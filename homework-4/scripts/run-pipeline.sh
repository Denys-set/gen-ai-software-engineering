#!/usr/bin/env bash
#
# run-pipeline.sh — single-command driver for the 4-agent bug/security/test pipeline.
#
# Dispatches the six subagents IN ORDER via Claude Code headless (`claude -p`). Each stage names
# the subagent to use and, where required, the skill to load — so skills load automatically and
# there is no manual per-agent invocation between steps.
#
#   Bug Researcher -> Research Verifier -> Bug Planner -> Bug Fixer
#                                                      -> Security Verifier
#                                                      -> Unit Test Generator
#
# Invoked by `npm run pipeline`.

set -euo pipefail

# --- Run from the homework-4 directory so homework-4/.claude is the project config -------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

# --- Preconditions ----------------------------------------------------------------------------
if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: the 'claude' CLI is not on PATH. Install Claude Code and authenticate first." >&2
  echo "       See HOWTORUN.md for setup." >&2
  exit 1
fi

# Flags applied to every headless stage.
#
# Default: acceptEdits — auto-approves file writes/edits. Bash commands the agents need
# (npm test, npm install, npm ls, ...) are auto-approved by the committed allowlist in
# .claude/settings.json, so the run is non-interactive without a blanket bypass.
#
# Escape hatch: set PIPELINE_BYPASS=1 to skip ALL permission checks for the run
# (equivalent to --dangerously-skip-permissions). Broader; use only if you trust the tree.
if [[ "${PIPELINE_BYPASS:-0}" == "1" ]]; then
  CLAUDE_FLAGS=(--permission-mode bypassPermissions)
else
  CLAUDE_FLAGS=(--permission-mode acceptEdits)
fi

BUG=context/bugs/001

banner() {
  echo ""
  echo "=================================================================================="
  echo ">> $1"
  echo "=================================================================================="
}

run_stage() {
  # $1 = human label, $2 = prompt for claude -p
  banner "$1"
  claude "${CLAUDE_FLAGS[@]}" -p "$2"
}

# --- Stage 1: Bug Researcher ------------------------------------------------------------------
run_stage "Stage 1/6 — Bug Researcher (model: sonnet)" \
"Use the bug-researcher subagent. Read ${BUG}/bug-context.md and the src/ tree, locate every \
seeded defect in real code, and write ${BUG}/research/codebase-research.md with an exact \
file:line and a verbatim snippet for each claim."

# --- Stage 2: Research Verifier ---------------------------------------------------------------
run_stage "Stage 2/6 — Research Verifier (model: opus)" \
"Use the research-verifier subagent and load the research-quality-measurement skill. Verify every \
file:line and snippet in ${BUG}/research/codebase-research.md against current source and write \
${BUG}/research/verified-research.md with the skill's required sections and a Research Quality \
level."

# --- Stage 3: Bug Planner ---------------------------------------------------------------------
run_stage "Stage 3/6 — Bug Planner (model: opus)" \
"Use the bug-planner subagent. From ${BUG}/research/verified-research.md, write \
${BUG}/implementation-plan.md with exact before/after code per defect and the test command. \
Plan only — no edits."

# --- Stage 4: Bug Fixer -----------------------------------------------------------------------
run_stage "Stage 4/6 — Bug Fixer (model: sonnet)" \
"Use the bug-fixer subagent. Apply ${BUG}/implementation-plan.md exactly, run npm test after each \
change, and write ${BUG}/fix-summary.md including the list of changed files. Stop and report if \
tests fail."

# --- Stage 5: Security Verifier (on changed code) ---------------------------------------------
run_stage "Stage 5/6 — Security Verifier (model: opus)" \
"Use the security-verifier subagent. Review the files listed in ${BUG}/fix-summary.md, rate \
findings CRITICAL–INFO with file:line and remediation, and write ${BUG}/security-report.md. \
Report only — no edits."

# --- Stage 6: Unit Test Generator (on changed code) -------------------------------------------
run_stage "Stage 6/6 — Unit Test Generator (model: sonnet)" \
"Use the unit-test-generator subagent and load the unit-tests-FIRST skill. Add FIRST-compliant \
regression tests for the changed code to tests/notes.fixed.test.js, run npm test, and write \
${BUG}/test-report.md."

# --- Final verification -----------------------------------------------------------------------
banner "Pipeline complete — running the full test suite"
npm test

echo ""
echo "Outputs written to ${BUG}/ :"
echo "  - research/codebase-research.md   (Bug Researcher)"
echo "  - research/verified-research.md   (Research Verifier)"
echo "  - implementation-plan.md          (Bug Planner)"
echo "  - fix-summary.md                  (Bug Fixer)"
echo "  - security-report.md              (Security Verifier)"
echo "  - test-report.md                  (Unit Test Generator)"
