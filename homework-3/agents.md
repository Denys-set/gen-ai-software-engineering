# agents.md — AI Coding-Partner Guidelines

> Operating rules for any AI coding agent working on the **Virtual Card Lifecycle Management** project. Load this as context before generating or editing code. These rules exist so an AI partner behaves consistently in a regulated FinTech domain. They **complement** `specification.md` (the source of truth for *what* to build) and `CLAUDE.md` (always-on guardrails). If a rule here conflicts with `specification.md`, the spec wins — surface the conflict, don't silently pick.

---

## 0. Golden rules (read first)

1. **Never** log, print, persist, or return a full PAN or CVV. Last-4 + token only.
2. **Never** use floating-point for money. Integer minor units or `Decimal` only.
3. **Never** commit a state change without a matching audit event.
4. **Never** weaken an authZ or audit check to make a test, build, or demo pass.
5. When unsure, **choose the safe default** (deny / rollback / fail-closed) and **surface the ambiguity** — do not guess.

---

## 1. Tech-stack assumptions

Assume this stack unless the repo clearly shows otherwise:

- **Language/runtime:** TypeScript on Node.js (the spec's task paths are `src/**/*.ts`).
- **Money:** integer **minor units** (cents) or a fixed-precision `Decimal` library — **never** `number`-as-float for amounts. Always pair an amount with an **ISO-4217** currency.
- **Persistence:** PostgreSQL (relational, transactional — needed for the mutate-then-audit atomic commit and optimistic-locking `version`).
- **Encryption:** KMS-backed keys; field-level encryption for card metadata. No key material in code or config.
- **Audit sink:** append-only stream/store (`events-audit-sink`), consumed via an adapter.
- **External services (do not implement):** `identity-auth-service`, `funding-account-service`, `card-network-gateway` (mock), `kms`.

**Changing the stack:** do **not** swap language, database, money representation, or crypto approach on your own. **Ask first**, state why, and wait for confirmation. A stack change touches security and compliance posture — it is never a silent refactor.

---

## 2. Banking domain rules the agent MUST follow

These are non-negotiable. A change that breaks one is a defect even if tests pass.

- **PAN/CVV handling.** Full PAN and CVV never enter this service's storage, logs, traces, error messages, or responses. Expose only **last-4 + network token/reference**. (PCI-DSS intent — minimize cardholder data.)
- **Money.** All amounts are integer minor units or `Decimal`, always with an explicit ISO-4217 currency. Compare only same-currency amounts. Round **half-even** if precision is ever needed.
- **Idempotency.** Every state-changing operation (issue, freeze, unfreeze, close, set/adjust limit) requires an `Idempotency-Key`. Same key + same body → replay the stored result, no new state, no new audit event. Same key + different body → `409 ERR_IDEMPOTENCY_MISMATCH`.
- **Audit on every mutation.** Each state change emits an append-only, hash-chained audit event with `actor_id, role, action, target_card_id, before, after, timestamp(UTC), correlation_id`. If the audit sink is down, **roll back and fail closed** (`503 ERR_DOWNSTREAM_UNAVAILABLE`) — never commit an un-audited mutation.
- **State machine.** Enforce only the legal transitions: `PENDING→ACTIVE`, `ACTIVE→FROZEN`, `FROZEN→ACTIVE`, `ACTIVE→CLOSED`, `FROZEN→CLOSED`. `CLOSED` is terminal. Any illegal transition → reject with **`ERR_INVALID_TRANSITION`**, no state change, and an audit event.
- **Least privilege + Separation of Duties.** Authorize every action deny-by-default against the actor's role and ownership. Cardholders act only on their own cards. A sensitive limit increase cannot be requested and approved by the same actor.

---

## 3. Code style & architecture

- **Layered architecture.** Keep boundaries clean: `routes/handlers → domain logic → repository/adapters`. No SQL or crypto in handlers; no HTTP concerns in domain logic.
- **Error shape.** Every error returns exactly `{ code, message, correlation_id }` with a **stable** `code`. Classify 4xx (caller) vs 5xx (system) correctly. Messages must be safe — no PAN/PII/stack traces.
- **IDs.** Prefixed, opaque, non-sequential: `card_`, `txn_`, `aud_`. Never derive an ID from PAN, identity, or a counter.
- **Time.** UTC ISO-8601 with `Z` everywhere. Audit timestamps are server-authoritative — never accept a client timestamp for an audit event.
- **Concurrency.** Use the card `version` field + optimistic locking for all mutations; on mismatch return `409 ERR_VERSION_CONFLICT`.
- **Secrets.** No secrets, keys, tokens, or connection strings in source, comments, or fixtures. Reference them via config/KMS.
- **Naming.** `snake_case` for stored fields and audit payloads (matches spec fixtures); follow the surrounding code's convention within a module. No PAN-derived names.

---

## 4. Testing & verification expectations

- **Audit assertion per state change.** Every state-changing feature MUST include a test asserting the correct audit event is emitted (action, before→after, required fields). A mutation path with no audit assertion is incomplete.
- **Edge-case tests required.** Cover the relevant rows of the spec's Edge Cases table — invalid limits, illegal transitions, idempotent double-submit, version conflict, fail-closed on audit-sink outage, enumeration 404-parity.
- **Contract tests are blocking.** Keep the three contract suites green: state-machine transitions, canonical error shape, audit-event schema. If you change any of those interfaces, update `specification.md` and both sides in the **same** change — never route around a failing contract test.
- **Deterministic tests.** No wall-clock/random dependence — inject a clock and IDs. Tests must pass repeatably in CI.
- **Coverage bar.** Target **≥ 85%** line/branch on domain and authZ/audit code; 100% of state-machine transitions and error codes exercised. (Coverage is a floor, not the goal — the audit/edge assertions matter more than the number.)

---

## 5. Security & compliance constraints

- **PCI-DSS** — never store/log/return full PAN; never retain CVV post-authorization; encrypt in transit (TLS 1.2+) and at rest.
- **GDPR** — data minimization (store only what lifecycle needs); support access/export; erasure **redacts PII** but retains the immutable audit record until the retention window expires.
- **SOX / audit** — append-only, tamper-evident, hash-chained audit trail; 7-year retention; Separation of Duties on sensitive changes.
- **Reporting suspected exposure.** If you notice code that could log/leak PAN, CVV, PII, or secrets, **stop and flag it** — do not "fix" it by loosening a check.

---

## 6. Handling edge cases & uncertainty

- **Safe default wins.** When a path is ambiguous or an external call fails, prefer **deny / rollback / fail-closed** over "let it through."
- **Surface, don't guess.** If the spec doesn't cover a case (a new transition, an unspecified limit rule, an unclear role permission), state the ambiguity and propose options — do not invent behavior and bury it in code.
- **Never trade safety for green.** Do not weaken an authZ check, drop an audit event, widen a role, or store more card data to make a test pass, unblock a build, or hit a deadline. Fix the test or escalate instead.
- **Keep the spec living.** If reality forces a behavior change, update `specification.md` in the same change so the doc never drifts from the code.

---

## 7. Quick "before you open a PR" checklist

- [ ] No full PAN/CVV in code, logs, tests, fixtures, or responses.
- [ ] All money is integer minor units / `Decimal` with an ISO-4217 currency.
- [ ] Every state change is idempotent **and** emits an audit event (asserted in a test).
- [ ] Illegal transitions rejected with `ERR_INVALID_TRANSITION`; error shape is `{ code, message, correlation_id }`.
- [ ] AuthZ deny-by-default + SoD honored; no widened permissions.
- [ ] Contract tests green; spec updated if any contract changed.
- [ ] Times are UTC; IDs are opaque/prefixed; no secrets committed.
