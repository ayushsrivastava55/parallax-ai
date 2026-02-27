import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  Content,
} from '@elizaos/core';
import { logger } from '@elizaos/core';
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
      logger.info('Fetching markets from all platforms...');

      const predictfun = new PredictFunService({ useTestnet: true });
      const opinion = new OpinionService({
        apiKey: runtime.getSetting('OPINION_API_KEY') || process.env.OPINION_API_KEY,
      });

      // Fetch from both platforms in parallel
      const [pfMarkets, opMarkets] = await Promise.allSettled([
        predictfun.getMarkets({ status: 'active' }),
        opinion.getMarkets({ status: 'active' }),
      ]);

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

      // Try to enrich with orderbook prices for top markets
      for (const market of allMarkets.slice(0, 10)) {
        try {
          const svc = market.platform === 'predictfun' ? predictfun : opinion;
          const prices = await svc.getMarketPrice(market.id);
          const yes = market.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes');
          const no = market.outcomes.find((o) => o.label === 'NO' || o.label === 'No');
          if (yes) yes.price = prices.yes;
          if (no) no.price = prices.no;
        } catch {
          // Skip price enrichment on error
        }
      }

      const table = formatMarketTable(allMarkets);

      const responseContent: Content = {
        text: table,
        actions: ['GET_MARKETS'],
        source: message.content.source,
      };

      await callback(responseContent);

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
