#!/usr/bin/env bash
# Starts the Starknet sim bridge + Vite dev server in parallel for local
# development. Stops both on Ctrl-C.
#
# Optional env:
#   STARKNET_RPC_URL  — fallback RPC for direct bridge calls without the
#                       X-Starknet-Rpc-Url header. The UI normally sends
#                       this header from app-side RPC settings.
#   VOYAGER_API_KEY    — optional; enables verified Cairo source passthrough.
#   STARKNET_SIM_BIND  — default 127.0.0.1:5790
#   STARKNET_SIM_LOG   — default info
#   VITE_PORT          — default 5173

set -euo pipefail

BRIDGE_BIN="./starknet-sim/target/release/starknet-sim-bridge"
BRIDGE_BIND="${STARKNET_SIM_BIND:-127.0.0.1:5790}"
BRIDGE_LOG="${STARKNET_SIM_LOG:-info}"
VITE_PORT="${VITE_PORT:-5173}"

if [[ ! -x "$BRIDGE_BIN" ]]; then
  echo "[dev-full] $BRIDGE_BIN not found — run 'npm run starknet-sim:build' first" >&2
  exit 1
fi

for env_file in ".env" ".env.local"; do
  if [[ -f "$env_file" ]]; then
    # shellcheck disable=SC1090
    set -a; source "$env_file"; set +a
  fi
done

if [[ -z "${STARKNET_RPC_URL:-}" ]]; then
  echo "[dev-full] STARKNET_RPC_URL not set; using per-request X-Starknet-Rpc-Url from the UI." >&2
  echo "[dev-full] Direct bridge calls without that header will fail." >&2
fi

cleanup() {
  echo "[dev-full] shutting down…" >&2
  jobs -p | xargs -r kill 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[dev-full] starting starknet-sim bridge on $BRIDGE_BIND"
BIND_ADDR="$BRIDGE_BIND" \
  REQUIRE_API_KEY=false \
  LOG_LEVEL="$BRIDGE_LOG" \
  STARKNET_RPC_URL="${STARKNET_RPC_URL:-}" \
  VOYAGER_API_KEY="${VOYAGER_API_KEY:-}" \
  "$BRIDGE_BIN" 2>&1 | sed -u 's/^/[bridge] /' &

echo "[dev-full] starting Vite dev server on :$VITE_PORT"
vite --host --port "$VITE_PORT" --strictPort 2>&1 | sed -u 's/^/[vite] /' &

wait
