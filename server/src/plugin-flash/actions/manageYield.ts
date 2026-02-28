import type {
  Action,
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '../../lib/types.js';
import { logger } from '../../lib/types.js';
import type { IdleCapitalSnapshot } from "../types/index.ts";
import { YieldRouter } from "../services/yieldRouter.ts";

function parseDemand(text: string): number {
  const demandMatch = text.match(/(?:demand|trade|recall)\s*\$?(\d+(?:\.\d+)?)/i);
  if (!demandMatch) return 0;
  const parsed = parseFloat(demandMatch[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export const manageYieldAction: Action = {
  name: "MANAGE_YIELD",
  similes: ["YIELD_ROTATE", "YIELD_STATUS", "DEPLOY_IDLE", "RECALL_CAPITAL"],
  description:
    "Manage idle-capital yield rotation on Venus: deploy idle funds, recall funds for trade demand, and report status.",

  validate: async (_runtime: IAgentRuntime, message: Memory, _state: State): Promise<boolean> => {
    const text = (message.content?.text || "").toLowerCase();
    return (
      text.includes("yield") ||
      text.includes("idle capital") ||
      text.includes("venus") ||
      text.includes("recall capital") ||
      text.includes("deploy idle")
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
      const router = new YieldRouter({
        minIdleUsd: Number(runtime.getSetting("YIELD_MIN_IDLE_USD") || process.env.YIELD_MIN_IDLE_USD || 500),
        recallBufferUsd: Number(runtime.getSetting("YIELD_RECALL_BUFFER_USD") || process.env.YIELD_RECALL_BUFFER_USD || 200),
        maxUtilizationPct: Number(runtime.getSetting("YIELD_MAX_UTILIZATION_PCT") || process.env.YIELD_MAX_UTILIZATION_PCT || 80),
      });

      const idleUsd = Number(runtime.getSetting("SIM_IDLE_USD") || process.env.SIM_IDLE_USD || 1200);
      const demandUsd = parseDemand(text);
      const snapshot: IdleCapitalSnapshot = {
        idleUsd,
        openTradeDemandUsd: demandUsd,
        deployedUsd: router.getStatus().suppliedUsd,
        timestamp: new Date().toISOString(),
      };

      const decision = router.decide(snapshot);

      await callback({
        text:
          `═══ YIELD ROTATION ═══\n\n` +
          `Provider: Venus\n` +
          `Reason: ${decision.reasonCode}\n` +
          `Amount: $${decision.amountUsd.toFixed(2)}\n` +
          `Executed: ${decision.executed ? "yes" : "no"}\n` +
          `Supplied: $${decision.updatedPosition.suppliedUsd.toFixed(2)}\n` +
          `Idle: $${decision.updatedPosition.availableIdleUsd.toFixed(2)}\n` +
          `Est APY: ${(decision.updatedPosition.estApyBps / 100).toFixed(2)}%\n` +
          `Note: ${decision.note}`,
        actions: ["MANAGE_YIELD"],
        source: message.content.source,
      });

      return {
        text: `Yield decision: ${decision.reasonCode}`,
        success: true,
        data: {
          actionName: "MANAGE_YIELD",
          decision,
        },
      };
    } catch (error) {
      logger.error({ error }, "Error in MANAGE_YIELD action");
      await callback({
        text: `Yield management failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        actions: ["MANAGE_YIELD"],
        source: message.content.source,
      });
      return {
        text: "Yield management failed",
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },
};
