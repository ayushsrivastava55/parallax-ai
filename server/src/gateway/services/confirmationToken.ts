import { createHmac } from 'node:crypto';
import type { QuoteTokenPayload } from '../types.ts';

const usedTokenStore = new Map<string, number>();

function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function secret(): string {
  return process.env.EYEBALZ_GATEWAY_SIGNING_SECRET || process.env.EYEBALZ_GATEWAY_DEV_SECRET || 'eyebalz-dev-secret-change-me';
}

function sign(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function issueConfirmationToken(payload: Omit<QuoteTokenPayload, 'tokenVersion' | 'expiresAt'>): { token: string; expiresAt: number } {
  const ttlSec = Number(process.env.EYEBALZ_GATEWAY_QUOTE_TTL_SEC || 90);
  const expiresAt = Date.now() + ttlSec * 1000;
  const fullPayload: QuoteTokenPayload = {
    tokenVersion: 1,
    expiresAt,
    ...payload,
  };

  const payloadB64 = b64urlEncode(JSON.stringify(fullPayload));
  const sig = sign(payloadB64);
  return {
    token: `${payloadB64}.${sig}`,
    expiresAt,
  };
}

export function verifyAndConsumeConfirmationToken(token: string): { ok: true; payload: QuoteTokenPayload } | { ok: false; code: string; message: string } {
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) {
    return { ok: false, code: 'CONFIRMATION_TOKEN_INVALID', message: 'Malformed confirmation token' };
  }

  const expected = sign(payloadB64);
  if (expected !== sig) {
    return { ok: false, code: 'CONFIRMATION_TOKEN_INVALID', message: 'Invalid token signature' };
  }

  if (usedTokenStore.has(token)) {
    return { ok: false, code: 'CONFIRMATION_TOKEN_USED', message: 'Confirmation token already used' };
  }

  let payload: QuoteTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64)) as QuoteTokenPayload;
  } catch {
    return { ok: false, code: 'CONFIRMATION_TOKEN_INVALID', message: 'Could not decode token payload' };
  }

  if (!payload.expiresAt || payload.expiresAt < Date.now()) {
    return { ok: false, code: 'CONFIRMATION_TOKEN_EXPIRED', message: 'Confirmation token expired' };
  }

  usedTokenStore.set(token, Date.now());
  return { ok: true, payload };
}
