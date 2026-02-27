import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '@elizaos/core';
import { logger } from '@elizaos/core';
import { PredictFunService } from '../services/predictfun.ts';
import { OpinionService } from '../services/opinion.ts';
import type { Position } from '../types/index.ts';

function formatPositions(positions: Position[]): string {
  if (positions.length === 0) {
    return '═══ PORTFOLIO ═══\n\nNo open positions. Use "analyze [thesis]" to find opportunities.';
  }

  let out = '═══ PORTFOLIO ═══\n\n';
  out += 'Platform     │ Market                          │ Side │ Size │ Entry  │ Current │ P&L\n';
  out += '─────────────┼─────────────────────────────────┼──────┼──────┼────────┼─────────┼────────\n';

  let totalPnl = 0;
  let totalValue = 0;

  for (const p of positions) {
    const platform = p.platform === 'predictfun' ? 'Predict.fun' : 'Opinion   ';
    const title = p.marketTitle.length > 29 ? p.marketTitle.slice(0, 26) + '...' : p.marketTitle.padEnd(29);
    const pnlStr = p.pnl >= 0 ? `+$${p.pnl.toFixed(2)}` : `-$${Math.abs(p.pnl).toFixed(2)}`;
    const pnlColor = p.pnl >= 0 ? pnlStr : pnlStr;

    out += `${platform}  │ ${title} │ ${p.outcomeLabel.padEnd(4)} │ ${String(p.size).padEnd(4)} │ $${p.avgEntryPrice.toFixed(2)}  │ $${p.currentPrice.toFixed(2)}   │ ${pnlColor}\n`;

    totalPnl += p.pnl;
    totalValue += p.currentPrice * p.size;
  }

  out += '─────────────┴─────────────────────────────────┴──────┴──────┴────────┴─────────┴────────\n';
  out += `Total Portfolio Value: $${totalValue.toFixed(2)}\n`;
  out += `Total P&L: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}\n`;

  return out;
}

export const getPositionsAction: Action = {
  name: 'GET_POSITIONS',
  similes: [
    'MY_POSITIONS',
    'PORTFOLIO',
    'SHOW_POSITIONS',
    'PNL',
    'PROFIT_LOSS',
    'MY_TRADES',
    'OPEN_POSITIONS',
  ],
  description:
    'Show open positions and P&L across Opinion.trade and Predict.fun prediction markets.',

  validate: async (_runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    const text = (message.content?.text || '').toLowerCase();
    return (
      text.includes('position') ||
      text.includes('portfolio') ||
      text.includes('p&l') ||
      text.includes('pnl') ||
      text.includes('my trades') ||
      text.includes('holdings') ||
      text.includes('what do i own')
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
      logger.info('GET_POSITIONS triggered');

      const walletAddress = runtime.getSetting('BNB_PUBLIC_KEY') || process.env.BNB_PUBLIC_KEY || '';

      const predictfun = new PredictFunService({ useTestnet: true });
      const opinionKey = runtime.getSetting('OPINION_API_KEY') || process.env.OPINION_API_KEY;
      const opinion = new OpinionService({
        enabled: (process.env.OPINION_ENABLED === 'true') && !!opinionKey,
        apiKey: opinionKey,
      });

      const [pfPositions, opPositions] = await Promise.allSettled([
        predictfun.getPositions(walletAddress),
        opinion.getPositions(walletAddress),
      ]);

      const allPositions: Position[] = [];
      if (pfPositions.status === 'fulfilled') allPositions.push(...pfPositions.value);
      if (opPositions.status === 'fulfilled') allPositions.push(...opPositions.value);

      const formatted = formatPositions(allPositions);

      await callback({
        text: formatted,
        actions: ['GET_POSITIONS'],
        source: message.content.source,
      });

      return {
        text: `Showing ${allPositions.length} positions`,
        success: true,
        values: {
          positionCount: allPositions.length,
        },
        data: {
          actionName: 'GET_POSITIONS',
          positions: allPositions,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error in GET_POSITIONS action');
      await callback({
        text: `Failed to fetch positions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        actions: ['GET_POSITIONS'],
        source: message.content.source,
      });
      return {
        text: 'Failed to fetch positions',
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: { text: 'Show me my positions' },
      },
      {
        name: 'Flash',
        content: {
          text: 'Fetching your portfolio across Opinion and Predict.fun...',
          actions: ['GET_POSITIONS'],
        },
      },
    ],
  ],
};
