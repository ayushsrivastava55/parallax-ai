# Eyebalz Gateway Messaging Contract

## Intent Mapping

### Market Intelligence

- "What markets are active?" -> `POST /v1/markets/list`
- "Analyze this thesis" -> `POST /v1/markets/analyze`
- "Find arbitrage" -> `POST /v1/arb/scan`
- "What's trending?" -> `POST /v1/markets/list` with `sortBy: "volume"`

### Portfolio and Positions

- "Show positions" -> `POST /v1/positions/list`
- "Show my P&L" -> `POST /v1/positions/list` with `includeVirtual: true`
- "Show identity/reputation" -> `GET /v1/agent/identity`

### Strategy Intents

- "Run heartbeat" -> Execute the full `heartbeat.md` 6-step flow
- "Run strategy" -> Load `strategy-playbook.md` and follow the decision tree
- "Arb scan" / "Find arb" -> Load `strategy-delta-neutral.md` and execute arb scan + trade flow
- "Deploy yield" / "Put capital to work" -> Load `strategy-yield.md` and execute deploy flow
- "Recall capital" / "Pull from Venus" -> Load `strategy-yield.md` and execute recall flow
- "Form thesis on X" / "I think X will happen" -> Load `strategy-thesis.md` and build a thesis trade
- "Autonomous mode on" / "Go autonomous" -> Enable the heartbeat loop (schedule heartbeat.md every 30 minutes)
- "Autonomous mode off" / "Stop autonomous" -> Disable the heartbeat loop (cancel scheduled heartbeats)

### Agent Registration

- "Register" / "Set up my wallet" / "Get started" -> `POST /v1/bots/register` (gateway generates wallet, ERC-8004 identity, NFA)
- "What's my wallet?" / "My agent ID" -> `POST /v1/bots/register` (idempotent, returns existing wallet)

### Probable Markets

- "Trade on probable" -> `POST /v1/trades/quote` with `platform: "probable"`, then two-step flow
- "Setup probable wallet" / "Deploy proxy" -> `POST /v1/bots/setup-proxy` (gateway deploys using agent's wallet)
- "Proxy status" / "Check proxy" -> `GET /v1/bots/proxy-status`

### Execution

- "Buy" / "Sell" / "Execute" -> Two-step flow via `skill-trading.md`

## Execution Mapping

All trade execution must follow the two-step flow:

1. `POST /v1/trades/quote` -- get a quote with confirmation token
2. Present the quote details to the user (or validate against strategy rules if autonomous)
3. `POST /v1/trades/execute` -- execute with confirmation token and idempotency key

## Required Execution Prompting

Before `trades/execute`, always present or validate:

- Market name + platform
- Side (YES/NO) + size (number of contracts)
- Quoted price + total cost
- Confirmation token and its expiry time
- Strategy context (which strategy triggered this trade and why)

### For human-attended mode:

Display all details and wait for explicit user approval. Reject execution if the user did not clearly approve.

### For autonomous mode:

Validate that:

1. The trade was triggered by a pre-authorized strategy
2. The trade size is within configured limits (max order USD, max slippage)
3. The trade does not violate any risk rules from `rules.md`
4. Log the full decision context (strategy, edge calculation, reasoning)

If any validation fails, escalate to the human operator instead of executing.
