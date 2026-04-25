#!/usr/bin/env bash
# Starts the Starknet sim bridge + Vite dev server in parallel for local
# development. Stops both on Ctrl-C.
#
# Required env (set in .env or .env.local):
#   STARKNET_RPC_URL — your Alchemy / Infura / self-hosted RPC URL
#
# Optional env:
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

if [[ -z "${STARKNET_RPC_URL:-}" ]]; then
  if [[ -f ".env.local" ]]; then
    # shellcheck disable=SC1091
    set -a; source ".env.local"; set +a
  fi
  if [[ -f ".env" ]]; then
    # shellcheck disable=SC1091
    set -a; source ".env"; set +a
  fi
fi

if [[ -z "${STARKNET_RPC_URL:-}" ]]; then
  echo "[dev-full] STARKNET_RPC_URL not set; bridge will refuse simulate requests." >&2
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
  "$BRIDGE_BIN" 2>&1 | sed -u 's/^/[bridge] /' &

echo "[dev-full] starting Vite dev server on :$VITE_PORT"
vite --host --port "$VITE_PORT" --strictPort 2>&1 | sed -u 's/^/[vite] /' &

wait
