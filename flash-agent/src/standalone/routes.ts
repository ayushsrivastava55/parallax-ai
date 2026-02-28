import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { PredictFunService } from '../plugin-flash/services/predictfun.ts';
import { OpinionService } from '../plugin-flash/services/opinion.ts';
import { ArbEngine } from '../plugin-flash/services/arbEngine.ts';
import { YieldRouter } from '../plugin-flash/services/yieldRouter.ts';
import { buildERC8004Config, ERC8004Service } from '../plugin-flash/services/erc8004.ts';
import {
  getLedgerPositions,
  recordTradeResult,
  refreshLivePrices,
} from '../plugin-flash/services/positionLedger.ts';
import type { Market, Order, Platform, Position, TradeResult } from '../plugin-flash/types/index.ts';
import {
  analyzeMarketSchema,
  arbScanSchema,
  listMarketsSchema,
  positionsListSchema,
  tradeExecuteSchema,
  tradeQuoteSchema,
  yieldManageSchema,
  botHeartbeatSchema,
  botActivitySchema,
} from '../gateway/schemas/index.ts';
import type {
  GatewayAuthContext,
  GatewayFailure,
  GatewayResponse,
  GatewayRouteRequest,
} from '../gateway/types.ts';
import { authorizeGatewayRequest } from '../gateway/services/auth.ts';
import {
  issueConfirmationToken,
  verifyAndConsumeConfirmationToken,
} from '../gateway/services/confirmationToken.ts';
import { evaluateExecutePolicy, evaluateQuotePolicy } from '../gateway/services/policyEngine.ts';
import { getConnectorHealth } from '../gateway/services/connectorHealth.ts';
import {
  ensureBotRegistered,
  recordBotHeartbeat,
  recordBotTrade,
  getBot,
  getAllBots,
  getPlatformStats,
} from '../gateway/services/botRegistry.ts';
import {
  recordActivity,
  getActivityFeed,
  getBotActivity,
  getBotStats,
} from '../gateway/services/activityTracker.ts';
import { analyzeWithAgent } from './analyze.ts';

/* ── Helpers ──────────────────────────────────────────────────── */

const idempotencyStore = new Map<string, { createdAt: number; response: GatewayResponse<unknown> }>();

function nowIso(): string {
  return new Date().toISOString();
}

function asFailure(
  requestId: string,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): GatewayFailure {
  return {
    success: false,
    requestId,
    data: null,
    error: { code, message, ...(details ? { details } : {}) },
    timestamp: nowIso(),
  };
}

function asSuccess<T>(requestId: string, data: T): GatewayResponse<T> {
  return {
    success: true,
    requestId,
    data,
    error: null,
    timestamp: nowIso(),
  };
}

function parseBody(req: Request): unknown {
  return req.body ?? {};
}

function respond(res: Response, status: number, body: GatewayResponse<unknown>): void {
  res.status(status).json(body);
}

function toGatewayReq(req: Request): GatewayRouteRequest {
  return {
    body: req.body,
    params: req.params as Record<string, string>,
    query: req.query as Record<string, string | string[] | undefined>,
    headers: req.headers as Record<string, string | string[] | undefined>,
    method: req.method,
    path: req.path,
    url: req.url,
  };
}

function requireAuth(
  req: Request,
  requestId: string,
): { ok: true; context: GatewayAuthContext } | { ok: false; status: number; body: GatewayFailure } {
  const auth = authorizeGatewayRequest(toGatewayReq(req));
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status,
      body: asFailure(requestId, auth.code, auth.message),
    };
  }
  return { ok: true, context: auth.context };
}

function trackRequest(
  requestId: string,
  agentId: string,
  keyId: string,
  type: string,
  details: Record<string, unknown> = {},
): void {
  ensureBotRegistered(agentId, keyId);
  recordActivity({ id: requestId, agentId, type, timestamp: nowIso(), details });
}

