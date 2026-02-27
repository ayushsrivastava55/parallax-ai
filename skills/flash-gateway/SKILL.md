---
name: flash-gateway
version: 1.0.0
description: Use Flash Gateway APIs for prediction market analysis, quoting, execution, positions, arbitrage, yield, and on-chain identity. Never call underlying prediction market protocols directly.
---

# Flash Gateway Skill

## Purpose

This skill routes all prediction-market workflows through Flash Gateway.

External agents must call Flash endpoints only:

- `POST /v1/markets/list`
- `POST /v1/markets/analyze`
- `POST /v1/trades/quote`
- `POST /v1/trades/execute`
- `POST /v1/positions/list`
- `POST /v1/arb/scan`
- `POST /v1/yield/manage`
- `GET /v1/agent/identity`

Do not call Predict.fun, Opinion, or chain contracts directly.

## Safety Rules

1. Never call `trades/execute` without explicit human confirmation.
2. Always call `trades/quote` first and use returned `confirmationToken`.
3. Treat quote token as short-lived and one-time use.
4. Require and preserve `Idempotency-Key` for execution calls.
5. If execution fails due token expiry, re-quote and ask again.

## Auth Contract

Every secured request must include headers:

- `X-Flash-Agent-Id`
- `X-Flash-Key-Id`
- `X-Flash-Timestamp`
- `X-Flash-Nonce`
- `X-Flash-Signature`

Signature canonical form:

`METHOD\nPATH\nSHA256(body)\nX-Flash-Agent-Id\nX-Flash-Timestamp\nX-Flash-Nonce`

Use HMAC-SHA256 with key secret.

## Workflow Patterns

### Read-Only Discovery

1. `markets/list` for available opportunities.
2. `markets/analyze` for thesis evaluation.
3. `arb/scan` for risk-free opportunities.
4. `positions/list` for current holdings and PnL.

### Trade Execution

1. User intent + parameters.
2. Call `trades/quote`.
3. Show quote and ask explicit approval.
4. On approval, call `trades/execute` with `confirmationToken` + `clientOrderId` + `Idempotency-Key`.
5. Call `positions/list` to confirm reflected state.

### Identity and Trust

Call `agent/identity` to retrieve ERC-8004 identity, reputation, and Flash stats.

## Script Helpers

Use bundled scripts in `scripts/`:

- `list_markets.sh`
- `analyze_market.sh`
- `trade_quote.sh`
- `trade_execute.sh`
- `positions_list.sh`
- `agent_identity.sh`

All scripts share signed request logic via `scripts/common.sh`.

## References

- `references/api.md` for payloads and curl examples.
- `references/policies.md` for execution and failure handling policies.
