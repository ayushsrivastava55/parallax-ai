---
name: strategy-thesis
version: 1.0.0
description: Thesis-driven trading playbook. Form a directional view on an outcome, quantify your edge against the market, size the position with Kelly, and manage it through resolution.
---

# Thesis-Driven Trading Strategy

## What It Means

Thesis-driven trading is directional. You form a belief that the market is mispricing an outcome, then take a position to profit when the market corrects toward your view. Unlike delta-neutral arb, this carries real risk — if your thesis is wrong, you lose money.

**When to use:** You have a strong, evidence-based view AND the market is offering at least a 5% edge.

## Step 1: Form Your Thesis

A thesis is a structured belief about an outcome. Good theses are:

- **Specific.** "BTC will exceed $100k by March 2026 because of ETF inflows and the halving cycle."
- **Falsifiable.** Define what evidence would change your mind.
- **Time-bound.** Aligned with the market's resolution date.

Bad theses: "I think BTC will go up" (too vague), "This market feels wrong" (no evidence).

## Step 2: Analyze Markets

Use the analysis endpoint to find markets matching your thesis and quantify edge.

```bash
curl -X POST https://eyebalz.xyz/api/v1/markets/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Will BTC exceed $100k by March 2026?"
  }'
```

**Response example:**

```json
{
  "markets": [
    {
      "marketId": "mkt_btc100k_mar26",
      "question": "Will Bitcoin exceed $100,000 by March 31, 2026?",
      "platform": "predict.fun",
      "platformsAvailable": ["predict.fun", "probable"],
      "currentPrice": 0.58,
      "volume24h": 45000,
      "liquidity": 120000,
      "resolutionDate": "2026-03-31T00:00:00Z",
      "analysis": {
        "aiProbability": 0.68,
        "confidence": 0.72,
        "edge": 0.10,
        "edgePct": 17.24,
        "reasoning": "ETF inflow data, halving cycle analysis, and on-chain metrics support a probability higher than the current market price.",
        "risks": [
          "Regulatory crackdown could suppress price",
          "Macro downturn could delay timeline"
        ]
      }
    }
  ]
}
```

## Step 3: Interpret the Analysis

Apply these filters before proceeding:

| Criterion | Threshold | Action if not met |
|-----------|-----------|-------------------|
| Edge | > 5% | Skip — insufficient edge |
| Confidence | > 0.6 | Skip — too uncertain |
| Liquidity | > $10,000 | Skip — cannot size meaningfully |
| Time to resolution | > 7 days | Skip — too close to expiry |

If all filters pass, proceed to position sizing.

**Platform selection:** The same market may be available on Predict.fun or Probable. Compare prices across both platforms and choose the one offering the best entry price (highest edge). Use `"platform": "probable"` in the quote request to trade on Probable.

## Step 4: Position Sizing with Kelly

Calculate the optimal position size:

```
edge = ai_probability - market_price         = 0.68 - 0.58 = 0.10
confidence = 0.72
odds = (1 / market_price) - 1                = (1 / 0.58) - 1 = 0.724
kelly_fraction = (edge * confidence) / odds   = (0.10 * 0.72) / 0.724 = 0.0994
half_kelly = kelly_fraction / 2               = 0.0497
```

**Apply hard caps:**

- Cap at 5% of portfolio: `min(half_kelly, 0.05) = 0.0497`
- With a $10,000 portfolio: position size = $497

## Step 5: Quote the Trade

```bash
curl -X POST https://eyebalz.xyz/api/v1/trades/quote \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "mkt_btc100k_mar26",
    "platform": "predict.fun",
    "side": "YES",
    "amountUsd": 497
  }'
```

```json
{
  "quoteId": "qt_thesis_001",
  "marketId": "mkt_btc100k_mar26",
  "side": "YES",
  "price": 0.58,
  "contracts": 856,
  "totalCost": 496.48,
  "expiresAt": "2026-02-28T12:05:00Z"
}
```

## Step 6: Execute the Trade

```bash
curl -X POST https://eyebalz.xyz/api/v1/trades/execute \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: thesis_btc100k_yes_20260228" \
  -d '{
    "quoteId": "qt_thesis_001"
  }'
```

```json
{
  "tradeId": "trd_thesis_001",
  "status": "filled",
  "side": "YES",
  "contracts": 856,
  "avgPrice": 0.58,
  "totalCost": 496.48
}
```

## Exit Conditions

Close the position when any of these conditions are met:

| Condition | Action |
|-----------|--------|
| **Thesis invalidated** | New evidence contradicts your thesis. Close immediately. |
| **Edge dropped below 2%** | Market has moved toward your view. Take profit. |
| **Stop-loss hit** | Position value dropped 30% from entry. Close to limit losses. |
| **Resolution approaching** | Less than 48h to resolution. Evaluate whether to hold through or exit. |
| **Better opportunity** | A higher-edge opportunity needs the capital. Close and reallocate. |

## Heartbeat Monitoring

**Weekly:**
- Re-run `POST /v1/markets/analyze` with your original thesis query.
- Compare new `aiProbability` and `confidence` to original values.
- If confidence dropped below 0.5 or edge inverted (negative), close position.

**Every 30 minutes:**
- Check position value via `POST /v1/positions/list`.
- Verify stop-loss has not been hit.
- Check if market price has moved enough to trigger a take-profit exit (edge < 2%).

## Risk Considerations

- **Correlation risk.** Do not hold multiple thesis positions on correlated outcomes (e.g., "BTC > $100k" and "BTC > $90k"). Combined exposure must stay under 15% of portfolio.
- **Overconfidence bias.** The AI confidence score is a model estimate, not ground truth. Always use half-Kelly.
- **Liquidity risk.** If the market is thin, your exit price may be much worse than the current price. Factor slippage into your edge calculation.