function parseRouteError(error: unknown): { code: string; message: string; status: number } {
  const msg = error instanceof Error ? error.message : String(error);
  if (/wallet.*configured/i.test(msg)) return { code: 'WALLET_NOT_CONFIGURED', message: msg, status: 400 };
  if (/insufficient/i.test(msg)) return { code: 'INSUFFICIENT_FUNDS', message: msg, status: 400 };
  if (/execution is disabled|kill switch|platform blocked/i.test(msg))
    return { code: 'POLICY_PLATFORM_BLOCKED', message: msg, status: 403 };
  if (/market/i.test(msg) && /not found|unavailable|closed/i.test(msg))
    return { code: 'MARKET_UNAVAILABLE', message: msg, status: 404 };
  if (/positions api is unavailable/i.test(msg))
    return { code: 'POSITIONS_UNAVAILABLE', message: msg, status: 501 };
  if (/endpoint|rejected|submission failed|not wired/i.test(msg))
    return { code: 'EXECUTION_REJECTED', message: msg, status: 422 };
  if (/timeout|network|api/i.test(msg)) return { code: 'CONNECTOR_UNAVAILABLE', message: msg, status: 502 };
  return { code: 'INTERNAL_ERROR', message: msg, status: 500 };
}

function makeOpinion(): OpinionService {
  const opinionKey = String(process.env.OPINION_API_KEY || '');
  return new OpinionService({
    enabled: process.env.OPINION_ENABLED === 'true' && !!opinionKey,
    apiKey: opinionKey,
    privateKey: String(process.env.BNB_PRIVATE_KEY || ''),
  });
}

async function collectMarkets(platforms?: Platform[], status: 'active' | 'all' = 'active'): Promise<Market[]> {
  const predictfun = new PredictFunService({ useTestnet: true });
  const opinion = makeOpinion();

  const includePf = !platforms || platforms.includes('predictfun');
  const includeOp = !platforms || platforms.includes('opinion');
  const [pf, op] = await Promise.allSettled([
    includePf ? predictfun.getMarkets({ status }) : Promise.resolve([]),
    includeOp ? opinion.getMarkets({ status }) : Promise.resolve([]),
  ]);

  const all: Market[] = [];
  if (pf.status === 'fulfilled') all.push(...pf.value);
  if (op.status === 'fulfilled') all.push(...op.value);
  return all;
}

function normalizePosition(p: Position): Position {
  return {
    ...p,
    pnl: Number.isFinite(p.pnl) ? p.pnl : 0,
    pnlPercent: Number.isFinite(p.pnlPercent) ? p.pnlPercent : 0,
  };
}

