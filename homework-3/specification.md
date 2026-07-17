# Virtual Card Lifecycle Management — Specification

> Ingest the information from this file, implement the Low-Level Tasks, and generate the code that will satisfy the High- and Mid-Level Objectives. Build only what is specified here; treat everything marked out-of-scope as an external system you integrate with, not something you implement.

## High-Level Objective

- Let a cardholder self-service the full lifecycle of a **virtual** payment card — create it, freeze/unfreeze it, set and adjust spending limits, and review its transactions — while giving ops/compliance a read-only oversight view and preserving a complete, immutable audit trail of every state change.
- **Scope boundary (explicitly OUT):** physical card production/shipping, KYC/identity onboarding, the settlement/ledger system, and the card-network authorization engine are upstream/downstream systems this feature consumes or notifies — it does not implement them.

## Mid-Level Objectives

Each objective is observable (describes what changes in the world on success) and independently testable. Downstream tasks, SLOs, and tests must cite these IDs.

- **MO-1 — Card issuance.** A cardholder can request a new virtual card and receives an active card with a unique `card_id`, a masked reference (last 4 only), and a status of `ACTIVE`; the full PAN is never returned to the lifecycle service or persisted by it.
- **MO-2 — Freeze / unfreeze state machine.** A card can transition `ACTIVE → FROZEN` and `FROZEN → ACTIVE`; while `FROZEN`, no new authorizations succeed, and every transition is rejected unless it is a legal edge in the defined state machine (invalid transitions fail with no state change).
- **MO-3 — Terminal closure.** A card can transition to `CLOSED` from either `ACTIVE` or `FROZEN`; `CLOSED` is terminal — no further transitions, limit changes, or spend are ever permitted on it.
- **MO-4 — Limit management.** A cardholder can set or adjust per-card spending limits (e.g. per-transaction and rolling daily/monthly caps); the new limit takes effect for all subsequent authorization decisions, and a limit that would be exceeded causes the offending authorization to be declined.
- **MO-5 — Transaction viewing & filtering.** A cardholder can list the transactions for one of their cards and filter by date range, status, and amount range, returned newest-first with stable pagination; results expose only masked card data.
- **MO-6 — Ops / compliance read view.** Ops and compliance can look up any card and its transactions across cardholders in a **read-only** view for investigation, without the ability to mutate card state, limits, or transactions, and without exposure of full PAN/CVV.
- **MO-7 — Immutable audit trail.** Every state-changing action (issue, freeze, unfreeze, close, limit change) emits an append-only audit event capturing actor, action, target `card_id`, before/after values, and UTC timestamp; audit events cannot be edited or deleted, and every mutation is traceable to exactly one event.
- **MO-8 — Authorization & least privilege.** Every action is authorized deny-by-default against the actor's role; a cardholder can act only on their own cards, and no role can perform an action outside the permissions defined in the stakeholders table below.

## Stakeholders

| Role | What they CAN do | What they must NOT see / do |
| --- | --- | --- |
| **Cardholder** | Create their own virtual cards; freeze/unfreeze and close their own cards; set/adjust limits on their own cards; view & filter their own transactions. | Cannot see or act on any other cardholder's cards; cannot see full PAN/CVV; cannot edit or delete audit events; cannot override a limit or unfreeze a fraud-locked card. |
| **Ops / Compliance** | Read-only lookup of any card, its status, limits, transactions, and audit trail across all cardholders for investigation and reporting. | Cannot create, freeze/unfreeze, close, or change limits on any card; cannot mutate or delete transactions or audit events; cannot see full PAN/CVV. |
| **Support** | Read-only view of a cardholder's card status and non-sensitive transaction metadata to assist with tickets. | Cannot change card state or limits; cannot view full PAN/CVV or full transaction detail beyond what is needed for support; cannot access unrelated cardholders' data. |
| **Fraud** | Freeze a card and place a fraud lock; read any card, transactions, and audit trail for investigation. | Cannot unfreeze/close on the cardholder's behalf beyond fraud actions; cannot change spending limits; cannot edit or delete audit events; cannot see full PAN/CVV. |

## Non-Functional & Policy Requirements

Defines *how well / how safely* the objectives above must be met. Numbers marked **(assumed target)** are hypothetical budgets chosen to reflect FinTech UX/ops reality; each carries a one-line justification. These requirements apply across all MOs unless a specific MO is cited.

### Security & Data Handling

- **PAN handling (MO-1, MO-5, MO-6).** The full Primary Account Number is **never** stored, logged, or returned by the lifecycle service; it is held only inside the PCI-DSS cardholder-data environment upstream. This service persists and exposes only a **network token / card reference** plus **last-4**. This keeps the service outside PCI-DSS scope for full-PAN storage (PCI-DSS Req. 3 — minimize stored cardholder data).
- **CVV / sensitive authentication data.** CVV/CVC is **never** stored after authorization under any condition, ever (PCI-DSS Req. 3.2 — SAD must not be retained post-auth).
- **Encryption in transit.** All external and service-to-service traffic over **TLS 1.2+** (TLS 1.3 preferred); plaintext transport is rejected.
- **Encryption at rest.** Storage encrypted at rest (AES-256 or provider-managed KMS equivalent), with **field-level encryption** for card metadata (token, last-4, expiry, cardholder linkage) so a raw datastore dump exposes no usable card data.
- **AuthZ model — RBAC, least privilege, deny-by-default (MO-8).** Every action is checked against the actor's role and ownership; unknown/unmapped actions are denied.
- **Separation of Duties (SoD).** No single actor both *initiates* and *approves* a sensitive change. Specifically, a limit increase above an **(assumed target)** threshold of **the card's current daily cap** cannot be requested and approved by the same ops user — requiring a second approver reduces internal-fraud and error risk (SOX-style control).

