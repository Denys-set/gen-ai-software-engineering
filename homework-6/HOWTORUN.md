# HOWTORUN — Multi-Agent Banking Pipeline

**Created by Denys Kubrakov <dkbeetroot@gmail.com>**

Reproducible setup and demo. Run everything from the `homework-6/` directory.

> **Interpreter note:** this project needs Python **3.11+** (developed on 3.12). On some machines
> the default `python3` is older (e.g. 3.9) and there is no bare `python`. Substitute your 3.11+
> interpreter for `python3.12` below if needed. Activating the venv (step 1) puts `python` on PATH.

---

## 1. Set up the environment

```bash
cd homework-6
python3.12 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt      # fastmcp>=3.0, pytest, pytest-cov
```

After activation, `python` resolves to the venv interpreter (this matters for `mcp.json`, which
uses `"command": "python"`).

## 2. Run the pipeline

```bash
python integrator.py
```

Expected output (8 transactions, 6 approved / 2 rejected):

```
=== Pipeline Summary ===
Processed 8 transactions at <ISO-8601 UTC>
  approved=6  rejected=2  flagged_for_review=3
  cross_border: total=2 (approved=1, rejected=1)

TXN ID    STATUS    CROSS_BORDER  RISK  REASON
--------------------------------------------------------------
TXN001    approved  False         0
TXN002    approved  False         50
TXN003    approved  False         0
TXN004    approved  True          40
TXN005    approved  False         50
TXN006    rejected  False         -     unsupported currency: XYZ
TXN007    rejected  True          -     amount must be positive
TXN008    approved  False         0
```

Artifacts written to `shared/results/`: one `TXN00x.json` per transaction (account numbers masked
to `ACC-****`), a `summary.json`, and an append-only `audit.log`.

## 3. Validate only (no processing)

Via the skill (in a Claude Code session rooted at `homework-6/`):

```
/validate-transactions
```

Or directly:

```bash
python agents/transaction_validator.py --dry-run
# -> Total: 8   Valid: 6   Invalid: 2   (TXN006 bad currency, TXN007 non-positive amount)
```

This writes nothing to `shared/`.

## 4. Run the tests + coverage

```bash
pytest --cov=agents --cov=mcp --cov=integrator --cov-report=term-missing
# -> 52 passed, Total coverage: 94%
```

## 5. Enable the coverage gate (blocks push < 80%)

From the **repository root** (the git repo is the parent of `homework-6/`):

```bash
git config core.hooksPath homework-6/.githooks
```

Now every `git push` runs `homework-6/scripts/coverage_gate.sh`; the push is aborted if coverage
is below 80%, tests fail, or no tests exist (fails closed). Run the gate manually any time:

```bash
cd homework-6
bash scripts/coverage_gate.sh                 # exit 0 when coverage >= 80%
COVERAGE_MIN=90 bash scripts/coverage_gate.sh # optional: raise the bar
```

The **Claude Code** layer is already wired in `.claude/settings.json` (a PreToolUse hook that
denies `git push` when coverage < 80%) — active whenever Claude Code is launched rooted at
`homework-6/`.

## 6. MCP servers

`mcp.json` declares both servers:

```json
{
  "mcpServers": {
    "context7":        { "command": "npx",    "args": ["-y", "@upstash/context7-mcp@latest"] },
    "pipeline-status": { "command": "python", "args": ["mcp/server.py"] }
  }
}
```

**How it maps to the client:** launch Claude Code rooted at `homework-6/` (with the venv activated,
so `python` → the venv interpreter). Claude Code reads `mcp.json` and starts both servers over
stdio. If you prefer explicit registration:

```bash
# custom status server (use the venv interpreter so fastmcp is importable)
claude mcp add pipeline-status -- "$PWD/.venv/bin/python" "$PWD/mcp/server.py"
# docs server
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
```

**Start / smoke-test the custom server directly:**

```bash
python mcp/server.py     # starts "pipeline-status" on stdio
```

**Run a context7 query** (from a Claude Code session): ask any library-docs question, e.g.
"look up the Python decimal module quantize/ROUND_HALF_UP" — context7 resolves the library ID and
returns docs (the two queries used while building are recorded in `research-notes.md`).

**Verify both are connected:**

```bash
claude mcp list
# context7:        ... - ✔ Connected
# pipeline-status: ... - ✔ Connected
```

**Query the pipeline over MCP** (after step 2 has populated `shared/results/`):

- `list_pipeline_results()` → summary of all 8 processed transactions
- `get_transaction_status("TXN005")` → `approved`, risk 50, `CTR` flag
- resource `pipeline://summary` → the latest run summary as text

## 7. REST API gateway + one-command demo

The pipeline is also reachable over HTTP (extension). The **fastest path** is the demo script,
which does everything with zero manual steps:

```bash
./demo.sh
# creates the venv, installs deps, starts the API, submits 4 sample transactions,
# prints each result + the summary, then shuts the server down cleanly.
```

Or run the API yourself:

```bash
uvicorn api.app:app --port 8100          # or: python -m api.app
```

Then, in another shell:

```bash
curl -s localhost:8100/health
curl -s -X POST localhost:8100/transactions -H 'Content-Type: application/json' -d '{
  "transaction_id":"T100","timestamp":"2026-03-16T09:00:00Z",
  "source_account":"ACC-1001","destination_account":"ACC-2001",
  "amount":"25000.00","currency":"USD","transaction_type":"wire_transfer",
  "metadata":{"channel":"api","country":"US"}}'
curl -s localhost:8100/transactions/T100      # stored result (accounts masked)
curl -s localhost:8100/results                # summary of all processed txns
```

Interactive OpenAPI docs while the server runs: **http://localhost:8100/docs**.

## 8. Change a rule (configurable engine)

All policy lives in **`config/rules.json`** — no code change needed. For example, sanction a
country and re-run:

```bash
# add "DE" to sanctioned_countries in config/rules.json, then:
python integrator.py        # TXN004 (country DE) now → rejected: sanctions screening hit
```

Other knobs: `high_value_amount`, `off_hours_start/end`, `ctr_threshold`,
`critical_risk_threshold`, `iso_4217_whitelist`, `sanctioned_accounts`. The engine validates the
file on load and every agent reads it, so one edit changes the whole pipeline.
