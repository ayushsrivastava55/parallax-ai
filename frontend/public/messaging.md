# Flash Gateway Messaging Contract

## Intent Mapping

- "What markets are active?" -> `POST /v1/markets/list`
- "Analyze this thesis" -> `POST /v1/markets/analyze`
- "Find arbitrage" -> `POST /v1/arb/scan`
- "Show positions" -> `POST /v1/positions/list`
- "Show identity/reputation" -> `GET /v1/agent/identity`

## Execution Mapping

- "Buy/execute" must trigger a two-step flow:
  1. `POST /v1/trades/quote`
  2. Ask explicit human confirmation
  3. `POST /v1/trades/execute`

## Required Execution Prompting

Before `trades/execute`, always present:

- market + platform
- side + size
- quoted price + cost
- confirmation token expiry

Reject execution if user did not clearly approve.