**Role → allowed lifecycle actions**

| Action | Cardholder | Ops/Compliance | Support | Fraud |
| --- | :---: | :---: | :---: | :---: |
| Issue card (MO-1) | ✅ own | ❌ | ❌ | ❌ |
| Freeze (MO-2) | ✅ own | ❌ | ❌ | ✅ (fraud lock) |
| Unfreeze (MO-2) | ✅ own | ❌ | ❌ | ❌ |
| Close (MO-3) | ✅ own | ❌ | ❌ | ❌ |
| Set/adjust limit (MO-4) | ✅ own | ⚠️ with 2nd approver (SoD) | ❌ | ❌ |
| View own transactions (MO-5) | ✅ own | — | — | — |
| Cross-cardholder read (MO-6) | ❌ | ✅ read-only | ✅ limited | ✅ read-only |

### Privacy

- **PII minimization (GDPR Art. 5 — data minimization).** Store only the cardholder linkage needed for lifecycle operations; no marketing/behavioral PII enters this service.
- **Data-subject access/erasure (GDPR Art. 15/17).** Support export of a data subject's card metadata and transaction references on request.
- **Erasure vs. retention conflict.** A GDPR erasure request **cannot** delete audit/transaction records still inside the regulatory **retention window** (see Audit). Resolution: erasure **redacts/pseudonymizes** directly-identifying PII (name, contact) while retaining the immutable audit event keyed by `card_id`/actor-ID; hard deletion occurs only after the retention window expires. Legal retention obligation overrides erasure for in-scope financial records.

### Audit / Logging (MO-7)

- **Append-only, tamper-evident.** Every state change — issue, freeze, unfreeze, close, limit change — **and** every read of sensitive data (cross-cardholder lookups, sensitive detail views) emits an audit event. Events are append-only; tamper-evidence via hash-chaining each event to its predecessor (any edit/deletion breaks the chain and is detectable).
- **Required fields per event:** `actor_id`, `role`, `action`, `target card_id`, `before → after` values, `timestamp` (UTC, ISO-8601), `correlation_id` (traces one logical request across services).
- **No sensitive data in audit payloads:** before/after values carry masked references only — never full PAN/CVV.
- **Retention window: 7 years (assumed target).** Aligns with common financial-record retention (SOX ~7 yr, card-scheme/AML expectations); long enough to satisfy audits and dispute/chargeback lookback, bounded so storage and GDPR exposure don't grow unbounded.

### Reliability

- **Availability: 99.9% (assumed target)** for lifecycle write actions (~43 min/month budget) — freeze/unfreeze is a safety control cardholders reach for during suspected fraud, so downtime has direct financial-risk cost.
- **Graceful degradation.** When the downstream card-network authorization engine is unavailable, the system **fails closed for spend** (new authorizations decline rather than approve blind) while keeping **freeze** and read views available — freezing must never depend on the network being up.
- **Idempotent retries.** All state-changing endpoints accept an **idempotency key**; a retried issue/freeze/limit request produces the same result and a single audit event, never a duplicate card or double-applied change.

### Performance / SLO

All latencies are server-side processing budgets, excluding client network. Page-size cap on transaction reads blunts scraping/enumeration.

| Metric | Target (assumed) | Rationale |
| --- | --- | --- |
| Freeze action latency | **p95 < 300 ms**, p99 < 500 ms | Safety-critical: a cardholder freezing a compromised card needs near-instant effect; tightest budget because every extra ms is a window for fraudulent spend. |
| Card issuance latency | **p95 < 1.5 s**, p99 < 3 s | Involves upstream token provisioning; users tolerate a short wait for a one-time create, so budget is looser than freeze. |
| Unfreeze / limit change latency | **p95 < 500 ms** | Interactive but not safety-critical; snappy enough to feel immediate. |
| Transaction list read | **p95 < 400 ms**, page size cap **≤ 100** (default 25) | Bounded page size caps DB/scan cost and limits bulk enumeration of transaction history. |
| Read-after-write consistency (new txn visible) | **≤ 5 s** | A just-posted transaction should appear in the cardholder's list within seconds to preserve trust; eventual-consistency window kept tight. |
| Rate limit — sensitive writes (freeze/unfreeze/limit) | **≤ 10 req/min per user** | Blunts abuse/automation of state changes while allowing legitimate rapid correction. |
| Rate limit — read endpoints | **≤ 60 req/min per user** | Allows normal browsing/pagination; caps scraping and card/transaction enumeration attempts. |
| Rate limit — issuance | **≤ 5 cards/hour per user** | Limits mass virtual-card creation used in fraud/testing-card abuse patterns. |

## Implementation Notes

