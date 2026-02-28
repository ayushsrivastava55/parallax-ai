import { createHmac } from "node:crypto";
import type {
  Market,
  Orderbook,
  Order,
  TradeResult,
  Position,
  MarketConnector,
} from "../types/index.js";
import { canonicalHash } from "../utils/matching.js";
import { Wallet, ethers } from "ethers";

// ═══ Constants ═══

const EVENTS_API_BASE = "https://market-api.probable.markets";
const CLOB_API_BASE = "https://api.probable.markets";

const PROBABLE_EXCHANGE = "0xF99F5367ce708c66F0860B77B4331301A5597c86";
const PROBABLE_DOMAIN_NAME = "Probable CTF Exchange";
const PROBABLE_CHAIN_ID = 56; // BSC Mainnet
const PROBABLE_SCALE = 1_000_000_000_000_000_000n; // 1e18
const PROBABLE_MIN_FEE_BPS = 175; // 1.75%
const SIDE_BUY = 0;
const SIDE_SELL = 1;
const SIG_TYPE_PROB_GNOSIS_SAFE = 2; // ProbGnosisSafe (order signed by EOA, maker is proxy)
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Proxy Factory (custom Probable factory, NOT standard Safe)
const PROXY_FACTORY = "0xB99159aBF0bF59a512970586F38292f8b9029924";
const PROXY_FACTORY_ABI = [
  "function computeProxyAddress(address user) view returns (address)",
  "function createProxy(address paymentToken, uint256 payment, address paymentReceiver, tuple(uint8 v, bytes32 r, bytes32 s) sig)",
];
const BSC_RPC = "https://bsc-dataseed.binance.org";

// EIP-712 types for order signing
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

// EIP-712 types for L1 auth
const CLOB_AUTH_EIP712_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
};

// ═══ Internal types ═══

interface ProbableEvent {
  id: string;
  title: string;
  slug: string;
  active: boolean;
  tags: string[];
  markets: ProbableMarket[];
}

interface ProbableMarket {
  id: string;
  question: string;
  clobTokenIds: string; // JSON: '["yesTokenId","noTokenId"]'
  outcomes: string;     // JSON: '["Yes","No"]'
  tokens: Array<{ token_id: string; outcome: string }>;
}

interface ProbableOrderBookResponse {
  asks: Array<{ price: string; size: string }>;
  bids: Array<{ price: string; size: string }>;
}

interface ProbableConfig {
  privateKey?: string;
  enabled?: boolean;
}

// ═══ Service ═══

export class ProbableService implements MarketConnector {
  platform = "probable" as const;
  private privateKey?: string;
  private enabled: boolean;

  // L2 auth credentials (populated after authenticate())
  private apiKey: string | null = null;
  private apiSecret: string | null = null;
  private apiPassphrase: string | null = null;

  // Proxy wallet address (resolved lazily from factory)
  private proxyAddress: string | null = null;

  // Cache: clobTokenId → { eventId, marketId, question }
  private tokenMarketMap = new Map<string, { eventId: string; marketId: string; question: string }>();

  constructor(config: ProbableConfig = {}) {
    this.privateKey = config.privateKey;
    this.enabled = config.enabled ?? true;
  }

  get isConfigured(): boolean {
    return this.enabled;
  }

  // ── Market Discovery (no auth needed) ──

