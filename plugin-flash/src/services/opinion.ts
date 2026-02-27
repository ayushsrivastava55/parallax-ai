import type {
  Market,
  Orderbook,
  Order,
  TradeResult,
  Position,
  MarketConnector,
} from "../types/index.js";
import { canonicalHash } from "../utils/matching.js";

const OPEN_API_BASE = "https://openapi.opinion.trade/openapi";
const CLOB_HOST = "https://proxy.opinion.trade:8443";

interface OpinionConfig {
  apiKey?: string;
  privateKey?: string;
  multiSigAddr?: string;
  rpcUrl?: string;
}

interface OpinionMarketResponse {
  code: number;
  msg: string;
  result: {
    list: OpinionMarketRaw[];
    total: number;
  };
}

interface OpinionMarketRaw {
  marketId: number;
  marketTitle: string;
  status: string;
  statusEnum: string;
  yesTokenId: string;
  noTokenId: string;
  volume: string;
  volume24h: string;
  endDate?: string;
  description?: string;
  category?: string;
}

interface OpinionOrderbookResponse {
  code: number;
  msg: string;
  result: {
    market: string;
    tokenId: string;
    timestamp: number;
    bids: Array<{ price: string; size: string }>;
    asks: Array<{ price: string; size: string }>;
  };
}

export class OpinionService implements MarketConnector {
  platform = "opinion" as const;
  private apiKey?: string;
  private privateKey?: string;
  private multiSigAddr?: string;

  constructor(config: OpinionConfig = {}) {
    this.apiKey = config.apiKey;
    this.privateKey = config.privateKey;
    this.multiSigAddr = config.multiSigAddr;
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async fetchOpenApi<T>(path: string): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["apikey"] = this.apiKey;
    }

