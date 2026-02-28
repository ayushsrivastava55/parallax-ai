import type { Platform } from '../../plugin-flash/types/index.ts';

function allowedPlatforms(): Set<Platform> {
  const raw = String(process.env.FLASH_GATEWAY_ALLOWED_PLATFORMS || 'predictfun,probable,xmarket');
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as Platform[];
  return new Set(parsed);
}

export function evaluateQuotePolicy(input: { platform: Platform; maxSlippageBps: number; quoteCostUsd: number }): { ok: true } | { ok: false; code: string; message: string } {
  const maxOrderUsd = Number(process.env.FLASH_GATEWAY_MAX_ORDER_USD || 1000);
  const maxSlippageBps = Number(process.env.FLASH_GATEWAY_MAX_SLIPPAGE_BPS || 300);

  if (!allowedPlatforms().has(input.platform)) {
    return { ok: false, code: 'POLICY_PLATFORM_BLOCKED', message: `Platform ${input.platform} is not allowed` };
  }

  if (input.maxSlippageBps > maxSlippageBps) {
    return { ok: false, code: 'POLICY_SLIPPAGE_EXCEEDED', message: `Requested slippage ${input.maxSlippageBps} bps exceeds policy max ${maxSlippageBps} bps` };
  }

  if (input.quoteCostUsd > maxOrderUsd) {
    return { ok: false, code: 'POLICY_ORDER_LIMIT', message: `Order cost $${input.quoteCostUsd.toFixed(2)} exceeds policy max $${maxOrderUsd.toFixed(2)}` };
  }

  return { ok: true };
}

export function evaluateExecutePolicy(input: { platform: Platform }): { ok: true } | { ok: false; code: string; message: string } {
  if (process.env.FLASH_GATEWAY_KILL_SWITCH === 'true') {
    return { ok: false, code: 'POLICY_KILL_SWITCH', message: 'Trading is disabled by kill switch' };
  }

  if (!allowedPlatforms().has(input.platform)) {
    return { ok: false, code: 'POLICY_PLATFORM_BLOCKED', message: `Platform ${input.platform} is not allowed` };
  }

  return { ok: true };
}
