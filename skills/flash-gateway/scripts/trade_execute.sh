#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

token="${1:?confirmation token required}"
client_order_id="${2:-client-$(date +%s)}"
idempotency_key="${3:-idem-$(date +%s)}"

body=$(cat <<JSON
{"confirmationToken":"${token}","clientOrderId":"${client_order_id}"}
JSON
)

headers=$(signed_headers "POST" '/v1/trades/execute' "$body")
# shellcheck disable=SC2086
curl -sS "${FLASH_GATEWAY_BASE_URL}/v1/trades/execute" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ${idempotency_key}" \
  $headers \
  --data "$body"
