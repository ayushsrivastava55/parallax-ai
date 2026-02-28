import type { IAgentRuntime } from '../../lib/types.js';
import { PredictFunService } from '../../plugin-flash/services/predictfun.ts';
import { OpinionService } from '../../plugin-flash/services/opinion.ts';
import { ProbableService } from '../../plugin-flash/services/probable.ts';
import { XmarketService } from '../../plugin-flash/services/xmarket.ts';

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 4000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ]);
}

export async function getConnectorHealth(runtime?: IAgentRuntime): Promise<{
  predictfun: { ok: boolean; error?: string };
  opinion: { ok: boolean; error?: string; enabled: boolean };
  probable: { ok: boolean; error?: string; enabled: boolean };
  xmarket: { ok: boolean; error?: string; enabled: boolean };
}> {
  const predictfun = new PredictFunService({ useTestnet: true });
  const opinionKey = String(runtime?.getSetting?.('OPINION_API_KEY') || process.env.OPINION_API_KEY || '');
  const opinionEnabled = (process.env.OPINION_ENABLED === 'true') && !!opinionKey;
  const opinion = new OpinionService({ enabled: opinionEnabled, apiKey: opinionKey });

  const probableEnabled = process.env.PROBABLE_ENABLED !== 'false';
  const probable = new ProbableService({ enabled: probableEnabled });

  const xmarketKey = String(process.env.XMARKET_API_KEY || '');
  const xmarketEnabled = !!xmarketKey;
  const xmarket = new XmarketService({ enabled: xmarketEnabled, apiKey: xmarketKey });

  const [pfRes, opRes, prRes, xmRes] = await Promise.all([
    withTimeout(predictfun.getMarkets({ status: 'active' }))
      .then(() => ({ ok: true as const }))
      .catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) })),

    opinionEnabled
      ? withTimeout(opinion.getMarkets({ status: 'active' }))
          .then(() => ({ ok: true as const, enabled: true }))
          .catch((e) => ({ ok: false as const, enabled: true, error: e instanceof Error ? e.message : String(e) }))
      : Promise.resolve({ ok: false as const, enabled: false, error: 'disabled' }),

    probableEnabled
      ? withTimeout(probable.getMarkets({ status: 'active' }))
          .then(() => ({ ok: true as const, enabled: true }))
          .catch((e) => ({ ok: false as const, enabled: true, error: e instanceof Error ? e.message : String(e) }))
      : Promise.resolve({ ok: false as const, enabled: false, error: 'disabled' }),

    xmarketEnabled
      ? withTimeout(xmarket.getMarkets({ status: 'active' }))
          .then(() => ({ ok: true as const, enabled: true }))
          .catch((e) => ({ ok: false as const, enabled: true, error: e instanceof Error ? e.message : String(e) }))
      : Promise.resolve({ ok: false as const, enabled: false, error: 'disabled' }),
  ]);

  return {
    predictfun: pfRes,
    opinion: opRes,
    probable: prRes,
    xmarket: xmRes,
  };
}
