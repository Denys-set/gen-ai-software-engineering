# 🏦 Multi-Agent Banking Transaction Pipeline

**Created by Denys Kubrakov <dkbeetroot@gmail.com>**

A capstone that demonstrates two layers of agents:

- **Four meta-agents** that *build* the system — **Spec** (writes `specification.md` via the
  `/write-spec` skill), **Code** (generates the pipeline using the **context7** MCP server),
  **Tests** (the pytest suite + the coverage-gate hook), and **Docs** (this README + `HOWTORUN.md`).
- **Three runtime agents** (plus an integrator) that *process* banking transactions. Raw records
  from `sample-transactions.json` flow through file-based JSON message passing —
  **validation → fraud scoring → compliance decisioning** — and every transaction ends up in
  `shared/results/` with an auditable `approved`/`rejected` outcome, a risk score, and an explicit
  cross-border flag.

The pipeline is deliberately banking-safe: money is always `decimal.Decimal` (never `float`),
currencies are validated against an ISO-4217 whitelist, every operation is written to an
append-only audit log with an ISO-8601 UTC timestamp, and account numbers are treated as PII —
masked to `ACC-****` before they ever reach a log, a printed summary, or a persisted result.

---

## Agent responsibilities

**Meta-agents (deliverables that build the system)**

- **Agent 1 — Spec:** produces `specification.md` via the `/write-spec` slash command.
- **Agent 2 — Code:** generates the integrator + three runtime agents, using context7 for
  framework lookups (documented in `research-notes.md`).
- **Agent 3 — Tests:** writes the `tests/` suite and the coverage-gate hook that blocks push < 80%.
- **Agent 4 — Docs:** writes this README and `HOWTORUN.md`.

**Runtime agents (the pipeline they build)**

- **`integrator.py`** — orchestrator. Sets up the `shared/` dirs, wraps each raw record in the
  standard message envelope, drives it through the agents in order, moves messages between stages,
  writes per-transaction results + `summary.json`, and appends the audit log.
- **`agents/transaction_validator.py`** — checks required fields, a positive `Decimal` amount, and
  an ISO-4217 currency; computes the `cross_border` flag once and threads it downstream. Valid →
  `fraud_detector`; invalid → rejected with a reason. Has a `--dry-run` CLI.
- **`agents/fraud_detector.py`** — additive risk score: high-value `> $10,000` (+50), off-hours UTC
  hour in `[0,6)` (+20), cross-border `country != US` (+20). Tracks cross-border risk in fields
  *separate* from domestic risk (`cross_border_flags`, `cross_border_review`); flags for review.
- **`agents/policy_agent.py`** — sanctions / restricted-country screen driven by the configurable
  rule engine (`config/rules.json`). Rejects on a `sanctioned_countries` / `sanctioned_accounts`
  hit (accounts matched in memory, never logged); otherwise annotates `policy_flags` and hands off
  to compliance. Its own auditable stage between fraud and compliance.
- **`agents/compliance_checker.py`** — terminal decision. CTR flag for `amount ≥ $10,000`,
  a separate cross-border EDD (enhanced due diligence) flag, and critical-risk
  rejection (`risk_score ≥ 70`); otherwise approves. Routes the final message to `results/`.

### Configurable rule engine (`config/rules.json` + `rules/engine.py`)

Every tunable threshold and list — high-value amount, off-hours window, cross-border/CTR/critical
cut-offs, the ISO-4217 whitelist, home country, and the sanctions lists — lives in
**`config/rules.json`**. The agents read the `RuleEngine` instead of hard-coded constants, so you
can change policy without touching Python (e.g. add `"KP"` to `sanctioned_countries`, or lower
`high_value_amount`, and re-run). Monetary values are strings (parsed to `Decimal`), and the engine
validates the config on load.

### REST API gateway (`api/app.py`)

A thin **FastAPI** adapter runs a transaction through the *same* agents over HTTP and returns the
*same* result JSON (accounts masked). Endpoints: `GET /health`, `POST /transactions`,
`GET /transactions/{id}`, `GET /results` — with auto OpenAPI docs at `/docs`. Both the batch
integrator and the API share one entrypoint, `integrator.process_record()`. Run it end-to-end with
**`./demo.sh`** (starts the server, submits sample transactions, prints results, cleans up).