function mergePositions(a: Position[], b: Position[]): Position[] {
  const map = new Map<string, Position>();

  for (const position of [...a, ...b]) {
    const key = `${position.platform}|${position.marketId}|${position.outcomeLabel.toUpperCase()}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...position });
      continue;
    }

    const combinedSize = existing.size + position.size;
    const weightedEntry =
      combinedSize > 0
        ? (existing.avgEntryPrice * existing.size + position.avgEntryPrice * position.size) / combinedSize
        : existing.avgEntryPrice;
    const weightedCurrent =
      combinedSize > 0
        ? (existing.currentPrice * existing.size + position.currentPrice * position.size) / combinedSize
        : existing.currentPrice;
    const pnl = (weightedCurrent - weightedEntry) * combinedSize;
    const pnlPercent = weightedEntry > 0 ? ((weightedCurrent - weightedEntry) / weightedEntry) * 100 : 0;

    map.set(key, {
      ...existing,
      marketTitle: existing.marketTitle || position.marketTitle,
      size: combinedSize,
      avgEntryPrice: weightedEntry,
      currentPrice: weightedCurrent,
      pnl,
      pnlPercent,
    });
  }

  return Array.from(map.values());
}

function auditLog(event: string, details: Record<string, unknown>): void {
  console.log('[FLASH_GATEWAY]', event, JSON.stringify(details));
}

/* ── Route handlers ───────────────────────────────────────────── */

async function handleSystemHealth(_req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  respond(res, 200, asSuccess(requestId, { status: 'ok', service: 'flash-gateway', version: 'v1' }));
}

async function handleConnectorStatus(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'system.connectors');

  try {
    const health = await getConnectorHealth();
    return respond(res, 200, asSuccess(requestId, health));
  } catch (error) {
    const parsedErr = parseRouteError(error);
    return respond(res, parsedErr.status, asFailure(requestId, parsedErr.code, parsedErr.message));
  }
}

async function handleListMarkets(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'markets.list');

  const parsed = listMarketsSchema.safeParse(parseBody(req));
  if (!parsed.success) {
    return respond(
      res,
      400,
      asFailure(requestId, 'VALIDATION_ERROR', 'Invalid list payload', { issues: parsed.error.issues }),
    );
  }

  try {
    const markets = await collectMarkets(parsed.data.platforms, parsed.data.status);
    const limited = markets.slice(0, parsed.data.limit).map((m) => {
      const yes = m.outcomes.find((o) => /^yes$/i.test(o.label));
      const no = m.outcomes.find((o) => /^no$/i.test(o.label));
      return {
        id: m.id,
        platform: m.platform,
        title: m.title,
        yesPrice: yes?.price ?? 0.5,
        noPrice: no?.price ?? 0.5,
        liquidity: m.liquidity,
        status: m.status,
        url: m.url,
        canonicalHash: m.canonicalHash,
      };
    });

    auditLog('markets.list', { requestId, agentId: auth.context.agentId, count: limited.length });
    return respond(res, 200, asSuccess(requestId, { markets: limited, total: limited.length }));
  } catch (error) {
    const parsedErr = parseRouteError(error);
    return respond(res, parsedErr.status, asFailure(requestId, parsedErr.code, parsedErr.message));
  }
}

async function handleAnalyzeMarket(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'markets.analyze');

  const parsed = analyzeMarketSchema.safeParse(parseBody(req));
  if (!parsed.success) {
    return respond(
      res,
      400,
      asFailure(requestId, 'VALIDATION_ERROR', 'Invalid analysis payload', { issues: parsed.error.issues }),
    );
  }

  try {
    // Fetch all markets for analyze
    const allMarkets = await collectMarkets(undefined, 'active');
    const analysis = await analyzeWithAgent(parsed.data.query, allMarkets);

    auditLog('markets.analyze', { requestId, agentId: auth.context.agentId, success: true });
    return respond(
      res,
      200,
      asSuccess(requestId, {
        text: `Completed analysis of ${analysis.market.title}`,
        values: {
          marketId: analysis.market.id,
          platform: analysis.market.platform,
          modelProbability: analysis.modelProbability,
          edge: analysis.edge,
          expectedValue: analysis.expectedValue,
          confidence: analysis.confidence,
        },
        data: { analysis },
      }),
    );
  } catch (error) {
    const parsedErr = parseRouteError(error);
    return respond(res, parsedErr.status, asFailure(requestId, parsedErr.code, parsedErr.message));
  }
}

async function handleTradeQuote(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'trades.quote');

  const parsed = tradeQuoteSchema.safeParse(parseBody(req));
  if (!parsed.success) {
    return respond(
      res,
      400,
      asFailure(requestId, 'VALIDATION_ERROR', 'Invalid quote payload', { issues: parsed.error.issues }),
    );
  }

  const input = parsed.data;
  try {
    const opinionExecutionEnabled = String(process.env.OPINION_EXECUTION_ENABLED || 'false') === 'true';
    if (input.platform === 'opinion' && !opinionExecutionEnabled) {
      return respond(
        res,
        403,
        asFailure(requestId, 'POLICY_PLATFORM_BLOCKED', 'Opinion execution is currently disabled'),
      );
    }

    const platformService =
      input.platform === 'predictfun'
        ? new PredictFunService({
            useTestnet: true,
            privateKey: String(process.env.BNB_PRIVATE_KEY || ''),
          })
        : makeOpinion();

    const prices = await platformService.getMarketPrice(input.marketId);
    const price = input.side === 'YES' ? prices.yes : prices.no;
    const shares = input.sizeType === 'shares' ? input.size : input.size / Math.max(price, 0.0000001);
    const cost = shares * price;

    const policy = evaluateQuotePolicy({
      platform: input.platform,
      maxSlippageBps: input.maxSlippageBps,
      quoteCostUsd: cost,
    });
    if (!policy.ok) {
      return respond(res, 403, asFailure(requestId, policy.code, policy.message));
    }

    const markets = await collectMarkets([input.platform], 'all');
    const marketTitle = markets.find((m) => m.id === input.marketId)?.title || input.marketId;

    const { token, expiresAt } = issueConfirmationToken({
      agentId: auth.context.agentId,
      marketId: input.marketId,
      marketTitle,
      platform: input.platform,
      side: input.side,
      shares,
      quotedPrice: price,
      quotedCost: cost,
      maxSlippageBps: input.maxSlippageBps,
    });

    auditLog('trades.quote', {
      requestId,
      agentId: auth.context.agentId,
      marketId: input.marketId,
      platform: input.platform,
      side: input.side,
      shares,
      quotedCost: cost,
    });

    return respond(
      res,
      200,
      asSuccess(requestId, {
        marketId: input.marketId,
        platform: input.platform,
        side: input.side,
        price,
        shares,
        estimatedCostUsd: cost,
        maxSlippageBps: input.maxSlippageBps,
        confirmationToken: token,
        expiresAt,
      }),
    );
  } catch (error) {
    const parsedErr = parseRouteError(error);
    return respond(res, parsedErr.status, asFailure(requestId, parsedErr.code, parsedErr.message));
  }
}

async function handleTradeExecute(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'trades.execute');

  const idempotencyKey = String(req.headers['idempotency-key'] || '');
  if (!idempotencyKey) {
    return respond(res, 400, asFailure(requestId, 'VALIDATION_ERROR', 'Missing Idempotency-Key header'));
  }

  const existing = idempotencyStore.get(idempotencyKey);
  if (existing) {
    return respond(res, 200, existing.response);
  }

  const parsed = tradeExecuteSchema.safeParse(parseBody(req));
  if (!parsed.success) {
    return respond(
      res,
      400,
      asFailure(requestId, 'VALIDATION_ERROR', 'Invalid execute payload', { issues: parsed.error.issues }),
    );
  }

  const tokenCheck = verifyAndConsumeConfirmationToken(parsed.data.confirmationToken);
  if (!tokenCheck.ok) {
    return respond(res, 409, asFailure(requestId, tokenCheck.code, tokenCheck.message));
  }

  const payload = tokenCheck.payload;
  if (payload.agentId !== auth.context.agentId) {
    return respond(res, 403, asFailure(requestId, 'AUTH_INVALID', 'Token agent mismatch'));
  }

  const execPolicy = evaluateExecutePolicy({ platform: payload.platform });
  if (!execPolicy.ok) {
    return respond(res, 403, asFailure(requestId, execPolicy.code, execPolicy.message));
  }

  try {
    const order: Order = {
      marketId: payload.marketId,
      platform: payload.platform,
      outcomeId: payload.side.toLowerCase(),
      side: 'buy',
      price: payload.quotedPrice,
      size: payload.shares,
      type: 'limit',
    };

    let result: TradeResult;
    if (payload.platform === 'predictfun') {
      const pf = new PredictFunService({
        useTestnet: true,
        privateKey: String(process.env.BNB_PRIVATE_KEY || ''),
      });
      result = await pf.placeOrder(order);
    } else {
      const opinionExecutionEnabled = String(process.env.OPINION_EXECUTION_ENABLED || 'false') === 'true';
      if (!opinionExecutionEnabled) {
        throw new Error('Opinion execution is disabled (read-only connector until CLOB integration is enabled).');
      }
      const op = makeOpinion();
      result = await op.placeOrder(order);
    }

    if (result.filledSize > 0) {
      await recordTradeResult({
        order,
        trade: result,
        marketTitle: payload.marketTitle || order.marketId,
        outcomeLabel: payload.side,
        source: 'gateway',
      });
      recordBotTrade(auth.context.agentId, result.filledSize * result.filledPrice);
    }

    try {
      const erc8004Config = buildERC8004Config();
      if (erc8004Config) {
        const erc8004 = new ERC8004Service(erc8004Config);
        await erc8004.submitTradeFeedback({
          success: result.status === 'filled' || result.status === 'partial' || result.status === 'submitted',
          profitPercent: 0,
          marketTitle: order.marketId,
          platform: order.platform,
        });
      }
    } catch {
      // Non-critical telemetry
    }

    const response = asSuccess(requestId, {
      clientOrderId: parsed.data.clientOrderId,
      order,
      trade: result,
    });

    idempotencyStore.set(idempotencyKey, { createdAt: Date.now(), response });
    auditLog('trades.execute', {
      requestId,
      agentId: auth.context.agentId,
      clientOrderId: parsed.data.clientOrderId,
      status: result.status,
      orderId: result.orderId,
    });

    return respond(res, 200, response);
  } catch (error) {
    const parsedErr = parseRouteError(error);
    const failure = asFailure(requestId, parsedErr.code, parsedErr.message);
    idempotencyStore.set(idempotencyKey, { createdAt: Date.now(), response: failure });
    return respond(res, parsedErr.status, failure);
  }
}

async function handlePositionsList(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'positions.list');

  const parsed = positionsListSchema.safeParse(parseBody(req));
  if (!parsed.success) {
    return respond(
      res,
      400,
      asFailure(requestId, 'VALIDATION_ERROR', 'Invalid positions payload', { issues: parsed.error.issues }),
    );
  }

  try {
    const walletAddress = parsed.data.wallet || String(process.env.BNB_PUBLIC_KEY || '');
    const predictfun = new PredictFunService({ useTestnet: true });
    const opinion = makeOpinion();
    const diagnostics: string[] = [];

    const ledgerPositions = parsed.data.includeVirtual
      ? await refreshLivePrices(await getLedgerPositions(), { predictfun, opinion })
      : [];
    let opinionPositions: Position[] = [];
    if (walletAddress && opinion.isConfigured) {
      try {
        opinionPositions = await opinion.getPositions(walletAddress);
      } catch (error) {
        diagnostics.push(`Opinion positions unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const clean = mergePositions(ledgerPositions, opinionPositions).map(normalizePosition);
    const totals = clean.reduce(
      (acc, p) => {
        acc.totalPnl += p.pnl;
        acc.totalValue += p.currentPrice * p.size;
        return acc;
      },
      { totalPnl: 0, totalValue: 0 },
    );

    return respond(
      res,
      200,
      asSuccess(requestId, {
        wallet: walletAddress || null,
        positions: clean,
        count: clean.length,
        totals,
        sources: {
          ledger: parsed.data.includeVirtual,
          opinionApi: opinion.isConfigured && !!walletAddress,
        },
        diagnostics,
      }),
    );
  } catch (error) {
    const parsedErr = parseRouteError(error);
    return respond(res, parsedErr.status, asFailure(requestId, parsedErr.code, parsedErr.message));
  }
}

