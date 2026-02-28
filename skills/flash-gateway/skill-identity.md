---
name: flash-identity
version: 2.0.0
description: On-chain identity, reputation, system health, and connector status via ERC-8004.
author: flash-team
tags: [identity, reputation, erc-8004, health, connectors]
---

# Flash Skill: Identity and Reputation

Use this skill when the user asks about the agent's on-chain identity,
reputation score, platform health, or connector status.

Trigger phrases: "who is this agent", "reputation score", "ERC-8004 identity",
"system health", "are connectors up", "platform status".

Base URL: `https://eyebalz.xyz/api/v1`

---

## 1. Agent Identity

**`GET /v1/agent/identity`**

Returns the agent's ERC-8004 on-chain identity, reputation metrics, and
Flash-specific statistics.

### Response (200)

```json
{
  "ok": true,
  "enabled": true,
  "identity": {
    "agentId": "0x1234567890abcdef1234567890abcdef12345678",
    "owner": "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    "metadata": {
      "name": "Flash Agent Alpha",
      "version": "2.0.0",
      "chain": "bnb-testnet"
    }
  },
  "reputation": {
    "score": 87,
    "tradeCount": 142,
    "winRate": 0.64,
    "avgPnlPct": 3.2,
    "lastUpdated": "2026-02-28T10:30:00Z"
  },
  "flashStats": {
    "totalVolumeUsd": 28400,
    "activeSince": "2026-01-15T00:00:00Z",
    "platformsUsed": ["predictfun", "probable"]
  }
}
```

### curl

```bash
curl https://eyebalz.xyz/api/v1/agent/identity
```

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| AUTH_INVALID | 401 | Missing or invalid authentication credentials |
| AUTH_INVALID | 403 | Wallet not authorized to query this agent |

---

## 2. System Health

**`GET /v1/system/health`**

Public endpoint. No authentication required. Use this to verify the gateway
is running before making other calls.

### Response (200)

```json
{
  "ok": true,
  "status": "ok",
  "service": "flash-gateway",
  "version": "v1"
}
```

### curl

```bash
curl https://eyebalz.xyz/api/v1/system/health
```

---

## 3. Connector Status

**`GET /v1/system/connectors`**

Returns the operational status of each upstream platform connector.

### Response (200)

```json
{
  "ok": true,
  "connectors": {
    "predictfun": {
      "ok": true,
      "latencyMs": 120
    },
    "probable": {
      "ok": true,
      "latencyMs": 95,
      "proxyDeployed": true
    }
  }
}
```

### curl

```bash
curl https://eyebalz.xyz/api/v1/system/connectors
```

---

## 4. Agent Registration (Non-Custodial)

**`POST /v1/bots/register`**

Registers a bot's wallet address with the gateway. The gateway never holds private keys — bots own their wallets and sign their own orders.

### Request Body

```json
{
  "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "erc8004AgentId": 42
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `walletAddress` | string | Yes | Bot's EOA wallet address (0x-prefixed, 40 hex chars) |
| `erc8004AgentId` | number | No | On-chain ERC-8004 agent token ID. If provided, gateway verifies `ownerOf(agentId) == walletAddress` |

### Response (200)

```json
{
  "ok": true,
  "agentId": "agent_abc123",
  "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
  "erc8004AgentId": 42,
  "onChainVerified": true
}
```

### Self-Service Registration Flow

1. Bot creates its own EOA wallet: `ethers.Wallet.createRandom()`
2. Bot funds wallet with BNB (for gas) and USDC (for trading)
3. (Optional) Bot registers on-chain: `identityRegistry.register(metadataURI)` → gets ERC-721 agentId
4. Bot calls `POST /v1/bots/register` with wallet address and optional agentId
5. Gateway verifies on-chain ownership (if agentId provided) and stores the mapping
6. Bot can now sign orders locally and relay through the gateway

### Trade Execution with Bot-Signed Orders

After registration, bots can sign orders locally and relay them:

```bash
POST /v1/trades/execute
{
  "confirmationToken": "tok_from_quote",
  "clientOrderId": "my-order-001",
  "signature": "0x...",
  "signerAddress": "0xBotAddr"
}
```

The gateway relays the pre-signed order to the platform without needing the bot's private key.

Unregistered bots fall back to the global gateway wallet for backward compatibility.

### Full Bot Setup Flow (including Probable)

For bots that want to trade on Probable Markets, the full onboarding flow is:

1. **Register** — `POST /v1/bots/register` with wallet address and optional ERC-8004 agentId
2. **Setup proxy** — `POST /v1/bots/setup-proxy` to deploy a Gnosis Safe proxy wallet for Probable
3. **Fund proxy** — Transfer USDT to the proxy address returned in step 2
4. **Verify** — `GET /v1/bots/proxy-status` to confirm proxy is deployed, funded, and approvals are OK
5. **Trade** — Call `/v1/trades/quote` and `/v1/trades/execute` with `"platform": "probable"`

Steps 2–4 are only required for Probable. Predict.fun works immediately after registration.

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| AUTH_INVALID | 401 | Missing or invalid authentication credentials |
| VALIDATION_ERROR | 400 | Invalid wallet address format or missing fields |
| OWNERSHIP_MISMATCH | 403 | On-chain `ownerOf(agentId)` does not match provided wallet |

---

## ERC-8004: On-Chain Agent Identity

ERC-8004 is a standard for registering autonomous agents on-chain. Each agent
receives a unique `agentId` tied to an owner wallet. The standard provides:

- **Verifiable identity** — anyone can look up the agent's owner and metadata.
- **Reputation accrual** — trade history and performance are recorded on-chain,
  building a public track record that other protocols and users can trust.
- **Composability** — other smart contracts can gate access or adjust terms
  based on the agent's reputation score.

If `enabled` is `false` in the identity response, the agent has not yet been
registered on-chain. Report this clearly to the user and suggest registration.

---

## When to Use

**From heartbeat loop:**
- Step 1 — call `/v1/system/health` and `/v1/system/connectors` to confirm
  the platform is operational before proceeding with market scans or trades.

**From user request:**
- Any question about the agent's identity, reputation, or platform status.

## Rules

1. If ERC-8004 is disabled, report that explicitly to the user.
2. Do not fabricate reputation metrics; only display what the API returns.
3. Always check `/v1/system/health` before assuming the gateway is available.
