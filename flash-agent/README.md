# flash-agent

Flash runtime package (ElizaOS) with:
1. `plugin-flash` actions/services.
2. Flash Gateway HTTP routes (`/v1` and `/api/v1`).
3. OpenAPI contract at `openapi/flash-gateway.v1.yaml`.

## Core Responsibilities

1. Market aggregation (Predict.fun + Opinion).
2. Thesis analysis and recommendation generation.
3. Human-in-the-loop trade quote/execute flow.
4. Ledger-backed positions and PnL refresh.
5. Optional ERC-8004 identity/reputation hooks.

## Local Setup

```bash
bun install
cp .env.example .env
```

Set at minimum:

```env
MINIMAX_API_KEY=...
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_SMALL_MODEL=MiniMax-M2.5
MINIMAX_LARGE_MODEL=MiniMax-M2.5
```

Optional trading keys/settings:

```env
BNB_PRIVATE_KEY=
BNB_PUBLIC_KEY=
OPINION_ENABLED=false
OPINION_API_KEY=
OPINION_EXECUTION_ENABLED=false
FLASH_KEYS_JSON={"demo":{"secret":"replace-me","enabled":true}}
```

## Run

```bash
bun x @elizaos/cli start
```

## Key Paths

1. `src/plugin-flash/actions/*`
2. `src/plugin-flash/services/*`
3. `src/gateway/routes/v1.ts`
4. `src/gateway/services/*`
5. `openapi/flash-gateway.v1.yaml`

## API Notes

1. HMAC headers are required for secured endpoints.
2. Trade execution requires `Idempotency-Key` and confirmation token from quote.
3. Positions are reconstructed from fill ledger and then live-priced.

For full monorepo docs and deploy topology, see root README: `../README.md`.
