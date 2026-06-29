#!/usr/bin/env bash
#
# Helper script for the Banking Transactions API.
#
#   ./demo/run.sh          Start the API server (http://localhost:3000)
#   ./demo/run.sh seed     Seed a running server with demo/sample-data.json
#
# The store is in-memory, so seeding must be run against an already-running
# server (start it in another terminal first).
set -euo pipefail

# Resolve the homework-1 root regardless of where the script is called from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BASE_URL="${BASE_URL:-http://localhost:3000}"

case "${1:-start}" in
  start)
    cd "$ROOT_DIR"
    echo "Starting Banking Transactions API on $BASE_URL ..."
    npm start
    ;;

  seed)
    echo "Seeding $BASE_URL from demo/sample-data.json ..."
    # Use Node (already a prerequisite) to POST each entry in the array.
    node -e '
      const fs = require("fs");
      const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const base = process.argv[2];
      (async () => {
        for (const tx of data) {
          const res = await fetch(base + "/transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tx),
          });
          const body = await res.json();
          console.log(res.status, body.id || JSON.stringify(body));
        }
      })().catch((e) => { console.error(e.message); process.exit(1); });
    ' "$SCRIPT_DIR/sample-data.json" "$BASE_URL"
    ;;

  *)
    echo "Usage: $0 [start|seed]" >&2
    exit 1
    ;;
esac
