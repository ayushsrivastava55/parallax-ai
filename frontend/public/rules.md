# Flash Gateway Rules

## Mandatory Rules

1. Do not call protocol APIs directly (Predict.fun, Opinion, chain contracts).
2. Use Flash Gateway endpoints only.
3. Do not execute trades without explicit human approval.
4. Do not execute trades without a valid `confirmationToken`.
5. Always send `Idempotency-Key` on `trades/execute`.
6. Never leak API secrets or signing secrets.

## Error Handling Rules

- `AUTH_INVALID` -> stop and rotate credentials check
- `AUTH_REPLAY_DETECTED` -> regenerate timestamp/nonce and retry once
- `CONFIRMATION_TOKEN_EXPIRED` -> re-quote and reconfirm
- `CONNECTOR_UNAVAILABLE` -> backoff, switch to read-only mode
- `EXECUTION_REJECTED` -> report exact reason to user

## Audit Rules

Log and preserve for each execution attempt:

- `requestId`
- `clientOrderId`
- `Idempotency-Key`
- final order status or error code
