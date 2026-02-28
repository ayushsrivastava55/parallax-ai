import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { PredictFunService } from '../plugin-flash/services/predictfun.ts';
import { OpinionService } from '../plugin-flash/services/opinion.ts';
import { ProbableService } from '../plugin-flash/services/probable.ts';
import { XmarketService } from '../plugin-flash/services/xmarket.ts';
import { ArbEngine } from '../plugin-flash/services/arbEngine.ts';
import { YieldRouter } from '../plugin-flash/services/yieldRouter.ts';
import { buildERC8004Config, ERC8004Service } from '../plugin-flash/services/erc8004.ts';
import {
  getLedgerPositions,
  recordTradeResult,
  refreshLivePrices,
} from '../plugin-flash/services/positionLedger.ts';
import type { Market, MarketConnector, Order, Platform, Position, TradeResult } from '../plugin-flash/types/index.ts';
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
  agentRegisterSchema,
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
  setBotWalletAddress,
  encryptPrivateKey,
  getAgentPrivateKey,
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

function makePredictFun(opts?: { withPrivateKey?: boolean }): PredictFunService {
  return new PredictFunService({
    useTestnet: true,
    apiKey: String(process.env.PREDICT_FUN_API_KEY || ''),
    ...(opts?.withPrivateKey ? { privateKey: String(process.env.BNB_PRIVATE_KEY || '') } : {}),
  });
}

function makeOpinion(): OpinionService {
  const opinionKey = String(process.env.OPINION_API_KEY || '');
  return new OpinionService({
    enabled: process.env.OPINION_ENABLED === 'true' && !!opinionKey,
    apiKey: opinionKey,
    privateKey: String(process.env.BNB_PRIVATE_KEY || ''),
  });
}

function makeProbable(): ProbableService {
  return new ProbableService({
    enabled: process.env.PROBABLE_ENABLED !== 'false', // enabled by default (public API)
    privateKey: String(process.env.BNB_PRIVATE_KEY || ''),
  });
}

function makeXmarket(): XmarketService {
  const xmarketKey = String(process.env.XMARKET_API_KEY || '');
  return new XmarketService({
    enabled: !!xmarketKey,
    apiKey: xmarketKey,
  });
}

async function collectMarkets(platforms?: Platform[], status: 'active' | 'all' = 'active'): Promise<Market[]> {
  const predictfun = new PredictFunService({ useTestnet: true });
  const opinion = makeOpinion();
  const probable = makeProbable();
  const xmarket = makeXmarket();

  const includePf = !platforms || platforms.includes('predictfun');
  const includeOp = !platforms || platforms.includes('opinion');
  const includePr = !platforms || platforms.includes('probable');
  const includeXm = !platforms || platforms.includes('xmarket');

  const [pf, op, pr, xm] = await Promise.allSettled([
    includePf ? predictfun.getMarkets({ status }) : Promise.resolve([]),
    includeOp ? opinion.getMarkets({ status }) : Promise.resolve([]),
    includePr ? probable.getMarkets({ status }) : Promise.resolve([]),
    includeXm && xmarket.isConfigured ? xmarket.getMarkets({ status }) : Promise.resolve([]),
  ]);

  const all: Market[] = [];
  if (pf.status === 'fulfilled') all.push(...pf.value);
  if (op.status === 'fulfilled') all.push(...op.value);
  if (pr.status === 'fulfilled') all.push(...pr.value);
  if (xm.status === 'fulfilled') all.push(...xm.value);
  return all;
}

