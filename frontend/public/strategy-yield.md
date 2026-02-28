---
name: strategy-yield
version: 1.0.0
description: Yield optimization playbook. Deploy idle capital to Venus Protocol for passive yield while not actively trading.
---

# Yield Optimization Strategy

## What It Means

Idle capital earns nothing. Venus Protocol on BNB Chain offers lending yield on stablecoins. This strategy automatically deploys untraded capital to Venus and recalls it when a trading opportunity arises. It is the lowest-priority strategy — arb and thesis always take precedence.

## Step 1: Check Idle Capital

List all positions to determine how much capital is currently undeployed.

```bash
curl -X POST https://eyebalz.xyz/api/v1/positions/list \
  -H "Content-Type: application/json" \
  -d '{}'
```

From the response, calculate:

- **Total portfolio value** = sum of all positions + cash balance
- **Deployed in trades** = sum of open position values
- **Deployed in yield** = amount currently in Venus
- **Idle capital** = cash balance - reserve floor (20% of portfolio)

Only proceed if idle capital exceeds $500.

## Step 2: Check Yield Status

Query the current state of your Venus deployment.

```bash
curl -X POST https://eyebalz.xyz/api/v1/yield/manage \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "status"
  }'
```

**Response example:**

```json
{
  "protocol": "venus",
  "chain": "bnb",
  "deposited": 3000.00,
  "currentValue": 3012.45,
  "earnedYield": 12.45,
  "currentApy": 4.2,
  "asset": "USDC",
  "lastUpdated": "2026-02-28T11:30:00Z"
}
```

## Step 3: Deploy Idle Capital

If idle capital is available and the current APY exceeds the 3% threshold, deploy.

```bash
curl -X POST https://eyebalz.xyz/api/v1/yield/manage \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "deploy",
    "amountUsd": 1000,
    "idleUsd": 1500
  }'
```

**Response example:**

```json
{
  "action": "deploy",
  "amountDeployed": 1000.00,
  "newTotalDeposited": 4000.00,
  "remainingIdle": 500.00,
  "txHash": "0xabc123...def456",
  "protocol": "venus",
  "asset": "USDC",
  "currentApy": 4.2
}
```

**Rules:**

- Only deploy if `currentApy > 3.0%`.
- Never deploy reserve capital (the 20% floor).
- Maximum single deployment: the full idle amount minus $200 buffer for gas.

## Step 4: Recall Capital When Needed

Before executing any trade (arb or thesis), check if the trading bucket has sufficient funds. If not, recall from yield.

```bash
curl -X POST https://eyebalz.xyz/api/v1/yield/manage \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "recall",
    "amountUsd": 500,
    "openTradeDemandUsd": 500
  }'
```

**Response example:**

```json
{
  "action": "recall",
  "amountRecalled": 500.00,
  "newTotalDeposited": 3500.00,
  "availableForTrading": 500.00,
  "txHash": "0x789abc...123def",
  "protocol": "venus",
  "asset": "USDC"
}
```

**Rules:**

- Recall only what is needed for the pending trade plus 10% buffer for slippage.
- Recall is a blocking step — wait for the transaction to confirm before executing the trade.
- If the recall transaction fails, abort the trade.

## APY Thresholds

| APY | Action |
|-----|--------|
| > 3.0% | Deploy idle capital |
| 2.0% – 3.0% | Hold current deployment, do not add more |
| < 2.0% | Recall all capital — yield is not worth the smart contract risk |

## Integration with Other Strategies

Yield is subordinate to trading. The integration flow:

1. **Heartbeat fires** (every 30 min).
2. Run arb scan. If arb found, check if trading bucket has funds. If not, recall from yield, then execute arb.
3. Check thesis queue. If thesis trade ready, check trading bucket. If not, recall from yield, then execute thesis.
4. If no trades needed, check idle capital. If idle > $500 and APY > 3%, deploy to yield.

## Heartbeat Monitoring

Every 30 minutes:

- Call `POST /v1/yield/manage` with `{"mode": "status"}`.
- Log current APY, deposited amount, and earned yield.
- If APY has dropped below 2.0%, auto-recall all deployed capital.
- If APY is between 2.0% and 3.0%, hold but do not deploy more.
- If idle capital has grown above $500 (e.g., from a trade closing), deploy the excess.
