---
name: flash-portfolio
version: 1.0.0
description: Position, PnL, and yield management through Flash Gateway.
---

# Flash Skill: Portfolio and Yield

Use this skill when the user asks:

- show positions
- PnL / holdings
- manage idle capital / yield

## Endpoints

1. `POST /v1/positions/list`
2. `POST /v1/yield/manage`

## Rules

1. Prefer reporting first, actions second.
2. Keep totals and per-position metrics consistent.
