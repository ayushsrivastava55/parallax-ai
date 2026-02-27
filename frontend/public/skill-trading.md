---
name: flash-trading
version: 1.0.0
description: Quote and execute prediction market trades through Flash Gateway.
---

# Flash Skill: Trading Execution

Use this skill when the user asks:

- buy / sell / execute
- place order
- confirm trade

## Mandatory Flow

1. `POST /v1/trades/quote`
2. Show quote details to user and request explicit confirmation
3. `POST /v1/trades/execute` with `confirmationToken`

## Hard Constraints

1. Never execute without user confirmation.
2. Never execute without `Idempotency-Key`.
3. If token expired, re-quote then ask again.
