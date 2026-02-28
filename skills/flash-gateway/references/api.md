# Eyebalz Gateway API Reference

Base URL:

`$EYEBALZ_GATEWAY_BASE_URL` (example: `http://localhost:3001`)

## Required Environment Variables

- `EYEBALZ_GATEWAY_BASE_URL`
- `EYEBALZ_AGENT_ID`
- `EYEBALZ_KEY_ID`
- `EYEBALZ_KEY_SECRET`

## Signed Request Example

```bash
source ./scripts/common.sh
signed_post '/v1/markets/list' '{"status":"active","limit":10}'
```

## Endpoints

### `POST /v1/markets/list`

Request:

```json
{
  "status": "active",
  "platforms": ["predictfun", "probable"],
  "limit": 20
}
```

### `POST /v1/markets/analyze`

Request:

```json
{
  "query": "I think BTC will stay above 95000 this week"
}
```

### `POST /v1/trades/quote`

Request:

```json
{
  "marketId": "123",
  "platform": "predictfun",
  "side": "YES",
  "size": 50,
  "sizeType": "usd",
  "maxSlippageBps": 100
}
```

Response includes `confirmationToken` and `expiresAt`.

### `POST /v1/trades/execute`

Headers:

- `Idempotency-Key: <unique-id>`

Request:

```json
{
  "confirmationToken": "<token-from-quote>",
  "clientOrderId": "trade-001"
}
```

### `POST /v1/positions/list`

Request:

```json
{
  "includeVirtual": true
}
```

### `POST /v1/arb/scan`

Request:

```json
{
  "maxCapitalUsd": 250
}
```

### `POST /v1/yield/manage`

Request:

```json
{
  "mode": "status"
}
```

### `GET /v1/agent/identity`

No body.

## Common Error Codes

- `AUTH_INVALID`
- `AUTH_REPLAY_DETECTED`
- `VALIDATION_ERROR`
- `CONFIRMATION_TOKEN_EXPIRED`
- `CONFIRMATION_TOKEN_USED`
- `WALLET_NOT_CONFIGURED`
- `INSUFFICIENT_FUNDS`
- `CONNECTOR_UNAVAILABLE`
- `EXECUTION_REJECTED`
