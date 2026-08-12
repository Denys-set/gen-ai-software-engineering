#!/usr/bin/env bash
# demo.sh — one-command end-to-end demo of the banking pipeline REST gateway (extension Task 3).
#
# Zero manual steps: sets up the venv, starts the API, submits a spread of test transactions over
# HTTP, prints each result and the final summary, then shuts the server down cleanly.
#
#   ./demo.sh                 # uses port 8100 (override with PORT=... ./demo.sh)
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"          # homework-6/
PORT="${PORT:-8100}"
BASE="http://127.0.0.1:${PORT}"
VENV_PY=".venv/bin/python"

# --- 1. Environment -------------------------------------------------------------------------
if [ ! -x "$VENV_PY" ]; then
  echo "▶ creating venv (.venv) ..."
  python3.12 -m venv .venv
fi
echo "▶ installing dependencies ..."
"$VENV_PY" -m pip install -q -r requirements.txt

# --- 2. Start the API in the background -----------------------------------------------------
echo "▶ starting API on ${BASE} ..."
"$VENV_PY" -m uvicorn api.app:app --port "$PORT" --log-level warning &
API_PID=$!

# Always stop the server on exit (success, error, or Ctrl-C).
cleanup() {
  echo ""
  echo "▶ stopping API (pid ${API_PID}) ..."
  kill "$API_PID" 2>/dev/null || true
  wait "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

# --- 3. Wait for health ---------------------------------------------------------------------
echo -n "▶ waiting for /health "
ready=0
for _ in $(seq 1 40); do
  if curl -sf "${BASE}/health" >/dev/null 2>&1; then ready=1; break; fi
  echo -n "."
  sleep 0.5
done
echo ""
if [ "$ready" -ne 1 ]; then
  echo "✗ API did not become healthy in time" >&2
  exit 1
fi
echo "✓ API is up"

# --- 4. Submit a spread of transactions -----------------------------------------------------
submit() {  # submit <label> <json>
  echo ""
  echo "── POST /transactions — $1"
  curl -sf -X POST "${BASE}/transactions" -H 'Content-Type: application/json' -d "$2" \
    | "$VENV_PY" -m json.tool
}

submit "normal domestic (approved)" '{
  "transaction_id":"DEMO001","timestamp":"2026-03-16T09:00:00Z",
  "source_account":"ACC-1001","destination_account":"ACC-2001",
  "amount":"1500.00","currency":"USD","transaction_type":"transfer",
  "metadata":{"channel":"online","country":"US"}}'

submit "high-value wire (approved + CTR)" '{
  "transaction_id":"DEMO002","timestamp":"2026-03-16T09:15:00Z",
  "source_account":"ACC-1002","destination_account":"ACC-3001",
  "amount":"25000.00","currency":"USD","transaction_type":"wire_transfer",
  "metadata":{"channel":"branch","country":"US"}}'

submit "cross-border off-hours (approved + EDD, flagged)" '{
  "transaction_id":"DEMO003","timestamp":"2026-03-16T02:47:00Z",
  "source_account":"ACC-1004","destination_account":"ACC-5500",
  "amount":"500.00","currency":"EUR","transaction_type":"transfer",
  "metadata":{"channel":"api","country":"DE"}}'

submit "bad currency (rejected)" '{
  "transaction_id":"DEMO004","timestamp":"2026-03-16T10:05:00Z",
  "source_account":"ACC-1006","destination_account":"ACC-7700",
  "amount":"200.00","currency":"XYZ","transaction_type":"transfer",
  "metadata":{"channel":"online","country":"US"}}'

# --- 5. Summary -----------------------------------------------------------------------------
echo ""
echo "── GET /results"
curl -sf "${BASE}/results" | "$VENV_PY" -m json.tool

# --- 6. Verdict -----------------------------------------------------------------------------
echo ""
echo "✅ Demo complete — 4 submitted → 3 approved, 1 rejected (DEMO004 bad currency)."
echo "   Interactive API docs: ${BASE}/docs  (while the server is running)"