async function handleArbScan(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'arb.scan');

  const parsed = arbScanSchema.safeParse(parseBody(req));
  if (!parsed.success) {
    return respond(
      res,
      400,
      asFailure(requestId, 'VALIDATION_ERROR', 'Invalid arb payload', { issues: parsed.error.issues }),
    );
  }

  try {
    const predictfun = new PredictFunService({ useTestnet: true });
    const opinion = makeOpinion();
    const arbEngine = new ArbEngine({ predictfun, opinion });

    const opportunities = await arbEngine.scanAll();
    const filtered = parsed.data.platforms?.length
      ? opportunities.filter((o) => o.platforms.some((p) => parsed.data.platforms?.includes(p)))
      : opportunities;

    const withCapital = parsed.data.maxCapitalUsd
      ? filtered.map((o) => ({
          ...o,
          suggestedShareSets: Math.max(0, Math.floor(parsed.data.maxCapitalUsd! / Math.max(o.totalCost, 0.0001))),
        }))
      : filtered;

    return respond(
      res,
      200,
      asSuccess(requestId, {
        opportunities: withCapital,
        count: withCapital.length,
        maxCapitalUsd: parsed.data.maxCapitalUsd ?? null,
      }),
    );
  } catch (error) {
    const parsedErr = parseRouteError(error);
    return respond(res, parsedErr.status, asFailure(requestId, parsedErr.code, parsedErr.message));
  }
}

