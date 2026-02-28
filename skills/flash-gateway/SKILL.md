---
name: flash-gateway
version: 2.0.0
description: Main routing skill for Flash Gateway. Autonomous prediction market trading on BNB Chain. Delegates to specialized skill docs for market intel, trading, portfolio, identity, and strategy execution.
homepage: https://eyebalz.xyz
metadata: {"flash":{"category":"trading","api_base":"https://eyebalz.xyz/api/v1","autonomous":true}}
---

# Flash Gateway (Main Skill Router)

## What Is Flash Gateway

Flash Gateway is a unified API layer for autonomous prediction market bots on BNB Chain. It aggregates multiple prediction market protocols and DeFi yield sources behind a single authenticated interface. **Bots never interact with underlying protocols or smart contracts directly** — all interactions go through Flash Gateway endpoints.

### What Bots Can Do

- **Discover markets** across Predict.fun (BSC testnet) and Probable Markets (BSC mainnet) in one call
- **Analyze theses** using AI-powered deep research with web search (MiniMax M2.5 + MCP search)
- **Scan for arbitrage** across platforms — matching identical markets and finding cross-platform mispricings
- **Execute trades** using a two-step confirmation flow (quote → execute) with idempotency guarantees
- **Track positions and P&L** via a built-in trade ledger that records every fill
- **Deploy idle capital** to Venus Protocol for yield while waiting for opportunities
- **Build on-chain identity** via ERC-8004 agent identity tokens
- **Run autonomously** via a heartbeat loop (every 30 minutes) that monitors, scans, and executes

### Architecture

```
┌──────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  OpenClaw    │     │   Flash Gateway      │     │  Predict.fun    │
│  Bot/Agent   │────▶│   (this API)         │────▶│  (BSC testnet)  │
│              │     │                      │     └─────────────────┘
│  Reads skill │     │  - Auth (HMAC/dev)   │     ┌─────────────────┐
│  docs, calls │     │  - Policy engine     │────▶│  Probable Mkts  │
│  API only    │     │  - Trade ledger      │     │  (BSC mainnet)  │
│              │     │  - Arb engine        │     └─────────────────┘
│              │     │  - Yield router      │     ┌─────────────────┐
│              │     │  - ERC-8004 identity │────▶│  Venus Protocol │
└──────────────┘     └──────────────────────┘     │  (BSC mainnet)  │
                                                  └─────────────────┘
```

## Platforms

| Platform | Network | Status | Notes |
|----------|---------|--------|-------|
| **Predict.fun** | BSC Testnet (chainId 97) | Active | No API key needed. Markets, orderbooks, and order submission all work. Wallet needs tUSDT + tBNB on testnet for live trades. |
| **Probable Markets** | BSC Mainnet (chainId 56) | Active | Polymarket fork. Requires one-time proxy wallet (Gnosis Safe) deployment. Gateway handles EIP-712 signing, HMAC auth, proxy-as-maker routing. |
| **Venus Protocol** | BSC Mainnet | Active | Yield-only. Deploy/recall idle USDT for lending APY. |

## Complete API Reference

Base URL: `https://eyebalz.xyz/api/v1`

All responses follow a standard envelope:

```json
{
  "success": true,
  "requestId": "uuid",
  "data": { ... },
  "error": null,
  "timestamp": "2026-02-28T12:00:00.000Z"
}
```

On error:

```json
{
  "success": false,
  "requestId": "uuid",
  "data": null,
  "error": { "code": "ERROR_CODE", "message": "Human-readable description" },
  "timestamp": "2026-02-28T12:00:00.000Z"
}
```

### Endpoint Summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/v1/system/health` | No | Gateway liveness check |
| `GET` | `/v1/system/connectors` | Yes | Connector status for each platform |
| `POST` | `/v1/markets/list` | Yes | List active markets across platforms |
| `POST` | `/v1/markets/analyze` | Yes | AI-powered thesis analysis with web research |
| `POST` | `/v1/trades/quote` | Yes | Get a trade quote with confirmation token |
| `POST` | `/v1/trades/execute` | Yes | Execute a quoted trade (requires Idempotency-Key) |
| `POST` | `/v1/positions/list` | Yes | List positions and P&L |
| `POST` | `/v1/arb/scan` | Yes | Scan for cross-platform arbitrage |
| `POST` | `/v1/yield/manage` | Yes | Status, deploy, or recall yield capital |
| `GET` | `/v1/agent/identity` | Yes | Agent ERC-8004 identity and reputation |
| `POST` | `/v1/bots/register` | Yes | Register bot wallet address |
| `POST` | `/v1/bots/setup-proxy` | Yes | Deploy Gnosis Safe proxy for Probable |
| `GET` | `/v1/bots/proxy-status` | Yes | Check proxy deployment, USDT balance, approvals |
| `POST` | `/v1/bots/heartbeat` | Yes | Record heartbeat completion |