Non-negotiable guardrails. An AI agent or human implementer **must not** violate these; a change that breaks one is a defect regardless of passing tests.

### Money

- **Never use floating-point for monetary values.** Represent all amounts as **integer minor units** (e.g. cents) or a fixed-precision `Decimal`. No `float`/`double` in any money path — storage, transport, or computation.
- **Every amount carries an explicit currency** as an **ISO-4217** code (e.g. `USD`, `EUR`). No implicit/default currency; an amount without a currency is invalid input.
- **Amount shape:** `{ "minor_units": 1050, "currency": "USD" }` means $10.50. Comparisons and limit checks only compare amounts of the **same** currency; mixed-currency comparison is an error.
- **Rounding rule:** limits and stored amounts are exact integer minor units (no rounding needed at rest). Where a computed value could produce sub-minor precision, round **half-even (banker's rounding)** to the currency's minor unit — chosen to avoid systematic upward bias across many operations.

### Identifiers

- All public IDs are **prefixed, opaque, and non-sequential** (UUIDv4 or ULID-with-random body) so IDs cannot be guessed or enumerated. Formats:
  - `card_id` → `card_<opaque>` (e.g. `card_01H`…)
  - `txn_id` → `txn_<opaque>`
  - `audit_id` → `aud_<opaque>`
- IDs are never derived from PAN, cardholder identity, or a monotonic counter. The prefix disambiguates type; the body reveals nothing about creation order or volume.

### Idempotency

- Every **state-changing** operation (issue, freeze, unfreeze, close, set/adjust limit) **requires** an `Idempotency-Key` header (client-generated, unique per logical intent).
- **Replay behavior:** the first request with a key is processed and its result + status stored against that key. A retry with the **same key and same request body** returns the **stored original result** (same status, same `card_id`) and emits **no** new state change and **no** new audit event. A retry with the same key but a **different body** returns a conflict error (`ERR_IDEMPOTENCY_MISMATCH`, 4xx). Keys are retained at least **24 h (assumed target)** — long enough to cover client/network retry windows.

### State Machine (MO-2, MO-3)

Card states: **`PENDING` → `ACTIVE` → `FROZEN` → `CLOSED`**.

Only these transitions are legal:

| From → To | Trigger | Notes |
| --- | --- | --- |
| `PENDING → ACTIVE` | issuance completes (token provisioned) | Card starts `PENDING`; becomes `ACTIVE` once upstream token is ready. |
| `ACTIVE → FROZEN` | cardholder freeze / fraud lock | Blocks new authorizations. |
| `FROZEN → ACTIVE` | cardholder unfreeze | Not allowed while a fraud lock is held. |
| `ACTIVE → CLOSED` | close | Terminal. |
| `FROZEN → CLOSED` | close | Terminal. |

- **`CLOSED` is terminal** — no outbound transitions, no limit changes, no spend.
- **Any transition not in this table is illegal:** it is **rejected with no state change**, **logged as an audit event**, and returns the stable error code **`ERR_INVALID_TRANSITION`** (4xx) with the attempted `from`/`to` in the message (no sensitive data).
- Self-transitions (e.g. freeze an already-`FROZEN` card) are treated as illegal transitions unless explicitly idempotent via the Idempotency-Key mechanism above.

### Error Semantics

- **Canonical error shape:** every error response is `{ "code": "ERR_...", "message": "<human-readable, safe>", "correlation_id": "<uuid>" }`. The `correlation_id` matches the audit event and logs for that request.
- **4xx = caller error** (bad input, invalid transition, authz denial, idempotency mismatch, rate limit). **5xx = system error** (downstream failure, unexpected exception). Callers may safely retry 5xx with the same Idempotency-Key; 4xx should not be blindly retried.
- **Never leak** full PAN, CVV, PII, internal stack traces, SQL, or hostnames in `message`. Detailed diagnostics go to server logs keyed by `correlation_id`, not to the client.
- **Stable codes** (non-exhaustive): `ERR_INVALID_TRANSITION`, `ERR_LIMIT_EXCEEDED`, `ERR_NOT_AUTHORIZED`, `ERR_CARD_NOT_FOUND`, `ERR_IDEMPOTENCY_MISMATCH`, `ERR_RATE_LIMITED`, `ERR_VALIDATION`, `ERR_DOWNSTREAM_UNAVAILABLE`.

### Time

- **UTC everywhere**, serialized as **ISO-8601** with a `Z` suffix (e.g. `2026-07-15T12:34:56Z`). No local time zones in storage or transport.
- **Audit timestamps are server-authoritative** — set by the service at commit time, never accepted from the client, so the trail can't be back-dated.

### Concurrency

- Each card carries a **`version` (integer)** field. All mutations use **optimistic locking**: a write includes the expected version; on mismatch the write is rejected with **`ERR_VERSION_CONFLICT`** (409) and no state change.
- This closes freeze/limit **races** — e.g. two concurrent limit adjustments, or a freeze racing a limit change: exactly one wins, the loser retries against the fresh state. Prevents lost updates without holding long DB locks in the authorization hot path.

## Context

### Beginning context (assumed present before work)

The following services/resources already exist and are consumed — they are **not** built here. Names are hypothetical but concrete so an implementer never guesses an interface:

- **`identity-auth-service`** — issues/validates access tokens, resolves `actor_id` + `role` for every request (source of truth for MO-8 authorization).
- **`funding-account-service`** — owns the cardholder's funding relationship; this feature links a card to a funding account by opaque reference only.
- **`card-network-gateway` (mock)** — the downstream authorization engine; exposes a mockable interface for provisioning a card token and receiving authorization/decline decisions. Out of scope to implement (see High-Level scope boundary); integrated behind an adapter.
- **`kms` (Key Management Service)** — provides/rotates encryption keys for field-level encryption at rest; no key material lives in app code or config.
- **`events-audit-sink`** — append-only stream/store that ingests audit events (the durable, tamper-evident destination for MO-7).
- **Repository state:** `homework-3/` contains `TASKS.md`, `specification-TEMPLATE-example.md`, and this evolving `specification.md`. No application source, schema, or tests exist yet.

### Ending context (artifacts/state after the work)

After implementing this spec, the following would exist:

- **Virtual Card Lifecycle service** exposing the lifecycle operations of MO-1…MO-6 (issue, freeze, unfreeze, close, set/adjust limit, list/filter transactions, ops/compliance read view) behind deny-by-default authorization.
- **Data stores:**
  - **Card store** — one record per card: `card_id`, masked reference (last-4 + token), status, `version`, limits, funding-account reference, timestamps. **No full PAN/CVV.**
  - **Transaction store** — transactions per card with amount (minor units + ISO-4217 currency), status, timestamps; supports date/status/amount filtering with capped pagination (MO-5).
  - **Limit configuration** — per-card per-transaction and rolling daily/monthly caps (MO-4).
- **Audit stream** — every state change and sensitive-read emitted to `events-audit-sink` as append-only, hash-chained events with the required fields (MO-7).
- **Adapters** — `card-network-gateway` adapter (fail-closed for spend, freeze independent of gateway health) and `kms`-backed field-level encryption for card metadata.
- **Enforced invariants** — the state machine, idempotency store, optimistic-locking version, canonical error shape, and rate limits described above are all live and testable.
- No physical-card, KYC, settlement/ledger, or network-authorization-engine code exists here — those remain external systems.

## Edge Cases & Failure Modes

**Cross-cutting requirement #1.** Edge cases are first-class and scoped to the virtual-card lifecycle. Each row gives concrete user-visible behavior (status/error code + what the user sees) and the exact audit event written plus who can read it. "Audit visible to" always includes ops/compliance and fraud read views (MO-6); cardholders never see other actors' audit events.

| Scenario | Trigger | Expected behavior (user-visible) | Audit / compliance implication | Guards |
| --- | --- | --- | --- | --- |
| **No cards yet** | Cardholder lists cards before issuing any | `200 OK` with empty array `[]` + `total: 0`; UI shows empty-state, not an error | No audit event (pure read of own empty set); read still rate-limited | MO-1, MO-5 |
| **Card with zero transactions** | Cardholder opens a newly-issued card's transactions | `200 OK`, empty `items: []`, `total: 0`, valid pagination cursor; not a 404 | No audit event (own non-sensitive read) | MO-5 |
| **Negative limit** | Set limit to `minor_units < 0` | `400` `ERR_VALIDATION` — "limit must be ≥ 0"; no change | `LIMIT_CHANGE_REJECTED` event (validation) with before/after unchanged; visible to ops/fraud | MO-4 |
| **Zero limit** | Set limit to `0` | `200 OK` — accepted as a valid "block all spend" state; all subsequent auths decline | `LIMIT_CHANGED` event `before → 0`; visible to ops/fraud | MO-4 |
| **Limit above product ceiling** | Set limit > configured product max | `400` `ERR_VALIDATION` — "exceeds maximum allowed"; no change | `LIMIT_CHANGE_REJECTED` event with attempted value; supports abuse review | MO-4 |
| **Limit below already-spent (rolling window)** | Lower daily cap below amount already spent today | `200 OK` — new cap accepted; **no clawback**; further spend blocked until window resets (auths decline `ERR_LIMIT_EXCEEDED`) | `LIMIT_CHANGED` event noting spent-vs-new-cap; visible to ops/fraud | MO-4 |
| **Non-integer / foreign-currency amount** | Limit sent as float, or currency ≠ card currency | `400` `ERR_VALIDATION` — "amount must be integer minor units in card currency"; no change | `LIMIT_CHANGE_REJECTED` (validation); no sensitive data logged | MO-4 |
| **Two limit changes race** | Concurrent adjusts on same card | First commits; second hits stale `version` → `409` `ERR_VERSION_CONFLICT`, caller refetches & retries | Exactly one `LIMIT_CHANGED` event; the loser writes no state, optional rejected event; no lost update | MO-4, MO-8 |
| **Freeze races an authorizing transaction** | Freeze fires while an auth is in flight | Freeze applied atomically on `version`; auth decisions after freeze-commit **decline**; in-flight auth already past decision point is honored but the card is now `FROZEN` | `CARD_FROZEN` event timestamped server-side; audit ordering shows freeze vs auth precedence for dispute review | MO-2 |
| **Double-submit issuance (same Idempotency-Key + body)** | Client retries create | Returns the **same** original `card_id`, same status; no second card created | Single `CARD_ISSUED` event only; replay produces no new event | MO-1 |
| **Issuance retry, same key, different body** | Retry with changed payload | `409` `ERR_IDEMPOTENCY_MISMATCH`; nothing created | `IDEMPOTENCY_CONFLICT` event; flags possible client bug/tampering | MO-1 |
| **Gateway timeout after card record created** | Card row written, `card-network-gateway` times out on token provisioning | Card stays **`PENDING`** (not `ACTIVE`); user sees "provisioning"; safe retry via same Idempotency-Key completes or a reconciliation job resolves; never returns an unusable "active" card | `CARD_ISSUE_PENDING` + later `CARD_ISSUED`/`CARD_ISSUE_FAILED`; partial-failure trail visible to ops | MO-1, reliability |
| **Audit sink down during a state change** | `events-audit-sink` unavailable mid-mutation | **Action fails closed:** the state change is **not committed** and returns `503` `ERR_DOWNSTREAM_UNAVAILABLE` (retry with same key). An un-audited state change is never allowed — auditability is a hard invariant | No orphaned/un-audited mutations; the *attempt* is logged locally with `correlation_id` for reconciliation | MO-7 |
| **Stale read after ops/limit change 1s ago** | Cardholder reads a limit ops changed ~1s prior | May briefly show old value; converges within read-after-write budget **≤ 5 s**; response carries `version`/`as_of` so clients detect staleness | The authoritative `LIMIT_CHANGED` event already recorded at change time; read itself is non-sensitive, no event | MO-4, MO-5 |
| **Support tries to change a limit** | Support role calls set-limit | `403` `ERR_NOT_AUTHORIZED`; no change | `AUTHZ_DENIED` event (actor, role=support, attempted action); SoD/least-privilege evidence | MO-8 |
| **Ops tries to view full PAN** | Ops requests unmasked PAN | `403`/masked response — full PAN is never returned to any role; only last-4 + token | `SENSITIVE_ACCESS_ATTEMPT`/`AUTHZ_DENIED` event; PCI-DSS control evidence | MO-6, MO-8 |
| **Cardholder tries to unfreeze a fraud-locked card** | Cardholder unfreeze on card with active fraud lock | `403` `ERR_NOT_AUTHORIZED` — "card is locked; contact support"; stays `FROZEN` | `UNFREEZE_DENIED_FRAUD_LOCK` event; visible to fraud/ops for case tracking | MO-2, MO-8 |
| **Rapid freeze/unfreeze toggling** | Many freeze↔unfreeze in short span | Each legal transition succeeds until the **≤ 10 req/min** write rate limit → `429` `ERR_RATE_LIMITED` | Every toggle audited; velocity pattern surfaced to fraud for review | MO-2, security |
| **Issuance velocity spike** | User creates cards past **≤ 5/hour** | `429` `ERR_RATE_LIMITED`; further issuance blocked for the window | Rate-limit hits + issuance counts audited; feeds fraud anomaly detection | MO-1, security |
| **card_id enumeration attempt** | Actor probes sequential/guessed `card_id`s | `404` `ERR_CARD_NOT_FOUND` for any card not owned/authorized (indistinguishable from non-existent — no oracle); opaque IDs make guessing infeasible | Repeated `CARD_NOT_FOUND`/`AUTHZ_DENIED` from one actor flagged as enumeration to fraud | MO-6, MO-8 |
| **Unfreeze a CLOSED card** | Transition `CLOSED → ACTIVE` | `409` `ERR_INVALID_TRANSITION` — "card is closed"; no change | `INVALID_TRANSITION` event with `from=CLOSED,to=ACTIVE`; visible to ops/fraud | MO-2, MO-3 |
| **Set limit on a PENDING card** | Limit change before issuance completes | `409` `ERR_INVALID_TRANSITION`/`ERR_VALIDATION` — "card not active"; no change | `LIMIT_CHANGE_REJECTED` event noting state=PENDING | MO-3, MO-4 |

## Low-Level Tasks

Decomposed, executable tasks. Each is tagged with the mid-level objective it serves. Tasks are ordered so foundational pieces (error shape, audit helper, authZ, idempotency, concurrency) exist before the endpoints that depend on them. Paths/names are hypothetical but concrete.

### 1. Canonical error model  [MO-8, cross-cutting]

- **Prompt to run:** "Create the canonical error type and HTTP mapper for the lifecycle service."
- **File/component:** `src/core/errors.ts`
- **Function/module:** `AppError`, `toErrorResponse()`
- **Details / constraints:** Error shape `{ code, message, correlation_id }`; stable code enum (`ERR_VALIDATION`, `ERR_INVALID_TRANSITION`, `ERR_LIMIT_EXCEEDED`, `ERR_NOT_AUTHORIZED`, `ERR_CARD_NOT_FOUND`, `ERR_IDEMPOTENCY_MISMATCH`, `ERR_VERSION_CONFLICT`, `ERR_RATE_LIMITED`, `ERR_DOWNSTREAM_UNAVAILABLE`); 4xx vs 5xx classification; message sanitizer strips PAN/PII/stack traces.
- **Acceptance criteria (DoD):**
  - [ ] Every error path returns exactly `{ code, message, correlation_id }`; no extra fields.
  - [ ] 4xx codes never map to 5xx and vice-versa (asserted per code).
  - [ ] Sanitizer test proves PAN-like/stack-trace input never appears in `message`.

### 2. Audit-event emit helper + hash-chaining  [MO-7]

- **Prompt to run:** "Create an append-only audit emitter that hash-chains events and writes to the events-audit-sink adapter."
- **File/component:** `src/audit/auditEmitter.ts`, `src/audit/sinkAdapter.ts`
- **Function/module:** `emitAudit(event)`, `chainHash(prev, event)`
- **Details / constraints:** Required fields `actor_id, role, action, target_card_id, before, after, timestamp(UTC), correlation_id`; server-authoritative timestamp; each event stores `prev_hash` + `hash`; no PAN/CVV in payload (masked refs only); emit is synchronous to the commit path (see Task 3).
- **Acceptance criteria (DoD):**
  - [ ] Emitted event contains all required fields; timestamp is server-set UTC ISO-8601 `Z`.
  - [ ] Tampering with any stored event breaks the hash chain and is detectable by a verifier.
  - [ ] Golden audit-event fixture matches the emitted schema byte-for-byte (contract check).

### 3. Transactional "mutate-then-audit" commit wrapper  [MO-7, reliability]

- **Prompt to run:** "Wrap all state changes so the mutation and its audit event commit atomically; fail closed if the audit sink is unavailable."
- **File/component:** `src/core/commit.ts`
- **Function/module:** `withAudit(mutationFn, auditFn)`
- **Details / constraints:** If audit persistence fails, roll back the mutation and return `503 ERR_DOWNSTREAM_UNAVAILABLE`; no un-audited state change may be committed (hard invariant).
- **Acceptance criteria (DoD):**
  - [ ] Simulated audit-sink outage → mutation is rolled back and `503 ERR_DOWNSTREAM_UNAVAILABLE` returned.
  - [ ] On success, exactly one audit event exists per committed mutation (no orphans, no duplicates).

### 4. Deny-by-default authZ middleware + role matrix  [MO-8]

- **Prompt to run:** "Create RBAC middleware enforcing the role→action matrix and ownership, denying anything unmapped."
- **File/component:** `src/authz/rbac.ts`, `src/authz/roleMatrix.ts`
- **Function/module:** `authorize(actor, action, resource)`
- **Details / constraints:** Resolve `actor_id`+`role` from `identity-auth-service`; cardholder restricted to own cards; SoD rule for limit increases; unmapped action → deny; every denial emits `AUTHZ_DENIED`.
- **Acceptance criteria (DoD):**
  - [ ] Each row of the role matrix has a passing allow/deny test.
  - [ ] Support→set-limit and cardholder→cross-cardholder-read both return `403 ERR_NOT_AUTHORIZED` and emit `AUTHZ_DENIED`.
  - [ ] An action absent from the matrix defaults to denied.

### 5. Idempotency layer  [MO-1, MO-2, MO-4]

- **Prompt to run:** "Create idempotency-key storage and middleware for all state-changing endpoints."
- **File/component:** `src/core/idempotency.ts`
- **Function/module:** `withIdempotency(key, requestHash, handler)`
- **Details / constraints:** Store result+status per key; same key+same body → replay stored result, no new state/audit; same key+different body → `409 ERR_IDEMPOTENCY_MISMATCH`; keys retained ≥ 24h.
- **Acceptance criteria (DoD):**
  - [ ] Double-submit with identical key+body returns the same `card_id` and creates no second card and no second audit event.
  - [ ] Same key + different body returns `409 ERR_IDEMPOTENCY_MISMATCH`.

### 6. Card store + optimistic-locking version  [MO-1, cross-cutting concurrency]

- **Prompt to run:** "Create the card data model and repository with a version field and field-level encryption for card metadata."
- **File/component:** `src/cards/cardRepo.ts`, `src/cards/cardModel.ts`
- **Function/module:** `CardRepository`, `Card`
- **Details / constraints:** Fields `card_id (card_ prefix, opaque)`, token, last-4, status, `version`, limits, funding ref, timestamps; **no PAN/CVV**; kms-backed field encryption; all writes compare-and-set on `version`.
- **Acceptance criteria (DoD):**
  - [ ] Stored record contains no full PAN/CVV under any code path.
  - [ ] Concurrent write with stale `version` returns `409 ERR_VERSION_CONFLICT` with no state change.

### 7. Issue-card endpoint (PENDING→ACTIVE)  [MO-1]

- **Prompt to run:** "Implement POST /cards to issue a virtual card via the card-network-gateway adapter."
- **File/component:** `src/cards/issueCard.ts`
- **Function/module:** `issueCard()`
- **Details / constraints:** Card starts `PENDING`; on gateway token success → `ACTIVE`; on gateway timeout → stays `PENDING`, resolvable via same idempotency key or reconciliation; returns masked card only.
- **Acceptance criteria (DoD):**
  - [ ] Happy path returns `201` with `card_id`, `status=ACTIVE`, last-4 only; emits `CARD_ISSUED`.
  - [ ] Gateway timeout leaves `status=PENDING` (never a false `ACTIVE`) and emits `CARD_ISSUE_PENDING`.

### 8. Card state machine module  [MO-2, MO-3]

- **Prompt to run:** "Implement the card state machine enforcing only the legal transitions from the spec."
- **File/component:** `src/cards/stateMachine.ts`
- **Function/module:** `transition(card, event)`
- **Details / constraints:** Legal set: `PENDING→ACTIVE`, `ACTIVE→FROZEN`, `FROZEN→ACTIVE`, `ACTIVE→CLOSED`, `FROZEN→CLOSED`; `CLOSED` terminal; illegal → `ERR_INVALID_TRANSITION` + audit, no state change.
- **Acceptance criteria (DoD):**
  - [ ] Every legal transition succeeds and bumps `version`.
  - [ ] Every illegal transition (e.g. `CLOSED→ACTIVE`) returns `409 ERR_INVALID_TRANSITION`, changes no state, and emits `INVALID_TRANSITION`.

### 9. Freeze / unfreeze endpoints + fraud-lock guard  [MO-2]

- **Prompt to run:** "Implement freeze and unfreeze endpoints on top of the state machine, honoring fraud locks."
- **File/component:** `src/cards/freeze.ts`
- **Function/module:** `freezeCard()`, `unfreezeCard()`
- **Details / constraints:** Freeze independent of gateway health; unfreeze denied while fraud lock held; freeze latency budget p95 < 300ms.
- **Acceptance criteria (DoD):**
  - [ ] Freeze on `ACTIVE` → `200`, `status=FROZEN`, emits `CARD_FROZEN`; new auths decline afterward.
  - [ ] Cardholder unfreeze on a fraud-locked card → `403 ERR_NOT_AUTHORIZED`, stays `FROZEN`, emits `UNFREEZE_DENIED_FRAUD_LOCK`.

### 10. Close-card endpoint  [MO-3]

- **Prompt to run:** "Implement POST /cards/{id}/close to terminally close a card."
- **File/component:** `src/cards/close.ts`
- **Function/module:** `closeCard()`
- **Details / constraints:** Allowed from `ACTIVE` or `FROZEN`; after close, all mutations/spend rejected.
- **Acceptance criteria (DoD):**
  - [ ] Close from `ACTIVE`/`FROZEN` → `200`, `status=CLOSED`, emits `CARD_CLOSED`.
  - [ ] Any subsequent limit change or transition on a `CLOSED` card is rejected.

### 11. Set/adjust limit with validation  [MO-4]

- **Prompt to run:** "Implement PUT /cards/{id}/limits with full monetary validation."
- **File/component:** `src/limits/setLimit.ts`, `src/limits/limitValidation.ts`
- **Function/module:** `setLimit()`, `validateAmount()`
- **Details / constraints:** Amount = integer minor units + ISO-4217 matching card currency; reject negative, non-integer, foreign currency, above product ceiling; zero allowed; lowering below already-spent allowed (no clawback); only on `ACTIVE` cards.
- **Acceptance criteria (DoD):**
  - [ ] Negative/above-ceiling/foreign-currency → `400 ERR_VALIDATION`, no change, emits `LIMIT_CHANGE_REJECTED`.
  - [ ] Valid change → `200`, new limit effective for subsequent auth checks, emits `LIMIT_CHANGED` with `before → after`.

### 12. Limit enforcement in authorization decision  [MO-4]

- **Prompt to run:** "Implement the limit-check used when the gateway asks for an authorization decision."
- **File/component:** `src/limits/enforce.ts`
- **Function/module:** `checkAgainstLimits()`
- **Details / constraints:** Compare same-currency amounts against per-transaction and rolling daily/monthly caps; exceed → decline with `ERR_LIMIT_EXCEEDED`; frozen/closed → decline.
- **Acceptance criteria (DoD):**
  - [ ] Spend that would exceed any active cap is declined with `ERR_LIMIT_EXCEEDED`.

### 13. Transaction store + list/filter/pagination  [MO-5]

- **Prompt to run:** "Implement GET /cards/{id}/transactions with filtering and stable pagination."
- **File/component:** `src/transactions/listTransactions.ts`, `src/transactions/txnRepo.ts`
- **Function/module:** `listTransactions()`
- **Details / constraints:** Filter by date range, status, amount range; newest-first; cursor pagination; page size default 25, cap 100; masked card refs only; read-after-write visibility ≤ 5s.
- **Acceptance criteria (DoD):**
  - [ ] Request with `page_size > 100` is clamped/rejected to the cap; default is 25.
  - [ ] Cursor pagination returns each transaction exactly once with no gaps/overlaps across pages.
  - [ ] Filters compose correctly (date ∧ status ∧ amount) and results are newest-first.

### 14. Ops/compliance read view  [MO-6]

- **Prompt to run:** "Implement the read-only cross-cardholder lookup for ops/compliance and fraud."
- **File/component:** `src/oversight/readView.ts`
- **Function/module:** `getCardOverview()`
- **Details / constraints:** Read-only; any card + transactions + audit trail; masked data only; every access emits `SENSITIVE_ACCESS`; no mutation endpoints exposed to these roles.
- **Acceptance criteria (DoD):**
  - [ ] Ops read of any card returns masked data and emits a `SENSITIVE_ACCESS` audit event.
  - [ ] No mutation is reachable through this view (all mutating verbs return `403 ERR_NOT_AUTHORIZED`).

### 15. Rate limiting per user/endpoint  [MO-1, MO-2, security]

- **Prompt to run:** "Add per-user rate limiting to sensitive writes, reads, and issuance."
- **File/component:** `src/core/rateLimit.ts`
- **Function/module:** `rateLimit(policy)`
- **Details / constraints:** Writes ≤ 10/min, reads ≤ 60/min, issuance ≤ 5/hour; exceed → `429 ERR_RATE_LIMITED`; counters per `actor_id`.
- **Acceptance criteria (DoD):**
  - [ ] Exceeding a policy returns `429 ERR_RATE_LIMITED`; under-limit requests pass.

### 16. card_id enumeration hardening  [MO-6, MO-8]

- **Prompt to run:** "Ensure unauthorized/unknown card lookups are indistinguishable and flagged."
- **File/component:** `src/authz/lookupGuard.ts`
- **Function/module:** `resolveCardOrDeny()`
- **Details / constraints:** Not-owned and non-existent both return `404 ERR_CARD_NOT_FOUND` (no oracle); repeated denials from one actor flagged to fraud.
- **Acceptance criteria (DoD):**
  - [ ] Owned-missing and unowned-existing cards return identical `404 ERR_CARD_NOT_FOUND` responses (no timing/shape oracle).

## Verification

**Cross-cutting requirement #2.** How each mid-level objective is known to be met, plus the workshop-required contract-testing layer that closes the "no contract testing → drift" anti-pattern.

### Objective → verification map

| Mid-level objective | How we know it's met | Verification method |
| --- | --- | --- |
| MO-1 Issuance | Card created `ACTIVE` with masked data; `CARD_ISSUED` emitted; PENDING on gateway timeout | Integration + contract (audit schema); reconciliation check for stuck PENDING |
| MO-2 Freeze/unfreeze | Legal transitions succeed, illegal rejected; fraud-lock guard holds; freeze p95 < 300ms | Contract (state machine) + unit + e2e; performance test for latency SLO |
| MO-3 Closure | `CLOSED` terminal; no post-close mutation | Contract (state machine) + unit |
| MO-4 Limits | Validation matrix enforced; new limit affects auth decisions; no clawback | Unit (validation) + integration (enforcement) + invalid-limits fixture |
| MO-5 Transactions | Filters compose; pagination stable; page-size cap; read-after-write ≤ 5s | Integration + e2e; pagination fixture; consistency test |
| MO-6 Oversight | Read-only cross-cardholder access; masked; `SENSITIVE_ACCESS` emitted | Integration + manual compliance review; role-matrix fixture |
| MO-7 Audit | Every state change → one hash-chained event; tamper-evident; fail-closed if sink down | Contract (audit schema) + integration (fail-closed) + golden fixture |
| MO-8 AuthZ/least-privilege | Deny-by-default; role matrix + SoD enforced | Contract (error shape) + unit per matrix row + security review |

### Contract tests (run in CI — the anti-drift gate)

Contract tests pin the stable interfaces so any drift fails the build, not production:

1. **State-machine contract** — asserts the exact legal transition set succeeds and **every** illegal transition is rejected with `409 ERR_INVALID_TRANSITION`. Adding/removing a transition fails the build until the spec's state-machine table and both sides are updated together.
2. **Error-shape contract** — for **every** error path, asserts the response is exactly `{ code, message, correlation_id }` with a stable `code` and correct 4xx/5xx class, and no PAN/PII/stack trace in `message`.
3. **Audit-event-schema contract** — asserts every state-changing action emits an event matching the golden schema (all required fields, server UTC timestamp, masked refs only, valid hash chain). A schema change fails CI until the spec + emitter + consumers are updated in lockstep.

**CI policy:** contract tests are blocking. A change to the state machine, error shape, or audit schema **fails the build** until `specification.md` and both producer/consumer sides are updated in the same change — this is the mechanism that keeps the spec a living document rather than drifting from code.

### Required fixtures / test data

- **`cards-by-state.fixture`** — sample cards in `PENDING`, `ACTIVE`, `FROZEN`, `CLOSED` (and one fraud-locked) for state-machine and guard tests.
- **`txn-pagination.fixture`** — a large, deterministic transaction set spanning date/status/amount ranges for filter + pagination + cap tests.
- **`invalid-limits.fixture`** — negative, zero, above-ceiling, non-integer, foreign-currency, and below-already-spent cases.
- **`role-matrix.fixture`** — actor/role/action tuples covering every allow/deny cell of the role matrix (incl. SoD second-approver).
- **`golden-audit-event.fixture`** — canonical serialized audit events per action type for the audit-schema contract test.

### Review checkpoints (gates before merge/release)

- **Security review gate** — sign-off that PAN/CVV never stored/logged, encryption in transit/at rest, authZ deny-by-default and SoD verified; blocks merge if unmet.
- **Compliance sign-off** — ops/compliance confirms audit completeness, 7-year retention, and GDPR erasure-vs-retention handling.
- **Audit-completeness check** — automated gate: **every state-changing task/endpoint MUST have a matching audit-event assertion**; a mutation path with no corresponding audit test fails the check.
