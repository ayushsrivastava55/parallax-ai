---
name: flash-heartbeat
version: 2.0.0
description: Autonomous heartbeat loop for Flash Gateway bots. Runs every 30 minutes to monitor health, manage positions, scan for arb, optimize yield, and execute strategies.
homepage: https://eyebalz.xyz
---

# Flash Gateway Heartbeat

The heartbeat is the autonomous engine of a Flash Gateway agent. It runs every 30 minutes and executes a 6-step pipeline. Each step gates the next — if health fails, the loop halts early.

**IMPORTANT: Before your first heartbeat, register with the gateway by calling `POST /v1/bots/register`. This creates your wallet, ERC-8004 identity, and NFA token. You only need to do this once — the endpoint is idempotent.**

## Step 0: Ensure Registration

On the very first heartbeat, register the agent:

```bash
curl -s -X POST https://eyebalz.xyz/api/v1/bots/register \
  -H "Content-Type: application/json" \
  -d '{"persona": "my-agent"}'
```

If `alreadyRegistered: true` in the response, skip — you're already set up. Store the `walletAddress` from the response for reference.

## Step 1: Platform Health

Verify the gateway and all connectors are operational before doing anything else.

```bash
curl -s https://eyebalz.xyz/api/v1/system/health
```

Expected response:

```json
{
  "status": "ok",
  "version": "2.0.0",
  "uptime": 86400,
  "timestamp": "2026-02-28T12:00:00Z"
}
```

Then check connector status:

```bash
curl -s https://eyebalz.xyz/api/v1/system/connectors
```

Expected response:

```json
{
  "connectors": [
    {"name": "predict", "status": "connected", "latencyMs": 45},
    {"name": "probable", "status": "connected", "latencyMs": 88},
    {"name": "venus", "status": "connected", "latencyMs": 30}
  ]
}
```

Then verify the Probable proxy wallet is healthy:

```bash
curl -s https://eyebalz.xyz/api/v1/bots/proxy-status
```

Expected response:

```json
{
  "proxyAddress": "0xSafeProxyAddress...",
  "deployed": true,
  "usdtBalance": "150.00",
  "approvalsOk": true
}
```

If `deployed` is `false`, call `POST /v1/bots/setup-proxy` — the gateway deploys the proxy using the agent's wallet (no private keys needed from the agent). If `usdtBalance` is below trading threshold or `approvalsOk` is `false`, flag for operator attention (the operator needs to fund the proxy).

**Decision:** If `status` is NOT `"ok"` or any critical connector is `"disconnected"`, STOP the heartbeat immediately. Log the error with the `requestId`. Retry on the next scheduled beat. Do not attempt any trades or portfolio operations against a degraded gateway.

## Step 2: Portfolio Check

Fetch all open positions and evaluate health.

```bash
curl -s -X POST https://eyebalz.xyz/api/v1/positions/list \
  -H "Content-Type: application/json" \
  -d '{"includeVirtual": true}'
```

Expected response:

```json
{
  "positions": [
    {
      "positionId": "pos_001",
      "marketId": "mkt_abc",
      "platform": "predict",
      "side": "YES",
      "size": 50,
      "entryPrice": 0.60,
      "currentPrice": 0.55,
      "unrealizedPnl": -2.50,
      "pnlPercent": -8.33,
      "strategy": "thesis"
    },
    {
      "positionId": "pos_002",
      "marketId": "mkt_xyz",
      "platform": "probable",
      "side": "NO",
      "size": 100,
      "entryPrice": 0.40,
      "currentPrice": 0.25,
      "unrealizedPnl": 15.00,
      "pnlPercent": 37.5,
      "strategy": "delta-neutral"
    }
  ],
  "summary": {
    "totalValue": 5200.00,
    "totalUnrealizedPnl": 12.50,
    "positionCount": 2
  }
}
```

**Stop-loss check:** For each position, if `pnlPercent <= -30%`, exit immediately:

1. Call `POST /v1/trades/quote` with the position's exit parameters
2. Call `POST /v1/trades/execute` with the confirmation token
3. Log the forced exit with reason `"stop-loss triggered"` and the position details

**Total P&L calculation:** Sum `unrealizedPnl` across all positions. If total portfolio drawdown exceeds 20% of starting capital, escalate to human operator.

## Step 3: Arb Scan

Scan for cross-platform arbitrage opportunities.

```bash
curl -s -X POST https://eyebalz.xyz/api/v1/arb/scan \
  -H "Content-Type: application/json" \
  -d '{"maxCapitalUsd": 500}'
```

Expected response:

