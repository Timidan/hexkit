#!/usr/bin/env bash
# Orchestrator: capture each (side, tab) into a fixture, then run diff.ts.
#
# Splits each capture into navigate → wait-loop → extract so we stay
# under playwriter's 10s -e cap on every individual call.

set -euo pipefail

cd "$(dirname "$0")"

TX_HASH="${1:-0xd5949557f4ed8aa1c50cd50f97beb7e1c7941f79e65afec49fab9e2e16a7fc}"
VOYAGER_SESSION="${VOYAGER_SESSION:-1}"
OURS_SESSION="${OURS_SESSION:-3}"
WAIT_BUDGET_S=90

mkdir -p fixtures

TABS=(overview events internalCalls storage)

build_payload() {
  local phase="$1"
  local side="$2"
  local tab="$3"
  npx tsx capture.ts --phase "$phase" --side "$side" --tab "$tab" --tx "$TX_HASH" 2>/dev/null
}

run_phase() {
  local phase="$1"
  local side="$2"
  local tab="$3"
  local session="$4"
  local payload
  payload=$(build_payload "$phase" "$side" "$tab")
  playwriter -s "$session" -e "$payload" 2>&1 || true
}

extract_envelope() {
  local raw="$1"
  local marker="$2"
  echo "$raw" | grep -oE "__${marker}__.*__END__" | sed "s/^__${marker}__//; s/__END__$//" | head -1
}

capture() {
  local side="$1"
  local tab="$2"
  local session
  if [ "$side" = "theirs" ]; then session="$VOYAGER_SESSION"; else session="$OURS_SESSION"; fi
  echo "  [$side/$tab] navigate"
  run_phase navigate "$side" "$tab" "$session" >/dev/null
  echo "  [$side/$tab] waiting…"
  local elapsed=0
  while [ "$elapsed" -lt "$WAIT_BUDGET_S" ]; do
    local raw
    raw=$(run_phase wait "$side" "$tab" "$session")
    local status
    status=$(extract_envelope "$raw" WAIT)
    if [ "$status" = "READY" ]; then
      break
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  echo "  [$side/$tab] extract"
  local raw
  raw=$(run_phase extract "$side" "$tab" "$session")
  local json
  json=$(extract_envelope "$raw" CAPTURE)
  if [ -z "$json" ]; then
    echo "    ! no capture envelope" >&2
    echo "$raw" | head -10 >&2
    echo "{\"side\":\"$side\",\"tab\":\"$tab\",\"fields\":{}}" > "fixtures/$side.$tab.json"
    return 1
  fi
  echo "$json" > "fixtures/$side.$tab.json"
}

echo "Tx hash: $TX_HASH"
for tab in "${TABS[@]}"; do
  echo "tab=$tab"
  capture theirs "$tab" || true
  capture ours "$tab" || true
done

echo
echo "Generating diff…"
npx tsx diff.ts >/dev/null
echo
cat report.md