async function handleYieldManage(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'yield.manage');

  const parsed = yieldManageSchema.safeParse(parseBody(req));
  if (!parsed.success) {
    return respond(
      res,
      400,
      asFailure(requestId, 'VALIDATION_ERROR', 'Invalid yield payload', { issues: parsed.error.issues }),
    );
  }

  try {
    const router = new YieldRouter({
      minIdleUsd: Number(process.env.YIELD_MIN_IDLE_USD || 500),
      recallBufferUsd: Number(process.env.YIELD_RECALL_BUFFER_USD || 200),
      maxUtilizationPct: Number(process.env.YIELD_MAX_UTILIZATION_PCT || 80),
    });

    if (parsed.data.mode === 'status') {
      return respond(res, 200, asSuccess(requestId, { mode: 'status', position: router.getStatus() }));
    }

    const snapshot = {
      idleUsd: parsed.data.idleUsd ?? (parsed.data.mode === 'deploy' ? (parsed.data.amountUsd ?? 0) : 0),
      openTradeDemandUsd:
        parsed.data.openTradeDemandUsd ?? (parsed.data.mode === 'recall' ? (parsed.data.amountUsd ?? 0) : 0),
      deployedUsd: router.getStatus().suppliedUsd,
      timestamp: nowIso(),
    };

    const decision = router.decide(snapshot);
    return respond(res, 200, asSuccess(requestId, { mode: parsed.data.mode, decision, status: router.getStatus() }));
  } catch (error) {
    const parsedErr = parseRouteError(error);
    return respond(res, parsedErr.status, asFailure(requestId, parsedErr.code, parsedErr.message));
  }
}

