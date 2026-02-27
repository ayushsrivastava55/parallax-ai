import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { logger } from "@elizaos/core";
import { PredictFunService } from "../services/predictfun.ts";
import { OpinionService } from "../services/opinion.ts";
import { ArbEngine } from "../services/arbEngine.ts";
import { DeltaNeutralEngine } from "../services/deltaNeutralEngine.ts";
import { saveBundle } from "../services/bundleStore.ts";
import { recordTradeResult } from "../services/positionLedger.ts";
import type { Order, TradeResult, ExecutionBundle, ExecutionLeg } from "../types/index.ts";

function parseCapital(text: string): number {
  const capMatch = text.match(/\$?(\d+(?:\.\d+)?)\s*(?:usd|usdt|dollars|capital)?/i);
  if (!capMatch) return 200;
  const parsed = parseFloat(capMatch[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 200;
}

async function executeLeg(
  leg: ExecutionLeg,
  runtime: IAgentRuntime
): Promise<TradeResult> {
  const order: Order = {
    marketId: leg.marketId,
    platform: leg.platform,
    outcomeId: leg.outcomeId,
    side: leg.side,
    price: leg.price,
    size: leg.shares,
    type: "limit",
  };

  if (leg.platform === "predictfun") {
    const pf = new PredictFunService({
      useTestnet: true,
      privateKey: String(runtime.getSetting("BNB_PRIVATE_KEY") || process.env.BNB_PRIVATE_KEY || ""),
    });
    return pf.placeOrder(order);
  }

  const opinionKey = String(runtime.getSetting("OPINION_API_KEY") || process.env.OPINION_API_KEY || "");
  const op = new OpinionService({
    enabled: process.env.OPINION_ENABLED === "true" && !!opinionKey,
    apiKey: opinionKey,
    privateKey: String(runtime.getSetting("BNB_PRIVATE_KEY") || process.env.BNB_PRIVATE_KEY || ""),
  });
  return op.placeOrder(order);
}

export const executeArbBundleAction: Action = {
  name: "EXECUTE_ARB_BUNDLE",
  similes: ["EXECUTE_ARB", "RUN_ARB_BUNDLE", "HEDGE_BUNDLE", "DELTA_NEUTRAL_EXECUTE"],
  description:
    "Plan and execute a 2-leg delta-neutral arbitrage bundle. Executes both legs and attempts unwind if second leg fails.",

  validate: async (_runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    const text = (message.content?.text || "").toLowerCase();
    return (
      text.includes("execute arb") ||
      text.includes("arb bundle") ||
      text.includes("delta neutral") ||
      text.includes("run hedge")
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
      const text = message.content?.text || "";
      const maxCapitalUsd = parseCapital(text);

      await callback({
        text: `Planning delta-neutral bundle with up to $${maxCapitalUsd.toFixed(2)} capital...`,
        actions: ["EXECUTE_ARB_BUNDLE"],
        source: message.content.source,
      });

      const predictfun = new PredictFunService({ useTestnet: true });
      const opinionKey = String(runtime.getSetting("OPINION_API_KEY") || process.env.OPINION_API_KEY || "");
      const opinion = new OpinionService({
        enabled: process.env.OPINION_ENABLED === "true" && !!opinionKey,
        apiKey: opinionKey,
      });

      const arbEngine = new ArbEngine({ predictfun, opinion });
      const opportunities = await arbEngine.scanAll();
      const best = opportunities[0];
      if (!best) {
        await callback({
          text: "No arbitrage opportunities available right now.",
          actions: ["EXECUTE_ARB_BUNDLE"],
          source: message.content.source,
        });
        return { text: "No opportunities", success: false };
      }

      const planner = new DeltaNeutralEngine();
      const plan = planner.planBundle({
        opportunity: best,
        maxCapitalUsd,
        slippageBps: 40,
        feeBps: 20,
        minNetEdgeBps: 15,
      });

      if (!plan.accepted || !plan.bundle) {
        await callback({
          text: `Bundle rejected: ${plan.reason}`,
          actions: ["EXECUTE_ARB_BUNDLE"],
          source: message.content.source,
        });
        return { text: "Bundle rejected", success: false };
      }

      const bundle: ExecutionBundle = {
        ...plan.bundle,
        status: "executing",
        updatedAt: new Date().toISOString(),
      };
      saveBundle(bundle);

      const legA = bundle.legs[0];
      const legB = bundle.legs[1];
      const resultA = await executeLeg(legA, runtime);
      if (resultA.status === "rejected") {
        bundle.status = "failed";
        bundle.failureReason = "Leg A rejected";
        bundle.updatedAt = new Date().toISOString();
        saveBundle(bundle);
        await callback({
          text: `Bundle failed: leg 1 rejected on ${legA.platform}.`,
          actions: ["EXECUTE_ARB_BUNDLE"],
          source: message.content.source,
        });
        return { text: "Leg A rejected", success: false };
      }

      const resultB = await executeLeg(legB, runtime);
      if (resultB.status !== "rejected") {
        if (resultA.filledSize > 0) {
          await recordTradeResult({
            order: {
              marketId: legA.marketId,
              platform: legA.platform,
              outcomeId: legA.outcomeId,
              side: legA.side,
              price: legA.price,
              size: legA.shares,
              type: "limit",
            },
            trade: resultA,
            marketTitle: bundle.marketTitle,
            outcomeLabel: legA.outcome,
            source: "agent_action",
          });
        }
        if (resultB.filledSize > 0) {
          await recordTradeResult({
            order: {
              marketId: legB.marketId,
              platform: legB.platform,
              outcomeId: legB.outcomeId,
              side: legB.side,
              price: legB.price,
              size: legB.shares,
              type: "limit",
            },
            trade: resultB,
            marketTitle: bundle.marketTitle,
            outcomeLabel: legB.outcome,
            source: "agent_action",
          });
        }
        bundle.status = "success";
        bundle.updatedAt = new Date().toISOString();
        saveBundle(bundle);
        await callback({
          text:
            `Bundle executed successfully.\n` +
            `Bundle ID: ${bundle.bundleId}\n` +
            `Leg1: ${legA.platform} ${legA.outcome} ${legA.shares} @ $${legA.price.toFixed(2)}\n` +
            `Leg2: ${legB.platform} ${legB.outcome} ${legB.shares} @ $${legB.price.toFixed(2)}\n` +
            `Expected net profit: $${bundle.expectedTotalProfit.toFixed(2)}`,
          actions: ["EXECUTE_ARB_BUNDLE"],
          source: message.content.source,
        });
        return {
          text: "Bundle success",
          success: true,
          data: { actionName: "EXECUTE_ARB_BUNDLE", bundle, resultA, resultB },
        };
      }

      // Second leg failed: attempt unwind of leg A.
      try {
        const unwindOrder: ExecutionLeg = {
          ...legA,
          side: "buy",
          price: Math.max(0.01, Math.min(0.99, 1 - legA.price)),
          outcome: legA.outcome === "YES" ? "NO" : "YES",
          outcomeId: legA.outcomeId === "yes" ? "no" : "yes",
        };
        await executeLeg(unwindOrder, runtime);
        bundle.status = "partial_unwound";
        bundle.failureReason = "Leg B failed; unwind attempted.";
      } catch {
        bundle.status = "failed";
        bundle.failureReason = "Leg B failed; unwind also failed.";
      }

      bundle.updatedAt = new Date().toISOString();
      saveBundle(bundle);

      await callback({
        text: `Bundle execution degraded: ${bundle.failureReason}`,
        actions: ["EXECUTE_ARB_BUNDLE"],
        source: message.content.source,
      });

      return {
        text: "Bundle degraded",
        success: bundle.status === "partial_unwound",
        data: { actionName: "EXECUTE_ARB_BUNDLE", bundle, resultA, resultB },
      };
    } catch (error) {
      logger.error({ error }, "Error in EXECUTE_ARB_BUNDLE action");
      await callback({
        text: `Bundle execution failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        actions: ["EXECUTE_ARB_BUNDLE"],
        source: message.content.source,
      });
      return {
        text: "Bundle execution failed",
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};
