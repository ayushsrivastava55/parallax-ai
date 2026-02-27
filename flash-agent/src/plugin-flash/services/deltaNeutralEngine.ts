import type { ArbOpportunity, ExecutionBundle, ExecutionLeg, HedgePlan } from "../types/index.js";
import { saveBundle } from "./bundleStore.js";

interface PlanParams {
  opportunity: ArbOpportunity;
  maxCapitalUsd: number;
  slippageBps: number;
  feeBps: number;
  minNetEdgeBps: number;
}

interface DeltaNeutralConfig {
  defaultSlippageBps?: number;
  defaultFeeBps?: number;
  defaultMinNetEdgeBps?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeBundleId(opp: ArbOpportunity): string {
  const titleSlug = opp.marketTitle.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  return `bundle_${titleSlug}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

export class DeltaNeutralEngine {
  private readonly defaultSlippageBps: number;
  private readonly defaultFeeBps: number;
  private readonly defaultMinNetEdgeBps: number;

  constructor(config: DeltaNeutralConfig = {}) {
    this.defaultSlippageBps = config.defaultSlippageBps ?? 40;
    this.defaultFeeBps = config.defaultFeeBps ?? 20;
    this.defaultMinNetEdgeBps = config.defaultMinNetEdgeBps ?? 15;
  }

  planBundle(params: PlanParams): HedgePlan {
    const slippageBps = params.slippageBps || this.defaultSlippageBps;
    const feeBps = params.feeBps || this.defaultFeeBps;
    const minNetEdgeBps = params.minNetEdgeBps || this.defaultMinNetEdgeBps;
    const shares = Math.max(1, Math.floor(params.maxCapitalUsd / Math.max(params.opportunity.totalCost, 0.0001)));

    if (shares <= 0) {
      return { accepted: false, reason: "Insufficient capital for even 1 share-set." };
    }

    const legs: ExecutionLeg[] = params.opportunity.legs.map((leg) => ({
      platform: leg.platform,
      marketId: leg.marketId,
      outcomeId: leg.outcome.toLowerCase(),
      outcome: leg.outcome,
      side: "buy",
      price: leg.price,
      shares,
      estimatedCost: leg.price * shares,
    }));

    const totalEstimatedCost = legs.reduce((sum, leg) => sum + leg.estimatedCost, 0);
    const grossProfitPerShare = params.opportunity.profit;
    const slippageCostPerShare = (params.opportunity.totalCost * slippageBps) / 10_000;
    const feeCostPerShare = (params.opportunity.totalCost * feeBps) / 10_000;
    const netProfitPerShare = grossProfitPerShare - slippageCostPerShare - feeCostPerShare;
    const netEdgeBps = params.opportunity.totalCost > 0
      ? (netProfitPerShare / params.opportunity.totalCost) * 10_000
      : 0;

    if (netProfitPerShare <= 0 || netEdgeBps < minNetEdgeBps) {
      return {
        accepted: false,
        reason: `Rejected: net edge ${netEdgeBps.toFixed(1)} bps below threshold ${minNetEdgeBps} bps after fees/slippage.`,
      };
    }

    const createdAt = nowIso();
    const bundle: ExecutionBundle = {
      bundleId: makeBundleId(params.opportunity),
      marketTitle: params.opportunity.marketTitle,
      opportunityType: params.opportunity.type,
      legs,
      expectedProfitPerShare: netProfitPerShare,
      expectedProfitPercent: (netProfitPerShare / params.opportunity.totalCost) * 100,
      expectedTotalProfit: netProfitPerShare * shares,
      totalEstimatedCost,
      slippageBps,
      feeBps,
      status: "planned",
      createdAt,
      updatedAt: createdAt,
    };

    saveBundle(bundle);
    return { accepted: true, bundle };
  }
}
