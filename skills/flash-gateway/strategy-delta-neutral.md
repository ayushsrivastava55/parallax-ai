---
name: strategy-delta-neutral
version: 1.0.0
description: Delta-neutral arbitrage playbook. Buy YES on one platform and NO on another when the combined cost is less than $1.00, locking in risk-free profit.
---

# Delta-Neutral Arbitrage Strategy

## What It Means

Delta-neutral arbitrage exploits price discrepancies across prediction market platforms. If Platform A prices YES at $0.55 and Platform B prices NO at $0.40, your total cost is $0.95 per contract pair. Regardless of the outcome, one contract pays $1.00. You lock in a $0.05 profit per pair — risk-free.

**Key invariant:** YES_A + NO_B < 1.00 means profit exists.

**Platforms:** Predict.fun and Probable. Cross-platform arb scans match markets across both platforms to find mispricings.

## Step 1: Scan for Opportunities

Scan all tracked markets for arbitrage edges.

```bash
curl -X POST https://eyebalz.xyz/api/v1/arb/scan \
  -H "Content-Type: application/json" \
  -d '{
    "maxCapitalUsd": 500
  }'
```

**Response example:**

```json
{
  "opportunities": [
    {
      "marketId": "mkt_abc123",
      "question": "Will BTC hit $100k by March 2026?",
      "legA": {
        "platform": "predict.fun",
        "side": "YES",
        "price": 0.55,
        "availableLiquidity": 2000
      },
      "legB": {
        "platform": "probable",
        "side": "NO",
        "price": 0.40,
        "availableLiquidity": 1500
      },
      "totalCost": 0.95,
      "totalProfit": 0.05,
      "edgePct": 5.26,
      "maxContracts": 500
    }
  ]
}
```

## Step 2: Filter

Only proceed if the opportunity meets these thresholds:

| Criterion | Minimum |
|-----------|---------|
| Edge (totalProfit / totalCost) | > 3% |
| Available liquidity on both legs | > $200 |
| Max capital per arb | 5% of portfolio |

Discard opportunities below these thresholds. Sort remaining by edge descending.

## Step 3: Quote Both Legs

Get firm quotes for each leg before executing.

**Leg A (YES on predict.fun):**

```bash
curl -X POST https://eyebalz.xyz/api/v1/trades/quote \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "mkt_abc123",
    "platform": "predict.fun",
    "side": "YES",
    "amountUsd": 275
  }'
```

```json
{
  "quoteId": "qt_leg_a_001",
  "marketId": "mkt_abc123",
  "side": "YES",
  "price": 0.55,
  "contracts": 500,
  "totalCost": 275.00,
  "expiresAt": "2026-02-28T12:05:00Z"
}
```

**Leg B (NO on probable):**

```bash
curl -X POST https://eyebalz.xyz/api/v1/trades/quote \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "mkt_abc123",
    "platform": "probable",
    "side": "NO",
    "amountUsd": 200
  }'
```

```json
{
  "quoteId": "qt_leg_b_001",
  "marketId": "mkt_abc123",
  "side": "NO",
  "price": 0.40,
  "contracts": 500,
  "totalCost": 200.00,
  "expiresAt": "2026-02-28T12:05:00Z"
}
```

**Validate before execution:** Confirm `legA.price + legB.price < 1.00` still holds. If quotes have drifted and the edge is gone, abort.

## Step 4: Execute Both Legs

Execute both legs as fast as possible. Use idempotency keys to prevent double-execution.

**Execute Leg A:**

```bash
curl -X POST https://eyebalz.xyz/api/v1/trades/execute \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: arb_mkt_abc123_legA_20260228" \
  -d '{
    "quoteId": "qt_leg_a_001"
  }'
```

```json
{
  "tradeId": "trd_a_001",
  "status": "filled",
  "side": "YES",
  "contracts": 500,
  "avgPrice": 0.55,
  "totalCost": 275.00
}
```

**Execute Leg B:**

```bash
curl -X POST https://eyebalz.xyz/api/v1/trades/execute \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: arb_mkt_abc123_legB_20260228" \
  -d '{
    "quoteId": "qt_leg_b_001"
  }'
```

```json
{
  "tradeId": "trd_b_001",
  "status": "filled",
  "side": "NO",
  "contracts": 500,
  "avgPrice": 0.40,
  "totalCost": 200.00
}
```

## Step 5: Monitor Positions

Verify both legs are filled and healthy.

```bash
curl -X POST https://eyebalz.xyz/api/v1/positions/list \
  -H "Content-Type: application/json" \
  -d '{}'
```

Confirm both `trd_a_001` and `trd_b_001` appear with status `filled` and matching contract counts. If contract counts differ, you have residual directional risk — see Step 6.

## Step 6: Unwind on Failure

If one leg fails to fill (status `rejected` or `partial`):

1. **Immediately close the filled leg.** You now have naked directional exposure.
2. Quote a close on the filled leg using `POST /v1/trades/quote` with the opposite side.
3. Execute the close. Accept slippage — exiting fast matters more than exit price.
4. Log the failure for review.

**Never hold a single leg of an arb position overnight.**

## Heartbeat Monitoring

Every 30 minutes:

- Fetch all open arb positions via `POST /v1/positions/list`.
- For each arb pair, verify both legs are still active.
- If a market is approaching resolution (< 24h), consider unwinding early to avoid settlement risk.
- If one leg has moved against you by > 10%, flag for manual review.
- Re-run `POST /v1/arb/scan` to find new opportunities.
