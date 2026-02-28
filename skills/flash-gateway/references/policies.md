# Eyebalz Gateway Policy Rules

## Hard Constraints

1. Trade execution requires explicit user confirmation.
2. `trades/execute` must be preceded by `trades/quote`.
3. Confirmation tokens are single-use and short-lived.
4. `Idempotency-Key` is mandatory for execute.
5. If quote token expires, re-quote and request new confirmation.

## Runtime Policy Checks

- Platform allowlist enforced server-side.
- Max order notional enforced server-side.
- Max slippage bps enforced server-side.
- Global kill switch can disable execution paths.

## Failure Handling

1. Do not retry `execute` with the same token if server says token used/expired.
2. Retry only read endpoints on transient errors.
3. On connector failures, surface server error code and defer execution.

## Audit Expectations

Every execute attempt should be traceable with:

- `requestId`
- `clientOrderId`
- `Idempotency-Key`
- final `orderId` or error code
