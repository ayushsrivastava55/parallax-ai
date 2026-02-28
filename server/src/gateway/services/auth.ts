import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from '../../lib/types.js';
import type { GatewayAuthContext, GatewayRouteRequest } from '../types.ts';

interface KeyRecord {
  secret: string;
  agentId?: string;
  enabled?: boolean;
}

interface AuthResult {
  ok: true;
  context: GatewayAuthContext;
}

interface AuthFailure {
  ok: false;
  status: number;
  code: string;
  message: string;
}

const nonceStore = new Map<string, number>();

function getHeader(req: GatewayRouteRequest, key: string): string {
  const headers = req.headers ?? {};
  const direct = headers[key] ?? headers[key.toLowerCase()];
  if (Array.isArray(direct)) return String(direct[0] ?? '');
  return String(direct ?? '');
}

function loadKeyMap(): Record<string, KeyRecord> {
  const raw = process.env.FLASH_KEYS_JSON || '{}';
  try {
    const parsed = JSON.parse(raw) as Record<string, KeyRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    logger.warn({ error }, 'FLASH_KEYS_JSON invalid JSON');
    return {};
  }
}

function hashBody(body: unknown): string {
  const normalized = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  return createHash('sha256').update(normalized).digest('hex');
}

function computeSignature(req: GatewayRouteRequest, secret: string, agentId: string, timestamp: string, nonce: string): string {
  const method = String(req.method || 'GET').toUpperCase();
  const path = String(req.path || req.url || '/');
  const bodySha = hashBody(req.body);
  const canonical = [method, path, bodySha, agentId, timestamp, nonce].join('\n');
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

function isWithinWindow(timestampMs: number, nowMs: number): boolean {
  const windowSec = Number(process.env.FLASH_GATEWAY_REPLAY_WINDOW_SEC || 60);
  return Math.abs(nowMs - timestampMs) <= windowSec * 1000;
}

function pruneNonces(nowMs: number): void {
  const ttlMs = 5 * 60 * 1000;
  for (const [nonce, seenAt] of nonceStore.entries()) {
    if (nowMs - seenAt > ttlMs) nonceStore.delete(nonce);
  }
}

export function authorizeGatewayRequest(req: GatewayRouteRequest): AuthResult | AuthFailure {
  const allowUnsigned = process.env.FLASH_GATEWAY_ALLOW_UNSIGNED === 'true';
  const keyMap = loadKeyMap();

  if (allowUnsigned && Object.keys(keyMap).length === 0) {
    return {
      ok: true,
      context: {
        agentId: getHeader(req, 'X-Flash-Agent-Id') || 'unsigned-agent',
        keyId: 'unsigned',
      },
    };
  }

  const agentId = getHeader(req, 'X-Flash-Agent-Id');
  const keyId = getHeader(req, 'X-Flash-Key-Id');
  const timestamp = getHeader(req, 'X-Flash-Timestamp');
  const nonce = getHeader(req, 'X-Flash-Nonce');
  const signature = getHeader(req, 'X-Flash-Signature');

  if (!agentId || !keyId || !timestamp || !nonce || !signature) {
    return { ok: false, status: 401, code: 'AUTH_INVALID', message: 'Missing required auth headers' };
  }

  const keyRecord = keyMap[keyId];
  if (!keyRecord || keyRecord.enabled === false) {
    return { ok: false, status: 401, code: 'AUTH_INVALID', message: 'Unknown or disabled key' };
  }

  if (keyRecord.agentId && keyRecord.agentId !== agentId) {
    return { ok: false, status: 403, code: 'AUTH_INVALID', message: 'Agent mismatch for key' };
  }

  const tsMs = Number(timestamp);
  const now = Date.now();
  if (!Number.isFinite(tsMs) || !isWithinWindow(tsMs, now)) {
    return { ok: false, status: 401, code: 'AUTH_INVALID', message: 'Timestamp outside replay window' };
  }

  pruneNonces(now);
  if (nonceStore.has(nonce)) {
    return { ok: false, status: 409, code: 'AUTH_REPLAY_DETECTED', message: 'Nonce already used' };
  }

  const expected = computeSignature(req, keyRecord.secret, agentId, timestamp, nonce);
  const givenBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const signatureValid = givenBuf.length === expectedBuf.length && timingSafeEqual(givenBuf, expectedBuf);

  if (!signatureValid) {
    return { ok: false, status: 401, code: 'AUTH_INVALID', message: 'Signature mismatch' };
  }

  nonceStore.set(nonce, now);
  return { ok: true, context: { agentId, keyId } };
}
