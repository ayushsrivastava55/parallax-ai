// ═══ Core Market Types ═══

export type Platform = "opinion" | "predictfun";

export interface Market {
  id: string;
  platform: Platform;
  slug: string;
  title: string;
  description: string;
  outcomes: Outcome[];
  resolutionDate: string; // ISO 8601
  category: string;
  liquidity: number; // in USD
  volume24h: number;
  status: "active" | "resolved" | "paused";
  url: string;
  /** Canonical hash for cross-platform event matching */
  canonicalHash?: string;
}

export interface Outcome {
  id: string;
  label: string; // "YES" | "NO" | custom
  price: number; // 0-1 (implied probability)
  bestBid: number;
  bestAsk: number;
}

export interface Orderbook {
  marketId: string;
  platform: Platform;
  bids: OrderbookLevel[]; // buy orders
  asks: OrderbookLevel[]; // sell orders
  midpoint: number;
  spread: number;
}

export interface OrderbookLevel {
  price: number;
  size: number; // in shares
}

// ═══ Trading Types ═══

export interface Order {
  marketId: string;
  platform: Platform;
  outcomeId: string;
  side: "buy" | "sell";
  price: number;
  size: number; // shares
  type: "limit" | "market";
}

export interface TradeResult {
  orderId: string;
  txHash?: string;
  status: "filled" | "partial" | "pending" | "submitted" | "rejected";
  filledSize: number;
  filledPrice: number;
  cost: number; // total USD cost
  timestamp: string;
}

export interface Position {
  marketId: string;
  platform: Platform;
  marketTitle: string;
  outcomeLabel: string;
  size: number;
  avgEntryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  resolutionDate: string;
}

// ═══ Analysis Types ═══

export interface MarketAnalysis {
  market: Market;
  crossPlatformPrices: CrossPlatformPrice[];
  research: ResearchFindings;
  statistics: StatisticalEval;
  arbOpportunities: ArbOpportunity[];
  recommendation: Recommendation;
}

export interface CrossPlatformPrice {
  platform: Platform;
  marketId: string;
  yesPrice: number;
  noPrice: number;
  liquidity: number;
  url: string;
}

export interface ResearchFindings {
  supporting: string[];
  contradicting: string[];
  neutral: string[];
  sources: string[];
  dataPoints: number;
}

export interface StatisticalEval {
  modelProbability: number; // 0-1
  marketProbability: number; // 0-1 (implied from prices)
  edge: number; // model - market
  expectedValue: number; // per $1 risked
  confidence: "low" | "medium" | "medium-high" | "high";
  riskScore: number; // 1-10
}

export interface Recommendation {
  action: "buy_yes" | "buy_no" | "avoid";
  platform: Platform;
  reasoning: string;
  suggestedSize: number; // in USD
}

// ═══ Arbitrage Types ═══

export interface ArbOpportunity {
  type: "intra_platform" | "cross_platform";
  description: string;
  platforms: Platform[];
  marketTitle: string;
  legs: ArbLeg[];
  totalCost: number; // per share set
  guaranteedPayout: number;
  profit: number;
  profitPercent: number;
  confidence: "low" | "medium" | "high";
}

export interface ArbLeg {
  platform: Platform;
  marketId: string;
  outcome: string; // "YES" | "NO"
  side: "buy";
  price: number;
}

// ═══ Service Interfaces ═══

export interface MarketConnector {
  platform: Platform;
  getMarkets(params?: { category?: string; status?: string }): Promise<Market[]>;
  getOrderbook(marketId: string): Promise<Orderbook>;
  getMarketPrice(marketId: string): Promise<{ yes: number; no: number }>;
  placeOrder(order: Order): Promise<TradeResult>;
  getPositions(walletAddress: string): Promise<Position[]>;
}

// ═══ URL Parser Types ═══

export interface ParsedMarketUrl {
  platform: Platform;
  marketSlug: string;
  marketId?: string;
  raw: string;
}

// ═══ Analysis Request Types ═══

export interface ThesisInput {
  mode: "thesis";
  thesis: string;
  extractedIntent?: {
    direction: "bullish" | "bearish";
    asset: string;
    condition: string;
    timeframe: string;
  };
}

export interface UrlInput {
  mode: "url";
  url: string;
  parsed: ParsedMarketUrl;
}

export type AnalysisInput = ThesisInput | UrlInput;
