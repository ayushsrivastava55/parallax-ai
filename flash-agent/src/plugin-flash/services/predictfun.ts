import type {
  Market,
  Orderbook,
  Order,
  TradeResult,
  Position,
  MarketConnector,
} from "../types/index.js";
import { canonicalHash } from "../utils/matching.js";
import { Wallet, TypedDataEncoder } from "ethers";

// ═══ Constants ═══

const TESTNET_API = "https://api-testnet.predict.fun";
const MAINNET_API = "https://api.predict.fun";

const PROTOCOL_NAME = "predict.fun CTF Exchange";
const PROTOCOL_VERSION = "1";
const SCALE = 10n ** 18n; // 1e18 wei

// Exchange contracts — testnet (chainId 97)
const TESTNET_EXCHANGES = {
  CTF_EXCHANGE: "0x2A6413639BD3d73a20ed8C95F634Ce198ABbd2d7",
  NEG_RISK_CTF_EXCHANGE: "0xd690b2bd441bE36431F6F6639D7Ad351e7B29680",
  YIELD_BEARING_CTF_EXCHANGE: "0x8a6B4Fa700A1e310b106E7a48bAFa29111f66e89",
  YIELD_BEARING_NEG_RISK_CTF_EXCHANGE: "0x95D5113bc50eD201e319101bbca3e0E250662fCC",
} as const;

// Exchange contracts — mainnet (chainId 56)
const MAINNET_EXCHANGES = {
  CTF_EXCHANGE: "0x8BC070BEdAB741406F4B1Eb65A72bee27894B689",
  NEG_RISK_CTF_EXCHANGE: "0x365fb81bd4A24D6303cd2F19c349dE6894D8d58A",
  YIELD_BEARING_CTF_EXCHANGE: "0x6bEb5a40C032AFc305961162d8204CDA16DECFa5",
  YIELD_BEARING_NEG_RISK_CTF_EXCHANGE: "0x8A289d458f5a134bA40015085A8F50Ffb681B41d",
} as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SIDE_BUY = 0;
const SIDE_SELL = 1;
const SIG_TYPE_EOA = 0;

// EIP-712 order types
const ORDER_EIP712_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
};

// ═══ Types ═══

interface PredictFunConfig {
  apiKey?: string;
  useTestnet?: boolean;
  privateKey?: string;
}

interface PFMarket {
  id: number;
  title: string;
  question: string;
  description: string;
  status: string;
  tradingStatus: string;
  isNegRisk: boolean;
  isYieldBearing?: boolean;
  feeRateBps: number;
  outcomes: Array<{
    name: string;
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
  bids: [number, number][];
  asks: [number, number][];
  updateTimestampMs: number;
}

// ═══ Service ═══

export class PredictFunService implements MarketConnector {
  platform = "predictfun" as const;
  private baseUrl: string;
  private apiKey?: string;
  private privateKey?: string;
  private useTestnet: boolean;

  // JWT auth token (populated after authenticate())
  private jwtToken: string | null = null;
  private jwtExpiresAt = 0;

  // Cache: marketId → PFMarket (for order placement)
  private marketCache = new Map<string, PFMarket>();

