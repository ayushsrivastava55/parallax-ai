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
  id: string;
  title: string;
  question: string;
  description: string;
  status: string;
  isNegRisk: boolean;
  feeRateBps: number;
  outcomes: Array<{
    name: string;
    indexSet: number;
    onChainId: string;
    status: string;
  }>;
  categorySlug: string;
  createdAt: string;
  conditionId: string;
  resolverAddress: string;
}

interface PFOrderbookResponse {
  bids: [number, number][];
  asks: [number, number][];
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

    const json = await res.json();
    return json as T;
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
        if (params?.status === "active") return m.status === "ACTIVE";
        return true;
      })
      .map((m) => this.mapMarket(m));
  }

  async getOrderbook(marketId: string): Promise<Orderbook> {
    const response = await this.fetch<PFOrderbookResponse>(
      `/v1/markets/${marketId}/orderbook`
    );

    const bids = (response.bids || []).map(([price, size]) => ({
      price,
      size,
    }));
    const asks = (response.asks || []).map(([price, size]) => ({
      price,
      size,
    }));

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
    // For demo/testnet — construct and submit signed order
    // In production, this would use the SDK's OrderBuilder for EIP-712 signing
    // For now, return a mock result for demo purposes
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
    // Testnet positions endpoint
    try {
      const response = await this.fetch<{
        success: boolean;
        data: Array<{
          marketId: string;
          marketTitle: string;
          outcomeName: string;
          size: string;
          avgPrice: string;
          currentPrice: string;
        }>;
      }>("/v1/positions");

      if (!response.success || !response.data) return [];

      return response.data.map((p) => {
        const size = parseFloat(p.size);
        const avgEntry = parseFloat(p.avgPrice);
        const current = parseFloat(p.currentPrice);
        return {
          marketId: p.marketId,
          platform: "predictfun" as const,
          marketTitle: p.marketTitle,
          outcomeLabel: p.outcomeName,
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

  async getMarketStatistics(
    marketId: string
  ): Promise<{ volume: number; liquidity: number }> {
    try {
      const response = await this.fetch<{
        success: boolean;
        data: { volume: string; liquidity: string };
      }>(`/v1/markets/${marketId}/statistics`);
      return {
        volume: parseFloat(response.data?.volume ?? "0"),
        liquidity: parseFloat(response.data?.liquidity ?? "0"),
      };
    } catch {
      return { volume: 0, liquidity: 0 };
    }
  }

  private mapMarket(m: PFMarket): Market {
    const outcomes = m.outcomes.map((o) => ({
      id: o.onChainId,
      label: o.name,
      price: 0, // Will be populated from orderbook
      bestBid: 0,
      bestAsk: 0,
    }));

    return {
      id: m.id,
      platform: "predictfun",
      slug: m.id,
      title: m.title || m.question,
      description: m.description || m.question,
      outcomes,
      resolutionDate: "", // Not directly in market response
      category: m.categorySlug || "general",
      liquidity: 0,
      volume24h: 0,
      status: m.status === "ACTIVE" ? "active" : "paused",
      url: `https://predict.fun/event/${m.id}`,
      canonicalHash: canonicalHash(m.question || m.title, ""),
    };
  }
}
