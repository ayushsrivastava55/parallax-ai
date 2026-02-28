import { randomUUID } from 'node:crypto';
import type { Plugin } from '../../lib/types.js';
import type { GatewayFailure, GatewayResponse, GatewayRouteRequest } from '../types.ts';
import { authorizeGatewayRequest } from '../services/auth.ts';
import {
  ensureBotRegistered,
  recordBotHeartbeat,
  getBot,
  getAllBots,
  getPlatformStats,
} from '../services/botRegistry.ts';
import {
  recordActivity,
  getActivityFeed,
  getBotActivity,
  getBotStats,
} from '../services/activityTracker.ts';
import { getConnectorHealth } from '../services/connectorHealth.ts';
import { botHeartbeatSchema, botActivitySchema } from '../schemas/index.ts';

type RouteDef = NonNullable<Plugin['routes']>[number];

function nowIso(): string {
  return new Date().toISOString();
}

function asFailure(requestId: string, code: string, message: string): GatewayFailure {
  return { success: false, requestId, data: null, error: { code, message }, timestamp: nowIso() };
}

function asSuccess<T>(requestId: string, data: T): GatewayResponse<T> {
  return { success: true, requestId, data, error: null, timestamp: nowIso() };
}

function respond(res: any, status: number, body: GatewayResponse<unknown>): void {
  res.status(status).json(body);
}

function parseBody(req: GatewayRouteRequest): unknown {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body ?? {};
}

function expandRoute(type: 'GET' | 'POST', path: string, handler: RouteDef['handler']): RouteDef[] {
  return [
    { type, path, handler },
    { type, path: `/api${path}`, handler },
  ];
}

/* ── Public endpoints ─────────────────────────────────────────── */

async function handlePlatformStats(_req: GatewayRouteRequest, res: any, runtime: any): Promise<void> {
  const requestId = randomUUID();
  try {
    const health = await getConnectorHealth(runtime).catch(() => ({
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

async function handleListBots(_req: GatewayRouteRequest, res: any): Promise<void> {
  const requestId = randomUUID();
  const bots = getAllBots();
  respond(res, 200, asSuccess(requestId, { bots, total: bots.length }));
}

async function handleGetBot(req: GatewayRouteRequest, res: any): Promise<void> {
  const requestId = randomUUID();
  const agentId = req.params?.agentId;
  if (!agentId) {
    return respond(res, 400, asFailure(requestId, 'VALIDATION_ERROR', 'Missing agentId'));
  }
  const bot = getBot(agentId);
  if (!bot) {
    return respond(res, 404, asFailure(requestId, 'NOT_FOUND', 'Bot not found'));
  }
  respond(res, 200, asSuccess(requestId, bot));
}

async function handleGetBotActivity(req: GatewayRouteRequest, res: any): Promise<void> {
  const requestId = randomUUID();
  const agentId = req.params?.agentId;
  if (!agentId) {
    return respond(res, 400, asFailure(requestId, 'VALIDATION_ERROR', 'Missing agentId'));
  }
  const parsed = botActivitySchema.safeParse(req.query ?? {});
  const limit = parsed.success ? parsed.data.limit : 50;
  const activity = getBotActivity(agentId, limit);
  respond(res, 200, asSuccess(requestId, { activity, total: activity.length }));
}

async function handleGetBotStats(req: GatewayRouteRequest, res: any): Promise<void> {
  const requestId = randomUUID();
  const agentId = req.params?.agentId;
  if (!agentId) {
    return respond(res, 400, asFailure(requestId, 'VALIDATION_ERROR', 'Missing agentId'));
  }
  const stats = getBotStats(agentId);
  respond(res, 200, asSuccess(requestId, stats));
}

async function handleGlobalActivityFeed(req: GatewayRouteRequest, res: any): Promise<void> {
  const requestId = randomUUID();
  const parsed = botActivitySchema.safeParse(req.query ?? {});
  const limit = parsed.success ? parsed.data.limit : 50;
  const activity = getActivityFeed(limit);
  respond(res, 200, asSuccess(requestId, { activity, total: activity.length }));
}

/* ── Authenticated endpoints ──────────────────────────────────── */

async function handleBotHeartbeat(req: GatewayRouteRequest, res: any): Promise<void> {
  const requestId = randomUUID();
  const auth = authorizeGatewayRequest(req);
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

/* ── Route factory ────────────────────────────────────────────── */

export function createBotRoutes(): RouteDef[] {
  const routes: RouteDef[] = [];

  // Public
  routes.push(...expandRoute('GET', '/v1/platform/stats', (req, res, runtime) => handlePlatformStats(req as GatewayRouteRequest, res, runtime)));
  routes.push(...expandRoute('GET', '/v1/bots', (req, res) => handleListBots(req as GatewayRouteRequest, res)));
  routes.push(...expandRoute('GET', '/v1/bots/:agentId', (req, res) => handleGetBot(req as GatewayRouteRequest, res)));
  routes.push(...expandRoute('GET', '/v1/bots/:agentId/activity', (req, res) => handleGetBotActivity(req as GatewayRouteRequest, res)));
  routes.push(...expandRoute('GET', '/v1/bots/:agentId/stats', (req, res) => handleGetBotStats(req as GatewayRouteRequest, res)));
  routes.push(...expandRoute('GET', '/v1/activity/feed', (req, res) => handleGlobalActivityFeed(req as GatewayRouteRequest, res)));

  // Authenticated
  routes.push(...expandRoute('POST', '/v1/bots/heartbeat', (req, res) => handleBotHeartbeat(req as GatewayRouteRequest, res)));

  return routes;
}
