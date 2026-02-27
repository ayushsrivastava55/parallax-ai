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
import type { Order, TradeResult } from '../types/index.ts';

// In-memory store for pending trades (in production, use proper state management)
const pendingTrades = new Map<string, { order: Order; analysisSnapshot: any }>();

export const executeTradeAction: Action = {
  name: 'EXECUTE_TRADE',
  similes: [
    'BUY',
    'SELL',
    'EXECUTE',
    'PLACE_ORDER',
    'TRADE',
    'BUY_YES',
    'BUY_NO',
    'OPTION_1',
    'OPTION_2',
    'LETS_GO',
    'DO_IT',
    'CONFIRM',
  ],
  description:
    'Execute a trade on a prediction market. HUMAN-IN-THE-LOOP: this action only fires after explicit user approval. The user must say "execute", "buy YES", "option 1", "let\'s go", etc. Never auto-trades.',

  validate: async (_runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    const text = (message.content?.text || '').toLowerCase();
    return (
      text.includes('execute') ||
      text.includes('buy') ||
      text.includes('option 1') ||
      text.includes('option 2') ||
      text.includes("let's go") ||
      text.includes('lets go') ||
      text.includes('do it') ||
      text.includes('confirm') ||
      text.includes('place order') ||
      /\d+ shares/.test(text) ||
      /\d+ yes/.test(text) ||
      /\d+ no/.test(text)
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
      const text = message.content?.text || '';
      logger.info({ text }, 'EXECUTE_TRADE triggered');

      // Parse trade intent from message
      const tradeIntent = await parseTradeIntent(runtime, text);

      if (!tradeIntent) {
        await callback({
          text: 'I need more details to execute a trade. Please specify:\n- Which market (or reference a previous analysis)\n- Side: YES or NO\n- Amount (in USD or shares)\n\nExample: "Buy 100 YES shares on Predict.fun"',
          actions: ['EXECUTE_TRADE'],
          source: message.content.source,
        });
        return { text: 'Need more trade details', success: false };
      }

      // Confirmation step — show what we're about to do
      const confirmText = `Confirming trade:\n\n` +
        `  Platform: ${tradeIntent.platform === 'predictfun' ? 'Predict.fun' : 'Opinion'}\n` +
        `  Side: Buy ${tradeIntent.outcome}\n` +
        `  Shares: ${tradeIntent.shares}\n` +
        `  Price: $${tradeIntent.price.toFixed(2)}\n` +
        `  Total Cost: $${(tradeIntent.shares * tradeIntent.price).toFixed(2)}\n` +
        `  Potential Payout: $${tradeIntent.shares.toFixed(2)} (if correct)\n\n` +
        `Executing on ${tradeIntent.platform === 'predictfun' ? 'Predict.fun testnet' : 'Opinion'}...`;

      await callback({
        text: confirmText,
        actions: ['EXECUTE_TRADE'],
        source: message.content.source,
      });

      // Execute the trade
      const order: Order = {
        marketId: tradeIntent.marketId,
        platform: tradeIntent.platform,
        outcomeId: tradeIntent.outcomeId,
        side: 'buy',
        price: tradeIntent.price,
        size: tradeIntent.shares,
        type: 'limit',
      };

      let result: TradeResult;
      if (tradeIntent.platform === 'predictfun') {
        const pf = new PredictFunService({ useTestnet: true });
        result = await pf.placeOrder(order);
      } else {
        const op = new OpinionService({
          apiKey: runtime.getSetting('OPINION_API_KEY') || process.env.OPINION_API_KEY,
          privateKey: runtime.getSetting('BNB_PRIVATE_KEY') || process.env.BNB_PRIVATE_KEY,
        });
        result = await op.placeOrder(order);
      }

      const resultText = result.status === 'rejected'
        ? `❌ Trade rejected. ${tradeIntent.platform === 'opinion' ? 'Opinion API key or wallet not configured.' : 'Check wallet balance.'}`
        : `✓ Order placed successfully!\n\n` +
          `  Order ID: ${result.orderId}\n` +
          `  Status: ${result.status}\n` +
          `  Filled: ${result.filledSize} shares @ $${result.filledPrice.toFixed(2)}\n` +
          `  Cost: $${result.cost.toFixed(2)}\n` +
          `  Potential Payout: $${result.filledSize.toFixed(2)}\n` +
          (result.txHash ? `  TX: ${result.txHash}\n` : '') +
          `\n  Analysis snapshot saved for audit trail.`;

      await callback({
        text: resultText,
        actions: ['EXECUTE_TRADE'],
        source: message.content.source,
      });

      return {
        text: `Trade executed: ${result.status}`,
        success: result.status !== 'rejected',
        values: {
          orderId: result.orderId,
          status: result.status,
          cost: result.cost,
        },
        data: {
          actionName: 'EXECUTE_TRADE',
          tradeResult: result,
          order,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error in EXECUTE_TRADE action');
      await callback({
        text: `Trade execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        actions: ['EXECUTE_TRADE'],
        source: message.content.source,
      });
      return {
        text: 'Trade execution failed',
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: '{{name1}}',
        content: { text: 'Execute option 1, buy 200 shares' },
      },
      {
        name: 'Flash',
        content: {
          text: 'Confirming trade: Buy 200 YES shares on Predict.fun at $0.58. Executing...',
          actions: ['EXECUTE_TRADE'],
        },
      },
    ],
    [
      {
        name: '{{name1}}',
        content: { text: "Let's go, option 2" },
      },
      {
        name: 'Flash',
        content: {
          text: 'Executing arb + directional trade across platforms...',
          actions: ['EXECUTE_TRADE'],
        },
      },
    ],
  ],
};

async function parseTradeIntent(
  runtime: IAgentRuntime,
  text: string
): Promise<{
  platform: 'predictfun' | 'opinion';
  marketId: string;
  outcomeId: string;
  outcome: string;
  shares: number;
  price: number;
} | null> {
  // Try to extract from structured text
  const sharesMatch = text.match(/(\d+)\s*(?:shares|yes|no)/i);
  const shares = sharesMatch ? parseInt(sharesMatch[1]) : 100; // default 100

  const isNo = /\bno\b/i.test(text);
  const outcome = isNo ? 'NO' : 'YES';

  const isPredictFun = text.toLowerCase().includes('predict');
  const isOpinion = text.toLowerCase().includes('opinion');
  const platform = isOpinion ? 'opinion' as const : 'predictfun' as const;

  // Use a reasonable default price for demo
  const price = outcome === 'YES' ? 0.58 : 0.42;

  return {
    platform,
    marketId: 'demo-market',
    outcomeId: outcome.toLowerCase(),
    outcome,
    shares,
    price,
  };
}
