import type {
  Market,
  Orderbook,
  Order,
  TradeResult,
  Position,
  MarketConnector,
} from "../types/index.js";
import { canonicalHash } from "../utils/matching.js";

const TESTNET_API = "https://api-testnet.predict.fun";
const MAINNET_API = "https://api.predict.fun";

interface PredictFunConfig {
  apiKey?: string;
  useTestnet?: boolean;
}

interface PFMarket {
  id: number;
  title: string;
  question: string;
  description: string;
  status: string;         // "REGISTERED" | "RESOLVED"
  tradingStatus: string;  // "OPEN" | "CLOSED"
  isNegRisk: boolean;
  feeRateBps: number;
  outcomes: Array<{
    name: string;        // "Yes" | "No"
    indexSet: number;
    onChainId: string;
    status: string | null;
  }>;
  categorySlug: string;
  createdAt: string;
  conditionId: string;
  resolverAddress: string;
  imageUrl?: string;
}

interface PFOrderbookData {
  marketId: number;
  bids: [number, number][];  // [price, size]
  asks: [number, number][];
  updateTimestampMs: number;
}

export class PredictFunService implements MarketConnector {
  platform = "predictfun" as const;
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: PredictFunConfig = {}) {
    this.baseUrl = config.useTestnet !== false ? TESTNET_API : MAINNET_API;
    this.apiKey = config.apiKey;
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PredictFun API error ${res.status}: ${text}`);
    }

    return (await res.json()) as T;
  }

  async getMarkets(params?: {
    category?: string;
    status?: string;
  }): Promise<Market[]> {
    let path = "/v1/markets?first=50";
    if (params?.category) path += `&categorySlug=${params.category}`;

    const response = await this.fetch<{
      success: boolean;
      data: PFMarket[];
      cursor?: string;
    }>(path);

    if (!response.success || !response.data) return [];

    return response.data
      .filter((m) => {
        if (params?.status === "active") return m.tradingStatus === "OPEN";
        return true;
      })
      .map((m) => this.mapMarket(m));
  }

  async getOrderbook(marketId: string): Promise<Orderbook> {
    const response = await this.fetch<{
      success: boolean;
      data: PFOrderbookData;
    }>(`/v1/markets/${marketId}/orderbook`);

    const data = response.data;
    const bids = (data.bids || []).map(([price, size]) => ({ price, size }));
    const asks = (data.asks || []).map(([price, size]) => ({ price, size }));

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;

    return {
      marketId,
      platform: "predictfun",
      bids,
      asks,
      midpoint: (bestBid + bestAsk) / 2,
      spread: bestAsk - bestBid,
    };
  }

  async getMarketPrice(
    marketId: string
  ): Promise<{ yes: number; no: number }> {
    const ob = await this.getOrderbook(marketId);
    const yesPrice = ob.midpoint;
    return { yes: yesPrice, no: 1 - yesPrice };
  }

  async placeOrder(order: Order): Promise<TradeResult> {
    // TODO: EIP-712 signing via SDK OrderBuilder for real execution
    return {
      orderId: `pf-${Date.now()}`,
      status: "pending",
      filledSize: order.size,
      filledPrice: order.price,
      cost: order.size * order.price,
      timestamp: new Date().toISOString(),
    };
  }

  async getPositions(_walletAddress: string): Promise<Position[]> {
    // Testnet doesn't have a straightforward positions endpoint without auth
    return [];
  }

  private mapMarket(m: PFMarket): Market {
    const outcomes = m.outcomes.map((o) => ({
      id: o.onChainId,
      label: o.name,
      price: 0,
      bestBid: 0,
      bestAsk: 0,
    }));

    return {
      id: String(m.id),
      platform: "predictfun",
      slug: String(m.id),
      title: m.question || m.title,
      description: m.description || m.question,
      outcomes,
      resolutionDate: "",
      category: m.categorySlug || "general",
      liquidity: 0,
      volume24h: 0,
      status: m.tradingStatus === "OPEN" ? "active" : "paused",
      url: `https://predict.fun/event/${m.id}`,
      canonicalHash: canonicalHash(m.question || m.title, ""),
    };
  }
}
