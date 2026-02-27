#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"

signed_get '/v1/agent/identity'