  constructor(config: PredictFunConfig = {}) {
    this.useTestnet = config.useTestnet !== false;
    this.baseUrl = this.useTestnet ? TESTNET_API : MAINNET_API;
    this.apiKey = config.apiKey;
    this.privateKey = config.privateKey;
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
      signal: init?.signal ?? AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PredictFun API error ${res.status}: ${text}`);
    }

    return (await res.json()) as T;
  }

  private async fetchAuth<T>(path: string, init?: RequestInit): Promise<T> {
    await this.ensureAuthenticated();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.jwtToken}`,
    };

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string>) },
      signal: init?.signal ?? AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PredictFun API error ${res.status}: ${text}`);
    }

    return (await res.json()) as T;
  }

  // ── Market Discovery ──

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

    // Cache market data for order placement
    for (const m of response.data) {
      this.marketCache.set(String(m.id), m);
    }

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

  // ── Authentication ──

  private async ensureAuthenticated(): Promise<void> {
    if (this.jwtToken && Date.now() < this.jwtExpiresAt) return;
    if (!this.privateKey) throw new Error("Predict.fun: private key required for authenticated requests");

    const wallet = new Wallet(this.privateKey);

    // Step 1: Get the auth message
    const msgRes = await this.fetch<{
      success: boolean;
      data: { message: string };
    }>("/v1/auth/message");

    if (!msgRes.success || !msgRes.data?.message) {
      throw new Error("Predict.fun: failed to get auth message");
    }

    const message = msgRes.data.message;

    // Step 2: Sign the message (EIP-191 personal_sign)
    const signature = await wallet.signMessage(message);

    // Step 3: Exchange for JWT
    const authRes = await this.fetch<{
      success: boolean;
      data?: { token: string };
      error?: string;
    }>("/v1/auth", {
      method: "POST",
      body: JSON.stringify({
        signer: wallet.address,
        signature,
        message,
      }),
    });

    if (!authRes.success || !authRes.data?.token) {
      throw new Error(`Predict.fun auth failed: ${authRes.error || "no token returned"}`);
    }

    this.jwtToken = authRes.data.token;
    // JWT typically valid for ~24h, refresh after 23h
    this.jwtExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
  }

  // ── Order Placement ──

  async placeOrder(
    order: Order,
    _opts?: { signature?: string; signerAddress?: string },
  ): Promise<TradeResult> {
    if (!this.privateKey) {
      throw new Error("Predict.fun: private key required for trading");
    }

    const timestamp = new Date().toISOString();
    const wallet = new Wallet(this.privateKey);

    // Fetch market data if not cached
    let market = this.marketCache.get(order.marketId);
    if (!market) {
      const marketsRes = await this.fetch<{
        success: boolean;
        data: PFMarket[];
      }>(`/v1/markets?first=50`);
      if (marketsRes.success && marketsRes.data) {
        for (const m of marketsRes.data) {
          this.marketCache.set(String(m.id), m);
        }
        market = this.marketCache.get(order.marketId);
      }
    }
    if (!market) {
      throw new Error(`Predict.fun market ${order.marketId} not found`);
    }

    // Resolve outcome token ID
    const isYes = order.outcomeId.toLowerCase() === "yes" || order.outcomeId === "0";
    const outcome = isYes ? market.outcomes[0] : market.outcomes[1];
    if (!outcome?.onChainId) {
      throw new Error(`Outcome ${order.outcomeId} not found in market ${order.marketId}`);
    }

    const tokenId = outcome.onChainId;
    const isBuy = order.side === "buy";
    const price = order.price;
    const size = order.size;

    // Match the official SDK: truncate price to 3 significant digits,
    // quantity to 5 significant digits, then compute amounts.
    const retainSigDigits = (num: bigint, digits: number): bigint => {
      if (num === 0n) return 0n;
      const str = num.toString();
      const excess = str.length - digits;
      if (excess <= 0) return num;
      const divisor = 10n ** BigInt(excess);
      return (num / divisor) * divisor;
    };

    // API allows max 2 decimal places on price (e.g. 0.45, not 0.455)
    const truncatedPrice = Math.floor(price * 100) / 100;
    const rawPriceWei = BigInt(Math.round(truncatedPrice * 1e18));
    const rawQuantityWei = BigInt(Math.round(size * 1e18));

    const priceWei = retainSigDigits(rawPriceWei, 2);
    const quantityWei = retainSigDigits(rawQuantityWei, 5);

    let makerAmount: bigint;
    let takerAmount: bigint;

    if (isBuy) {
      // BUY: maker offers collateral, taker gives shares
      makerAmount = (priceWei * quantityWei) / SCALE;
      takerAmount = quantityWei;
    } else {
      // SELL: maker offers shares, taker gives collateral
      makerAmount = quantityWei;
      takerAmount = (priceWei * quantityWei) / SCALE;
    }

    // Ensure non-zero amounts
    if (makerAmount === 0n) makerAmount = SCALE;
    if (takerAmount === 0n) takerAmount = SCALE;

    // Build expiration: LIMIT = far future, MARKET = 5 min
    const expiration = order.type === "market"
      ? BigInt(Math.floor(Date.now() / 1000) + 300)
      : 4102444800n; // 2100-01-01

    const salt = BigInt(Math.floor(Math.random() * 2_147_483_648));
    const nonce = 0n;

    // Determine the correct exchange contract
    const exchangeAddress = this.resolveExchangeAddress(
      market.isNegRisk,
      market.isYieldBearing ?? false,
    );

    // Build the EIP-712 domain
    const domain = {
      name: PROTOCOL_NAME,
      version: PROTOCOL_VERSION,
      chainId: this.useTestnet ? 97 : 56,
      verifyingContract: exchangeAddress,
    };

    // Build the order message
    const orderMsg = {
      salt,
      maker: wallet.address,
      signer: wallet.address,
      taker: ZERO_ADDRESS,
      tokenId: BigInt(tokenId),
      makerAmount,
      takerAmount,
      expiration,
      nonce,
      feeRateBps: BigInt(market.feeRateBps),
      side: isBuy ? SIDE_BUY : SIDE_SELL,
      signatureType: SIG_TYPE_EOA,
    };

    // Sign with EIP-712
    const signature = await wallet.signTypedData(domain, ORDER_EIP712_TYPES, orderMsg);

    // Compute the order hash
    const orderHash = TypedDataEncoder.hash(domain, ORDER_EIP712_TYPES, orderMsg);

    // Build the API payload
    const apiOrder = {
      hash: orderHash,
      salt: salt.toString(),
      maker: wallet.address,
      signer: wallet.address,
      taker: ZERO_ADDRESS,
      tokenId,
      makerAmount: makerAmount.toString(),
      takerAmount: takerAmount.toString(),
      expiration: expiration.toString(),
      nonce: nonce.toString(),
      feeRateBps: market.feeRateBps.toString(),
      side: isBuy ? SIDE_BUY : SIDE_SELL,
      signatureType: SIG_TYPE_EOA,
      signature,
    };

    // pricePerShare is the truncated price itself (matching the SDK)
    const body = {
      data: {
        order: apiOrder,
        pricePerShare: priceWei.toString(),
        strategy: order.type === "market" ? "MARKET" : "LIMIT",
      },
    };

    // Submit with JWT auth
    const response = await this.fetchAuth<{
      success: boolean;
      data?: {
        code?: string;
        orderId?: string;
        orderHash?: string;
      };
      error?: string;
      message?: string;
    }>("/v1/orders", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!response.success) {
      const errMsg = response.error || response.message || "Order rejected";
      throw new Error(`Predict.fun order submission failed: ${errMsg}. Order hash: ${orderHash}`);
    }

    const remoteOrderId = response.data?.orderId || orderHash;
    return {
      orderId: remoteOrderId,
      status: "submitted",
      filledSize: 0,
      filledPrice: price,
      cost: 0,
      timestamp,
      txHash: signature,
    };
  }

  async getPositions(_walletAddress: string): Promise<Position[]> {
    throw new Error(
      "Predict.fun live positions API is unavailable for this connector; use Flash trade ledger positions."
    );
  }

  // ── Helpers ──

  private resolveExchangeAddress(isNegRisk: boolean, isYieldBearing: boolean): string {
    const exchanges = this.useTestnet ? TESTNET_EXCHANGES : MAINNET_EXCHANGES;
    if (isNegRisk && isYieldBearing) return exchanges.YIELD_BEARING_NEG_RISK_CTF_EXCHANGE;
    if (isNegRisk) return exchanges.NEG_RISK_CTF_EXCHANGE;
    if (isYieldBearing) return exchanges.YIELD_BEARING_CTF_EXCHANGE;
    return exchanges.CTF_EXCHANGE;
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
