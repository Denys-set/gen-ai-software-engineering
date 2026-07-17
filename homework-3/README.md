# Homework 3 — Virtual Card Lifecycle Management (Specification Package)

> **Student Name**: Denys Kubrakov
> **Author**: Denys Kubrakov &lt;dkbeetroot@gmail.com&gt;
> **Date Submitted**: 2026-07-15
> **AI Tools Used**: Claude Code (Claude Opus 4.8 & Claude Sonnet 4.6)

---

## 1. Student & task summary

This is a **specification-only** package for a regulated-FinTech feature, **Virtual Card Lifecycle Management** (create · freeze/unfreeze · set/adjust limits · view transactions). It contains **no code** — the deliverable is a spec-driven document set that an AI or human implementer could build from without guessing. The package applies the workshop's Spec-Driven Development (SDD) model to a PCI-DSS / SOX / GDPR-sensitive domain, layering requirements from vision down to checkable low-level tasks.

**Package contents:**

| File | Purpose |
| --- | --- |
| `specification.md` | The layered spec: objectives → NFRs → implementation notes → context → edge cases → tasks → verification. Built across Prompts 1–5. |
| `agents.md` | Full operating rules for an AI coding partner in this domain (Prompt 6). |
| `CLAUDE.md` | Tight, always-on editor guardrails auto-loaded every session (Prompt 7). |
| `README.md` | This file — rationale + best-practice map (Prompt 8). |
| `TASKS.md`, `specification-TEMPLATE-example.md` | Assignment brief and the template the spec structure is drawn from. |

---

## 2. Rationale

### Why the layered five-section structure

The spec is built up in the SDD order **vision → mid-level → NFR → implementation notes → context → tasks**, each appended as its own layer rather than regenerated:

- **High-Level Objective** sets the North Star and an explicit scope boundary, so nothing downstream expands scope silently.
- **Mid-Level Objectives (MO-1…MO-8)** are numbered and observable. Every later artifact — NFRs, edge-case rows, tasks, verification methods — **cites an MO id**, so a grader can trace any task or test back to the objective it serves and confirm coverage. That traceability is the whole point of numbering the objectives.
- **Non-Functional & Policy Requirements**, **Implementation Notes**, and **Context** convert "what" into "how well / how safely / from what starting state," so an implementer never invents money formats, ID schemes, or service boundaries.
- **Low-Level Tasks** decompose the work into 16 small, MO-tagged, individually checkable units; **Verification** proves each MO is met.

### How performance targets were chosen

Targets live in `specification.md` → **Non-Functional & Policy Requirements → Performance / SLO** as a `metric | target | rationale` table, and **every hypothetical number is labelled "(assumed target)"** with a one-line justification (numbers are plausible, not measured).

- **Freeze has the tightest budget (p95 < 300 ms)** because it is the safety control a cardholder reaches for when they suspect fraud — every extra millisecond is a window for fraudulent spend. Issuance is looser (p95 < 1.5 s) because it is a one-time create involving upstream token provisioning, where a short wait is acceptable. Ranking budgets by *financial risk of latency* rather than uniformly is the deliberate choice.
- **Read-after-write window ≤ 5 s** balances trust against cost: a just-posted transaction should appear to the cardholder within a few seconds (or they distrust the ledger), but forcing strict synchronous consistency on every read would be expensive and unnecessary for a history view. The response carries `version`/`as_of` so clients can detect staleness inside that window.

### How verification depth was chosen

Depth scales with **compliance risk**, defined in `specification.md` → **Verification**:

- **An audit-event assertion on every state change** — because in a SOX-audited system an unproven audit trail is a failed control, not a missing nice-to-have. The **audit-completeness review gate** makes this automatic: a mutation path with no matching audit assertion fails the check.
- **Contract tests on the three stable interfaces** — the card state machine, the canonical error shape, and the audit-event schema — because those are exactly the surfaces where code silently drifts from intent. They run **blocking in CI**.
- **A compliance sign-off gate** (plus a security review gate) before release, because PAN handling, retention, and GDPR erasure decisions need human regulatory judgment, not just green tests.

### How the SDD anti-patterns were avoided

| Anti-pattern | How this package avoids it | Where |
| --- | --- | --- |
| **Vague specs** | Numbered, observable, independently testable objectives + measurable SLOs | `specification.md` → Mid-Level Objectives; Performance / SLO |
| **Code-first drift** | Living-document policy + blocking contract tests reconcile spec ↔ code every PR | `specification.md` → Verification; README §3 |
| **Missing error cases** | A first-class 22-row edge-case table with status/error codes and audit implications | `specification.md` → Edge Cases & Failure Modes |
| **No contract testing** | Contract suites on state machine / error shape / audit schema, blocking in CI | `specification.md` → Verification → Contract tests |
| **Outdated agent configs** | `agents.md` + `CLAUDE.md` kept current and required to match the spec | `agents.md`; `CLAUDE.md` |
| **One-time docs** | Explicit living-document policy (below) | README §3 |

