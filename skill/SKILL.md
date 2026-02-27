---
name: flash-prediction-trader
version: 1.0.0
description: AI-powered prediction market trading agent for BNB Chain
author: Flash Team
platforms:
  - bnb-chain
  - bsc-testnet
capabilities:
  - market-analysis
  - arbitrage-detection
  - trade-execution
  - portfolio-tracking
dependencies:
  - ethers@^6.0.0
env:
  - ANTHROPIC_API_KEY
  - BNB_PRIVATE_KEY
  - OPINION_API_KEY (optional)
tags:
  - prediction-markets
  - trading
  - arbitrage
  - bnb-chain
  - defi
---

# Flash — Prediction Market Trading Agent

Flash is an AI agent that analyzes and trades BNB Chain prediction markets across Opinion.trade and Predict.fun.

## Capabilities

### 1. Market Analysis (ANALYZE_MARKET)

Give Flash a thesis or a market URL, and it will:

- **Research** relevant news, data, and sentiment via web search
- **Compute** model probability vs market implied probability
- **Quantify** edge percentage and expected value per dollar risked
- **Compare** prices across Opinion.trade and Predict.fun
- **Detect** arbitrage opportunities (intra-platform and cross-platform)
- **Recommend** Buy YES / Buy NO / Avoid with confidence level

**Example prompts:**
- "I think BTC will hold above $90k through Thursday"
- "Analyze https://predict.fun/event/btc-90k"
- "Should I bet on a Fed rate cut in March?"

### 2. Arbitrage Detection (SCAN_ARBITRAGE)

Flash scans for risk-free profit opportunities:

- **Intra-platform:** YES ask + NO ask < $0.995 on a single platform
- **Cross-platform:** Same event priced differently on Opinion vs Predict.fun

**Example prompts:**
- "Find me any guaranteed profit right now"
- "Scan for arbitrage"

### 3. Trade Execution (EXECUTE_TRADE)

Flash executes trades with human-in-the-loop safety:

- **Never auto-trades** — always waits for explicit approval
- User can modify order size or reject before execution
- EIP-712 signed orders on BNB Chain
- Stores analysis snapshot with each trade for audit trail

**Example prompts:**
- "Execute option 1"
- "Buy 200 YES shares"

### 4. Portfolio Tracking (GET_POSITIONS)

View positions across all connected platforms:

- Open positions with current P&L
- Total portfolio value
- Per-position entry price vs current price

**Example prompts:**
- "Show me my positions"
- "What's my P&L?"

## Setup

1. Set required environment variables (see `env` above)
2. Fund your BSC testnet wallet via [faucet](https://www.bnbchain.org/en/testnet-faucet)
3. Start Flash and chat naturally about prediction markets

## Architecture

Flash is built as an ElizaOS plugin with:
- Market connectors for Opinion.trade REST API and Predict.fun SDK
- Canonical event hashing for cross-platform matching
- Statistical evaluation engine with Claude-powered research
- BAP-578 NFA on-chain identity on BSC testnet
