import type { IAgentRuntime } from '@elizaos/core';
import { PredictFunService } from '../../plugin-flash/services/predictfun.ts';
import { OpinionService } from '../../plugin-flash/services/opinion.ts';

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 4000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);
}

export async function getConnectorHealth(runtime?: IAgentRuntime): Promise<{
  predictfun: { ok: boolean; error?: string };
  opinion: { ok: boolean; error?: string; enabled: boolean };
}> {
  const predictfun = new PredictFunService({ useTestnet: true });
  const opinionKey = String(runtime?.getSetting?.('OPINION_API_KEY') || process.env.OPINION_API_KEY || '');
  const opinionEnabled = (process.env.OPINION_ENABLED === 'true') && !!opinionKey;
  const opinion = new OpinionService({ enabled: opinionEnabled, apiKey: opinionKey });

  const pfRes = await withTimeout(predictfun.getMarkets({ status: 'active' }))
    .then(() => ({ ok: true as const }))
    .catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));

  if (!opinionEnabled) {
    return {
      predictfun: pfRes,
      opinion: { ok: false, enabled: false, error: 'disabled' },
    };
  }

  const opRes = await withTimeout(opinion.getMarkets({ status: 'active' }))
    .then(() => ({ ok: true as const, enabled: true }))
    .catch((e) => ({ ok: false as const, enabled: true, error: e instanceof Error ? e.message : String(e) }));

  return {
    predictfun: pfRes,
    opinion: opRes,
  };
}