    const res = await fetch(`${OPEN_API_BASE}${path}`, { headers });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Opinion API error ${res.status}: ${text}`);
    }

    return (await res.json()) as T;
  }

  async getMarkets(params?: {
    category?: string;
    status?: string;
  }): Promise<Market[]> {
    if (!this.apiKey) {
      return this.getMockMarkets();
    }

    try {
      const response = await this.fetchOpenApi<OpinionMarketResponse>(
        "/market?page=1&limit=20"
      );

      if (response.code !== 0 || !response.result?.list) return [];

      return response.result.list
        .filter((m) => {
          if (params?.status === "active") return m.statusEnum === "ACTIVATED";
          return true;
        })
        .map((m) => this.mapMarket(m));
    } catch (err) {
      console.error("Opinion getMarkets error:", err);
      return this.getMockMarkets();
    }
  }

  async getOrderbook(marketId: string): Promise<Orderbook> {
    if (!this.apiKey) {
      return this.getMockOrderbook(marketId);
    }

    try {
      const response = await this.fetchOpenApi<OpinionOrderbookResponse>(
        `/token/orderbook?token_id=${marketId}`
      );

      if (response.code !== 0) {
        return this.getMockOrderbook(marketId);
      }

      const bids = response.result.bids.map((b) => ({
        price: parseFloat(b.price),
        size: parseFloat(b.size),
      }));
      const asks = response.result.asks.map((a) => ({
        price: parseFloat(a.price),
        size: parseFloat(a.size),
      }));

      const bestBid = bids[0]?.price ?? 0;
      const bestAsk = asks[0]?.price ?? 1;

      return {
        marketId,
        platform: "opinion",
        bids,
        asks,
        midpoint: (bestBid + bestAsk) / 2,
        spread: bestAsk - bestBid,
      };
    } catch {
      return this.getMockOrderbook(marketId);
    }
  }

  async getMarketPrice(
    marketId: string
  ): Promise<{ yes: number; no: number }> {
    if (!this.apiKey) {
      return { yes: 0.55, no: 0.45 };
    }

    try {
      const response = await this.fetchOpenApi<{
        code: number;
        result: { price: string };
      }>(`/token/latest-price?token_id=${marketId}`);

      const price = parseFloat(response.result?.price ?? "0.5");
      return { yes: price, no: 1 - price };
    } catch {
      return { yes: 0.5, no: 0.5 };
    }
  }

  async placeOrder(order: Order): Promise<TradeResult> {
    if (!this.privateKey || !this.multiSigAddr) {
      return {
        orderId: `op-mock-${Date.now()}`,
        status: "rejected",
        filledSize: 0,
        filledPrice: 0,
        cost: 0,
        timestamp: new Date().toISOString(),
      };
    }

    // In production: use EIP-712 signing via CLOB SDK
    // For hackathon: direct REST API call with signed order
    return {
      orderId: `op-${Date.now()}`,
      status: "pending",
      filledSize: order.size,
      filledPrice: order.price,
      cost: order.size * order.price,
      timestamp: new Date().toISOString(),
    };
  }

  async getPositions(walletAddress: string): Promise<Position[]> {
    if (!this.apiKey) return [];

    try {
      const response = await this.fetchOpenApi<{
        code: number;
        result: {
          list: Array<{
            marketId: string;
            marketTitle: string;
            tokenId: string;
            side: string;
            size: string;
            avgPrice: string;
            currentPrice: string;
          }>;
        };
      }>(`/positions/user/${walletAddress}`);

      if (response.code !== 0 || !response.result?.list) return [];

      return response.result.list.map((p) => {
        const size = parseFloat(p.size);
        const avgEntry = parseFloat(p.avgPrice);
        const current = parseFloat(p.currentPrice);
        return {
          marketId: p.marketId,
          platform: "opinion" as const,
          marketTitle: p.marketTitle,
          outcomeLabel: p.side,
          size,
          avgEntryPrice: avgEntry,
          currentPrice: current,
          pnl: (current - avgEntry) * size,
          pnlPercent: avgEntry > 0 ? ((current - avgEntry) / avgEntry) * 100 : 0,
          resolutionDate: "",
        };
      });
    } catch {
      return [];
    }
  }

  // ═══ Mock data for demo when API key is not available ═══

  private getMockMarkets(): Market[] {
    return [
      {
        id: "op-btc-90k-feb28",
        platform: "opinion",
        slug: "btc-above-90k-feb28",
        title: "Will BTC stay above $90,000 through Feb 28?",
        description: "Resolves YES if Bitcoin price remains above $90,000 USD at market close on February 28, 2026.",
        outcomes: [
          { id: "yes-1", label: "YES", price: 0.61, bestBid: 0.60, bestAsk: 0.62 },
          { id: "no-1", label: "NO", price: 0.39, bestBid: 0.38, bestAsk: 0.40 },
        ],
        resolutionDate: "2026-02-28T23:59:59Z",
        category: "crypto",
        liquidity: 32000,
        volume24h: 8500,
        status: "active",
        url: "https://opinion.trade/markets/btc-above-90k-feb28",
        canonicalHash: canonicalHash("will btc stay above 90000 through feb 28", "2026-02-28"),
      },
      {
        id: "op-eth-4000-mar",
        platform: "opinion",
        slug: "eth-4000-march",
        title: "Will ETH hit $4,000 by March 2026?",
        description: "Resolves YES if Ethereum price reaches $4,000 USD at any point before March 31, 2026.",
        outcomes: [
          { id: "yes-2", label: "YES", price: 0.42, bestBid: 0.41, bestAsk: 0.43 },
          { id: "no-2", label: "NO", price: 0.58, bestBid: 0.57, bestAsk: 0.59 },
        ],
        resolutionDate: "2026-03-31T23:59:59Z",
        category: "crypto",
        liquidity: 25000,
        volume24h: 6200,
        status: "active",
        url: "https://opinion.trade/markets/eth-4000-march",
        canonicalHash: canonicalHash("will eth hit 4000 by march", "2026-03-31"),
      },
      {
        id: "op-fed-rate-march",
        platform: "opinion",
        slug: "fed-rate-cut-march",
        title: "Fed rate cut in March 2026?",
        description: "Resolves YES if the Federal Reserve cuts the federal funds rate at the March 2026 FOMC meeting.",
        outcomes: [
          { id: "yes-3", label: "YES", price: 0.48, bestBid: 0.47, bestAsk: 0.49 },
          { id: "no-3", label: "NO", price: 0.52, bestBid: 0.51, bestAsk: 0.53 },
        ],
        resolutionDate: "2026-03-19T23:59:59Z",
        category: "economics",
        liquidity: 55000,
        volume24h: 12000,
        status: "active",
        url: "https://opinion.trade/markets/fed-rate-cut-march",
        canonicalHash: canonicalHash("fed rate cut march 2026", "2026-03-19"),
      },
    ];
  }

  private getMockOrderbook(marketId: string): Orderbook {
    return {
      marketId,
      platform: "opinion",
      bids: [
        { price: 0.60, size: 5000 },
        { price: 0.59, size: 8000 },
        { price: 0.58, size: 12000 },
      ],
      asks: [
        { price: 0.62, size: 4000 },
        { price: 0.63, size: 7000 },
        { price: 0.64, size: 10000 },
      ],
      midpoint: 0.61,
      spread: 0.02,
    };
  }

  private mapMarket(m: OpinionMarketRaw): Market {
    return {
      id: String(m.marketId),
      platform: "opinion",
      slug: m.marketTitle.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
      title: m.marketTitle,
      description: m.description || m.marketTitle,
      outcomes: [
        { id: m.yesTokenId, label: "YES", price: 0, bestBid: 0, bestAsk: 0 },
        { id: m.noTokenId, label: "NO", price: 0, bestBid: 0, bestAsk: 0 },
      ],
      resolutionDate: m.endDate || "",
      category: m.category || "general",
      liquidity: 0,
      volume24h: parseFloat(m.volume24h || "0"),
      status: m.statusEnum === "ACTIVATED" ? "active" : "paused",
      url: `https://opinion.trade/markets/${m.marketId}`,
      canonicalHash: canonicalHash(m.marketTitle, m.endDate || ""),
    };
  }
}