---

## 3. Living-document policy

`specification.md`, `agents.md`, and `CLAUDE.md` are **living documents**, not one-time write-ups. This closes both the "one-time docs" and "code-first drift" anti-patterns.

**Rules:**

1. **Any PR that changes behavior MUST update the relevant spec section in the same PR.** A new state transition updates the state-machine table; a new error code updates Error Semantics; a changed limit rule updates the limit task and edge-case rows. Spec and code move together or not at all.
2. **A contract-test failure is a drift signal.** If the state-machine, error-shape, or audit-schema contract test fails, the spec and implementation have diverged — reconcile them (update `specification.md` **and** both producer/consumer sides) **before merge**. Routing around a failing contract test is prohibited.
3. **Agent rules track the spec.** When the spec's guardrails change, `agents.md` and `CLAUDE.md` are updated in the same change so the AI partner never operates on stale rules.

---

## 4. Industry best practices — where they appear

Every entry references a real file + section anchor in this package.

| Best practice | Why it matters in FinTech | Where it appears |
| --- | --- | --- |
| **PCI-DSS PAN handling** (no full PAN/CVV stored, last-4 + token only) | Storing cardholder data expands PCI scope and breach liability; minimizing it is the primary control | `specification.md` → Non-Functional & Policy Requirements → **Security & Data Handling**; `agents.md` §2; `CLAUDE.md` → Avoid |
| **Integer / `Decimal` money** (never float) | Float rounding silently corrupts balances and limits — unacceptable for money | `specification.md` → Implementation Notes → **Money**; `agents.md` §1–§2; `CLAUDE.md` → Avoid |
| **Idempotency** (`Idempotency-Key` on all writes) | Network retries must not double-issue a card or double-apply a limit change | `specification.md` → Implementation Notes → **Idempotency** (+ Task 5); `agents.md` §2; `CLAUDE.md` → Prefer |
| **Append-only, tamper-evident audit trail** | SOX/regulatory audits require a provable, unalterable record of every state change | `specification.md` → Non-Functional → **Audit / Logging** (MO-7) + Tasks 2–3; `agents.md` §2, §5 |
| **Least privilege + Separation of Duties** | Limits internal fraud/error; no one both requests and approves a sensitive change | `specification.md` → Non-Functional → **Security & Data Handling** (role matrix, SoD); MO-8; `agents.md` §2 |
| **GDPR PII minimization** (+ erasure-vs-retention resolution) | Over-collection is a liability; erasure must not destroy legally-retained records | `specification.md` → Non-Functional → **Privacy**; `agents.md` §5 |
| **Optimistic locking** (card `version`) | Prevents lost updates in freeze/limit races without slow locks on the hot path | `specification.md` → Implementation Notes → **Concurrency** (+ Task 6); `CLAUDE.md` → Prefer |
| **Deny-by-default authorization** | Fail-safe posture: an unmapped action is denied, not accidentally allowed | `specification.md` → Non-Functional → Security (RBAC); MO-8 + Task 4; `agents.md` §2; `CLAUDE.md` → FinTech defaults |
| **SLO / latency budgets** (p50/p95/p99) | "Should be fast" is untestable; safety-critical freeze needs a measurable, tight budget | `specification.md` → Non-Functional → **Performance / SLO** |
| **Read-after-write consistency** (≤ 5 s window) | A just-posted transaction must appear promptly or cardholders distrust the record | `specification.md` → Non-Functional → Performance / SLO; Edge Cases (stale read row) |
| **Contract testing in CI** | Pins stable interfaces so spec↔code drift is caught in CI, not production | `specification.md` → **Verification → Contract tests**; README §3 |
| **Canonical error shape** `{code, message, correlation_id}` | Consistent, safe errors (no PAN/PII/stack traces) and traceable to audit/logs | `specification.md` → Implementation Notes → **Error Semantics** (+ Task 1); `agents.md` §3; `CLAUDE.md` → Prefer |
| **Fail-closed defaults** (gateway down, audit sink down) | In payments, "fail open" approves fraud or drops audit records — fail closed instead | `specification.md` → Non-Functional → Reliability; Edge Cases (gateway/audit rows); `CLAUDE.md` → FinTech defaults |
