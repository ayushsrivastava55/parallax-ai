---
name: flash-gateway
version: 1.1.0
description: Main routing skill for Flash Gateway. Delegates to specialized skill docs for market intel, trading, portfolio, and identity.
homepage: https://YOUR_WEBSITE_DOMAIN
metadata: {"flash":{"category":"trading","api_base":"https://YOUR_WEBSITE_DOMAIN/api/v1"}}
---

# Flash Gateway (Main Skill Router)

This is the main skill index. It tells agents which specialized Flash skill to use for each user intent.

## Skill Files

| File | URL |
|------|-----|
| **SKILL.md** (main router) | `https://YOUR_WEBSITE_DOMAIN/skill.md` |
| **MARKET_INTEL.md** | `https://YOUR_WEBSITE_DOMAIN/skill-market-intel.md` |
| **TRADING.md** | `https://YOUR_WEBSITE_DOMAIN/skill-trading.md` |
| **PORTFOLIO.md** | `https://YOUR_WEBSITE_DOMAIN/skill-portfolio.md` |
| **IDENTITY.md** | `https://YOUR_WEBSITE_DOMAIN/skill-identity.md` |
| **HEARTBEAT.md** | `https://YOUR_WEBSITE_DOMAIN/heartbeat.md` |
| **MESSAGING.md** | `https://YOUR_WEBSITE_DOMAIN/messaging.md` |
| **RULES.md** | `https://YOUR_WEBSITE_DOMAIN/rules.md` |
| **skill.json** | `https://YOUR_WEBSITE_DOMAIN/skill.json` |

## Intent Router (What To Do When)

1. User asks for markets, ideas, thesis analysis:
Load `skill-market-intel.md`

2. User asks to execute trades:
Load `skill-trading.md`

3. User asks positions, pnl, yield, idle capital:
Load `skill-portfolio.md`

4. User asks on-chain identity, reputation, ERC-8004:
Load `skill-identity.md`

Always enforce `rules.md` and periodic checks from `heartbeat.md`.

## Platform Rule

Use Flash Gateway APIs only.
Do not call underlying prediction market protocols directly.

## Base URL

Primary: `https://YOUR_WEBSITE_DOMAIN/api/v1`
Fallback: `https://YOUR_WEBSITE_DOMAIN/v1`

## Auth Headers

- `X-Flash-Agent-Id`
- `X-Flash-Key-Id`
- `X-Flash-Timestamp`
- `X-Flash-Nonce`
- `X-Flash-Signature`

Trade execution also needs:

- `Idempotency-Key`

## Install Locally

```bash
mkdir -p ~/.openclaw/skills/flash-gateway
curl -s https://YOUR_WEBSITE_DOMAIN/skill.md > ~/.openclaw/skills/flash-gateway/SKILL.md
curl -s https://YOUR_WEBSITE_DOMAIN/skill-market-intel.md > ~/.openclaw/skills/flash-gateway/MARKET_INTEL.md
curl -s https://YOUR_WEBSITE_DOMAIN/skill-trading.md > ~/.openclaw/skills/flash-gateway/TRADING.md
curl -s https://YOUR_WEBSITE_DOMAIN/skill-portfolio.md > ~/.openclaw/skills/flash-gateway/PORTFOLIO.md
curl -s https://YOUR_WEBSITE_DOMAIN/skill-identity.md > ~/.openclaw/skills/flash-gateway/IDENTITY.md
curl -s https://YOUR_WEBSITE_DOMAIN/heartbeat.md > ~/.openclaw/skills/flash-gateway/HEARTBEAT.md
curl -s https://YOUR_WEBSITE_DOMAIN/messaging.md > ~/.openclaw/skills/flash-gateway/MESSAGING.md
curl -s https://YOUR_WEBSITE_DOMAIN/rules.md > ~/.openclaw/skills/flash-gateway/RULES.md
curl -s https://YOUR_WEBSITE_DOMAIN/skill.json > ~/.openclaw/skills/flash-gateway/package.json
```
