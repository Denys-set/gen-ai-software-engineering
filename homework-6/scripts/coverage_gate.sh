#!/usr/bin/env bash
# Coverage gate — the single source of truth for "is coverage >= threshold?".
#
# Runs the pytest suite with coverage over agents/, mcp/, and integrator.py and FAILS CLOSED:
# it exits non-zero (blocking a push) when coverage is below the threshold, when tests fail, or
# on ANY error. pytest-cov's --cov-fail-under enforces the percentage; the TOTAL line and the
# "Required test coverage ... not reached" message print the exact percentage.
#
# Called by:
#   - .githooks/pre-push            (git aborts the push on non-zero exit)
#   - .claude/hooks/pretooluse_git_push.sh  (Claude Code denies the `git push` tool call)
#
# Threshold override: COVERAGE_MIN env var (default 80).
set -uo pipefail

THRESHOLD="${COVERAGE_MIN:-80}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR" || { echo "[coverage-gate] ERROR: cannot enter project dir — push blocked" >&2; exit 1; }

# Prefer the project venv (has pytest + pytest-cov); fall back to python3.12.
if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
else
  PY="python3.12"
fi

echo "[coverage-gate] enforcing >= ${THRESHOLD}% coverage (interpreter: ${PY})"
"$PY" -m pytest \
  --cov=agents --cov=mcp --cov=integrator --cov=api --cov=rules \
  --cov-report=term-missing \
  "--cov-fail-under=${THRESHOLD}" \
  -q
STATUS=$?

if [ "$STATUS" -eq 0 ]; then
  echo "[coverage-gate] OK — coverage >= ${THRESHOLD}% — push allowed"
  exit 0
fi

if [ "$STATUS" -eq 5 ]; then
  echo "[coverage-gate] coverage < ${THRESHOLD}% — no tests collected (coverage 0%) — push blocked" >&2
else
  echo "[coverage-gate] coverage < ${THRESHOLD}% or tests failed — push blocked" >&2
fi
exit "$STATUS"
