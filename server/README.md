# Flash Gateway Server

Standalone Express server for Flash Gateway — prediction market trading API on BNB Chain.

## What It Does

1. Market aggregation (Predict.fun + Probable Markets).
2. AI-powered thesis analysis with web search (MiniMax M2.5).
3. Cross-platform arbitrage scanning.
4. Human-in-the-loop trade quote/execute flow.
5. Ledger-backed positions and PnL tracking.
6. ERC-8004 on-chain agent identity and reputation.
7. Venus Protocol yield management.

## Run

```bash
bun install
cp .env.example .env   # fill in your keys
npx tsx src/server.ts
```

Server starts on port 3000:
- API: `http://localhost:3000/v1/system/health`
- Dashboard: `http://localhost:3000/`
- Skills: `http://localhost:3000/skill.md`

## Key Paths

- `src/server.ts` — Express server entry point
- `src/standalone/routes.ts` — All API route handlers
- `src/plugin-flash/services/*` — Platform connectors (Predict.fun, Probable, etc.)
- `src/gateway/services/*` — Auth, policy, confirmation tokens, bot registry
- `src/lib/types.ts` — Type definitions and logger
