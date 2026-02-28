import type {
  Market,
  Orderbook,
  Order,
  TradeResult,
  Position,
  MarketConnector,
} from "../types/index.js";
import { canonicalHash } from "../utils/matching.js";

// ═══ Constants ═══

const PUBLIC_API = "https://engine.xmarket.app/api/v1";
const AUTH_API = "https://engine.xmarket.app/openapi/v1";

// ═══ Internal types ═══

interface XmarketConfig {
  apiKey?: string;
  enabled?: boolean;
}

interface XmarketMarketRaw {
  id: string;
  name: string;
  slug: string;
  type: string;
  rules: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  categoryId: string | null;
  tradingStatus: string | null;
  volume: number | null;
  views: number | null;
  fillPrice: number | null;
  outcomes: Array<{ id: string; name: string }>;
}

interface XmarketSpreadResponse {
  asks: Array<{ price: number; shares: number }>;
  bids: Array<{ price: number; shares: number }>;
  lastPrice: number;
  spread: number;
}

interface XmarketPositionRaw {
  id: string;
  marketId: string;
  marketName: string;
  marketSlug: string;
  marketStatus: string;
  outcomeName: string;
  outcomeId: string;
  price: number;       // avg entry price
  quantity: number;     // shares held
  latestPrice: number;  // current price
}

// ═══ Service ═══

export class XmarketService implements MarketConnector {
  platform = "xmarket" as const;
  private apiKey?: string;
  private enabled: boolean;

  constructor(config: XmarketConfig = {}) {
    this.apiKey = config.apiKey;
    this.enabled = config.enabled ?? !!config.apiKey;
  }