### Request Schemas (exact fields accepted)

**POST /v1/markets/list**
```json
{
  "platforms": ["predictfun", "probable"],  // optional, omit for all
  "status": "active",                       // "active" (default) or "all"
  "limit": 20                               // 1-100, default 20
}
```

**POST /v1/markets/analyze**
```json
{
  "query": "Will BTC exceed 100k by March 2026?",  // min 3 chars
  "marketId": "123",    // optional — target a specific market
  "platform": "predictfun"  // optional — narrow to one platform
}
```

**POST /v1/trades/quote**
```json
{
  "marketId": "123",           // required — market ID from /markets/list
  "platform": "predictfun",    // required — "predictfun" or "probable"
  "side": "YES",               // required — "YES" or "NO"
  "size": 10,                  // required — positive number
  "sizeType": "shares",        // required — "shares" or "usd"
  "maxSlippageBps": 100        // optional — 0-5000, default 100 (1%)
}
```

**POST /v1/trades/execute**
```json
{
  "confirmationToken": "ct_...",  // required — from quote response
  "clientOrderId": "my-order-001", // required — min 4 chars, your tracking ID
  "signature": "0x...",           // optional — bot-signed order (relay mode)
  "signerAddress": "0x..."        // optional — required if signature provided
}
```
Headers: `Idempotency-Key: <unique-uuid>` (required)

**POST /v1/positions/list**
```json
{
  "wallet": "0x...",          // optional — override wallet address
  "includeVirtual": true      // default true — include ledger positions
}
```

**POST /v1/arb/scan**
```json
{
  "maxCapitalUsd": 500,                    // optional — cap suggested sizing
  "platforms": ["predictfun", "probable"]  // optional — filter platforms
}
```

**POST /v1/yield/manage**
```json
{
  "mode": "status",                // required — "status", "deploy", or "recall"
  "amountUsd": 1000,              // optional — amount to deploy/recall
  "idleUsd": 1500,                // optional — current idle balance
  "openTradeDemandUsd": 500       // optional — capital needed for trades
}
```

**POST /v1/bots/register**
```json
{
  "walletAddress": "0x1234...5678",  // required — 0x + 40 hex chars
  "erc8004AgentId": 42              // optional — on-chain agent token ID
}
```

**POST /v1/bots/heartbeat**
```json
{
  "strategies": ["delta-neutral", "yield"],  // optional — active strategy names
  "state": { "key": "value" }               // optional — arbitrary state snapshot
}
```

## Platform Setup Requirements

### Predict.fun

**No special setup required.** Works with any EOA wallet on BSC testnet.

However, for **live trade execution** (not just quotes), the wallet needs:
- tBNB on BSC testnet (for gas fees)
- tUSDT approved on the Predict.fun exchange contracts

The gateway handles EIP-712 order signing, salt generation, amount computation, and API submission automatically. The bot just calls `/v1/trades/quote` + `/v1/trades/execute`.

### Probable Markets

Probable requires a **proxy wallet** (Gnosis Safe) deployed on BSC mainnet before orders can be submitted.

**Setup flow:**

1. Call `POST /v1/bots/setup-proxy` — deploys Gnosis Safe on-chain (~0.001 BNB gas)
2. Fund the proxy address with USDT (transfer USDT to the proxy address returned)
3. Call `GET /v1/bots/proxy-status` to verify: `deployed: true`, `usdtBalance > 0`, `approvalsOk: true`
4. Trade normally with `"platform": "probable"` in quote/execute calls

**If proxy is not deployed**, orders fail with error `PROXY_NOT_DEPLOYED` (HTTP 404). The bot should tell the user to deploy the proxy wallet first.

**If the user hasn't set up their proxy yet**, tell them:

> "Before I can trade on Probable Markets, you need a proxy wallet. I can deploy one for you — it's a one-time setup that costs ~0.001 BNB. Should I proceed?"