async function handleAgentIdentity(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'agent.identity');

  try {
    const ercConfig = buildERC8004Config();
    if (!ercConfig) {
      return respond(
        res,
        200,
        asSuccess(requestId, { enabled: false, identity: null, reputation: null, flashStats: null }),
      );
    }

    const service = new ERC8004Service(ercConfig);
    const [identity, reputation, flashStats] = await Promise.all([
      service.getAgentIdentity().catch(() => null),
      service.getReputationSummary().catch(() => null),
      service.getFlashAgentStats().catch(() => null),
    ]);

    return respond(res, 200, asSuccess(requestId, { enabled: true, identity, reputation, flashStats }));
  } catch (error) {
    const parsedErr = parseRouteError(error);
    return respond(res, parsedErr.status, asFailure(requestId, parsedErr.code, parsedErr.message));
  }
}

/* ── Bot routes ───────────────────────────────────────────────── */

async function handlePlatformStats(_req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  try {
    const health = await getConnectorHealth().catch(() => ({
      predictfun: { ok: false },
      opinion: { ok: false, enabled: false },
    }));
    const connectorHealth: Record<string, boolean> = {
      predictfun: health.predictfun.ok,
      opinion: (health.opinion as any).ok ?? false,
    };
    const stats = getPlatformStats(connectorHealth);
    respond(res, 200, asSuccess(requestId, stats));
  } catch {
    respond(res, 200, asSuccess(requestId, getPlatformStats()));
  }
}

