# Flash Gateway Rules

## Mandatory Rules

1. Do not call protocol APIs directly (Predict.fun, Probable, Venus, chain contracts, blockchain RPCs).
2. Use Flash Gateway HTTP endpoints only (`https://eyebalz.xyz/api/v1`).
3. **Never use, generate, or request private keys.** The gateway manages all wallets and signing. If you see `WALLET_NOT_CONFIGURED`, call `POST /v1/bots/register` — do NOT set `BNB_PRIVATE_KEY` or create wallets locally.
4. **Register before trading.** Call `POST /v1/bots/register` before any other operation. This is idempotent.
5. Do not execute trades without a valid `confirmationToken`.
6. Always send `Idempotency-Key` on `trades/execute`.
7. Never leak API secrets or signing secrets.
8. Always enforce stop-loss limits (close position if value drops 30% from entry).
9. Verify proxy wallet is deployed (`GET /v1/bots/proxy-status`) before trading on Probable. If not deployed, call `POST /v1/bots/setup-proxy`.

## Autonomous Mode Rules

Bots MAY execute trades without per-trade human approval IF all of the following conditions are met:

1. **Pre-authorized strategy.** The user has explicitly activated the strategy (delta-neutral, thesis, or yield). Bots must never autonomously activate a new strategy -- that requires human approval.

2. **Trade within configured limits.** Each autonomous trade must satisfy:
   - Max single order: $500 USD
   - Max slippage: 3% from quoted price
   - Max portfolio exposure per trade: 5% of total portfolio value

3. **Logged with strategy context.** Every autonomous trade MUST be logged with:
   - Which strategy triggered it (delta-neutral, thesis, yield)
   - Why the trade was triggered (edge calculation, arb spread, APY change)
   - Full quote details (market, side, size, price, cost)
   - The `requestId` and `clientOrderId`

4. **Within rate limits:**
   - Max 10 trades per hour per bot
   - Max $5,000 daily trading volume per bot
   - Max 60 API requests per minute

5. **Within risk limits:**
   - Max 5% of total portfolio per single trade
   - Max 30% total exposure across all active positions
   - Max 15% correlated exposure (positions on related outcomes)
   - Reserve floor: always keep 20% of portfolio in cash/stables

### Emergency Stop

Setting `FLASH_GATEWAY_KILL_SWITCH=true` halts ALL execution immediately. When the kill switch is active:

- No new trades are placed
- No yield deployments or recalls are executed
- The heartbeat loop continues in read-only mode (health checks and portfolio monitoring only)
- All pending confirmation tokens are invalidated

The kill switch can be activated by:
- The human operator at any time
- The bot itself if it detects anomalous conditions (3+ consecutive failures, unexpected portfolio drawdown)

## Human Escalation Required

The following situations ALWAYS require human approval, even in autonomous mode:

- Any single trade exceeding $500 USD
- Activation of a new strategy for the first time
- Emergency situations (gateway down, connector failures, anomalous market conditions)
- Total portfolio drawdown exceeding 20% from peak
- Arb execution where one leg failed (risk of unhedged exposure)
- Any operation that would breach the 30% total exposure limit

## Error Handling Rules

- `AUTH_INVALID` -> stop and rotate credentials check
- `AUTH_REPLAY_DETECTED` -> regenerate timestamp/nonce and retry once
- `CONFIRMATION_TOKEN_EXPIRED` -> re-quote and reconfirm (human mode) or re-quote and re-validate (autonomous mode)
- `CONNECTOR_UNAVAILABLE` -> backoff, switch to read-only mode
- `EXECUTION_REJECTED` -> report exact reason to user; if autonomous, log and escalate
- `RATE_LIMITED` -> exponential backoff starting at 5 seconds
- `KILL_SWITCH_ACTIVE` -> halt all execution, continue monitoring only

## Audit Rules

Log and preserve for each execution attempt:

- `requestId` (from gateway response)
- `clientOrderId` (your order identifier)
- `Idempotency-Key` (the key you sent)
- Final order status or error code
- Strategy context (which strategy, edge calculation)
- Timestamp and bot state snapshot

All audit logs must be retained for at least 30 days. In autonomous mode, audit logs are the primary record of bot decision-making and must be complete enough to reconstruct the reasoning for every trade.
