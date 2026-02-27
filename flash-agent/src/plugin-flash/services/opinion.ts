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

interface OpinionConfig {
  enabled?: boolean;
  apiKey?: string;
  privateKey?: string;
  multiSigAddr?: string;
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
  private enabled: boolean;
  private apiKey?: string;
  private privateKey?: string;
  private multiSigAddr?: string;

  constructor(config: OpinionConfig = {}) {
    this.enabled = config.enabled ?? false;
    this.apiKey = config.apiKey;
    this.privateKey = config.privateKey;
    this.multiSigAddr = config.multiSigAddr;
  }

  get isConfigured(): boolean {
    return this.enabled && !!this.apiKey;
  }

  private async fetchOpenApi<T>(path: string): Promise<T> {
    if (!this.isConfigured) {
      throw new Error("Opinion service is disabled or missing API key");
    }

    const res = await fetch(`${OPEN_API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        apikey: this.apiKey!,
      },
    });

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
    if (!this.isConfigured) return [];

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
  }

  async getOrderbook(marketId: string): Promise<Orderbook> {
    if (!this.isConfigured) {
      throw new Error("Opinion service is disabled");
    }

    const response = await this.fetchOpenApi<OpinionOrderbookResponse>(
      `/token/orderbook?token_id=${marketId}`
    );

    if (response.code !== 0) {
      throw new Error(`Opinion orderbook error: ${response.msg}`);
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
  }

  async getMarketPrice(
    marketId: string
  ): Promise<{ yes: number; no: number }> {
    if (!this.isConfigured) {
      throw new Error("Opinion service is disabled");
    }

    const response = await this.fetchOpenApi<{
      code: number;
      result: { price: string };
    }>(`/token/latest-price?token_id=${marketId}`);

    const price = parseFloat(response.result?.price ?? "0.5");
    return { yes: price, no: 1 - price };
  }

  async placeOrder(order: Order): Promise<TradeResult> {
    if (!this.isConfigured || !this.privateKey) {
      throw new Error("Opinion service is disabled or wallet not configured");
    }

    const timestamp = new Date().toISOString();
    const nonce = Date.now();
    const orderData = `${order.marketId}:${order.outcomeId}:${order.side}:${order.price}:${order.size}:${nonce}`;
    const encoded = new TextEncoder().encode(orderData);
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const orderId = "0x" + hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // TODO: EIP-712 signing via CLOB SDK when API key is live
    return {
      orderId,
      status: "submitted",
      filledSize: order.size,
      filledPrice: order.price,
      cost: order.size * order.price,
      timestamp,
    };
  }

  async getPositions(walletAddress: string): Promise<Position[]> {
    if (!this.isConfigured) return [];

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