Then call `POST /v1/bots/setup-proxy`.

**Technical details:** Probable uses EIP-712 signing with domain `{name: "ProbableX", chainId: 56, verifyingContract: "0xF99F5367ce708c66F0860B77B4331301A5597c86"}` — note: NO `version` field in the domain. Orders set `maker` = proxy address, `signer` = EOA, `signatureType` = 2 (ProbGnosisSafe). Minimum fee: 1.75% (175 bps). The gateway handles all of this automatically.

## Two-Step Trade Flow (Critical)

**Every trade must follow this exact flow:**

```
Step 1: Quote
  POST /v1/trades/quote
  → Returns: confirmationToken, price, shares, estimatedCostUsd, expiresAt

Step 2: Present quote to user (or validate against strategy rules if autonomous)

Step 3: Execute
  POST /v1/trades/execute
  Headers: Idempotency-Key: <unique-uuid>
  Body: { confirmationToken, clientOrderId }
  → Returns: orderId, status, filledSize, filledPrice
```

**Rules:**
- Confirmation tokens expire after **90 seconds**
- Each token is **single-use** — reusing returns `TOKEN_ALREADY_USED`
- If expired, re-quote and get a new token
- Always include `Idempotency-Key` header to prevent duplicate execution
- Never execute without showing the quote to the user first (unless autonomous mode with pre-authorized strategy)

## Authentication (HMAC-SHA256)

### Dev Mode (Local Testing)

Set `FLASH_GATEWAY_ALLOW_UNSIGNED=true` to skip signature verification. All endpoints accept requests without auth headers.

### Production Mode

Every request must include these headers:

| Header | Value |
|--------|-------|
| `X-Flash-Agent-Id` | Your agent ID |
| `X-Flash-Key-Id` | Your API key ID |
| `X-Flash-Timestamp` | Unix epoch seconds |
| `X-Flash-Nonce` | Unique per-request (UUIDv4) |
| `X-Flash-Signature` | HMAC-SHA256 hex signature |

**Canonical string format:**

```
METHOD\nPATH\nSHA256(body)\nagentId\ntimestamp\nnonce
```

**Example:**

```
POST
/v1/trades/quote
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
agent_abc123
1709000000
550e8400-e29b-41d4-a716-446655440000
```

Sign the canonical string with HMAC-SHA256 using your secret key.

## Error Code Reference

| Code | HTTP | Meaning | Action |
|------|------|---------|--------|
| `VALIDATION_ERROR` | 400 | Bad request body | Fix request payload |
| `INSUFFICIENT_FUNDS` | 400 | Wallet balance too low | Fund wallet |
| `WALLET_NOT_CONFIGURED` | 400 | No private key configured | Set BNB_PRIVATE_KEY |
| `AUTH_INVALID` | 401/403 | Bad credentials or token mismatch | Check auth headers |
| `POLICY_PLATFORM_BLOCKED` | 403 | Platform disabled by policy | Check allowed platforms |
| `PROXY_NOT_DEPLOYED` | 404 | Probable proxy wallet missing | Call POST /v1/bots/setup-proxy |
| `MARKET_UNAVAILABLE` | 404 | Market not found or closed | Check market ID |
| `TOKEN_EXPIRED` | 409 | Confirmation token too old (>90s) | Re-quote |
| `TOKEN_ALREADY_USED` | 409 | Token consumed by prior execute | Re-quote |
| `PROXY_ALREADY_DEPLOYED` | 409 | Proxy wallet already exists | Use existing proxy |
| `EXECUTION_REJECTED` | 422 | On-chain execution failed | Check slippage/liquidity |
| `POSITIONS_UNAVAILABLE` | 501 | Position API unavailable | Use ledger positions |
| `CONNECTOR_UNAVAILABLE` | 502 | Upstream platform down | Retry later |

## Skill Files

