# Flash Gateway Heartbeat

Run every 30-60 minutes:

1. `GET /v1/system/health`
2. `GET /v1/system/connectors`
3. If healthy, optionally run `POST /v1/markets/list` with a small limit.
4. Record last check time in memory/state.

## Alert Conditions

- Gateway health not `ok`
- Connector unavailable for more than 2 consecutive checks
- Repeated auth failures

## Recommended Action on Failure

- Pause trade execution
- Continue read-only checks
- Notify human operator with `requestId` and error code