  get isConfigured(): boolean {
    return this.enabled && !!this.apiKey;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
    };
  }

  // ── Markets (public) ──

  async getMarkets(params?: { category?: string; status?: string }): Promise<Market[]> {
    const statusFilter = params?.status === "active" ? "live,approved" : "live,approved,closed,resolved";
    const url = `${PUBLIC_API}/markets?pageSize=50&status=${statusFilter}`;

    const res = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { items?: XmarketMarketRaw[] };
    if (!data.items) return [];

    return data.items.map((m) => this.mapMarket(m));
  }

  // ── Orderbook ──

  async getOrderbook(marketId: string): Promise<Orderbook> {
    // Xmarket orderbook is per-outcome. Get market first to find YES outcome.
    const marketRes = await fetch(`${PUBLIC_API}/markets/${marketId}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!marketRes.ok) throw new Error(`Xmarket market ${marketId} not found`);

    const market = (await marketRes.json()) as XmarketMarketRaw;
    if (!market.outcomes || market.outcomes.length === 0) {
      throw new Error(`Xmarket market ${marketId} has no outcomes`);
    }

    // Use first outcome (typically YES) for the primary orderbook
    const yesOutcome = market.outcomes.find(
      (o) => o.name.toLowerCase() === "yes"
    ) || market.outcomes[0];

    const spreadRes = await fetch(`${PUBLIC_API}/orderbook/spread/${yesOutcome.id}`, {
      headers: {
        ...this.headers(),
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!spreadRes.ok) {
      // Fall back to empty orderbook
      return {
        marketId,
        platform: "xmarket",
        bids: [],
        asks: [],
        midpoint: 0.5,
        spread: 0,
      };
    }

    const spread = (await spreadRes.json()) as XmarketSpreadResponse;

    // Xmarket prices are integers 1-99 representing cents. Normalize to 0-1.
    const bids = (spread.bids || []).map((b) => ({
      price: b.price > 1 ? b.price / 100 : b.price,
      size: b.shares,
    })).sort((a, b) => b.price - a.price);

    const asks = (spread.asks || []).map((a) => ({
      price: a.price > 1 ? a.price / 100 : a.price,
      size: a.shares,
    })).sort((a, b) => a.price - b.price);

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;

    return {
      marketId,
      platform: "xmarket",
      bids,
      asks,
      midpoint: (bestBid + bestAsk) / 2,
      spread: bestAsk - bestBid,
    };
  }

  async getMarketPrice(marketId: string): Promise<{ yes: number; no: number }> {
    const ob = await this.getOrderbook(marketId);
    const yesPrice = ob.midpoint;
    return { yes: yesPrice, no: 1 - yesPrice };
  }

  // ── Trading (requires API key) ──

  async placeOrder(order: Order): Promise<TradeResult> {
    if (!this.isConfigured) {
      throw new Error("Xmarket: API key required for trading");
    }

    const timestamp = new Date().toISOString();

    // Xmarket prices are integers 1-99
    const priceInt = Math.round(order.price * 100);
    if (priceInt < 1 || priceInt > 99) {
      throw new Error(`Xmarket price must be 1-99 cents, got ${priceInt}`);
    }

    // Resolve outcomeId: if it's "yes"/"no", look up the UUID from the market
    let resolvedOutcomeId = order.outcomeId;
    if (resolvedOutcomeId.toLowerCase() === "yes" || resolvedOutcomeId.toLowerCase() === "no") {
      const marketRes = await fetch(`${PUBLIC_API}/markets/${order.marketId}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!marketRes.ok) throw new Error(`Xmarket market ${order.marketId} not found`);
      const market = (await marketRes.json()) as XmarketMarketRaw;
      const outcome = market.outcomes.find(
        (o) => o.name.toLowerCase() === resolvedOutcomeId.toLowerCase()
      );
      if (!outcome) throw new Error(`Outcome "${resolvedOutcomeId}" not found in xmarket market`);
      resolvedOutcomeId = outcome.id;
    }

    const body = {
      outcomeId: resolvedOutcomeId,
      quantity: order.size,
      price: priceInt,
      side: order.side,
      type: order.type,
    };

    const res = await fetch(`${AUTH_API}/order`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`Xmarket order failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      throw new Error(`Xmarket order failed: ${data.message || `HTTP ${res.status}`}`);
    }

    const orderId = String(data.id || data.orderId || "");
    const filledQty = Number(data.filledQuantity ?? 0);
    const filledPrice = Number(data.filledPrice ?? order.price);
    const rawStatus = String(data.status || "open").toLowerCase();

    const status: TradeResult["status"] =
      rawStatus === "filled" ? "filled"
      : rawStatus === "partially_filled" ? "partial"
      : rawStatus === "cancelled" ? "rejected"
      : "submitted";

    return {
      orderId,
      status,
      filledSize: filledQty > 0 ? filledQty : (status === "filled" ? order.size : 0),
      filledPrice: filledPrice > 1 ? filledPrice / 100 : filledPrice,
      cost: (filledQty > 0 ? filledQty : order.size) * order.price,
      timestamp,
    };
  }

  // ── Positions ──

  async getPositions(walletAddress: string): Promise<Position[]> {
    if (!this.isConfigured) return [];

    const res = await fetch(`${PUBLIC_API}/positions?pageSize=50`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { items?: XmarketPositionRaw[] };
    if (!data.items) return [];

    return data.items.map((p) => {
      const entryPrice = p.price > 1 ? p.price / 100 : p.price;
      const currentPrice = p.latestPrice > 1 ? p.latestPrice / 100 : p.latestPrice;
      const pnl = (currentPrice - entryPrice) * p.quantity;
      const pnlPercent = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

      return {
        marketId: p.marketId,
        platform: "xmarket" as const,
        marketTitle: p.marketName,
        outcomeLabel: p.outcomeName,
        size: p.quantity,
        avgEntryPrice: entryPrice,
        currentPrice,
        pnl,
        pnlPercent,
        resolutionDate: "",
      };
    });
  }

  // ── Helpers ──

  private mapMarket(m: XmarketMarketRaw): Market {
    const outcomes = (m.outcomes || []).map((o) => ({
      id: o.id,
      label: o.name.toUpperCase() === "YES" || o.name.toUpperCase() === "NO" ? o.name.toUpperCase() : o.name,
      price: 0,
      bestBid: 0,
      bestAsk: 0,
    }));

    return {
      id: m.id,
      platform: "xmarket",
      slug: m.slug || m.id,
      title: m.name,
      description: m.rules || m.name,
      outcomes,
      resolutionDate: m.expiresAt || "",
      category: m.categoryId || "general",
      liquidity: 0,
      volume24h: m.volume || 0,
      status: m.status === "live" || m.status === "approved" ? "active" : "paused",
      url: `https://xmarket.app/markets/${m.slug || m.id}`,
      canonicalHash: canonicalHash(m.name, m.expiresAt || ""),
    };
  }
}