function resolvePlatformService(platform: Platform): MarketConnector {
  switch (platform) {
    case 'predictfun':
      return new PredictFunService({
        useTestnet: true,
        privateKey: String(process.env.BNB_PRIVATE_KEY || ''),
      });
    case 'opinion':
      return makeOpinion();
    case 'probable':
      return makeProbable();
    case 'xmarket':
      return makeXmarket();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
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
  console.log('[EYEBALZ_GATEWAY]', event, JSON.stringify(details));
}

/* ── Route handlers ───────────────────────────────────────────── */

async function handleSystemHealth(_req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  respond(res, 200, asSuccess(requestId, { status: 'ok', service: 'eyebalz-gateway', version: 'v1' }));
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

    const platformService = resolvePlatformService(input.platform);

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

    // Resolve per-agent wallet: prefer agent's custodial key, then relay mode, then global key
    const botSignature = parsed.data.signature;
    const botSignerAddress = parsed.data.signerAddress;
    const bot = getBot(auth.context.agentId);
    const agentKey = getAgentPrivateKey(auth.context.agentId);
    const useRelayMode = !!(botSignature && botSignerAddress);
    const effectivePrivateKey = agentKey || String(process.env.BNB_PRIVATE_KEY || '');

    let result: TradeResult;
    if (payload.platform === 'predictfun') {
      const pf = new PredictFunService({
        useTestnet: true,
        privateKey: useRelayMode ? undefined : effectivePrivateKey,
      });
      result = await pf.placeOrder(
        order,
        useRelayMode ? { signature: botSignature, signerAddress: botSignerAddress } : undefined,
      );
    } else if (payload.platform === 'opinion') {
      const opinionExecutionEnabled = String(process.env.OPINION_EXECUTION_ENABLED || 'false') === 'true';
      if (!opinionExecutionEnabled) {
        throw new Error('Opinion execution is disabled (read-only connector until CLOB integration is enabled).');
      }
      const op = makeOpinion();
      result = await op.placeOrder(order);
    } else if (payload.platform === 'probable') {
      const pr = new ProbableService({ enabled: true, privateKey: effectivePrivateKey });
      result = await pr.placeOrder(order);
    } else if (payload.platform === 'xmarket') {
      const xm = makeXmarket();
      result = await xm.placeOrder(order);
    } else {
      throw new Error(`Unsupported platform: ${payload.platform}`);
    }

    if (result.filledSize > 0) {
      await recordTradeResult({
        order,
        trade: result,
        marketTitle: payload.marketTitle || order.marketId,
        outcomeLabel: payload.side,
        source: 'gateway',
        agentId: auth.context.agentId,
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
    // Resolve wallet: registered bot's wallet > request body > global env
    const bot = getBot(auth.context.agentId);
    const walletAddress = parsed.data.wallet || bot?.walletAddress || String(process.env.BNB_PUBLIC_KEY || '');
    const predictfun = new PredictFunService({ useTestnet: true });
    const opinion = makeOpinion();
    const probable = makeProbable();
    const xmarket = makeXmarket();
    const diagnostics: string[] = [];

    // Filter ledger positions by agentId if bot has a registered wallet (segregated)
    const agentIdFilter = bot?.walletAddress ? auth.context.agentId : undefined;
    const ledgerPositions = parsed.data.includeVirtual
      ? await refreshLivePrices(await getLedgerPositions(agentIdFilter), { predictfun, opinion, probable, xmarket })
      : [];
    let externalPositions: Position[] = [];
    if (walletAddress && opinion.isConfigured) {
      try {
        const opPos = await opinion.getPositions(walletAddress);
        externalPositions.push(...opPos);
      } catch (error) {
        diagnostics.push(`Opinion positions unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (walletAddress && xmarket.isConfigured) {
      try {
        const xmPos = await xmarket.getPositions(walletAddress);
        externalPositions.push(...xmPos);
      } catch (error) {
        diagnostics.push(`Xmarket positions unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const clean = mergePositions(ledgerPositions, externalPositions).map(normalizePosition);
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
    const probable = makeProbable();
    const xmarket = makeXmarket();
    const connectors = [probable, ...(xmarket.isConfigured ? [xmarket] : [])];
    const arbEngine = new ArbEngine({ predictfun, opinion, connectors });

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

/* ── Agent registration ───────────────────────────────────────── */

async function handleAgentRegister(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'bots.register');

  // Check if agent already has a wallet (idempotent)
  const existingBot = getBot(auth.context.agentId);
  if (existingBot?.walletAddress) {
    return respond(
      res,
      200,
      asSuccess(requestId, {
        agentId: auth.context.agentId,
        walletAddress: existingBot.walletAddress,
        erc8004AgentId: existingBot.erc8004AgentId ?? null,
        nfaTokenId: existingBot.nfaTokenId ?? null,
        onChainVerified: existingBot.onChainVerified ?? false,
        alreadyRegistered: true,
      }),
    );
  }

  const parsed = agentRegisterSchema.safeParse(parseBody(req));
  if (!parsed.success) {
    return respond(
      res,
      400,
      asFailure(requestId, 'VALIDATION_ERROR', 'Invalid registration payload', { issues: parsed.error.issues }),
    );
  }

  const persona = parsed.data.persona || `eyebalz-agent-${auth.context.agentId.slice(0, 8)}`;

  // 1. Generate a fresh wallet for this agent
  const { ethers } = await import('ethers');
  const agentWallet = ethers.Wallet.createRandom();
  const walletAddress = agentWallet.address;
  const encrypted = encryptPrivateKey(agentWallet.privateKey);

  auditLog('bots.register.wallet_generated', {
    requestId,
    agentId: auth.context.agentId,
    walletAddress,
  });

  // 2. Register on ERC-8004 IdentityRegistry + mint NFA (best-effort)
  let erc8004AgentId: number | undefined;
  let nfaTokenId: number | undefined;
  let onChainVerified = false;

  const ercConfig = buildERC8004Config();
  if (ercConfig) {
    try {
      const provider = new ethers.JsonRpcProvider(ercConfig.rpcUrl);
      const gatewayWallet = new ethers.Wallet(ercConfig.privateKey, provider);

      // Register on IdentityRegistry (gateway wallet pays gas, agent wallet gets the identity)
      const identityRegistry = new ethers.Contract(
        ercConfig.identityRegistryAddress,
        [
          'function register(string calldata metadataURI) external returns (uint256)',
          'event Registered(uint256 indexed agentId, address indexed owner)',
        ],
        gatewayWallet,
      );

      const metadataURI = `https://eyebalz.xyz/api/v1/agent/metadata/${auth.context.agentId}`;
      const regTx = await identityRegistry['register(string)'](metadataURI);
      const regReceipt = await regTx.wait();

      // Extract agentId from Registered event
      for (const log of regReceipt.logs) {
        try {
          const parsed = identityRegistry.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed && parsed.name === 'Registered') {
            erc8004AgentId = Number(parsed.args.agentId);
            break;
          }
        } catch { /* skip non-matching logs */ }
      }

      if (erc8004AgentId !== undefined) {
        onChainVerified = true;
        auditLog('bots.register.erc8004_registered', {
          requestId,
          agentId: auth.context.agentId,
          erc8004AgentId,
          txHash: regReceipt.hash,
        });
      }

      // 3. Mint FlashAgent NFA (if contract is configured)
      if (ercConfig.flashAgentAddress && erc8004AgentId !== undefined) {
        try {
          const flashAgent = new ethers.Contract(
            ercConfig.flashAgentAddress,
            [
              'function mintAgent(address to, string calldata persona, string calldata experience, string calldata uri) external returns (uint256)',
              'event AgentMinted(uint256 indexed tokenId, address indexed owner)',
            ],
            gatewayWallet,
          );

          const mintTx = await flashAgent.mintAgent(
            walletAddress,
            persona,
            'prediction-markets',
            metadataURI,
          );
          const mintReceipt = await mintTx.wait();

          for (const log of mintReceipt.logs) {
            try {
              const parsed = flashAgent.interface.parseLog({
                topics: log.topics as string[],
                data: log.data,
              });
              if (parsed && parsed.name === 'AgentMinted') {
                nfaTokenId = Number(parsed.args.tokenId);
                break;
              }
            } catch { /* skip non-matching logs */ }
          }

          auditLog('bots.register.nfa_minted', {
            requestId,
            agentId: auth.context.agentId,
            nfaTokenId,
            txHash: mintReceipt.hash,
          });
        } catch (error) {
          auditLog('bots.register.nfa_mint_failed', {
            requestId,
            agentId: auth.context.agentId,
            error: error instanceof Error ? error.message : String(error),
          });
          // Non-fatal: agent works without NFA
        }
      }
    } catch (error) {
      auditLog('bots.register.erc8004_failed', {
        requestId,
        agentId: auth.context.agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Non-fatal: agent gets a wallet even if on-chain registration fails
    }
  }

  // 4. Store everything in the registry
  ensureBotRegistered(auth.context.agentId, auth.context.keyId);
  setBotWalletAddress(auth.context.agentId, walletAddress, {
    erc8004AgentId,
    onChainVerified,
    encryptedPrivateKey: encrypted,
    nfaTokenId,
  });

  auditLog('bots.register', {
    requestId,
    agentId: auth.context.agentId,
    walletAddress,
    erc8004AgentId,
    nfaTokenId,
    onChainVerified,
  });

  return respond(
    res,
    200,
    asSuccess(requestId, {
      agentId: auth.context.agentId,
      walletAddress,
      erc8004AgentId: erc8004AgentId ?? null,
      nfaTokenId: nfaTokenId ?? null,
      onChainVerified,
    }),
  );
}

/* ── Proxy wallet routes ──────────────────────────────────────── */

async function handleSetupProxy(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'bots.setup-proxy');

  try {
    // Use per-agent wallet if available, fall back to global
    const agentKey = getAgentPrivateKey(auth.context.agentId);
    const privateKey = agentKey || String(process.env.BNB_PRIVATE_KEY || '');
    if (!privateKey) {
      return respond(
        res,
        400,
        asFailure(requestId, 'WALLET_NOT_CONFIGURED', 'Agent has no wallet — call POST /v1/bots/register first'),
      );
    }

    const probable = new ProbableService({ enabled: true, privateKey });
    const proxyAddress = await probable.ensureProxyDeployed();

    auditLog('bots.setup-proxy', {
      requestId,
      agentId: auth.context.agentId,
      proxyAddress,
      usedAgentWallet: !!agentKey,
    });

    return respond(
      res,
      200,
      asSuccess(requestId, {
        proxyAddress,
        status: 'deployed',
      }),
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/already/i.test(msg)) {
      return respond(res, 409, asFailure(requestId, 'PROXY_ALREADY_DEPLOYED', msg));
    }
    const parsedErr = parseRouteError(error);
    return respond(res, parsedErr.status, asFailure(requestId, parsedErr.code, parsedErr.message));
  }
}

async function handleProxyStatus(req: Request, res: Response): Promise<void> {
  const requestId = randomUUID();
  const auth = requireAuth(req, requestId);
  if (!auth.ok) return respond(res, auth.status, auth.body);

  trackRequest(requestId, auth.context.agentId, auth.context.keyId, 'bots.proxy-status');

  try {
    // Use per-agent wallet if available, fall back to global
    const agentKey = getAgentPrivateKey(auth.context.agentId);
    const privateKey = agentKey || String(process.env.BNB_PRIVATE_KEY || '');
    const probable = new ProbableService({ enabled: true, privateKey });
    const proxyAddress = await probable.resolveProxyAddress();

    if (!proxyAddress) {
      return respond(
        res,
        404,
        asFailure(requestId, 'PROXY_NOT_DEPLOYED', 'No proxy wallet found — call POST /v1/bots/setup-proxy first'),
      );
    }

    // Check USDT balance and approvals on BSC
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org');
    const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';
    const EXCHANGE = '0xF99F5367ce708c66F0860B77B4331301A5597c86';
    const erc20 = new ethers.Contract(
      USDT_BSC,
      ['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)'],
      provider,
    );

    const [balanceRaw, allowanceRaw] = await Promise.all([
      erc20.balanceOf(proxyAddress).catch(() => 0n),
      erc20.allowance(proxyAddress, EXCHANGE).catch(() => 0n),
    ]);

    const balance = Number(balanceRaw) / 1e18;
    const approvalsOk = BigInt(allowanceRaw) > 0n;

    return respond(
      res,
      200,
      asSuccess(requestId, {
        proxyAddress,
        deployed: true,
        usdtBalance: balance.toFixed(2),
        approvalsOk,
      }),
    );
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

  // Agent registration
  router.post('/bots/register', handleAgentRegister);

  // Proxy wallet (Probable)
  router.post('/bots/setup-proxy', handleSetupProxy);
  router.get('/bots/proxy-status', handleProxyStatus);

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
