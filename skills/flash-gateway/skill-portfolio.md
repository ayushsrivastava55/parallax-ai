---
name: eyebalz-portfolio
version: 2.0.0
description: Position tracking, PnL reporting, and yield management through Eyebalz Gateway.
author: eyebalz-team
tags: [portfolio, positions, pnl, yield, capital-management]
---

# Eyebalz Skill: Portfolio and Yield

Use this skill when the user asks about their positions, profit and loss,
holdings, idle capital, or yield strategies.

Trigger phrases: "show positions", "my PnL", "what am I holding",
"manage idle capital", "deploy to yield", "recall funds".

Base URL: `https://eyebalz.xyz/api/v1`

---

## 1. List Positions

**`POST /v1/positions/list`**

### Request

```json
{
  "includeVirtual": true
}
```

Set `includeVirtual` to `true` to include positions simulated from pending
orders that have not yet settled on-chain.

### Response (200)

```json
{
  "ok": true,
  "positions": [
    {
      "marketId": "0xabc123...def",
      "platform": "predictfun",
      "question": "Will BTC exceed $100k by March 2026?",
      "side": "YES",
      "size": 100,
      "avgEntryPrice": 0.58,
      "currentPrice": 0.62,
      "pnl": 4.00,
      "pnlPct": 6.90,
      "valueUsd": 62.00
    },
    {
      "marketId": "0x456def...789",
      "platform": "probable",
      "question": "Will BNB exceed $400 by April 2026?",
      "side": "NO",
      "size": 200,
      "avgEntryPrice": 0.48,
      "currentPrice": 0.52,
      "pnl": -8.00,
      "pnlPct": -8.33,
      "valueUsd": 104.00
    }
  ],
  "totals": {
    "totalPnl": -4.00,
    "totalValue": 166.00,
    "positionCount": 2
  },
  "sources": ["predictfun", "probable"]
}
```

### curl

```bash
curl -X POST https://eyebalz.xyz/api/v1/positions/list \
  -H "Content-Type: application/json" \
  -d '{"includeVirtual":true}'
```

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| POSITIONS_UNAVAILABLE | 501 | Upstream connector cannot retrieve positions right now |

### PnL Calculation

```
pnl = (currentPrice - avgEntryPrice) * size
pnlPct = (pnl / (avgEntryPrice * size)) * 100
```

---

## 2. Yield Management

**`POST /v1/yield/manage`**

This endpoint handles three modes: `status`, `deploy`, and `recall`.

### Mode: status

```json
{ "mode": "status" }
```

Response:

```json
{
  "ok": true,
  "yield": {
    "suppliedUsd": 2500.00,
    "estApyPct": 4.8,
    "provider": "venus-bnb",
    "lastUpdated": "2026-02-28T11:00:00Z"
  }
}
```

```bash
curl -X POST https://eyebalz.xyz/api/v1/yield/manage \
  -H "Content-Type: application/json" \
  -d '{"mode":"status"}'
```

### Mode: deploy

```json
{
  "mode": "deploy",
  "amountUsd": 1000,
  "idleUsd": 1500
}
```

Response:

```json
{
  "ok": true,
  "decision": {
    "action": "deploy",
    "amountUsd": 1000,
    "provider": "venus-bnb",
    "reason": "Idle balance exceeds trade reserve; deploying surplus to yield."
  }
}
```

```bash
curl -X POST https://eyebalz.xyz/api/v1/yield/manage \
  -H "Content-Type: application/json" \
  -d '{"mode":"deploy","amountUsd":1000,"idleUsd":1500}'
```

### Mode: recall

```json
{
  "mode": "recall",
  "amountUsd": 500,
  "openTradeDemandUsd": 500
}
```

Response:

```json
{
  "ok": true,
  "decision": {
    "action": "recall",
    "amountUsd": 500,
    "provider": "venus-bnb",
    "reason": "Open trade demand requires additional capital; recalling from yield."
  }
}
```

```bash
curl -X POST https://eyebalz.xyz/api/v1/yield/manage \
  -H "Content-Type: application/json" \
  -d '{"mode":"recall","amountUsd":500,"openTradeDemandUsd":500}'
```

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| VALIDATION_ERROR | 400 | Missing mode or invalid amount values |

---

## When to Use

**From heartbeat loop:**
- Step 2 — call `/v1/positions/list` for portfolio health check.
- Step 4 — call `/v1/yield/manage` with mode `status` then `deploy` or `recall` as needed.

**From user request:**
- Any question about holdings, PnL, capital allocation, or yield.

## Rules

1. Prefer reporting first, actions second.
2. Keep totals and per-position metrics consistent.
3. Always show PnL in both absolute USD and percentage terms.
