#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

body='{"includeVirtual":true}'
signed_post '/v1/positions/list' "$body"
