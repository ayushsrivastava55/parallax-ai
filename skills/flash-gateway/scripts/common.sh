#!/usr/bin/env bash
set -euo pipefail

: "${EYEBALZ_GATEWAY_BASE_URL:?EYEBALZ_GATEWAY_BASE_URL is required}"
: "${EYEBALZ_AGENT_ID:?EYEBALZ_AGENT_ID is required}"
: "${EYEBALZ_KEY_ID:?EYEBALZ_KEY_ID is required}"
: "${EYEBALZ_KEY_SECRET:?EYEBALZ_KEY_SECRET is required}"

body_sha256() {
  local body="${1:-{}}"
  printf '%s' "$body" | openssl dgst -sha256 -binary | xxd -p -c 256
}

hmac_sha256_hex() {
  local input="$1"
  printf '%s' "$input" | openssl dgst -sha256 -hmac "$EYEBALZ_KEY_SECRET" -binary | xxd -p -c 256
}

signed_headers() {
  local method="$1"
  local path="$2"
  local body="${3:-{}}"

  local ts nonce body_hash canonical sig
  ts="$(($(date +%s) * 1000))"
  nonce="$(uuidgen | tr -d '-')"
  body_hash="$(body_sha256 "$body")"
  canonical="${method}\n${path}\n${body_hash}\n${EYEBALZ_AGENT_ID}\n${ts}\n${nonce}"
  sig="$(hmac_sha256_hex "$canonical")"

  echo "-H" "X-Eyebalz-Agent-Id: ${EYEBALZ_AGENT_ID}"
  echo "-H" "X-Eyebalz-Key-Id: ${EYEBALZ_KEY_ID}"
  echo "-H" "X-Eyebalz-Timestamp: ${ts}"
  echo "-H" "X-Eyebalz-Nonce: ${nonce}"
  echo "-H" "X-Eyebalz-Signature: ${sig}"
}

signed_post() {
  local path="$1"
  local body="${2:-{}}"
  local headers
  headers=$(signed_headers "POST" "$path" "$body")
  # shellcheck disable=SC2086
  curl -sS "${EYEBALZ_GATEWAY_BASE_URL}${path}" \
    -X POST \
    -H "Content-Type: application/json" \
    $headers \
    --data "$body"
}

signed_get() {
  local path="$1"
  local headers
  headers=$(signed_headers "GET" "$path" "{}")
  # shellcheck disable=SC2086
  curl -sS "${EYEBALZ_GATEWAY_BASE_URL}${path}" \
    -X GET \
    $headers
}