async function handleListBots(_req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const bots = getAllBots();
  respond(res, 200, asSuccess(requestId, { bots, total: bots.length }));
}

async function handleGetBot(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const agentId = req.params.agentId;
  if (!agentId) {
    return respond(res, 400, asFailure(requestId, 'VALIDATION_ERROR', 'Missing agentId'));
  }
  const bot = getBot(agentId);
  if (!bot) {
    return respond(res, 404, asFailure(requestId, 'NOT_FOUND', 'Bot not found'));
  }
  respond(res, 200, asSuccess(requestId, bot));
}

async function handleGetBotActivity(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const agentId = req.params.agentId;
  if (!agentId) {
    return respond(res, 400, asFailure(requestId, 'VALIDATION_ERROR', 'Missing agentId'));
  }
  const parsed = botActivitySchema.safeParse(req.query ?? {});
  const limit = parsed.success ? parsed.data.limit : 50;
  const activity = getBotActivity(agentId, limit);
  respond(res, 200, asSuccess(requestId, { activity, total: activity.length }));
}

async function handleGetBotStats(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const agentId = req.params.agentId;
  if (!agentId) {
    return respond(res, 400, asFailure(requestId, 'VALIDATION_ERROR', 'Missing agentId'));
  }
  const stats = getBotStats(agentId);
  respond(res, 200, asSuccess(requestId, stats));
}

async function handleBotHeartbeat(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = authorizeGatewayRequest(toGatewayReq(req));
  if (!auth.ok) {
    return respond(res, auth.status, asFailure(requestId, auth.code, auth.message));
  }

  const parsed = botHeartbeatSchema.safeParse(parseBody(req));
  if (!parsed.success) {
    return respond(res, 400, asFailure(requestId, 'VALIDATION_ERROR', 'Invalid heartbeat payload'));
  }

  ensureBotRegistered(auth.context.agentId, auth.context.keyId);
  recordBotHeartbeat(auth.context.agentId, parsed.data.strategies);
  recordActivity({
    id: requestId,
    agentId: auth.context.agentId,
    type: 'heartbeat',
    timestamp: nowIso(),
    details: {
      strategies: parsed.data.strategies ?? [],
      ...(parsed.data.state ?? {}),
    },
  });

  respond(res, 200, asSuccess(requestId, { received: true }));
}

async function handleGlobalActivityFeed(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const parsed = botActivitySchema.safeParse(req.query ?? {});
  const limit = parsed.success ? parsed.data.limit : 50;
  const activity = getActivityFeed(limit);
  respond(res, 200, asSuccess(requestId, { activity, total: activity.length }));
}

/* ── Router factory ───────────────────────────────────────────── */

export function createRouter(): Router {
  const router = Router();

  // System
  router.get('/system/health', handleSystemHealth);
  router.get('/system/connectors', handleConnectorStatus);

  // Markets
  router.post('/markets/list', handleListMarkets);
  router.post('/markets/analyze', handleAnalyzeMarket);

  // Trades
  router.post('/trades/quote', handleTradeQuote);
  router.post('/trades/execute', handleTradeExecute);

  // Positions
  router.post('/positions/list', handlePositionsList);

  // Arb
  router.post('/arb/scan', handleArbScan);

  // Yield
  router.post('/yield/manage', handleYieldManage);

  // Agent identity
  router.get('/agent/identity', handleAgentIdentity);

  // Platform / Bots (public)
  router.get('/platform/stats', handlePlatformStats);
  router.get('/bots', handleListBots);
  router.get('/bots/heartbeat', (_req, res) => res.status(405).json({ error: 'Use POST' }));
  router.get('/bots/:agentId', handleGetBot);
  router.get('/bots/:agentId/activity', handleGetBotActivity);
  router.get('/bots/:agentId/stats', handleGetBotStats);

  // Bot heartbeat (authenticated)
  router.post('/bots/heartbeat', handleBotHeartbeat);

  // Activity feed
  router.get('/activity/feed', handleGlobalActivityFeed);

  return router;
}
