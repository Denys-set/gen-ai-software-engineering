#!/usr/bin/env bash
# Claude Code PreToolUse dispatcher — layer 2 of the coverage gate.
#
# Wired in .claude/settings.json against the Bash tool. The PreToolUse payload arrives as JSON on
# stdin; the intercepted shell command is in .tool_input.command. We ONLY gate `git push` — every
# other Bash command passes straight through (exit 0). When it IS a git push, we run the canonical
# coverage_gate.sh and, on any failure, exit 2 — the code Claude Code treats as "deny this tool
# call", surfacing the reason to the model and user. Fails CLOSED.
set -uo pipefail

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE="$HOOK_DIR/../../scripts/coverage_gate.sh"   # .claude/hooks -> homework-6/scripts

payload="$(cat 2>/dev/null || true)"

# Not a git push? Allow the command untouched.
if ! printf '%s' "$payload" | grep -q "git push"; then
  exit 0
fi

if [ ! -x "$GATE" ]; then
  echo "[coverage-gate] gate script missing at $GATE — git push denied (fail closed)" >&2
  exit 2
fi

if "$GATE"; then
  exit 0
fi

echo "[coverage-gate] git push DENIED — unit-test coverage is below 80%." >&2
exit 2
