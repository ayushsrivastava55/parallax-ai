---
name: eyebalz-trading
version: 2.0.0
description: Quote and execute prediction market trades through Eyebalz Gateway.
author: eyebalz-team
tags: [trading, execution, orders, prediction-markets]
---

# Eyebalz Skill: Trading Execution

Use this skill when the user asks to buy, sell, place an order, execute a trade,
or confirm a pending quote. Trading always follows a strict 2-step flow.

Trigger phrases: "buy YES", "sell NO", "place order", "execute trade",
"confirm trade", "I want to trade".

Base URL: `https://eyebalz.xyz/api/v1`

---

## Step 1: Get a Quote

**`POST /v1/trades/quote`**

### Request

```json
{
  "marketId": "0xabc123...def",
  "platform": "predictfun",
  "side": "YES",
  "size": 100,
  "sizeType": "shares",
  "maxSlippageBps": 100
}
```

Fields:
- `platform` — `"predictfun"` or `"probable"`
- `side` — `"YES"` or `"NO"`
- `sizeType` — `"shares"` (number of outcome tokens) or `"usd"` (dollar amount)
- `maxSlippageBps` — maximum acceptable slippage in basis points (100 = 1%)

### Response (200)

```json
{
  "ok": true,
  "quote": {
    "confirmationToken": "qt_a1b2c3d4e5f6...",
    "price": 0.62,
    "shares": 100,
    "estimatedCostUsd": 62.00,
    "side": "YES",
    "platform": "predictfun",
    "marketId": "0xabc123...def",
    "expiresAt": "2026-02-28T12:01:30Z"
  }
}
```

### curl

```bash
curl -X POST https://eyebalz.xyz/api/v1/trades/quote \
  -H "Content-Type: application/json" \
  -d '{
    "marketId":"0xabc123...def",
    "platform":"predictfun",
    "side":"YES",
    "size":100,
    "sizeType":"shares",
    "maxSlippageBps":100
  }'
```

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| VALIDATION_ERROR | 400 | Missing or invalid fields in request body |
| POLICY_PLATFORM_BLOCKED | 403 | Platform is disabled by policy or config |
| INSUFFICIENT_FUNDS | 400 | Wallet balance too low for the requested size |
| PROXY_NOT_DEPLOYED | 400 | Proxy wallet needs setup before trading on Probable (`POST /v1/bots/setup-proxy`) |

---

## Step 2: Execute the Trade

**`POST /v1/trades/execute`**

You MUST present the quote to the user and obtain explicit confirmation
before calling this endpoint. Never auto-execute.

### Request

```json
{
  "confirmationToken": "qt_a1b2c3d4e5f6...",
  "clientOrderId": "my-bot-order-001"
}
```

### Required Headers

```
Content-Type: application/json
Idempotency-Key: <unique-uuid-per-attempt>
```

The `Idempotency-Key` header prevents duplicate executions if the request is
retried. Generate a fresh UUID for each execution attempt.

### Response (200)

```json
{
  "ok": true,
  "trade": {
    "status": "filled",
    "orderId": "ord_x9y8z7...",
    "side": "YES",
    "filledSize": 100,
    "filledPrice": 0.62,
    "totalCostUsd": 62.00,
    "platform": "predictfun",
    "marketId": "0xabc123...def",
    "executedAt": "2026-02-28T12:00:05Z"
  }
}
```

### curl

```bash
curl -X POST https://eyebalz.xyz/api/v1/trades/execute \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "confirmationToken":"qt_a1b2c3d4e5f6...",
    "clientOrderId":"my-bot-order-001"
  }'
```

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| AUTH_INVALID | 403 | Authentication failed or wallet not authorized |
| TOKEN_EXPIRED | 409 | Confirmation token older than 90 seconds |
| TOKEN_ALREADY_USED | 409 | Token was already consumed by a prior execute call |
| EXECUTION_REJECTED | 422 | On-chain execution failed (slippage, liquidity, etc.) |

---

## Token Rules

- A confirmation token is valid for **90 seconds** from issuance.
- Each token is **single-use**; a second execute call with the same token returns TOKEN_ALREADY_USED.
- If the token expires, you must call `/v1/trades/quote` again and present the new quote to the user.

---

## Platform-Specific Notes

### Probable Markets

Probable is a Polymarket fork on BSC. The gateway abstracts away all complexity — agents call the same `/v1/trades/quote` and `/v1/trades/execute` endpoints with `"platform": "probable"`.

**One-time setup required:** Before the first trade on Probable, deploy a proxy wallet via `POST /v1/bots/setup-proxy`. The gateway handles EIP-712 signing, HMAC authentication, and proxy-as-maker routing automatically.

**Minimum order fee:** 1.75% (175 bps) — enforced by the Probable CLOB.

**Check proxy status:** Use `GET /v1/bots/proxy-status` to verify the proxy is deployed, funded, and approvals are in place before trading.

---

## Proxy Wallet Endpoints

### Deploy Proxy Wallet

**`POST /v1/bots/setup-proxy`**

Deploys a Gnosis Safe proxy wallet for Probable Markets. One-time operation, costs ~0.001 BNB in gas.

#### Request

```json
{}
```

Uses the authenticated agent's wallet — no additional fields required.

#### Response (200)

```json
{
  "ok": true,
  "proxyAddress": "0xSafeProxyAddress...",
  "txHash": "0xDeploymentTxHash...",
  "status": "deployed"
}
```

#### curl

```bash
curl -X POST https://eyebalz.xyz/api/v1/bots/setup-proxy \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| AUTH_INVALID | 403 | Authentication failed or wallet not authorized |
| PROXY_ALREADY_DEPLOYED | 409 | Proxy wallet already exists for this agent |

---

### Check Proxy Status

**`GET /v1/bots/proxy-status`**

Quick health check before trading on Probable. Returns proxy deployment state, USDT balance, and approval status.

#### Response (200)

```json
{
  "ok": true,
  "proxyAddress": "0xSafeProxyAddress...",
  "deployed": true,
  "usdtBalance": "150.00",
  "approvalsOk": true
}
```

#### curl

```bash
curl https://eyebalz.xyz/api/v1/bots/proxy-status
```

#### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| AUTH_INVALID | 403 | Authentication failed or wallet not authorized |
| PROXY_NOT_DEPLOYED | 404 | No proxy wallet found — call `POST /v1/bots/setup-proxy` first |

---

## When to Use

**From heartbeat loop:**
- Arb execution — requires 2 legs (quote + execute for each side).
- Thesis execution — after analysis confirms edge, quote then execute.

**From user request:**
- Any buy, sell, or order placement request.

## Hard Constraints

1. Never execute without explicit user confirmation.
2. Never execute without an `Idempotency-Key` header.
3. If a token expires, re-quote and ask again before executing.
4. Always show `estimatedCostUsd` and `side` before asking for confirmation.
5. **Never use private keys or sign transactions locally.** The gateway handles all wallet management and on-chain signing. If you get `WALLET_NOT_CONFIGURED`, call `POST /v1/bots/register` first.
6. **Register before trading.** Call `POST /v1/bots/register` before your first trade. This is idempotent.
