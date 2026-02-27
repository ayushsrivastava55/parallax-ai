---
name: flash-identity
version: 1.0.0
description: On-chain identity, reputation, and validation status via ERC-8004 endpoints.
---

# Flash Skill: Identity and Reputation

Use this skill when the user asks:

- who is this agent on-chain
- reputation score
- validation status
- ERC-8004 identity

## Endpoint

- `GET /v1/agent/identity`

## Rules

1. If ERC-8004 is disabled, report that explicitly.
2. Do not fabricate reputation metrics.
