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
import { getLedgerPositions, refreshLivePrices } from '../services/positionLedger.ts';
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

function mergePositions(a: Position[], b: Position[]): Position[] {
  const map = new Map<string, Position>();

  for (const position of [...a, ...b]) {
    const key = `${position.platform}|${position.marketId}|${position.outcomeLabel.toUpperCase()}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...position });
      continue;
    }

    const combinedSize = existing.size + position.size;
    const weightedEntry =
      combinedSize > 0
        ? ((existing.avgEntryPrice * existing.size) + (position.avgEntryPrice * position.size)) / combinedSize
        : existing.avgEntryPrice;
    const weightedCurrent =
      combinedSize > 0
        ? ((existing.currentPrice * existing.size) + (position.currentPrice * position.size)) / combinedSize
        : existing.currentPrice;
    const pnl = (weightedCurrent - weightedEntry) * combinedSize;
    const pnlPercent = weightedEntry > 0 ? ((weightedCurrent - weightedEntry) / weightedEntry) * 100 : 0;

    map.set(key, {
      ...existing,
      marketTitle: existing.marketTitle || position.marketTitle,
      size: combinedSize,
      avgEntryPrice: weightedEntry,
      currentPrice: weightedCurrent,
      pnl,
      pnlPercent,
    });
  }

  return Array.from(map.values());
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

      const walletAddress = String(runtime.getSetting('BNB_PUBLIC_KEY') || process.env.BNB_PUBLIC_KEY || '');
      const opinionKey = String(runtime.getSetting('OPINION_API_KEY') || process.env.OPINION_API_KEY || '');
      const predictfun = new PredictFunService({ useTestnet: true });
      const opinion = new OpinionService({
        enabled: (process.env.OPINION_ENABLED === 'true') && !!opinionKey,
        apiKey: opinionKey,
      });

      const ledgerPositions = await getLedgerPositions();
      const liveLedgerPositions = await refreshLivePrices(ledgerPositions, { predictfun, opinion });

      const diagnostics: string[] = [];
      let opinionPositions: Position[] = [];
      if (walletAddress && opinion.isConfigured) {
        try {
          opinionPositions = await opinion.getPositions(walletAddress);
        } catch (error) {
          diagnostics.push(`Opinion positions unavailable: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const allPositions = mergePositions(liveLedgerPositions, opinionPositions);

      const formatted = diagnostics.length > 0
        ? `${formatPositions(allPositions)}\n\nDiagnostics:\n${diagnostics.map((d) => `- ${d}`).join('\n')}`
        : formatPositions(allPositions);

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
