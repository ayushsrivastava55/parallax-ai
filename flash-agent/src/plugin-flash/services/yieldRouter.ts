import type {
  IdleCapitalSnapshot,
  YieldPosition,
  YieldRotationDecision,
} from "../types/index.js";

interface YieldRouterConfig {
  minIdleUsd?: number;
  recallBufferUsd?: number;
  maxUtilizationPct?: number;
  estApyBps?: number;
}

let state: YieldPosition = {
  provider: "venus",
  suppliedUsd: 0,
  availableIdleUsd: 0,
  estApyBps: 900,
  updatedAt: new Date().toISOString(),
};

function nowIso(): string {
  return new Date().toISOString();
}

export class YieldRouter {
  private readonly minIdleUsd: number;
  private readonly recallBufferUsd: number;
  private readonly maxUtilizationPct: number;
  private readonly estApyBps: number;

  constructor(config: YieldRouterConfig = {}) {
    this.minIdleUsd = config.minIdleUsd ?? Number(process.env.YIELD_MIN_IDLE_USD || 500);
    this.recallBufferUsd = config.recallBufferUsd ?? Number(process.env.YIELD_RECALL_BUFFER_USD || 200);
    this.maxUtilizationPct = config.maxUtilizationPct ?? Number(process.env.YIELD_MAX_UTILIZATION_PCT || 80);
    this.estApyBps = config.estApyBps ?? 900;
  }

  getStatus(): YieldPosition {
    return { ...state };
  }

  decide(snapshot: IdleCapitalSnapshot): YieldRotationDecision {
    const maxDeployableByPolicy = (snapshot.idleUsd * this.maxUtilizationPct) / 100;

    if (snapshot.openTradeDemandUsd > state.availableIdleUsd) {
      const needed = snapshot.openTradeDemandUsd - state.availableIdleUsd;
      const recallAmount = Math.min(needed + this.recallBufferUsd, state.suppliedUsd);
      if (recallAmount > 0) {
        return this.execute("RECALL_FOR_TRADE", recallAmount, snapshot, "Recall from Venus to fund active trade demand.");
      }
    }

    const deployAmount = Math.max(0, Math.min(maxDeployableByPolicy, snapshot.idleUsd - this.recallBufferUsd));
    if (snapshot.idleUsd >= this.minIdleUsd && deployAmount > 0) {
      return this.execute("IDLE_DEPLOY", deployAmount, snapshot, "Deploy idle capital to Venus supply strategy.");
    }

    return this.execute("NO_ACTION", 0, snapshot, "No yield rotation needed under current thresholds.", false);
  }

  private execute(
    reasonCode: YieldRotationDecision["reasonCode"],
    amountUsd: number,
    snapshot: IdleCapitalSnapshot,
    note: string,
    mutate = true
  ): YieldRotationDecision {
    if (mutate && reasonCode === "IDLE_DEPLOY") {
      state.suppliedUsd += amountUsd;
      state.availableIdleUsd = Math.max(0, snapshot.idleUsd - amountUsd);
      state.updatedAt = nowIso();
      state.estApyBps = this.estApyBps;
    } else if (mutate && reasonCode === "RECALL_FOR_TRADE") {
      state.suppliedUsd = Math.max(0, state.suppliedUsd - amountUsd);
      state.availableIdleUsd = snapshot.idleUsd + amountUsd;
      state.updatedAt = nowIso();
    } else {
      state.availableIdleUsd = snapshot.idleUsd;
      state.updatedAt = nowIso();
    }

    return {
      reasonCode,
      amountUsd,
      provider: "venus",
      note,
      executed: mutate && amountUsd > 0,
      snapshot,
      updatedPosition: { ...state },
    };
  }
}
