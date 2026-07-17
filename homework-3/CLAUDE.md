# CLAUDE.md — Always-on rules for the Virtual Card Lifecycle project (FinTech; PCI/SOX/GDPR-sensitive). Read `specification.md` for detail, `agents.md` for the full rationale. These are the non-negotiable defaults.

## Naming
- **Do** prefix opaque IDs: `card_…`, `txn_…`, `aud_…`. Do generate them as UUIDv4/ULID.
- **Do** use `snake_case` for DB columns, JSON fields, and audit payloads; `camelCase` for in-code TS variables/functions.
- **Don't** put a PAN, CVV, or any card-number fragment beyond last-4 in a variable, field, file, or log key name.
- **Don't** derive an ID from PAN, identity, or a counter.

## Prefer these patterns
- **Do** go through the **repository layer** for all persistence — no SQL/crypto in handlers.
- **Do** make every state-changing op **idempotent** via `Idempotency-Key` (replay → stored result, no new state/audit).
- **Do** use **optimistic locking** on the card `version`; conflict → `409 ERR_VERSION_CONFLICT`.
- **Do** return the **canonical error shape** `{ code, message, correlation_id }` with a stable `code`.
- **Do** call the **audit-emit helper on every state change** — inside the same atomic commit as the mutation.

## Avoid these
- **Don't** use `float`/`double` for money — integer minor units or `Decimal`, always with an ISO-4217 currency.
- **Don't** store or persist PAN or CVV — last-4 + token only.
- **Don't** use sequential/guessable IDs.
- **Don't** log request/response bodies, headers, or anything that could carry PAN/PII.
- **Don't** swallow errors (no empty `catch`) — surface with the canonical shape and a `correlation_id`.
- **Don't** weaken, skip, or comment-out an authZ or audit check for convenience, a test, or a demo.

## FinTech-sensitive defaults
- **Authorization:** deny-by-default; cardholders act only on their own cards; enforce Separation of Duties on limit increases.
- **Time:** UTC ISO-8601 (`…Z`) everywhere; audit timestamps are server-set, never client-supplied.
- **Logs:** redact/omit PII; log by `correlation_id`, not by cardholder data.
- **Card-network gateway:** **fail closed** — on timeout/outage, decline spend and keep the card `PENDING`/current state; never approve blind. Freeze must work even when the gateway is down.
- **Audit sink down:** roll back the mutation and return `503 ERR_DOWNSTREAM_UNAVAILABLE` — never commit an un-audited state change.
- **State machine:** only legal transitions (`PENDING→ACTIVE→FROZEN⇄ACTIVE`, `→CLOSED` terminal); illegal → `ERR_INVALID_TRANSITION`, no state change.

## Before you commit
- [ ] **Audit:** does every state change emit an audit event, with a test asserting it?
- [ ] **PAN safe:** no full PAN/CVV in code, logs, errors, fixtures, or responses?
- [ ] **Money:** integer minor units / `Decimal` + explicit currency, no floats?
- [ ] **Idempotent:** state-changing op keyed and replay-safe?
- [ ] **Edge case:** test for the relevant edge (invalid limit, illegal transition, version conflict, fail-closed)?
- [ ] **Error + authZ:** canonical error shape, correct 4xx/5xx, deny-by-default intact?
