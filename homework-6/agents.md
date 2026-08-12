# agents.md — Multi-Agent Banking Pipeline (always-on context)

> Durable rulebook for every agent in this capstone. Read before writing or changing code.
> Author: **Denys Kubrakov <dkbeetroot@gmail.com>** · Stack: Python 3.11 · `decimal.Decimal` · pytest.

---

## Meta-agents (the four deliverables)

| Meta-agent | Single responsibility |
|------------|-----------------------|
| **Agent 1 — Spec** | Produces `specification.md` via the `/write-spec` skill. Owns the contract. |
| **Agent 2 — Code** | Generates the pipeline code (integrator + 3 runtime agents), using **context7** for framework lookups. |
| **Agent 3 — Tests** | Writes the pytest suite and the **coverage-gate hook** (blocks push < 80%). |
| **Agent 4 — Docs** | Writes `README.md` (with author name) + `HOWTORUN.md`. |

**Do** keep each meta-agent to its one job. **Don't** let the Code agent invent spec rules — the
spec is authoritative; change `specification.md` first, then the code.

---

## Runtime pipeline agents (the system they build)

Run **in this order**; a rejection short-circuits the remaining stages:

1. **`transaction_validator`** — required fields present · amount is a positive `Decimal` ·
   currency is ISO-4217. → routes to `fraud_detector` or rejects.
2. **`fraud_detector`** — additive `risk_score`: high-value > $10k (+50), off-hours UTC hour in
   `[0,6)` (+20), cross-border `country != "US"` (+20); sets `fraud_review` at score ≥ 50.
   → routes to `compliance_checker`.
3. **`compliance_checker`** — CTR flag for amount ≥ $10k · sanctions screening · terminal
   decision `approved`/`rejected` + `reason`. → writes to `shared/results/`.

Each runtime agent exposes `process_message(message: dict) -> dict`. The **integrator**
(`integrator.py`, `run_pipeline(...)`) orchestrates them.

---

## Standard message format

- `message_id` — uuid4 string
- `timestamp` — ISO-8601 UTC (e.g. `2026-03-16T10:00:00Z`)
- `source_agent` / `target_agent` — agent names above
- `message_type` — e.g. `"transaction"`
- `data` — the transaction payload + accumulated fields (`status`, `risk_score`, `reason`, flags)

**Worked example:**
```json
{
  "message_id": "3f2a9c1e-7b4d-4e2a-9c3f-1a2b3c4d5e6f",
  "timestamp": "2026-03-16T09:00:00Z",
  "source_agent": "transaction_validator",
  "target_agent": "fraud_detector",
  "message_type": "transaction",
  "data": {
    "transaction_id": "TXN001",
    "amount": "1500.00",
    "currency": "USD",
    "status": "validated",
    "risk_score": 0,
    "risk_flags": [],
    "reason": null
  }
}
```

---

## Shared-directory protocol

```
shared/input/       ← integrator drops the initial message
shared/processing/  ← the active agent moves the message here while working
shared/output/      ← the agent writes its result here for the next agent to pick up
shared/results/     ← final approved/rejected outcome lands here (+ summary.json)
```

Ownership of each hop:

| Hop | Owner |
|-----|-------|
| create message → `input/` | integrator |
| `input/` → `processing/` → `output/` | the currently-running runtime agent |
| `output/` → next agent's `processing/` | integrator (hands off between stages) |
| terminal message → `results/` + `summary.json` | integrator (after `compliance_checker`) |

**Do** treat a file's directory as its state. **Don't** leave stale files in `processing/` — move
or delete on completion.

---

## Non-negotiable banking rules

**Do:**
- Use `decimal.Decimal` for every monetary value; parse from the JSON **string** form
  (`Decimal("25000.00")`). Use `ROUND_HALF_UP` if rounding.
- Accept **ISO-4217** currency codes only (USD, EUR, GBP, JPY, …); reject the rest (`XYZ`).
- Audit-log **every** operation: `{ISO-8601 UTC timestamp, agent, transaction_id, outcome}`
  as JSON lines.
- Mask/hash PII (`source_account`, `destination_account`, names) before it reaches any log or
  printed summary (`ACC-1001` → `ACC-****`). Transaction IDs are safe to log.

**Don't:**
- Never use `float` for money.
- Never log account numbers or names in plaintext.
- Never let a rejected transaction skip being recorded in `shared/results/` with its reason.

---

## Coverage gate

- Pushes are **blocked below 80%** by the coverage-gate hook (Task 3).
- **Target ≥ 90%.** Every runtime agent gets unit tests; the pipeline gets ≥ 1 integration test.
- **Do** isolate tests from the real `shared/` (use `tmp_path` or equivalent). **Don't** write test
  artifacts into the tracked `shared/` dirs.
