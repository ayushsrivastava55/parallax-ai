# Flash — AI Prediction Market Trading Agent

> BNB Chain x YZi Labs Hackathon, Bengaluru 2026

Flash is a conversational AI agent that **analyzes, compares, and trades** prediction markets on BNB Chain. Built on ElizaOS with cross-platform arbitrage detection across **Opinion.trade** and **Predict.fun**.

## What Flash Does

| Capability | Description |
|---|---|
| **Vibe Trade** | Say "I think BTC stays above $90k" → Flash finds markets, researches, computes edge, recommends action |
| **URL Analysis** | Paste any Opinion.trade or Predict.fun link → instant deep analysis |
| **Arbitrage Scan** | Cross-platform price comparison, finds risk-free profit opportunities |
| **Human-in-the-Loop** | Never auto-trades — always asks for explicit approval |
| **On-Chain Identity** | BAP-578 NFA with verifiable trade history on BSC testnet |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ElizaOS Framework                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐             │
│  │  Claude   │  │  OpenAI  │  │ Telegram  │             │
│  │ (reason)  │  │ (embed)  │  │   (chat)  │             │
│  └──────────┘  └──────────┘  └───────────┘             │
├─────────────────────────────────────────────────────────┤
│                    Plugin Flash                          │
│                                                         │
│  Actions:                                               │
│  ┌──────────────┐ ┌───────────────┐ ┌──────────────┐   │
│  │ANALYZE_MARKET│ │ SCAN_ARBITRAGE│ │EXECUTE_TRADE │   │
│  │ thesis + URL │ │ cross-platform│ │ human-in-loop│   │
│  └──────┬───────┘ └──────┬────────┘ └──────┬───────┘   │
│         │                │                  │           │
│  ┌──────┴────────────────┴──────────────────┴───────┐   │
│  │              Market Aggregator                    │   │
│  ├──────────────────┬───────────────────────────────┤   │
│  │  Opinion.trade   │      Predict.fun              │   │
│  │  (REST API)      │      (SDK + REST)             │   │
│  └──────────────────┴───────────────────────────────┘   │
│                                                         │
│  Services:                                              │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │ Arb Engine  │ │ URL Parser  │ │Event Matcher │       │
│  │ intra+cross │ │opinion+pf   │ │canonical hash│       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
├─────────────────────────────────────────────────────────┤
│                    BNB Chain (BSC)                        │
│  ┌──────────────┐ ┌──────────────┐                      │
│  │ FlashAgent   │ │  EIP-712     │                      │
│  │ NFA (BAP-578)│ │  Signing     │                      │
│  └──────────────┘ └──────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/your-repo/bnb-hack.git
cd bnb-hack/flash-agent
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env: add OPENAI_API_KEY and/or ANTHROPIC_API_KEY

# 3. Start Flash
bun x @elizaos/cli start

# 4. Open web chat
open http://localhost:3000
```

## Demo Conversations

### Vibe Trade with Deep Research
```
You: "I think BTC will hold above $90k through Thursday. What's the play?"
Flash: [Researches 12+ data sources, finds matching markets, computes edge]
       → Recommend: Buy YES on Predict.fun at $0.58 (+10% edge)
       → Arb Alert: Cross-platform spread = $0.03

You: "Execute option 1"
Flash: → Order placed on Predict.fun testnet ✓
```

### Arbitrage Scan
```
You: "Find me any guaranteed profit"
Flash: [Scans all markets across Opinion + Predict.fun]
       → Opportunity: Buy YES on PF + NO on Opinion = $0.03/share risk-free
```

## Tech Stack

- **Framework:** ElizaOS v1.7.2
- **AI:** Claude (reasoning) + OpenAI (embeddings)
- **Markets:** Opinion.trade REST API + Predict.fun SDK
- **Chain:** BNB Chain (BSC testnet)
- **Contract:** BAP-578 NFA (FlashAgent.sol)
- **Language:** TypeScript + Solidity

## Project Structure

```
bnb-hack/
├── flash-agent/           # ElizaOS agent project
│   └── src/
│       ├── character.ts   # Flash agent personality
│       ├── index.ts       # Entry point
│       └── plugin-flash/  # Core plugin
│           ├── actions/   # ANALYZE, EXECUTE, SCAN, etc.
│           ├── providers/ # Market data, portfolio context
│           ├── services/  # Opinion, Predict.fun, ArbEngine
│           ├── types/     # Shared TypeScript types
│           └── utils/     # URL parser, event matching
├── contracts/             # Smart contracts
│   └── src/
│       └── FlashAgent.sol # BAP-578 NFA implementation
├── skill/
│   └── SKILL.md          # OpenClaw skill definition
└── README.md
```

## Why This Wins

1. **ElizaOS + BNB plugin** — ecosystem-native, judges see alignment
2. **BAP-578 NFA** — on-chain agent identity, BNB's newest standard
3. **Cross-platform aggregation** — Opinion + Predict.fun in one agent
4. **Deep research + statistical edge** — model prob vs market prob with quantified EV
5. **Human-in-the-loop** — responsible AI, never auto-trades
6. **URL intake** — paste any market link for instant analysis
7. **Arbitrage detection** — risk-free profit layer
8. **OpenClaw SKILL.md** — distribution to 150k+ agent users

## License

MIT
