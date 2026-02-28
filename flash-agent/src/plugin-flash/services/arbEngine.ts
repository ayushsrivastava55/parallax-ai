import type {
  Market,
  ArbOpportunity,
  ArbLeg,
  Platform,
  MarketConnector,
} from "../types/index.js";
import type { PredictFunService } from "./predictfun.js";
import type { OpinionService } from "./opinion.js";

const INTRA_THRESHOLD = 0.995; // YES_ask + NO_ask < 0.995 = arb
const CROSS_THRESHOLD = 0.015; // Cross-platform spread > 1.5% = arb

interface ArbEngineConfig {
  predictfun: PredictFunService;
  opinion: OpinionService;
  connectors?: MarketConnector[];
}

export class ArbEngine {
  private predictfun: PredictFunService;
  private opinion: OpinionService;
  private connectors: MarketConnector[];

  constructor(config: ArbEngineConfig) {
    this.predictfun = config.predictfun;
    this.opinion = config.opinion;
    this.connectors = config.connectors || [];
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

    // Scan additional connectors (Probable, Xmarket, etc.)
    for (const connector of this.connectors) {
      try {
        const markets = await connector.getMarkets({ status: "active" });
        for (const market of markets.slice(0, 20)) {
          try {
            const prices = await connector.getMarketPrice(market.id);
            const totalCost = prices.yes + prices.no;

            if (totalCost < INTRA_THRESHOLD && totalCost > 0) {
              const profit = 1 - totalCost;
              opportunities.push({
                type: "intra_platform",
                description: `Buy YES + NO on ${connector.platform} for $${totalCost.toFixed(4)}, guaranteed payout $1.00`,
                platforms: [connector.platform],
                marketTitle: market.title,
                legs: [
                  {
                    platform: connector.platform,
                    marketId: market.id,
                    outcome: "YES",
                    side: "buy",
                    price: prices.yes,
                  },
                  {
                    platform: connector.platform,
                    marketId: market.id,
                    outcome: "NO",
                    side: "buy",
                    price: prices.no,
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
            // Skip market
          }
        }
      } catch {
        // Connector not available
      }
    }

    return opportunities;
  }

  /**
   * Cross-platform: Find same event on multiple platforms with price divergence.
   * If YES on platform A + NO on platform B < $1, guaranteed profit.
   */
  async scanCrossPlatform(): Promise<ArbOpportunity[]> {
    const opportunities: ArbOpportunity[] = [];

    try {
      // Collect markets from all available platforms
      const allConnectors: MarketConnector[] = [this.predictfun, this.opinion, ...this.connectors];
      const platformMarkets = await Promise.allSettled(
        allConnectors.map(async (c) => ({
          platform: c.platform,
          connector: c,
          markets: await c.getMarkets({ status: "active" }),
        })),
      );

      const available = platformMarkets
        .filter((r): r is PromiseFulfilledResult<{ platform: Platform; connector: MarketConnector; markets: Market[] }> =>
          r.status === "fulfilled" && r.value.markets.length > 0,
        )
        .map((r) => r.value);

      if (available.length < 2) return opportunities;

      // Compare each pair of platforms
      for (let i = 0; i < available.length; i++) {
        for (let j = i + 1; j < available.length; j++) {
          const a = available[i];
          const b = available[j];

          for (const marketA of a.markets) {
            if (!marketA.canonicalHash) continue;

            const marketB = b.markets.find(
              (m) => m.canonicalHash === marketA.canonicalHash,
            );
            if (!marketB) continue;

            let pricesA: { yes: number; no: number };
            let pricesB: { yes: number; no: number };

            try {
              [pricesA, pricesB] = await Promise.all([
                a.connector.getMarketPrice(marketA.id),
                b.connector.getMarketPrice(marketB.id),
              ]);
            } catch {
              continue;
            }

            const spread = Math.abs(pricesA.yes - pricesB.yes);
            if (spread <= CROSS_THRESHOLD) continue;

            const buyYesPlatform: Platform =
              pricesA.yes < pricesB.yes ? a.platform : b.platform;
            const buyNoPlatform: Platform =
              buyYesPlatform === a.platform ? b.platform : a.platform;

            const yesPrice = buyYesPlatform === a.platform ? pricesA.yes : pricesB.yes;
            const noPrice = buyNoPlatform === a.platform ? pricesA.no : pricesB.no;
            const yesMarketId = buyYesPlatform === a.platform ? marketA.id : marketB.id;
            const noMarketId = buyNoPlatform === a.platform ? marketA.id : marketB.id;

            const totalCost = yesPrice + noPrice;

            if (totalCost < 1) {
              const profit = 1 - totalCost;
              opportunities.push({
                type: "cross_platform",
                description: `Buy YES on ${buyYesPlatform} ($${yesPrice.toFixed(2)}) + NO on ${buyNoPlatform} ($${noPrice.toFixed(2)})`,
                platforms: [buyYesPlatform, buyNoPlatform],
                marketTitle: marketA.title,
                legs: [
                  {
                    platform: buyYesPlatform,
                    marketId: yesMarketId,
                    outcome: "YES",
                    side: "buy",
                    price: yesPrice,
                  },
                  {
                    platform: buyNoPlatform,
                    marketId: noMarketId,
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
      }
    } catch (err) {
      console.error("Cross-platform scan error:", err);
    }

    return opportunities;
  }
}
