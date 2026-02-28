---
name: eyebalz-market-intel
version: 2.0.0
description: Market discovery, thesis analysis, and arbitrage scanning via Eyebalz Gateway.
author: eyebalz-team
tags: [markets, analysis, arbitrage, prediction-markets]
---

# Eyebalz Skill: Market Intelligence

Use this skill when the user asks about live markets, wants a thesis analyzed,
asks whether a market is overpriced or underpriced, or wants to find arbitrage
opportunities across platforms.

Trigger phrases: "what markets are live", "analyze my thesis", "find arb",
"is this overpriced", "scan for opportunities", "show me prediction markets".

Base URL: `https://eyebalz.xyz/api/v1`
Rate limit: 240 requests/min across all endpoints.

---

## 1. List Active Markets

**`POST /v1/markets/list`**

### Request

```json
{
  "platforms": ["predictfun", "probable"],
  "status": "active",
  "limit": 20
}
```

### Response (200)

```json
{
  "ok": true,
  "markets": [
    {
      "marketId": "0xabc123...def",
      "platform": "predictfun",
      "question": "Will BTC exceed $100k by March 2026?",
      "yesPrice": 0.62,
      "noPrice": 0.38,
      "volume24hUsd": 48200,
      "liquidity": 125000,
      "expiresAt": "2026-03-31T23:59:59Z"
    },
    {
      "marketId": "0x456def...789",
      "platform": "probable",
      "question": "Will BNB exceed $400 by April 2026?",
      "yesPrice": 0.52,
      "noPrice": 0.48,
      "volume24hUsd": 31500,
      "liquidity": 78000,
      "expiresAt": "2026-04-30T23:59:59Z"
    }
  ],
  "total": 2
}
```

### curl

```bash
curl -X POST https://eyebalz.xyz/api/v1/markets/list \
  -H "Content-Type: application/json" \
  -d '{"platforms":["predictfun","probable"],"status":"active","limit":20}'
```

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| VALIDATION_ERROR | 400 | Bad request body (e.g. unknown platform name) |
| CONNECTOR_UNAVAILABLE | 502 | Upstream platform is down or unreachable |

---

## 2. Thesis Analysis

**`POST /v1/markets/analyze`**

### Request

```json
{
  "query": "BTC above 100k by March"
}
```

### Response (200)

```json
{
  "ok": true,
  "analysis": {
    "edge": 0.14,
    "confidence": 0.72,
    "direction": "YES",
    "factors": [
      "Institutional inflows up 38% month-over-month",
      "Historical March seasonality is bullish 6 of last 8 years",
      "Current implied probability (62%) lags model estimate (76%)"
    ],
    "suggestedMarketId": "0xabc123...def",
    "platform": "predictfun"
  }
}
```

### curl

```bash
curl -X POST https://eyebalz.xyz/api/v1/markets/analyze \
  -H "Content-Type: application/json" \
  -d '{"query":"BTC above 100k by March"}'
```

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| VALIDATION_ERROR | 400 | Empty or malformed query string |
| ANALYSIS_FAILED | 422 | Could not produce a meaningful analysis |

---

## 3. Arbitrage Scan

**`POST /v1/arb/scan`**

### Request

```json
{
  "maxCapitalUsd": 500,
  "platforms": ["predictfun", "probable"]
}
```

### Response (200)

```json
{
  "ok": true,
  "opportunities": [
    {
      "question": "Will BNB exceed $400 by April 2026?",
      "legA": {
        "platform": "predictfun",
        "side": "YES",
        "price": 0.54,
        "marketId": "0xdef456...789"
      },
      "legB": {
        "platform": "probable",
        "side": "NO",
        "price": 0.40,
        "marketId": "0x456def...789"
      },
      "spreadPct": 6.0,
      "maxProfitUsd": 30.0,
      "capitalRequired": 470
    }
  ],
  "scannedPairs": 64
}
```

### curl

```bash
curl -X POST https://eyebalz.xyz/api/v1/arb/scan \
  -H "Content-Type: application/json" \
  -d '{"maxCapitalUsd":500,"platforms":["predictfun","probable"]}'
```

**Arb surface:** With 2 platforms (Predict.fun and Probable), arb scanning covers cross-platform mispricings on matched markets.

---

## When to Use

**From heartbeat loop:**
- Step 3 — run `/v1/arb/scan` to detect cross-platform mispricings.
- Step 5 — run `/v1/markets/analyze` for periodic strategy health checks.

**From user request:**
- Any question about live markets, research, thesis validation, or arbitrage.

## Rules

1. Always start with fresh market data; never cache across user turns.
2. Show confidence and risk language clearly to the user.
3. Do not execute orders from this skill — hand off to eyebalz-trading.
