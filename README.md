# Eyebalz Gateway

Autonomous prediction market trading infrastructure on BNB Chain. A unified API layer that lets AI agents discover markets, analyze theses, execute trades, scan for arbitrage, and manage yield — across multiple prediction market protocols — through simple HTTP calls.

**Live at [eyebalz.xyz](https://eyebalz.xyz)**

---

## User Journey

```
                        ┌─────────────────────────────────────────────┐
                        │         AI Agent (OpenClaw / Custom)        │
                        │                                             │
                        │  1. Install skill docs from eyebalz.xyz    │
                        │  2. Read skill.md → learn all endpoints    │
                        │  3. POST /bots/register → get wallet       │
                        │  4. Run heartbeat loop every 30 min        │
                        └─────────────┬───────────────────────────────┘
                                      │ HTTP only
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Eyebalz Gateway (this repo)                        │
│                                                                            │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐ │
│  │   Auth   │  │  Policy  │  │ Arb Scan  │  │  Trade   │  │  Custodial │ │
│  │  HMAC /  │  │  Engine  │  │  Engine   │  │  Ledger  │  │  Wallet    │ │
│  │  DevMode │  │ kill sw  │  │ matching  │  │  JSONL   │  │  Manager   │ │
│  └──────────┘  └──────────┘  └───────────┘  └──────────┘  └────────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Confirm  │  │  Yield   │  │  AI Thesis│  │ ERC-8004 │  │ Bot / Agent│ │
│  │ Tokens   │  │  Router  │  │  Analysis │  │ Identity │  │  Registry  │ │
│  └──────────┘  └──────────┘  └───────────┘  └──────────┘  └────────────┘ │
└────────┬───────────────┬───────────────┬───────────────┬─────────────────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
   ┌───────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────────┐
   │Predict.fun│  │ Probable   │  │   Venus    │  │  ERC-8004 Registries│
   │BSC testnet│  │ BSC mainnet│  │ BSC mainnet│  │  BSC testnet       │
   │ markets   │  │ Polymarket │  │ lending    │  │  Identity/Reputation│
   │ orderbook │  │ fork CLOB  │  │ yield      │  │  FlashAgent NFA    │
   └───────────┘  └────────────┘  └────────────┘  └────────────────────┘
```

### Agent Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Install  │───▶│ Register │───▶│ Setup    │───▶│ Heartbeat│───▶│  Trade   │
│ Skills   │    │ Agent    │    │ Proxy    │    │ Loop     │    │ Execute  │
│          │    │          │    │ (Prob.)  │    │          │    │          │
│ curl     │    │ POST     │    │ POST     │    │ 6-step   │    │ quote →  │
│ skill.md │    │ /register│    │ /setup-  │    │ pipeline │    │ confirm →│
│          │    │ → wallet │    │  proxy   │    │ q30 min  │    │ execute  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

---

## Architecture

```
bnb-hack/
├── server/                     # Express API server (Eyebalz Gateway)
│   ├── src/
│   │   ├── server.ts                    # HTTP entry point
│   │   ├── standalone/routes.ts         # All v1 API route handlers
│   │   ├── standalone/analyze.ts        # AI thesis analysis (MiniMax)
│   │   ├── gateway/
│   │   │   ├── services/auth.ts         # HMAC-SHA256 auth + dev mode
│   │   │   ├── services/policyEngine.ts # Kill switch, rate limits
│   │   │   ├── services/confirmationToken.ts  # Quote → execute tokens
│   │   │   ├── services/botRegistry.ts  # Agent registry + wallet encryption
│   │   │   ├── services/activityTracker.ts    # Activity feed logging
│   │   │   ├── services/connectorHealth.ts    # Platform health checks
│   │   │   ├── schemas/index.ts         # Zod request validation
│   │   │   └── types.ts                 # BotRecord, GatewayResponse types
│   │   ├── plugin-flash/
│   │   │   ├── services/predictfun.ts   # Predict.fun connector
│   │   │   ├── services/probable.ts     # Probable Markets connector
│   │   │   ├── services/opinion.ts      # Opinion.trade connector
│   │   │   ├── services/xmarket.ts      # xMarket connector
│   │   │   ├── services/arbEngine.ts    # Cross-platform arb scanner
│   │   │   ├── services/yieldRouter.ts  # Venus Protocol yield management
│   │   │   ├── services/erc8004.ts      # ERC-8004 identity + reputation
│   │   │   ├── services/positionLedger.ts     # Trade fill tracking
│   │   │   └── types/index.ts           # Market, Order, Position types
│   │   └── lib/types.ts                 # Logger, IAgentRuntime interface
│   ├── .env.example
│   └── package.json
├── frontend/                   # React dashboard + skill docs
│   ├── src/
│   │   ├── main.tsx                     # Router: Dashboard, Agents, Strategies, etc.
│   │   ├── pages/                       # Dashboard, Agents, AgentDetail, Chat, etc.
│   │   ├── components/
│   │   │   ├── layout/                  # Shell, Sidebar, TopBar
│   │   │   ├── dashboard/              # HeroStats, AgentGrid, ActivityFeed
│   │   │   ├── agents/                 # AgentCard, AgentProfile, TradeHistory
│   │   │   ├── strategies/             # StrategyCard
│   │   │   ├── skills/                 # SkillInstaller, SkillViewer
│   │   │   ├── cards/                  # MarketTable, ArbScan, TradeConfirm, etc.
│   │   │   └── shared/                 # StatCard, EmptyState
│   │   ├── hooks/                       # useAgents, useHealth, usePolling, useChat
│   │   └── lib/                         # api.ts, constants.ts, formatters.ts
│   └── public/                          # Skill docs served at eyebalz.xyz/*.md
├── contracts/                  # Solidity smart contracts
│   ├── src/
│   │   ├── IdentityRegistry.sol         # ERC-8004 agent identity (ERC-721)
│   │   └── FlashAgent.sol               # Non-Fungible Agent (NFA) token
│   ├── scripts/                         # Hardhat deployment scripts
│   └── deployments/bscTestnet.json      # Deployed contract addresses
├── skills/flash-gateway/       # Local install copy of skill docs
├── ecosystem.config.cjs        # PM2 production config
├── docker-compose.yml          # Docker deployment
└── setup.sh                    # One-command VPS setup
```

---

## Features

### Custodial Wallet Management
Agents call `POST /v1/bots/register` and the gateway generates a wallet, registers on ERC-8004, and mints a FlashAgent NFA token. Agents never need private keys.

### Cross-Platform Arbitrage
The arb engine matches identical markets across Predict.fun and Probable Markets using canonical question hashing, then identifies mispricings where buying YES on one platform + NO on another costs less than $1.00.

### AI Thesis Analysis
Agents send a natural language thesis ("Will BTC exceed $100k by March?") and the gateway uses MiniMax M2.5 with web search to build a probability model, compare against market prices, and calculate edge.

### Two-Step Trade Execution
Every trade follows: `quote` → `confirm` → `execute` with single-use confirmation tokens (90s TTL), idempotency keys, and policy engine checks (kill switch, max order size, slippage limits).

### Yield Optimization
Idle capital auto-deploys to Venus Protocol on BSC mainnet for lending APY. The yield router decides when to deploy (idle > $500 + APY > 3%) and when to recall (APY < 2% or trade demand).

### On-Chain Identity (ERC-8004)
Each agent gets an ERC-721 identity token with on-chain reputation accrual. Trade performance is recorded as reputation signals, building a verifiable track record.

### Skill-Based Agent Interface
13 structured markdown docs at `eyebalz.xyz/*.md` teach any OpenClaw-compatible agent how to use the entire platform autonomously — including a 6-step heartbeat loop, strategy playbooks, and intent-to-endpoint mapping.

---

## Deployed Contracts (BSC Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| IdentityRegistry | `0x614BC11d3fB661c56685c8a4F880EBFeB20dd482` | ERC-8004 agent identity (ERC-721) |
| ReputationRegistry | `0xFc78A21359a7AAD7a5EDA56c52e2B1004241A01a` | On-chain reputation signals |
| ValidationRegistry | `0x18e32D6f091e354b5dAbE7F765d20EAf5cB08350` | Third-party validation |
| FlashAgent (NFA) | `0x16C9125cC4298C9389cd6d59df067816e2586204` | Non-Fungible Agent token |

---

## API Endpoints

Base URL: `https://eyebalz.xyz/api/v1`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/system/health` | No | Gateway liveness |
| `GET` | `/system/connectors` | Yes | Platform connector status |
| `POST` | `/bots/register` | Yes | Register agent (generates wallet + ERC-8004 + NFA) |
| `POST` | `/bots/setup-proxy` | Yes | Deploy Gnosis Safe for Probable Markets |
| `GET` | `/bots/proxy-status` | Yes | Proxy wallet health check |
| `POST` | `/bots/heartbeat` | Yes | Record heartbeat completion |
| `POST` | `/markets/list` | Yes | List markets across platforms |
| `POST` | `/markets/analyze` | Yes | AI thesis analysis with web research |
| `POST` | `/trades/quote` | Yes | Get trade quote + confirmation token |
| `POST` | `/trades/execute` | Yes | Execute trade (requires Idempotency-Key) |
| `POST` | `/positions/list` | Yes | Portfolio positions and P&L |
| `POST` | `/arb/scan` | Yes | Cross-platform arbitrage scan |
| `POST` | `/yield/manage` | Yes | Venus yield: status / deploy / recall |
| `GET` | `/agent/identity` | Yes | ERC-8004 identity and reputation |

Full API documentation: [eyebalz.xyz/skill.md](https://eyebalz.xyz/skill.md)

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.1+) or Node.js 20+
- BNB private key (for on-chain operations)

### Install & Run

```bash
# Clone
git clone https://github.com/user/bnb-hack && cd bnb-hack

# Install dependencies
cd server && bun install && cd ..
cd frontend && bun install && cd ..

# Configure
cp server/.env.example server/.env
# Edit server/.env — set BNB_PRIVATE_KEY and MINIMAX_API_KEY at minimum

# Build frontend
cd frontend && bun run build && cd ..

# Start server (serves API + built frontend on port 3000)
cd server && npx tsx src/server.ts
```

Dashboard: `http://localhost:3000`
API: `http://localhost:3000/v1/system/health`
Skill docs: `http://localhost:3000/skill.md`

---

## Deployment

### VPS (PM2)

```bash
git clone https://github.com/user/bnb-hack && cd bnb-hack
cp server/.env.example server/.env
# Fill in keys: BNB_PRIVATE_KEY, MINIMAX_API_KEY, SERPER_API_KEY, etc.
./setup.sh   # Installs deps, builds frontend, starts PM2
```

PM2 manages the process with auto-restart, memory limits (512MB), and log rotation.

### Docker

```bash
docker compose up -d
```

The Docker setup uses the same environment from `server/.env`.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BNB_PRIVATE_KEY` | Yes | Gateway operator wallet (pays gas for agent registration) |
| `MINIMAX_API_KEY` | Yes | MiniMax M2.5 for thesis analysis |
| `SERPER_API_KEY` | Recommended | Web search for thesis research |
| `JINA_API_KEY` | Recommended | URL content extraction for research |
| `EYEBALZ_GATEWAY_ALLOW_UNSIGNED` | Dev only | Set `true` to skip HMAC auth |
| `ERC8004_ENABLED` | Optional | Enable on-chain identity (`true`/`false`) |
| `ERC8004_IDENTITY_REGISTRY` | If ERC8004 | Contract address |
| `FLASH_AGENT_CONTRACT` | If ERC8004 | FlashAgent NFA contract address |
| `EYEBALZ_GATEWAY_KILL_SWITCH` | Optional | Emergency halt all execution |
| `EYEBALZ_GATEWAY_MAX_ORDER_USD` | Optional | Max single order (default: 1000) |
| `XMARKET_API_KEY` | Optional | xMarket connector |

---

## Open-Source Dependencies

### Server

| Package | Version | Purpose |
|---------|---------|---------|
| [Express](https://expressjs.com) | 5.x | HTTP API framework |
| [ethers](https://docs.ethers.org) | 6.x | EVM wallet, contract interaction, EIP-712 signing |
| [Zod](https://zod.dev) | 4.x | Request schema validation |
| [@predictdotfun/sdk](https://www.npmjs.com/package/@predictdotfun/sdk) | 1.x | Predict.fun market data + order submission |
| [dotenv](https://www.npmjs.com/package/dotenv) | 17.x | Environment configuration |
| [cors](https://www.npmjs.com/package/cors) | 2.x | Cross-origin resource sharing |
| [@openai/agents](https://www.npmjs.com/package/@openai/agents) | 0.5.x | MiniMax M2.5 OpenAI-compatible client |

### Frontend

| Package | Version | Purpose |
|---------|---------|---------|
| [React](https://react.dev) | 19.x | UI framework |
| [React Router](https://reactrouter.com) | 7.x | Client-side routing |
| [Vite](https://vite.dev) | 7.x | Build tool + dev server |
| [GSAP](https://gsap.com) | 3.x | Card reveal animations |
| [socket.io-client](https://socket.io) | 4.x | Real-time chat streaming |

### Contracts

| Package | Version | Purpose |
|---------|---------|---------|
| [OpenZeppelin](https://openzeppelin.com/contracts) | 5.x | ERC-721, access control, security primitives |
| [Hardhat](https://hardhat.org) | 2.x | Solidity compilation + deployment |

### Infrastructure

| Tool | Purpose |
|------|---------|
| [PM2](https://pm2.io) | Process management, auto-restart, log rotation |
| [Caddy](https://caddyserver.com) | Reverse proxy, automatic HTTPS |
| [Neon](https://neon.tech) | Serverless PostgreSQL (optional) |

---

## How It Works: Agent Perspective

An AI agent discovers Eyebalz by reading the skill docs:

```bash
# 1. Install skill docs
mkdir -p ~/.openclaw/skills/eyebalz-gateway
curl -sL https://eyebalz.xyz/skill.md > ~/.openclaw/skills/eyebalz-gateway/SKILL.md

# 2. Register (gateway generates wallet + on-chain identity)
curl -X POST https://eyebalz.xyz/api/v1/bots/register \
  -H "Content-Type: application/json" \
  -d '{"persona": "my-agent"}'
# → { walletAddress, erc8004AgentId, nfaTokenId }

# 3. Check health
curl https://eyebalz.xyz/api/v1/system/health
# → { status: "ok" }

# 4. List markets
curl -X POST https://eyebalz.xyz/api/v1/markets/list \
  -H "Content-Type: application/json" \
  -d '{"platforms": ["predictfun", "probable"], "limit": 10}'

# 5. Analyze a thesis
curl -X POST https://eyebalz.xyz/api/v1/markets/analyze \
  -H "Content-Type: application/json" \
  -d '{"query": "Will BTC exceed 100k by March 2026?"}'

# 6. Scan for arb
curl -X POST https://eyebalz.xyz/api/v1/arb/scan \
  -H "Content-Type: application/json" \
  -d '{"maxCapitalUsd": 500}'

# 7. Trade (two-step)
# Step A: Quote
curl -X POST https://eyebalz.xyz/api/v1/trades/quote \
  -H "Content-Type: application/json" \
  -d '{"marketId": "0x...", "platform": "predictfun", "side": "YES", "size": 10, "sizeType": "shares"}'
# → { confirmationToken, price, estimatedCostUsd }

# Step B: Execute
curl -X POST https://eyebalz.xyz/api/v1/trades/execute \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"confirmationToken": "ct_...", "clientOrderId": "order-001"}'

# 8. Record heartbeat
curl -X POST https://eyebalz.xyz/api/v1/bots/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"strategies": ["delta-neutral", "yield"]}'
```

The agent runs this loop autonomously every 30 minutes. Full heartbeat spec: [eyebalz.xyz/heartbeat.md](https://eyebalz.xyz/heartbeat.md)

---

## License

MIT

---

Built for the BNB Chain x YZi Labs Hackathon 2026.
