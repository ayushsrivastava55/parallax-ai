# Flash

BNB Chain prediction-market agent stack for hackathon demos and production-style integrations.

Flash is now structured as a monorepo with three core surfaces:
1. `flash-agent` for agent runtime + gateway APIs.
2. `frontend` for landing UI + public `skill.md` files (OpenClaw/agent discovery).
3. `contracts` for on-chain components (FlashAgent + ERC-8004 registries work).

## Current Product Shape

Flash is moving to an OpenClaw-first model:
1. External agents discover `https://<domain>/skill.md`.
2. They route actions to Flash Gateway (`/v1` or `/api/v1`).
3. Flash orchestrates markets, analysis, quote/execute, positions, arb, yield, identity.

## What Is Live Right Now

1. Unified market listing and analysis across Predict.fun + Opinion.
2. Signed gateway API with HMAC auth, replay protection, confirmation tokens, idempotency.
3. Human-in-the-loop trading flow: `quote -> confirm -> execute`.
4. Durable fill ledger for positions (`.flash/trade-fills.jsonl`) with live price refresh.
5. Public skill artifacts under `frontend/public` (`skill.md`, `skill-*.md`, `rules.md`, `heartbeat.md`).

## Important Execution Notes

1. Predict.fun execution path is wired for real order submission attempts.
2. Opinion execution is intentionally gated by `OPINION_EXECUTION_ENABLED` (default `false`) until full CLOB signing integration is enabled.
3. Positions are ledger-backed from real fills, then enriched with live prices.
4. Analysis is strict (no fake fallback): if research model output is invalid, analysis fails clearly.

## Monorepo Layout

```text
bnb-hack/
├── README.md
├── package.json
├── contracts/
│   ├── src/
│   └── scripts/
├── flash-agent/
│   ├── src/plugin-flash/
│   ├── src/gateway/
│   ├── openapi/flash-gateway.v1.yaml
│   └── .env.example
├── frontend/
│   ├── src/
│   └── public/
│       ├── skill.md
│       ├── skill.json
│       ├── skill-market-intel.md
│       ├── skill-trading.md
│       ├── skill-portfolio.md
│       ├── skill-identity.md
│       ├── rules.md
│       └── heartbeat.md
└── skills/flash-gateway/
```

## Quick Start (Local)

1. Install dependencies.

```bash
cd flash-agent && bun install
cd ../frontend && bun install
cd ../contracts && npm install
```

2. Configure runtime env.

```bash
cp flash-agent/.env.example flash-agent/.env
```

3. Set model provider (MiniMax M2.5 via OpenAI-compatible interface).

```env
MINIMAX_API_KEY=...
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_SMALL_MODEL=MiniMax-M2.5
MINIMAX_LARGE_MODEL=MiniMax-M2.5
```

4. Start agent.

```bash
cd flash-agent
bun x @elizaos/cli start
```

5. Start frontend (second terminal).

```bash
cd frontend
bun run dev
```

## Gateway API Surface

OpenAPI source: `flash-agent/openapi/flash-gateway.v1.yaml`

Main endpoints:
1. `GET /v1/system/health`
2. `GET /v1/system/connectors`
3. `POST /v1/markets/list`
4. `POST /v1/markets/analyze`
5. `POST /v1/trades/quote`
6. `POST /v1/trades/execute` (requires `Idempotency-Key`)
7. `POST /v1/positions/list`
8. `POST /v1/arb/scan`
9. `POST /v1/yield/manage`
10. `GET /v1/agent/identity`

Also available under `/api/v1/*`.

## OpenClaw Skill Hosting

To make any OpenClaw-style agent use Flash:
1. Host frontend public files on your domain.
2. Ensure `https://<domain>/skill.md` is reachable.
3. Replace all `YOUR_WEBSITE_DOMAIN` placeholders in skill files.
4. Point `api_base` to your gateway (`https://<domain>/api/v1` or dedicated API domain).

## Deploy (Recommended)

VPS deployment (single domain) is straightforward:
1. Run gateway as long-lived process (systemd/pm2/docker) on internal port.
2. Serve frontend static build via Nginx.
3. Proxy `/api/*` from Nginx to gateway.
4. Keep HMAC secrets and wallet keys only on server env.

## Root Scripts

From repo root:
1. `bun run start` -> starts Flash agent (`flash-agent`).
2. `bun run dev` -> starts Flash agent dev mode.
3. `bun run build` -> builds `flash-agent`.
4. `bun run compile` -> compiles contracts.
5. `bun run deploy:testnet` -> runs testnet deploy script.

## Security Basics

1. Never commit `.env`.
2. Rotate exposed API keys immediately.
3. Keep `FLASH_KEYS_JSON`, signing secrets, private keys server-side only.
4. Keep human confirmation for all trade executes.

