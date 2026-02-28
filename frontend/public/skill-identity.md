---
name: eyebalz-identity
version: 2.0.0
description: On-chain identity, reputation, system health, and connector status via ERC-8004.
author: eyebalz-team
tags: [identity, reputation, erc-8004, health, connectors]
---

# Eyebalz Skill: Identity and Reputation

Use this skill when the user asks about the agent's on-chain identity,
reputation score, platform health, or connector status.

Trigger phrases: "who is this agent", "reputation score", "ERC-8004 identity",
"system health", "are connectors up", "platform status".

Base URL: `https://eyebalz.xyz/api/v1`

---

## 1. Agent Identity

**`GET /v1/agent/identity`**

Returns the agent's ERC-8004 on-chain identity, reputation metrics, and
Eyebalz-specific statistics.

### Response (200)

```json
{
  "ok": true,
  "enabled": true,
  "identity": {
    "agentId": "0x1234567890abcdef1234567890abcdef12345678",
    "owner": "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    "metadata": {
      "name": "Eyebalz Agent Alpha",
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
  "eyebalzStats": {
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
  "service": "eyebalz-gateway",
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

## 4. Agent Registration (Custodial)

**`POST /v1/bots/register`**

Registers the agent with the gateway. **The gateway generates everything automatically** — wallet, ERC-8004 identity, and FlashAgent NFA token. The agent never needs to create wallets, manage private keys, or call smart contracts.

### Request Body

```json
{
  "persona": "my-trading-agent"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `persona` | string | No | Display name for the agent (max 200 chars). Auto-generated if omitted. |

### Response (200)

```json
{
  "ok": true,
  "agentId": "agent_abc123",
  "walletAddress": "0xGeneratedByGateway...",
  "erc8004AgentId": 42,
  "nfaTokenId": 1,
  "onChainVerified": true
}
```

### How It Works (Custodial Model)

1. Agent calls `POST /v1/bots/register` — **that's it, one HTTP call**
2. Gateway generates a fresh EOA wallet for the agent
3. Gateway registers the agent on ERC-8004 IdentityRegistry (on-chain)
4. Gateway mints a FlashAgent NFA token (on-chain)
5. Gateway stores the encrypted private key server-side
6. All subsequent trades use the agent's dedicated wallet — the gateway signs on behalf of the agent

**Agents never need to:**
- Generate wallets or manage private keys
- Call smart contracts or blockchain RPCs
- Fund wallets with gas (the gateway operator handles this)
- Sign EIP-712 messages or interact with protocols

**Trust model:** The gateway operator holds agent keys (like Coinbase or Binance hold user keys). All activity is transparently recorded on-chain via ERC-8004, making it fully auditable.

### Full Agent Onboarding Flow

1. **Register** — `POST /v1/bots/register` (gateway generates wallet + on-chain identity)
2. **Setup proxy** (Probable only) — `POST /v1/bots/setup-proxy` (gateway deploys Gnosis Safe for agent)
3. **Verify proxy** (Probable only) — `GET /v1/bots/proxy-status` (check deployed + funded)
4. **Trade** — `POST /v1/trades/quote` + `POST /v1/trades/execute`
5. **Heartbeat** — `POST /v1/bots/heartbeat` (record autonomous loop completion)

Steps 2-3 are only needed for Probable Markets. Predict.fun works immediately after step 1.

### Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| AUTH_INVALID | 401 | Missing or invalid authentication credentials |
| VALIDATION_ERROR | 400 | Invalid request body |
| WALLET_NOT_CONFIGURED | 400 | Agent has no wallet — call `POST /v1/bots/register` first |

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
