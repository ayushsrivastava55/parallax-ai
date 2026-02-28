# Flash Gateway

Autonomous prediction market trading platform on BNB Chain. Aggregates Predict.fun, Probable Markets, and Venus Protocol behind a single API layer for AI agents and bots.

## Architecture

```
bnb-hack/
├── server/           # Express API server (Flash Gateway)
│   ├── src/
│   │   ├── server.ts              # Entry point
│   │   ├── standalone/routes.ts   # All API route handlers
│   │   ├── plugin-flash/          # Platform connectors & services
│   │   ├── gateway/               # Auth, policy, tokens, bot registry
│   │   └── lib/types.ts           # Type definitions
│   └── .env
├── frontend/         # React dashboard + skill docs
│   ├── src/
│   └── public/       # Skill files (skill.md, heartbeat.md, rules.md, etc.)
├── contracts/        # Solidity (ERC-8004 identity + FlashAgent NFA)
│   ├── src/
│   ├── scripts/
│   └── deployments/
├── skills/flash-gateway/  # Local install copy of skill docs
└── ecosystem.config.cjs   # PM2 config
```

## What's Live

- Predict.fun (BSC testnet) — markets, orderbook, order submission
- Probable Markets (BSC mainnet) — markets, proxy wallet, order submission
- Cross-platform arbitrage scanning
- AI-powered thesis analysis (MiniMax M2.5 + web search MCP)
- ERC-8004 on-chain identity (deployed to BSC testnet)
- Venus Protocol yield routing
- HMAC-authenticated API with confirmation tokens + idempotency
- OpenClaw skill docs at `https://eyebalz.xyz/skill.md`

## Quick Start

```bash
# Install
cd server && bun install
cd ../frontend && bun install

# Configure
cp server/.env.example server/.env  # fill in keys

# Run server (serves API + built frontend)
cd server && npx tsx src/server.ts

# Or for frontend dev with hot reload
cd frontend && bun run dev
```

Server runs on port 3000:
- API: `http://localhost:3000/v1/system/health`
- Dashboard: `http://localhost:3000/`
- Skills: `http://localhost:3000/skill.md`

## Deploy (VPS)

```bash
git clone <repo-url> && cd bnb-hack
# Copy .env to server/.env
./setup.sh   # Installs deps, builds frontend, starts PM2
```

## Root Scripts

| Command | What it does |
|---------|-------------|
| `bun run start` | Start Flash Gateway server |
| `bun run dev` | Start in dev mode |
| `bun run build` | Build frontend |
| `bun run compile` | Compile Solidity contracts |
| `bun run deploy:testnet` | Deploy contracts to BSC testnet |
