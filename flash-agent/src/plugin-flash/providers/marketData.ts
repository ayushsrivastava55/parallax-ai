import type {
  Provider,
  ProviderResult,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PredictFunService } from '../services/predictfun.ts';
import { OpinionService } from '../services/opinion.ts';

// Cache market data for 60 seconds to avoid excessive API calls
let marketCache: { data: string; timestamp: number } | null = null;
const CACHE_TTL = 60_000;

export const marketDataProvider: Provider = {
  name: 'MARKET_DATA_PROVIDER',
  description:
    'Provides real-time prediction market data from Opinion.trade and Predict.fun to give the agent awareness of current market conditions.',

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    try {
      const now = Date.now();
      if (marketCache && now - marketCache.timestamp < CACHE_TTL) {
        return { text: marketCache.data, values: {}, data: {} };
      }

      const predictfun = new PredictFunService({ useTestnet: true });
      const opinion = new OpinionService({
        apiKey: runtime.getSetting('OPINION_API_KEY') || process.env.OPINION_API_KEY,
      });

      const [pfMarkets, opMarkets] = await Promise.allSettled([
        predictfun.getMarkets({ status: 'active' }),
        opinion.getMarkets({ status: 'active' }),
      ]);

      const pfCount = pfMarkets.status === 'fulfilled' ? pfMarkets.value.length : 0;
      const opCount = opMarkets.status === 'fulfilled' ? opMarkets.value.length : 0;

      // Build a concise market summary for Claude context
      let summary = `[Market Data] ${pfCount} Predict.fun markets, ${opCount} Opinion markets active.\n`;

      if (pfMarkets.status === 'fulfilled') {
        const top = pfMarkets.value.slice(0, 5);
        for (const m of top) {
          const yes = m.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes');
          summary += `  PF: "${m.title}" YES=$${(yes?.price ?? 0).toFixed(2)}\n`;
        }
      }

      if (opMarkets.status === 'fulfilled') {
        const top = opMarkets.value.slice(0, 5);
        for (const m of top) {
          const yes = m.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes');
          summary += `  OP: "${m.title}" YES=$${(yes?.price ?? 0).toFixed(2)}\n`;
        }
      }

      marketCache = { data: summary, timestamp: now };

      return { text: summary, values: {}, data: {} };
    } catch (err) {
      logger.warn('Market data provider error:', err);
      return {
        text: '[Market Data] Unable to fetch live market data at this time.',
        values: {},
        data: {},
      };
    }
  },
};
