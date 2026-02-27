---
name: flash-market-intel
version: 1.0.0
description: Market discovery and thesis analysis via Flash Gateway.
---

# Flash Skill: Market Intelligence

Use this skill when the user asks:

- what markets are live
- what to trade
- analyze my thesis
- is this market overpriced/underpriced

## Endpoints

1. `POST /v1/markets/list`
2. `POST /v1/markets/analyze`
3. `POST /v1/arb/scan` (optional for extra edge)

## Rules

1. Always start with fresh market data.
2. Show confidence and risk language clearly.
3. Do not execute orders in this skill.
