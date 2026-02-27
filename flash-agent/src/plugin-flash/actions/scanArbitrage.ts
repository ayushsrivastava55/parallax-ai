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
import { ArbEngine } from '../services/arbEngine.ts';
import type { ArbOpportunity } from '../types/index.ts';

function formatArbResults(opportunities: ArbOpportunity[]): string {
  if (opportunities.length === 0) {
    return '═══ ARBITRAGE SCAN ═══\n\nNo arbitrage opportunities found at this time. Markets are efficiently priced.\n\nTip: Arb opportunities are fleeting — I can scan again in a few minutes.';
  }

  let out = `═══ ARBITRAGE SCAN ═══\n\n`;
  out += `Found ${opportunities.length} opportunity${opportunities.length > 1 ? 'ies' : 'y'}:\n\n`;

  let totalProfit = 0;
  let totalCapital = 0;

  for (let i = 0; i < opportunities.length; i++) {
    const opp = opportunities[i];
    out += `Opportunity #${i + 1} (${opp.type === 'cross_platform' ? 'Cross-Platform' : 'Intra-Platform'}):\n`;
    out += `  "${opp.marketTitle}"\n`;

    for (const leg of opp.legs) {
      const platform = leg.platform === 'predictfun' ? 'Predict.fun' : 'Opinion';
      out += `  → ${platform} ${leg.outcome}: $${leg.price.toFixed(2)}\n`;
    }

    out += `  Combined cost: $${opp.totalCost.toFixed(4)} → Guaranteed payout: $${opp.guaranteedPayout.toFixed(2)}\n`;
    out += `  Profit: $${opp.profit.toFixed(4)}/share (${opp.profitPercent.toFixed(1)}% risk-free)\n`;
    out += `  Confidence: ${opp.confidence}\n\n`;

    // Estimate profit per $100
    const sharesper100 = Math.floor(100 / opp.totalCost);
    const profitper100 = sharesper100 * opp.profit;
    totalProfit += profitper100;
    totalCapital += 100;
  }

  out += `─────────────────────────────────\n`;
  out += `Estimated total profit: $${totalProfit.toFixed(2)} on $${totalCapital} capital\n\n`;
  out += `Execute all? Say "execute arb" to proceed (requires explicit approval for each trade).`;

  return out;
}

export const scanArbitrageAction: Action = {
  name: 'SCAN_ARBITRAGE',
  similes: [
    'FIND_ARBITRAGE',
    'ARB_SCAN',
    'GUARANTEED_PROFIT',
    'RISK_FREE',
    'FIND_ARB',
    'ARBITRAGE',
  ],
  description:
    'Scan all BNB Chain prediction markets for arbitrage opportunities. Checks intra-platform (YES+NO < $0.995) and cross-platform (same event, different prices on Opinion vs Predict.fun) mispricings.',

  validate: async (_runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    const text = (message.content?.text || '').toLowerCase();
    return (
      text.includes('arbitrage') ||
      text.includes('arb') ||
      text.includes('guaranteed') ||
      text.includes('risk-free') ||
      text.includes('risk free') ||
      text.includes('mispricing') ||
      text.includes('scan for profit')
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
      logger.info('SCAN_ARBITRAGE triggered');

      await callback({
        text: 'Scanning BNB Chain prediction markets for arbitrage opportunities...',
        actions: ['SCAN_ARBITRAGE'],
        source: message.content.source,
      });

      const predictfun = new PredictFunService({ useTestnet: true });
      const opinionKey = String(runtime.getSetting('OPINION_API_KEY') || process.env.OPINION_API_KEY || '');
      const opinion = new OpinionService({
        enabled: (process.env.OPINION_ENABLED === 'true') && !!opinionKey,
        apiKey: opinionKey,
      });
      const arbEngine = new ArbEngine({ predictfun, opinion });

      const opportunities = await arbEngine.scanAll();
      const formatted = formatArbResults(opportunities);

      await callback({
        text: formatted,
        actions: ['SCAN_ARBITRAGE'],
        source: message.content.source,
      });

      return {
        text: `Found ${opportunities.length} arbitrage opportunities`,
        success: true,
        values: {
          opportunityCount: opportunities.length,
          totalProfitEstimate: opportunities.reduce((sum, o) => sum + o.profit, 0),
        },
        data: {
          actionName: 'SCAN_ARBITRAGE',
          opportunities,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error in SCAN_ARBITRAGE action');
      await callback({
        text: `Arbitrage scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        actions: ['SCAN_ARBITRAGE'],
        source: message.content.source,
      });
      return {
        text: 'Arbitrage scan failed',
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: { text: 'Find me any guaranteed profit right now' },
      },
      {
        name: 'Flash',
        content: {
          text: 'Scanning 5 BNB Chain prediction markets for arbitrage...',
          actions: ['SCAN_ARBITRAGE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: { text: 'Any arb opportunities?' },
      },
      {
        name: 'Flash',
        content: {
          text: 'Running cross-platform arbitrage scan on Opinion and Predict.fun...',
          actions: ['SCAN_ARBITRAGE'],
        },
      },
    ],
  ],
};