  async getMarkets(params?: { category?: string; status?: string }): Promise<Market[]> {
    const PAGE_SIZE = 100;
    const allEvents: ProbableEvent[] = [];
    let offset = 0;

    // Paginate events API
    while (true) {
      const url = `${EVENTS_API_BASE}/public/api/v1/events?active=true&limit=${PAGE_SIZE}&offset=${offset}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) break;

      const events = (await res.json()) as ProbableEvent[];
      if (!Array.isArray(events) || events.length === 0) break;

      allEvents.push(...events);
      if (events.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const markets: Market[] = [];
    for (const event of allEvents) {
      for (const m of event.markets) {
        // Parse token IDs
        let yesTokenId = "";
        let noTokenId = "";
        try {
          if (m.tokens && m.tokens.length >= 2) {
            yesTokenId = m.tokens.find((t) => t.outcome === "Yes")?.token_id || m.tokens[0].token_id;
            noTokenId = m.tokens.find((t) => t.outcome === "No")?.token_id || m.tokens[1].token_id;
          } else {
            const tokenIds = JSON.parse(m.clobTokenIds) as string[];
            yesTokenId = tokenIds[0] || "";
            noTokenId = tokenIds[1] || "";
          }
        } catch {
          continue;
        }

        // Cache for orderbook lookups
        this.tokenMarketMap.set(yesTokenId, { eventId: event.id, marketId: m.id, question: m.question });
        this.tokenMarketMap.set(noTokenId, { eventId: event.id, marketId: m.id, question: m.question });

        markets.push({
          id: m.id,
          platform: "probable",
          slug: event.slug || m.id,
          title: m.question || event.title,
          description: m.question || event.title,
          outcomes: [
            { id: yesTokenId, label: "YES", price: 0, bestBid: 0, bestAsk: 0 },
            { id: noTokenId, label: "NO", price: 0, bestBid: 0, bestAsk: 0 },
          ],
          resolutionDate: "",
          category: event.tags?.[0] || "general",
          liquidity: 0,
          volume24h: 0,
          status: event.active ? "active" : "paused",
          url: `https://probable.markets/events/${event.slug || event.id}`,
          canonicalHash: canonicalHash(m.question || event.title, ""),
        });
      }
    }

    if (params?.status === "active") {
      return markets.filter((m) => m.status === "active");
    }
    return markets;
  }

  async getOrderbook(marketId: string): Promise<Orderbook> {
    // marketId here is the Probable market ID. We need the YES token to fetch orderbook.
    // First, find YES/NO tokens for this market by scanning our cache or fetching.
    const markets = await this.getMarkets({ status: "active" });
    const market = markets.find((m) => m.id === marketId);
    if (!market || market.outcomes.length < 2) {
      throw new Error(`Probable market ${marketId} not found or has no outcomes`);
    }

    const yesTokenId = market.outcomes[0].id;
    const noTokenId = market.outcomes[1].id;

    const [yesBook, noBook] = await Promise.all([
      this.fetchTokenOrderbook(yesTokenId),
      this.fetchTokenOrderbook(noTokenId),
    ]);

    // Combine into our Orderbook format (YES perspective)
    const bids = yesBook.bids.map((b) => ({
      price: parseFloat(b.price),
      size: parseFloat(b.size),
    })).sort((a, b) => b.price - a.price);

    const asks = yesBook.asks.map((a) => ({
      price: parseFloat(a.price),
      size: parseFloat(a.size),
    })).sort((a, b) => a.price - b.price);

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 1;

    return {
      marketId,
      platform: "probable",
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

  // ── Trading (requires auth) ──

  async placeOrder(order: Order): Promise<TradeResult> {
    if (!this.privateKey) {
      throw new Error("Probable: private key required for trading");
    }

    const timestamp = new Date().toISOString();

    // Ensure L2 auth
    if (!this.apiKey) {
      await this.authenticate();
    }

    const wallet = new Wallet(this.privateKey);

    // Resolve proxy address (maker = proxy, signer = EOA)
    const proxyAddr = await this.resolveProxyAddress();
    if (!proxyAddr) {
      throw new Error(
        "Probable: proxy wallet not deployed. Visit probable.markets to create your proxy wallet, " +
        "or call ensureProxyDeployed() first."
      );
    }

    // Find outcome token ID
    const markets = await this.getMarkets({ status: "active" });
    const market = markets.find((m) => m.id === order.marketId);
    if (!market) throw new Error(`Probable market ${order.marketId} not found`);

    const outcome = market.outcomes.find(
      (o) => o.id === order.outcomeId || o.label.toLowerCase() === order.outcomeId.toLowerCase()
    );
    if (!outcome) throw new Error(`Outcome ${order.outcomeId} not found in market ${order.marketId}`);

    const tokenId = outcome.id;
    const isBuy = order.side === "buy";
    const price = order.price;

    // Build order amounts (1e18 scale) using Probable's rounding
    let sharesRaw = BigInt(Math.round(order.size * 1e8)) * PROBABLE_SCALE / 100_000_000n;

    // Quantize to 0.01 step for Probable ME
    const QTY_STEP = 10n ** 16n;
    sharesRaw = (sharesRaw / QTY_STEP) * QTY_STEP;
    if (sharesRaw === 0n) sharesRaw = QTY_STEP;

    // Compute amounts per side
    const priceScaled = BigInt(Math.round(price * 10000));
    const usdtRaw = sharesRaw * priceScaled / 10000n;

    const makerAmount = isBuy ? usdtRaw : sharesRaw;
    const takerAmount = isBuy ? sharesRaw : usdtRaw;

    const salt = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
    const nonce = 0n;

    // Sign EIP-712 order — maker is PROXY, signer is EOA
    const domain = {
      name: PROBABLE_DOMAIN_NAME,
      version: "1",
      chainId: PROBABLE_CHAIN_ID,
      verifyingContract: PROBABLE_EXCHANGE,
    };

    const orderMsg = {
      salt,
      maker: proxyAddr,
      signer: wallet.address,
      taker: ZERO_ADDRESS,
      tokenId: BigInt(tokenId),
      makerAmount,
      takerAmount,
      expiration: 0n, // 0 = no expiration (like Prophet reference)
      nonce,
      feeRateBps: BigInt(PROBABLE_MIN_FEE_BPS),
      side: isBuy ? SIDE_BUY : SIDE_SELL,
      signatureType: SIG_TYPE_PROB_GNOSIS_SAFE,
    };

    const signature = await wallet.signTypedData(domain, ORDER_EIP712_TYPES, orderMsg);

    // Serialize for API
    const body = {
      deferExec: true,
      order: {
        salt: salt.toString(),
        maker: proxyAddr,
        signer: wallet.address,
        taker: ZERO_ADDRESS,
        tokenId: tokenId.toString(),
        makerAmount: makerAmount.toString(),
        takerAmount: takerAmount.toString(),
        side: isBuy ? "BUY" : "SELL",
        expiration: "0",
        nonce: nonce.toString(),
        feeRateBps: PROBABLE_MIN_FEE_BPS.toString(),
        signatureType: SIG_TYPE_PROB_GNOSIS_SAFE,
        signature,
      },
      owner: proxyAddr,
      orderType: order.type === "limit" ? "GTC" : "IOC",
    };

    const requestPath = `/public/api/v1/order/${PROBABLE_CHAIN_ID}`;
    const bodyStr = JSON.stringify(body);
    const headers = this.getL2AuthHeaders("POST", requestPath, bodyStr);

    const res = await fetch(`${CLOB_API_BASE}${requestPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: bodyStr,
      signal: AbortSignal.timeout(10_000),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const errMsg = typeof data.error === "string"
        ? data.error
        : typeof data.error === "object" && data.error
          ? String((data.error as Record<string, unknown>).message ?? `HTTP ${res.status}`)
          : `HTTP ${res.status}`;
      throw new Error(`Probable order failed: ${errMsg}`);
    }

    const rawId = data.orderId ?? data.orderID ?? data.id;
    const rawQty = data.executedQty ?? data.filledQty;
    const filledSize = rawQty != null ? Number(rawQty) : 0;

    return {
      orderId: rawId != null ? String(rawId) : signature.slice(0, 18),
      status: filledSize > 0 ? "filled" : "submitted",
      filledSize,
      filledPrice: price,
      cost: filledSize * price,
      timestamp,
      txHash: typeof data.transactionsHashes === "string" ? data.transactionsHashes : undefined,
    };
  }

  async getPositions(_walletAddress: string): Promise<Position[]> {
    // Probable has no standard positions API — use Flash ledger
    return [];
  }

  // ── Proxy Wallet ──

  /**
   * Resolve the deterministic proxy address for the current EOA.
   * Returns null if proxy is not deployed on-chain.
   */
  async resolveProxyAddress(): Promise<string | null> {
    if (this.proxyAddress) return this.proxyAddress;
    if (!this.privateKey) return null;

    const wallet = new Wallet(this.privateKey);
    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const factory = new ethers.Contract(PROXY_FACTORY, PROXY_FACTORY_ABI, provider);

    const addr = await factory.computeProxyAddress(wallet.address) as string;
    const code = await provider.getCode(addr);

    if (code.length > 2) {
      this.proxyAddress = addr;
      return addr;
    }
    return null;
  }

  /**
   * Get the deterministic proxy address (even if not deployed yet).
   */
  async getProxyAddress(): Promise<string> {
    if (!this.privateKey) throw new Error("Probable: private key required");
    const wallet = new Wallet(this.privateKey);
    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const factory = new ethers.Contract(PROXY_FACTORY, PROXY_FACTORY_ABI, provider);
    return await factory.computeProxyAddress(wallet.address) as string;
  }

  /**
   * Deploy the proxy wallet on-chain via the Probable factory.
   * Requires BNB for gas (~0.001 BNB).
   * Returns the deployed proxy address.
   */
  async ensureProxyDeployed(): Promise<string> {
    // Check if already deployed
    const existing = await this.resolveProxyAddress();
    if (existing) return existing;

    if (!this.privateKey) throw new Error("Probable: private key required for proxy deployment");

    const provider = new ethers.JsonRpcProvider(BSC_RPC);
    const wallet = new Wallet(this.privateKey, provider);
    const factory = new ethers.Contract(PROXY_FACTORY, PROXY_FACTORY_ABI, wallet);

    // Sign EIP-712 CreateProxy message
    // IMPORTANT: The factory uses EIP712Domain WITHOUT the "version" field:
    // EIP712Domain(string name, uint256 chainId, address verifyingContract)
    const domain = {
      name: "Probable Contract Proxy Factory",
      chainId: PROBABLE_CHAIN_ID,
      verifyingContract: PROXY_FACTORY,
    };
    const types = {
      CreateProxy: [
        { name: "paymentToken", type: "address" },
        { name: "payment", type: "uint256" },
        { name: "paymentReceiver", type: "address" },
      ],
    };
    const message = {
      paymentToken: ZERO_ADDRESS,
      payment: 0n,
      paymentReceiver: ZERO_ADDRESS,
    };

    const signature = await wallet.signTypedData(domain, types, message);
    const sig = ethers.Signature.from(signature);

    const tx = await factory.createProxy(
      ZERO_ADDRESS, 0n, ZERO_ADDRESS,
      { v: sig.v, r: sig.r, s: sig.s },
    );
    await tx.wait();

    const proxyAddr = await factory.computeProxyAddress(wallet.address) as string;
    this.proxyAddress = proxyAddr;
    return proxyAddr;
  }

  // ── Auth ──

  private async authenticate(): Promise<void> {
    if (!this.privateKey) throw new Error("Probable: private key required for auth");

    const wallet = new Wallet(this.privateKey);

    // L1 Auth: sign EIP-712 ClobAuth message
    const authTimestamp = Math.floor(Date.now() / 1000).toString();
    const authDomain = { name: "ClobAuthDomain", version: "1", chainId: PROBABLE_CHAIN_ID };
    const authMsg = {
      address: wallet.address,
      timestamp: authTimestamp,
      nonce: 0n,
      message: "This message attests that I control the given wallet",
    };

    const authSig = await wallet.signTypedData(authDomain, CLOB_AUTH_EIP712_TYPES, authMsg);

    const l1Headers: Record<string, string> = {
      Prob_address: wallet.address,
      Prob_signature: authSig,
      Prob_timestamp: authTimestamp,
      Prob_nonce: "0",
    };

    // Try create, then derive
    let data: Record<string, unknown> | null = null;

    try {
      const createRes = await fetch(
        `${CLOB_API_BASE}/public/api/v1/auth/api-key/${PROBABLE_CHAIN_ID}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...l1Headers },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (createRes.ok) {
        data = (await createRes.json()) as Record<string, unknown>;
      }
    } catch {
      // Fall through to derive
    }

    if (!data) {
      const deriveRes = await fetch(
        `${CLOB_API_BASE}/public/api/v1/auth/derive-api-key/${PROBABLE_CHAIN_ID}`,
        {
          method: "GET",
          headers: l1Headers,
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!deriveRes.ok) {
        throw new Error(`Probable auth failed: HTTP ${deriveRes.status}`);
      }
      data = (await deriveRes.json()) as Record<string, unknown>;
    }

    this.apiKey = data.apiKey as string;
    this.apiSecret = data.secret as string;
    this.apiPassphrase = data.passphrase as string;
  }

  private getL2AuthHeaders(method: string, requestPath: string, body?: string): Record<string, string> {
    if (!this.apiKey || !this.apiSecret || !this.apiPassphrase) {
      throw new Error("Probable: L2 auth not initialized — call authenticate() first");
    }

    const wallet = this.privateKey ? new Wallet(this.privateKey) : null;
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = buildHmacSignature(this.apiSecret, timestamp, method, requestPath, body);

    return {
      Prob_address: wallet?.address ?? "",
      Prob_signature: sig,
      Prob_timestamp: String(timestamp),
      Prob_api_key: this.apiKey,
      Prob_passphrase: this.apiPassphrase,
    };
  }

  private async fetchTokenOrderbook(tokenId: string): Promise<ProbableOrderBookResponse> {
    const url = `${CLOB_API_BASE}/public/api/v1/book?token_id=${tokenId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(`Probable orderbook error: ${res.status}`);
    const data = (await res.json()) as ProbableOrderBookResponse;
    if (!data.asks || !data.bids) throw new Error("Invalid Probable orderbook response");
    return data;
  }
}

// ── HMAC helper (from Prophet reference) ──

function buildHmacSignature(
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body?: string,
): string {
  let message = String(timestamp) + method + requestPath;
  if (body !== undefined) message += body;

  const keyBuffer = Buffer.from(
    secret.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );

  const hmac = createHmac("sha256", keyBuffer);
  hmac.update(message);

  return hmac
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