```json
{
  "opportunities": [
    {
      "arbId": "arb_001",
      "question": "Will BNB exceed $400 by April 2026?",
      "legA": {"platform": "predict", "side": "YES", "price": 0.54},
      "legB": {"platform": "probable", "side": "NO", "price": 0.40},
      "spread": 0.06,
      "edgePercent": 6.0,
      "maxSize": 300,
      "expiresAt": "2026-02-28T12:05:00Z"
    }
  ],
  "scannedPairs": 64
}
```

**Decision:** If any opportunity has `edgePercent > 3%`:

1. Load `strategy-delta-neutral.md`
2. Execute the delta-neutral strategy for the highest-edge opportunity first
3. Process remaining opportunities in descending edge order, respecting capital limits

If no opportunities meet the threshold, continue to Step 4.

## Step 4: Yield Check

Check idle capital and yield deployment status.

```bash
curl -s -X POST https://eyebalz.xyz/api/v1/yield/manage \
  -H "Content-Type: application/json" \
  -d '{"mode": "status"}'
```

Expected response:

```json
{
  "deployedCapital": 1500.00,
  "currentApy": 4.2,
  "earnedToDate": 32.50,
  "idleCapital": 800.00,
  "protocol": "venus",
  "lastRebalance": "2026-02-27T18:00:00Z"
}
```

**Decision logic:**

- If `idleCapital > 500` AND `currentApy > 3%`: deploy idle capital to yield. Load `strategy-yield.md` and execute deploy flow.
- If `currentApy < 2%`: recall deployed capital back to reserve. Load `strategy-yield.md` and execute recall flow.
- Otherwise: no action needed.

## Step 5: Strategy-Specific Checks

Run health checks for each active strategy:

### Delta-Neutral Positions

For each active delta-neutral position:

- Verify both legs are still open and healthy (neither side has resolved or been liquidated)
- Check that the spread between legs hasn't collapsed below 1% (edge gone)
- If either leg is unhealthy, exit the entire position (both legs) immediately

### Thesis Positions

For each active thesis position:

- Re-check the edge: compare current market price to your thesis probability
- If edge has collapsed below 2%, consider reducing position size
- If edge has reversed (market now prices your thesis as unlikely), exit immediately
- Check for new information that might invalidate the thesis

### Yield Deployments

For each yield deployment:

- Verify APY is still above the minimum threshold (3%)
- Check for any protocol risk alerts from Venus
- If APY has dropped below 2% for two consecutive heartbeats, recall capital

## Step 6: Record Heartbeat

Log the heartbeat completion to the gateway.

```bash
curl -s -X POST https://eyebalz.xyz/api/v1/bots/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "strategies": ["delta-neutral", "yield"],
    "portfolioSnapshot": {
      "totalValue": 5200.00,
      "positionCount": 2,
      "idleCapital": 800.00,
      "deployedYield": 1500.00
    },
    "actions": ["stop-loss-check-passed", "arb-scan-0-found", "yield-status-ok"],
    "nextBeatAt": "2026-02-28T12:30:00Z"
  }'
```

This creates a permanent record of what the bot checked and decided during this heartbeat.

## State Management

Persist the following state between heartbeats (save to local storage or file):

| Key | Type | Description |
|-----|------|-------------|
| `last_heartbeat_at` | ISO timestamp | When the last heartbeat completed |
| `active_positions` | array | List of position IDs and their strategies |
| `active_strategies` | array | Currently active strategy names (e.g., `["delta-neutral", "yield"]`) |
| `last_arb_scan` | object | Result summary of last arb scan (count, best edge) |
| `portfolio_snapshot` | object | Total value, P&L, idle capital at last check |
| `consecutive_failures` | integer | Number of consecutive heartbeat failures (reset on success) |
| `yield_apy_history` | array | Last 5 APY readings for trend detection |

Example state file (`~/.flash-gateway/state.json`):

```json
{
  "last_heartbeat_at": "2026-02-28T12:00:00Z",
  "active_positions": ["pos_001", "pos_002"],
  "active_strategies": ["delta-neutral", "yield"],
  "last_arb_scan": {"count": 0, "bestEdge": 2.1},
  "portfolio_snapshot": {"totalValue": 5200, "idleCapital": 800},
  "consecutive_failures": 0,
  "yield_apy_history": [4.5, 4.3, 4.2, 4.1, 4.2]
}
```

## Escalation Triggers

Alert the human operator immediately when:

- Gateway health check fails for 3 consecutive heartbeats
- Any connector is disconnected for 2+ consecutive checks
- Total portfolio drawdown exceeds 20% from peak value
- A stop-loss is triggered (always notify on forced exits)
- A single trade exceeds $500 in value (requires human approval)
- A new strategy is being activated for the first time
- Arb execution fails (potential for one-legged exposure)
- Repeated auth failures (`AUTH_INVALID` errors)
- Kill switch is activated (`FLASH_GATEWAY_KILL_SWITCH=true`)

When escalating, include: the `requestId`, error details, current portfolio snapshot, and recommended action.
