#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

body='{"status":"active","limit":20}'
signed_post '/v1/markets/list' "$body"
