---
description: Generate a complete banking transaction-pipeline specification into specification.md following the required 5-section template.
argument-hint: "[optional focus note, e.g. 'emphasize cross-border fraud rules']"
---

# /write-spec — Agent 1: Specification generator

You are **Agent 1 (Specification)** of a multi-agent banking pipeline capstone. Your job is to
produce a complete, implementation-ready technical specification for a **multi-agent banking
transaction-processing pipeline** and write it to `specification.md`.

## Step 0 — Ground yourself in the real input

Before writing anything, **read `sample-transactions.json`** in the current project (it holds raw
transaction records). Use the actual field names, value shapes, and edge cases you find there
(e.g. negative amounts, invalid currency codes, off-hours timestamps, high-value wires,
cross-border metadata) to make every objective concrete and testable. Do not invent fields that
are absent from the sample; do reference the fields that are present
(`transaction_id`, `timestamp`, `source_account`, `destination_account`, `amount`, `currency`,
`transaction_type`, `description`, `metadata.channel`, `metadata.country`).

If `$ARGUMENTS` is non-empty, treat it as an extra emphasis note and fold it into the objectives.

## Step 1 — Emit these sections, IN THIS EXACT ORDER

### 1. High-Level Objective
One sentence describing what the pipeline does.

### 2. Mid-Level Objectives
4–5 concrete, **testable** requirements grounded in the sample data. Each must be verifiable by a
unit test. Examples of the required style (adapt to the real data, don't copy verbatim):
- Transactions above $10,000 are flagged for fraud review with a numeric risk score.
- Transactions with a non-ISO-4217 currency (e.g. `XYZ`) are rejected at validation.
- Non-positive amounts (e.g. a `-100.00` refund) are rejected with a reason.
- Rejected transactions are written to `shared/results/` with a `reason` field.
- Every agent operation is logged with an ISO-8601 UTC timestamp.

### 3. Implementation Notes
State each of these as a binding constraint the code MUST follow:
- **Money:** use a precise decimal type (`decimal.Decimal` in the Python stack) — **never `float`**.
  Parse amounts from their string form in the JSON.
- **Currency:** accept **ISO-4217** codes only (USD, EUR, GBP, JPY, …); reject anything else.
- **Audit log:** every operation logs `{ISO-8601 UTC timestamp, agent name, transaction id, outcome}`.
- **PII:** treat `source_account` / `destination_account` / any names as sensitive —
  **never log them in plaintext** (mask or hash if they must appear).

### 4. Context
- **Beginning state:** a `sample-transactions.json` file with raw transaction records.
- **Ending state:** processed results in `shared/results/`, a pipeline summary report, and unit
  test **coverage ≥ 90%** (hard gate blocks push below 80%).

### 5. Low-Level Tasks
Exactly **one entry per pipeline agent**, minimum three agents
(`transaction_validator`, `fraud_detector`, and a third — `compliance_checker`,
`settlement_processor`, or `reporting_agent`). Each entry MUST use this exact block form:

```
Task: [Agent Name]
Prompt: "[exact prompt you will give the code-generation agent]"
File to CREATE: agents/[agent_name].py
Function to CREATE: process_message(message: dict) -> dict
Details: [what the agent checks, transforms, or decides]
```

The `Prompt` line must be a real, copy-pasteable instruction (not a placeholder). The `Details`
line must name the specific rules the agent enforces (e.g. validator: required-field presence,
positive `Decimal` amount, ISO-4217 currency; fraud detector: >$10k high-value, off-hours
timing, cross-border country mismatch → risk score; third agent: sanctions/threshold flags →
`approved`/`rejected` with reason).

## Step 2 — Write the file

Write the full specification to **`specification.md`** (overwrite any placeholder). Keep the
wording **language-agnostic** where reasonable, but default to the repo's **Python 3.11 /
`decimal.Decimal` / pytest** stack in concrete examples. After writing, print a short summary:
the number of Mid-Level Objectives and the list of Low-Level agent tasks emitted.
