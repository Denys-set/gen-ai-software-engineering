#!/usr/bin/env bash
#
# Smoke test for the Banking Transactions API.
# Produces clean, labelled output suitable for submission screenshots.
#
# Usage:
#   ./demo/smoke-test.sh                 # against http://localhost:3000
#   BASE_URL=http://localhost:4000 ./demo/smoke-test.sh
#
# Requires the server to be running first (e.g. `npm start`).
# Pretty-prints JSON via `jq` when available, otherwise prints raw.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

# Pretty-print JSON from stdin (jq if present, raw otherwise).
pp() {
  if command -v jq >/dev/null 2>&1; then
    jq .
  else
    cat
  fi
}

# Labelled separator before each step.
section() {
  echo
  echo "=================================================================="
  echo "  $1"
  echo "=================================================================="
}

# Run a curl request, then print the HTTP status and the pretty body.
# All arguments are passed straight through to curl. Fails loudly (instead of
# letting `set -e` abort silently) if the server can't be reached.
show() {
  local resp code body rc=0
  resp="$(curl -s -m 10 -w $'\n%{http_code}' "$@")" || rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "ERROR: request failed (curl exit $rc). Is the server running at $BASE_URL?"
    exit 1
  fi
  code="$(printf '%s' "$resp" | tail -n1)"
  body="$(printf '%s' "$resp" | sed '$d')"
  echo "HTTP $code"
  printf '%s\n' "$body" | pp
}

echo "Banking Transactions API — smoke test"
echo "Target: $BASE_URL"
if command -v jq >/dev/null 2>&1; then
  echo "JSON formatter: jq"
else
  echo "JSON formatter: raw (install jq for pretty output)"
fi

# Pre-flight: make sure the server is up before running the steps.
if ! curl -s -m 5 -o /dev/null "$BASE_URL/"; then
  echo
  echo "ERROR: cannot reach the API at $BASE_URL"
  echo "Start the server first, e.g.:  (cd homework-1 && npm start)"
  echo "Or target another port:        BASE_URL=http://localhost:4000 $0"
  exit 1
fi

section "Step 1: Create a valid transaction (expect HTTP 201)"
show -X POST "$BASE_URL/transactions" \
  -H 'Content-Type: application/json' \
  -d '{"fromAccount":"ACC-00000","toAccount":"ACC-12345","amount":1000.00,"currency":"USD","type":"deposit"}'

section "Step 2: Trigger a validation error — negative amount (expect HTTP 400)"
show -X POST "$BASE_URL/transactions" \
  -H 'Content-Type: application/json' \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":-50,"currency":"USD","type":"transfer"}'

section "Step 3: List all transactions"
show "$BASE_URL/transactions"

section "Step 4: Account balance for ACC-12345"
show "$BASE_URL/accounts/ACC-12345/balance"

section "Step 5: Simple interest for ACC-12345 (rate=0.05, days=30)"
show "$BASE_URL/accounts/ACC-12345/interest?rate=0.05&days=30"

echo
echo "Done."
