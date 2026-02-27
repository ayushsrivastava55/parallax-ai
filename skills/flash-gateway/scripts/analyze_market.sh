#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

query="${1:-I think BTC will stay above 95000 this week}"
body="$(printf '{"query":%s}' "$(printf '%s' "$query" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')")"
signed_post '/v1/markets/analyze' "$body"
