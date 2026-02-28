import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '../../lib/types.js';
import { logger } from '../../lib/types.js';
import { PredictFunService } from '../services/predictfun.ts';
import { OpinionService } from '../services/opinion.ts';
import { recordTradeResult } from '../services/positionLedger.ts';
import { ERC8004Service, buildERC8004Config } from '../services/erc8004.ts';
import { lastAnalysis } from './analyzeMarket.ts';
import type { Order, TradeResult, Platform } from '../types/index.ts';

interface TradeIntent {
  platform: Platform;
  marketId: string;
  marketTitle: string;
  outcomeId: string;
  outcome: string;
  shares: number;
  price: number;
}

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
    state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]
  ): Promise<ActionResult> => {
    try {
      const text = message.content?.text || '';
      logger.info({ text }, 'EXECUTE_TRADE triggered');

      // Parse trade intent from message + prior analysis
      const tradeIntent = await parseTradeIntent(runtime, text, state);

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
        `  Market: ${tradeIntent.marketTitle}\n` +
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
        const pf = new PredictFunService({
          useTestnet: true,
          privateKey: String(runtime.getSetting('BNB_PRIVATE_KEY') || process.env.BNB_PRIVATE_KEY || ''),
        });
        result = await pf.placeOrder(order);
      } else {
        const opinionExecutionEnabled =
          String(runtime.getSetting('OPINION_EXECUTION_ENABLED') || process.env.OPINION_EXECUTION_ENABLED || 'false') === 'true';
        if (!opinionExecutionEnabled) {
          throw new Error('Opinion execution is disabled (read-only connector until CLOB integration is enabled).');
        }
        const opinionKey = String(runtime.getSetting('OPINION_API_KEY') || process.env.OPINION_API_KEY || '');
        const op = new OpinionService({
          enabled: (process.env.OPINION_ENABLED === 'true') && !!opinionKey,
          apiKey: opinionKey,
          privateKey: String(runtime.getSetting('BNB_PRIVATE_KEY') || process.env.BNB_PRIVATE_KEY || ''),
        });
        result = await op.placeOrder(order);
      }

      // Persist only actual filled quantity to the durable ledger
      if (result.filledSize > 0) {
        await recordTradeResult({
          order,
          trade: result,
          marketTitle: tradeIntent.marketTitle,
          outcomeLabel: tradeIntent.outcome,
          source: 'agent_action',
        });
      }

      // ERC-8004 reputation feedback (fire-and-forget, only for executed trades)
      if (result.status === 'filled' || result.status === 'submitted') {
        try {
          const erc8004Config = buildERC8004Config(runtime);
          if (erc8004Config) {
            const erc8004 = new ERC8004Service(erc8004Config);
            await erc8004.submitTradeFeedback({
              success: true,
              profitPercent: 0, // Not known at execution time
              marketTitle: tradeIntent.marketTitle,
              platform: tradeIntent.platform,
            });
          }
        } catch { /* non-critical, fire-and-forget */ }
      }

      const resultText = result.status === 'rejected'
        ? `Trade rejected. ${tradeIntent.platform === 'opinion' ? 'Opinion API key or wallet not configured.' : 'Check wallet balance.'}`
        : `Order placed successfully!\n\n` +
          `  Order ID: ${result.orderId}\n` +
          `  Status: ${result.status}\n` +
          `  Filled: ${result.filledSize} shares @ $${result.filledPrice.toFixed(2)}\n` +
          `  Cost: $${result.cost.toFixed(2)}\n` +
          `  Potential Payout: $${result.filledSize.toFixed(2)}\n` +
          (result.txHash ? `  TX: ${result.txHash}\n` : '') +
          `\n  Fills recorded in ledger. Use "show my positions" to view portfolio.`;

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
  text: string,
  state: State
): Promise<TradeIntent | null> {
  const lowerText = text.toLowerCase();

  // Parse user preferences from text
  const sharesMatch = text.match(/(\d+)\s*(?:shares|yes|no)/i);
  const shares = sharesMatch ? parseInt(sharesMatch[1]) : 100;

  const isNo = /\bno\b/i.test(lowerText) && !lowerText.includes('option');
  const isOption2 = /option\s*2/i.test(lowerText);
  const outcome = isNo ? 'NO' : 'YES';

  const explicitPredictFun = lowerText.includes('predict');
  const explicitOpinion = lowerText.includes('opinion');
  const opinionExecutionEnabled =
    String(runtime.getSetting('OPINION_EXECUTION_ENABLED') || process.env.OPINION_EXECUTION_ENABLED || 'false') === 'true';

  // Strategy 1: Use lastAnalysis (module-level, always available)
  if (lastAnalysis) {
    const analysis = lastAnalysis;
    const market = analysis.market;

    // Option 2 = arb trade (if available)
    if (isOption2 && analysis.arbOpportunities.length > 0) {
      const arb = analysis.arbOpportunities[0];
      const leg = arb.legs[0];
      return {
        platform: leg.platform,
        marketId: leg.marketId,
        marketTitle: arb.marketTitle,
        outcomeId: leg.outcome.toLowerCase(),
        outcome: leg.outcome,
        shares,
        price: leg.price,
      };
    }

    // Option 1 = directional (recommended) — use best-price platform
    const bestCross = analysis.crossPlatformPrices.length > 0
      ? analysis.crossPlatformPrices.sort((a, b) =>
          outcome === 'YES' ? a.yesPrice - b.yesPrice : a.noPrice - b.noPrice
        )[0]
      : null;

    const suggestedPlatform = bestCross?.platform ?? market.platform;
    const defaultPlatform = suggestedPlatform === 'opinion' && !opinionExecutionEnabled
      ? 'predictfun'
      : suggestedPlatform;
    const platform: Platform = explicitOpinion
      ? 'opinion'
      : explicitPredictFun
      ? 'predictfun'
      : defaultPlatform;

    const yesOutcome = market.outcomes.find((o) => o.label === 'YES' || o.label === 'Yes');
    const noOutcome = market.outcomes.find((o) => o.label === 'NO' || o.label === 'No');

    const price = outcome === 'YES'
      ? (bestCross?.yesPrice ?? yesOutcome?.price ?? 0.5)
      : (bestCross?.noPrice ?? noOutcome?.price ?? 0.5);

    const outcomeObj = outcome === 'YES' ? yesOutcome : noOutcome;

    return {
      platform,
      marketId: bestCross?.marketId ?? market.id,
      marketTitle: market.title,
      outcomeId: outcomeObj?.id ?? outcome.toLowerCase(),
      outcome,
      shares,
      price,
    };
  }

  // Strategy 2: Check state.data.actionResults for prior ANALYZE_MARKET
  try {
    const actionResults = (state as any)?.data?.actionResults;
    if (Array.isArray(actionResults)) {
      const analyzeResult = [...actionResults]
        .reverse()
        .find((r: any) => r.data?.actionName === 'ANALYZE_MARKET' && r.success);

      if (analyzeResult?.data?.analysis) {
        const analysis = analyzeResult.data.analysis;
        const market = analysis.market;
        const yesOutcome = market.outcomes.find((o: any) => o.label === 'YES' || o.label === 'Yes');
        const noOutcome = market.outcomes.find((o: any) => o.label === 'NO' || o.label === 'No');

        const price = outcome === 'YES'
          ? (yesOutcome?.price ?? 0.5)
          : (noOutcome?.price ?? 0.5);

        return {
          platform: market.platform,
          marketId: market.id,
          marketTitle: market.title,
          outcomeId: (outcome === 'YES' ? yesOutcome?.id : noOutcome?.id) ?? outcome.toLowerCase(),
          outcome,
          shares,
          price,
        };
      }
    }
  } catch {
    // State access failed, continue to fallback
  }

  // Strategy 3: Search recent conversation for market references
  try {
    const memories = await runtime.getMemories({
      roomId: state.roomId as `${string}-${string}-${string}-${string}-${string}`,
      tableName: 'messages',
      count: 10,
    });

    for (const mem of memories) {
      const memText = mem.content?.text || '';
      // Look for analysis output markers with a concrete market ID
      const marketIdMatch = memText.match(/Market ID:\s*([A-Za-z0-9_-]+)/i);
      const marketMatch = memText.match(/Market:\s*(.+)/);
      const platformMatch = memText.match(/Platform:\s*(Predict\.fun|Opinion)/);
      const priceMatch = memText.match(/YES Price.*?\$(\d+\.\d+)/);

      if (marketMatch && marketIdMatch) {
        const platform: Platform = platformMatch?.[1] === 'Opinion' ? 'opinion' : 'predictfun';
        const price = priceMatch ? parseFloat(priceMatch[1]) : 0.5;

        return {
          platform: explicitOpinion ? 'opinion' : explicitPredictFun ? 'predictfun' : platform,
          marketId: marketIdMatch[1].trim(),
          marketTitle: marketMatch[1].trim(),
          outcomeId: outcome.toLowerCase(),
          outcome,
          shares,
          price: outcome === 'YES' ? price : 1 - price,
        };
      }
    }
  } catch {
    // Memory search failed
  }

  // No analysis context found — cannot proceed
  logger.warn('No prior analysis found for trade execution');
  return null;
}