---

## Architecture

```
        sample-transactions.json          REST API (api/app.py)
                  │                        POST /transactions
                  ▼                                 │
           ┌──────────────┐                         │  both call
           │  integrator  │ (run_pipeline) ─────────┴──▶ integrator.process_record()
           └──────┬───────┘
                  │ wrap each record in a message envelope
                  ▼
           shared/input/
                  │
   ┌──────────────┼───────────────────────────── per transaction ────────────────┐
   │              ▼                                                                │
   │  processing ─▶ transaction_validator ─▶ output      (rules/engine.py         │
   │              │  valid?                                 ← config/rules.json)   │
   │     rejected │  yes                                                           │
   │              ▼                                                                │
   │  processing ─▶ fraud_detector        ─▶ output                               │
   │              │                                                                │
   │              ▼                                                                │
   │  processing ─▶ policy_agent (sanctions) ─▶ output                            │
   │              │  clear?                                                        │
   │     rejected │  yes                                                           │
   │              ▼                                                                │
   │  processing ─▶ compliance_checker    ─▶ output                               │
   │              │                                                                │
   └──────────────┼──────────────────────────────────────────────────────────────┘
                  ▼
    shared/results/<TXN>.json  +  summary.json  +  audit.log
                  ▲
                  │  queryable over MCP           and over HTTP: GET /results, /transactions/{id}
    ┌─────────────┴──────────────┐
    │  pipeline-status (FastMCP)  │  get_transaction_status, list_pipeline_results,
    └─────────────────────────────┘  resource pipeline://summary
```

A rejection at any stage short-circuits the remaining stages, but the transaction still lands in
`shared/results/` with its reason and `cross_border` flag.

---

## Tech stack

| Area | Choice |
|------|--------|
| Language | Python 3.11+ (developed/tested on 3.12) |
| Money | `decimal.Decimal` with `ROUND_HALF_UP` — never `float` |
| Messaging | File-based JSON envelopes through `shared/{input,processing,output,results}` |
| Rule engine | `config/rules.json` (data) + `rules/engine.py` — no hard-coded thresholds |
| REST API | `FastAPI` + `uvicorn` — `api/app.py`, run `./demo.sh` |
| Tests | `pytest` + `pytest-cov` (93% coverage, 84 tests) |
| Custom MCP server | `fastmcp` (≥ 3.0) — `pipeline-status` |
| Docs MCP server | `context7` (`@upstash/context7-mcp`) — used during code generation |
| Coverage gate | `scripts/coverage_gate.sh` via a git `pre-push` hook **and** a Claude Code PreToolUse hook |
| Std lib only (agents) | `json`, `uuid`, `decimal`, `datetime`, `os`, `pathlib` |

---

## Skills (custom slash commands, in `.claude/commands/`)

- **`/write-spec`** — Agent 1: generates `specification.md` from the required 5-section template.
- **`/run-pipeline`** — runs the pipeline end-to-end and summarizes approved/rejected + reasons.
- **`/validate-transactions`** — dry-run validation only; reports total/valid/invalid + reasons.

## Coverage-gate hook (blocks push below 80%)

`scripts/coverage_gate.sh` runs `pytest --cov=agents --cov=mcp --cov=integrator
--cov-fail-under=80` and **fails closed**. Two layers enforce it:

1. **git `pre-push`** (`.githooks/pre-push`) — aborts the push on non-zero exit.
2. **Claude Code PreToolUse hook** (`.claude/settings.json` → `.claude/hooks/pretooluse_git_push.sh`)
   — intercepts `git push` Bash commands and denies them (exit 2) when coverage < 80%.

## MCP servers (`mcp.json`)

- **`context7`** — up-to-date library docs, used while generating the code (see `research-notes.md`
  for the two documented queries: Python `decimal` and FastMCP).
- **`pipeline-status`** — the custom FastMCP server (`mcp/server.py`) exposing
  `get_transaction_status(transaction_id)`, `list_pipeline_results()`, and the
  `pipeline://summary` resource. All responses are PII-safe (transaction ids + outcomes only).

See **[HOWTORUN.md](HOWTORUN.md)** for reproducible setup and demo steps.
