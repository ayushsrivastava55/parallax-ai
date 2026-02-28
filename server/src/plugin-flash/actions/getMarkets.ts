import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  Content,
} from '../../lib/types.js';
import { logger } from '../../lib/types.js';
import { PredictFunService } from '../services/predictfun.ts';
import { OpinionService } from '../services/opinion.ts';
import type { Market } from '../types/index.ts';

function formatMarketTable(markets: Market[]): string {
  if (markets.length === 0) return 'No active markets found.';

  let table = '═══ ACTIVE PREDICTION MARKETS ═══\n\n';
  table += 'Platform     │ Market                                    │ YES    │ NO     │ Liquidity\n';
  table += '─────────────┼───────────────────────────────────────────┼────────┼────────┼──────────\n';

  for (const m of markets.slice(0, 15)) {
    const yes = m.outcomes.find((o) => o.label === 'YES');
    const no = m.outcomes.find((o) => o.label === 'NO');
    const platform = m.platform === 'predictfun' ? 'Predict.fun' : 'Opinion   ';
    const title = m.title.length > 39 ? m.title.slice(0, 36) + '...' : m.title.padEnd(39);
    const yesStr = yes ? `$${yes.price.toFixed(2)}`.padEnd(6) : '  -   ';
    const noStr = no ? `$${no.price.toFixed(2)}`.padEnd(6) : '  -   ';
    const liq = m.liquidity > 0 ? `$${(m.liquidity / 1000).toFixed(1)}k` : '  -   ';

    table += `${platform}  │ ${title} │ ${yesStr} │ ${noStr} │ ${liq}\n`;
  }

  table += `\n${markets.length} markets found. Say "analyze [market name]" for deep analysis.`;
  return table;
}

export const getMarketsAction: Action = {
  name: 'GET_MARKETS',
  similes: [
    'LIST_MARKETS',
    'SHOW_MARKETS',
    'FETCH_MARKETS',
    'AVAILABLE_MARKETS',
    'WHAT_MARKETS',
    'PREDICTION_MARKETS',
  ],
  description:
    'Fetch and display active prediction markets from Opinion.trade and Predict.fun on BNB Chain. Use when the user asks about available markets, what markets exist, or wants to browse prediction markets.',

  validate: async (_runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    const text = (message.content?.text || '').toLowerCase();
    return (
      text.includes('market') ||
      text.includes('prediction') ||
      text.includes('available') ||
      text.includes('browse') ||
      text.includes('list') ||
      text.includes('what can i bet')
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    try {
      logger.info('GET_MARKETS handler starting...');

      const predictfun = new PredictFunService({ useTestnet: true });
      const opinionKey = String(runtime.getSetting('OPINION_API_KEY') || process.env.OPINION_API_KEY || '');
      const opinion = new OpinionService({
        enabled: (process.env.OPINION_ENABLED === 'true') && !!opinionKey,
        apiKey: opinionKey,
      });

      // Fetch from both platforms in parallel with 8s overall timeout
      const fetchWithTimeout = Promise.race([
        Promise.allSettled([
          predictfun.getMarkets({ status: 'active' }),
          opinion.getMarkets({ status: 'active' }),
        ]),
        new Promise<[PromiseSettledResult<Market[]>, PromiseSettledResult<Market[]>]>((resolve) =>
          setTimeout(() => resolve([
            { status: 'rejected', reason: new Error('timeout') } as PromiseRejectedResult,
            { status: 'rejected', reason: new Error('timeout') } as PromiseRejectedResult,
          ]), 8000)
        ),
      ]);

      const [pfMarkets, opMarkets] = await fetchWithTimeout;
      logger.info('GET_MARKETS: markets fetched');

      const allMarkets: Market[] = [];

      if (pfMarkets.status === 'fulfilled') {
        allMarkets.push(...pfMarkets.value);
      } else {
        logger.warn('Failed to fetch Predict.fun markets:', pfMarkets.reason);
      }

      if (opMarkets.status === 'fulfilled') {
        allMarkets.push(...opMarkets.value);
      } else {
        logger.warn('Failed to fetch Opinion markets:', opMarkets.reason);
      }

      // Enrich top 3 markets with orderbook prices in parallel (2s timeout)
      const enrichPromises = allMarkets.slice(0, 3).map(async (market) => {
        try {
          const svc = market.platform === 'predictfun' ? predictfun : opinion;
          const prices = await Promise.race([
            svc.getMarketPrice(market.id),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
          ]);
          const yes = market.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes');
          const no = market.outcomes.find((o) => o.label === 'NO' || o.label === 'No');
          if (yes) yes.price = prices.yes;
          if (no) no.price = prices.no;
        } catch {
          // Skip price enrichment on error/timeout
        }
      });
      await Promise.allSettled(enrichPromises);
      logger.info('GET_MARKETS: prices enriched');

      const table = formatMarketTable(allMarkets);

      const responseContent: Content = {
        text: table,
        actions: ['GET_MARKETS'],
        source: message.content.source,
      };

      logger.info('GET_MARKETS: sending callback with table...');
      await callback(responseContent);
      logger.info('GET_MARKETS: callback sent, returning result');

      return {
        text: `Found ${allMarkets.length} markets across platforms`,
        success: true,
        values: {
          marketCount: allMarkets.length,
        },
        data: {
          actionName: 'GET_MARKETS',
          markets: allMarkets,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error in GET_MARKETS action');
      await callback({
        text: 'Failed to fetch markets. Please try again.',
        actions: ['GET_MARKETS'],
        source: message.content.source,
      });
      return {
        text: 'Failed to fetch markets',
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: { text: 'What prediction markets are available?' },
      },
      {
        name: 'Flash',
        content: {
          text: 'Fetching active markets from Opinion.trade and Predict.fun...',
          actions: ['GET_MARKETS'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: { text: 'Show me prediction markets' },
      },
      {
        name: 'Flash',
        content: {
          text: 'Scanning BNB Chain prediction markets...',
          actions: ['GET_MARKETS'],
        },
      },
    ],
  ],
};
