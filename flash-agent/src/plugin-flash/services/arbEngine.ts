import type {
  Market,
  ArbOpportunity,
  ArbLeg,
  Platform,
} from "../types/index.js";
import type { PredictFunService } from "./predictfun.js";
import type { OpinionService } from "./opinion.js";

const INTRA_THRESHOLD = 0.995; // YES_ask + NO_ask < 0.995 = arb
const CROSS_THRESHOLD = 0.015; // Cross-platform spread > 1.5% = arb

interface ArbEngineConfig {
  predictfun: PredictFunService;
  opinion: OpinionService;
}

export class ArbEngine {
  private predictfun: PredictFunService;
  private opinion: OpinionService;

  constructor(config: ArbEngineConfig) {
    this.predictfun = config.predictfun;
    this.opinion = config.opinion;
  }

  /**
   * Scan for all arbitrage opportunities across platforms.
   */
  async scanAll(): Promise<ArbOpportunity[]> {
    const [intra, cross] = await Promise.all([
      this.scanIntraPlatform(),
      this.scanCrossPlatform(),
    ]);

    return [...intra, ...cross].sort(
      (a, b) => b.profitPercent - a.profitPercent
    );
  }

  /**
   * Intra-platform: Check if YES_ask + NO_ask < threshold on each platform.
   * This means you can buy both sides for less than $1 and guarantee profit.
   */
  async scanIntraPlatform(): Promise<ArbOpportunity[]> {
    const opportunities: ArbOpportunity[] = [];

    // Scan Predict.fun
    try {
      const pfMarkets = await this.predictfun.getMarkets({ status: "active" });
      for (const market of pfMarkets.slice(0, 20)) {
        try {
          const ob = await this.predictfun.getOrderbook(market.id);
          const yesAsk = ob.asks[0]?.price ?? 1;
          const noAsk = 1 - (ob.bids[0]?.price ?? 0); // NO ask = 1 - YES bid

          const totalCost = yesAsk + noAsk;
          if (totalCost < INTRA_THRESHOLD) {
            const profit = 1 - totalCost;
            opportunities.push({
              type: "intra_platform",
              description: `Buy YES + NO on Predict.fun for $${totalCost.toFixed(4)}, guaranteed payout $1.00`,
              platforms: ["predictfun"],
              marketTitle: market.title,
              legs: [
                {
                  platform: "predictfun",
                  marketId: market.id,
                  outcome: "YES",
                  side: "buy",
                  price: yesAsk,
                },
                {
                  platform: "predictfun",
                  marketId: market.id,
                  outcome: "NO",
                  side: "buy",
                  price: noAsk,
                },
              ],
              totalCost,
              guaranteedPayout: 1,
              profit,
              profitPercent: (profit / totalCost) * 100,
              confidence: profit > 0.03 ? "high" : profit > 0.01 ? "medium" : "low",
            });
          }
        } catch {
          // Skip market if orderbook fetch fails
        }
      }
    } catch {
      // Predict.fun not available
    }

    // Scan Opinion
    try {
      const opMarkets = await this.opinion.getMarkets({ status: "active" });
      for (const market of opMarkets.slice(0, 20)) {
        const yesOutcome = market.outcomes.find((o) => o.label === "YES");
        const noOutcome = market.outcomes.find((o) => o.label === "NO");
        if (!yesOutcome || !noOutcome) continue;

        const yesAsk = yesOutcome.bestAsk || yesOutcome.price;
        const noAsk = noOutcome.bestAsk || noOutcome.price;
        const totalCost = yesAsk + noAsk;

        if (totalCost < INTRA_THRESHOLD) {
          const profit = 1 - totalCost;
          opportunities.push({
            type: "intra_platform",
            description: `Buy YES + NO on Opinion for $${totalCost.toFixed(4)}, guaranteed payout $1.00`,
            platforms: ["opinion"],
            marketTitle: market.title,
            legs: [
              {
                platform: "opinion",
                marketId: market.id,
                outcome: "YES",
                side: "buy",
                price: yesAsk,
              },
              {
                platform: "opinion",
                marketId: market.id,
                outcome: "NO",
                side: "buy",
                price: noAsk,
              },
            ],
            totalCost,
            guaranteedPayout: 1,
            profit,
            profitPercent: (profit / totalCost) * 100,
            confidence: profit > 0.03 ? "high" : profit > 0.01 ? "medium" : "low",
          });
        }
      }
    } catch {
      // Opinion not available
    }

    return opportunities;
  }

  /**
   * Cross-platform: Find same event on both platforms with price divergence.
   * If YES on platform A + NO on platform B < $1, guaranteed profit.
   */
  async scanCrossPlatform(): Promise<ArbOpportunity[]> {
    const opportunities: ArbOpportunity[] = [];

    try {
      const [pfMarkets, opMarkets] = await Promise.all([
        this.predictfun.getMarkets({ status: "active" }),
        this.opinion.getMarkets({ status: "active" }),
      ]);

      // Match markets by canonical hash
      for (const pfMarket of pfMarkets) {
        if (!pfMarket.canonicalHash) continue;

        const matched = opMarkets.find(
          (op) => op.canonicalHash === pfMarket.canonicalHash
        );
        if (!matched) continue;

        // Get prices from both platforms
        let pfPrices: { yes: number; no: number };
        let opPrices: { yes: number; no: number };

        try {
          [pfPrices, opPrices] = await Promise.all([
            this.predictfun.getMarketPrice(pfMarket.id),
            this.opinion.getMarketPrice(matched.id),
          ]);
        } catch {
          continue;
        }

        const spread = Math.abs(pfPrices.yes - opPrices.yes);

        if (spread > CROSS_THRESHOLD) {
          // Determine arb direction
          const buyYesPlatform: Platform =
            pfPrices.yes < opPrices.yes ? "predictfun" : "opinion";
          const buyNoPlatform: Platform =
            buyYesPlatform === "predictfun" ? "opinion" : "predictfun";

          const yesPrice =
            buyYesPlatform === "predictfun" ? pfPrices.yes : opPrices.yes;
          const noPrice =
            buyNoPlatform === "predictfun" ? pfPrices.no : opPrices.no;

          const totalCost = yesPrice + noPrice;

          if (totalCost < 1) {
            const profit = 1 - totalCost;
            opportunities.push({
              type: "cross_platform",
              description: `Buy YES on ${buyYesPlatform} ($${yesPrice.toFixed(2)}) + NO on ${buyNoPlatform} ($${noPrice.toFixed(2)})`,
              platforms: [buyYesPlatform, buyNoPlatform],
              marketTitle: pfMarket.title,
              legs: [
                {
                  platform: buyYesPlatform,
                  marketId:
                    buyYesPlatform === "predictfun" ? pfMarket.id : matched.id,
                  outcome: "YES",
                  side: "buy",
                  price: yesPrice,
                },
                {
                  platform: buyNoPlatform,
                  marketId:
                    buyNoPlatform === "predictfun" ? pfMarket.id : matched.id,
                  outcome: "NO",
                  side: "buy",
                  price: noPrice,
                },
              ],
              totalCost,
              guaranteedPayout: 1,
              profit,
              profitPercent: (profit / totalCost) * 100,
              confidence:
                profit > 0.03 ? "high" : profit > 0.01 ? "medium" : "low",
            });
          }
        }
      }
    } catch (err) {
      console.error("Cross-platform scan error:", err);
    }

    return opportunities;
  }
}
