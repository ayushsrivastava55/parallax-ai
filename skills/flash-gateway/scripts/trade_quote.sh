#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

market_id="${1:?market id required}"
platform="${2:-predictfun}"
side="${3:-YES}"
size="${4:-50}"
size_type="${5:-usd}"

body=$(cat <<JSON
{"marketId":"${market_id}","platform":"${platform}","side":"${side}","size":${size},"sizeType":"${size_type}","maxSlippageBps":100}
JSON
)

signed_post '/v1/trades/quote' "$body"