| File | URL | Purpose |
|------|-----|---------|
| **skill.md** (this file) | `/skill.md` | Main router, API reference, setup guide |
| **skill-market-intel.md** | `/skill-market-intel.md` | Market discovery, thesis analysis, arb scanning |
| **skill-trading.md** | `/skill-trading.md` | Quote and execute trades, proxy wallet endpoints |
| **skill-portfolio.md** | `/skill-portfolio.md` | Positions, P&L, yield management |
| **skill-identity.md** | `/skill-identity.md` | ERC-8004 identity, connectors, bot registration |
| **heartbeat.md** | `/heartbeat.md` | Autonomous 6-step heartbeat loop |
| **messaging.md** | `/messaging.md` | Intent-to-endpoint mapping |
| **rules.md** | `/rules.md` | Mandatory rules, risk limits, kill switch |
| **strategy-playbook.md** | `/strategy-playbook.md` | Master strategy guide and decision tree |
| **strategy-delta-neutral.md** | `/strategy-delta-neutral.md` | Cross-platform delta-neutral arbitrage |
| **strategy-thesis.md** | `/strategy-thesis.md` | Conviction-based thesis trading |
| **strategy-yield.md** | `/strategy-yield.md` | Idle capital yield optimization (Venus) |
| **skill.json** | `/skill.json` | Machine-readable skill manifest |

## Intent Router

When a user message or autonomous heartbeat arrives, route to the correct skill file:

1. **Autonomous heartbeat fires** → Load `heartbeat.md` — run the full 6-step pipeline
2. **Strategy selection, "which strategy?"** → Load `strategy-playbook.md`
3. **Markets, analysis, "what's hot?", "analyze this"** → Load `skill-market-intel.md`
4. **Trade execution, "buy", "sell"** → Load `skill-trading.md`
5. **Portfolio, P&L, yield** → Load `skill-portfolio.md`
6. **Identity, reputation, registration** → Load `skill-identity.md`
7. **Delta-neutral arb** → Load `strategy-delta-neutral.md`
8. **Thesis trading** → Load `strategy-thesis.md`
9. **Yield management, Venus** → Load `strategy-yield.md`

Always enforce `rules.md` for every operation. Run `heartbeat.md` on schedule.

## Quick Start (End-to-End)

### 1. Verify gateway is alive

```bash
curl -s https://eyebalz.xyz/api/v1/system/health
```

Response: `{"success":true,"data":{"status":"ok","service":"flash-gateway","version":"v1"}}`

### 2. Check connector health

```bash
curl -s https://eyebalz.xyz/api/v1/system/connectors
```

Returns which platforms are reachable (predictfun, probable).

### 3. Discover active markets

```bash
curl -s -X POST https://eyebalz.xyz/api/v1/markets/list \
  -H "Content-Type: application/json" \
  -d '{"platforms":["predictfun","probable"],"status":"active","limit":10}'
```

Returns market IDs, titles, YES/NO prices, liquidity, and platform.

### 4. Analyze a thesis

```bash
curl -s -X POST https://eyebalz.xyz/api/v1/markets/analyze \
  -H "Content-Type: application/json" \
  -d '{"query":"Will BTC exceed 100k by March 2026?"}'
```

Returns AI-powered analysis with model probability, edge, confidence, and recommendation.

### 5. Scan for arbitrage

```bash
curl -s -X POST https://eyebalz.xyz/api/v1/arb/scan \
  -H "Content-Type: application/json" \
  -d '{"maxCapitalUsd":500}'
```

Returns cross-platform arb opportunities with spread percentages and suggested sizing.

### 6. Execute a trade (two-step)

```bash
# Step 1: Quote
curl -s -X POST https://eyebalz.xyz/api/v1/trades/quote \
  -H "Content-Type: application/json" \
  -d '{"marketId":"123","platform":"predictfun","side":"YES","size":10,"sizeType":"shares"}'

# Step 2: Execute (use confirmationToken from quote response)
curl -s -X POST https://eyebalz.xyz/api/v1/trades/execute \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{"confirmationToken":"ct_from_quote","clientOrderId":"my-order-001"}'
```

### 7. Check positions

```bash
curl -s -X POST https://eyebalz.xyz/api/v1/positions/list \
  -H "Content-Type: application/json" \
  -d '{"includeVirtual":true}'
```

### 8. Record heartbeat

```bash
curl -s -X POST https://eyebalz.xyz/api/v1/bots/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"strategies":["delta-neutral","yield"]}'
```

## Install Locally

```bash
mkdir -p ~/.openclaw/skills/flash-gateway
for f in skill.md skill.json skill-market-intel.md skill-trading.md skill-portfolio.md \
         skill-identity.md heartbeat.md messaging.md rules.md \
         strategy-playbook.md strategy-delta-neutral.md strategy-thesis.md strategy-yield.md; do
  curl -s "https://eyebalz.xyz/$f" > ~/.openclaw/skills/flash-gateway/$f
done
```
