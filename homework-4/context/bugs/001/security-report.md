# Security Report — Batch 001

## Summary
- Reviewed: `src/routes/notes.js`, `src/store.js` (per `context/bugs/001/fix-summary.md`, which reports "no source changes" — these are the files it verified). Also inspected `package.json` and the resolved dependency tree.
- The four seeded items are all genuinely mitigated in current source (see Seeded-Item Verification below). The core changed code is clean with respect to injection, hardcoded secrets, and insecure comparison.
- Findings: CRITICAL 0 · HIGH 0 · MEDIUM 1 · LOW 2 · INFO 4

## Seeded-Item Verification
- **BUG-1 (404 guard) — MITIGATED.** `src/routes/notes.js:54-57` — `getNoteById` result is guarded by `if (!note) return res.status(404)...` before `res.json(note)`. Confirmed.
- **BUG-2 (id counter) — MITIGATED.** `src/store.js:11` `let nextId = 3;`, `src/store.js:24` `const id = nextId++;`, `src/store.js:43` `_reset()` restores `nextId = 3`. Counter is independent of `notes.length`; deleted ids are never reissued. Confirmed.
- **SECURITY-1 (reflected XSS) — MITIGATED.** `src/routes/notes.js:9-16` `escapeHtml()` escapes `& < > " '`. It is applied to `q` (`:45`), `n.title` and `n.body` (`:39`) before interpolation. Values land in HTML text/element content (not unquoted attributes or JS contexts), so escaping is adequate. Confirmed.
- **SECURITY-2 (hardcoded secret + insecure compare) — MITIGATED.** `src/routes/notes.js:20` token from `process.env.ADMIN_TOKEN` (no secret in source). `:73-79` uses `crypto.timingSafeEqual` with a length pre-check and fail-closed on empty configured token (`expected.length === 0`). Confirmed. (Minor timing note under LOW below.)

## Findings

### [MEDIUM] Missing type validation on POST body enables stored-crash / DoS
- File: `src/routes/notes.js:63-67`
- Issue: `POST /` only checks `if (!title)`. A non-string `title`/`body` (e.g. `{"title": 123}` or `{"title": {}}`) passes the truthiness check and is stored. Later `GET /search` (`:34`) calls `n.title.includes(q)` / `n.body.includes(q)`, which throws `TypeError` on non-strings, producing an unhandled 500 and breaking the search page for all users — a persisted denial-of-service triggerable by any unauthenticated caller.
- Remediation: Validate types before storing: reject unless `typeof title === 'string'` (and coerce/validate `body` to a string), plus enforce a reasonable max length. Alternatively coerce with `String(...)` in `createNote`, but explicit validation returning 400 is preferred.

### [LOW] Unauthenticated state-changing create endpoint
- File: `src/routes/notes.js:62-69`
- Issue: `POST /api/notes` has no authentication or authorization (unlike `DELETE`, which requires the admin token). Any client can create notes, enabling spam/unbounded growth of the in-memory store (memory-exhaustion vector). CSRF exposure is limited because the body is parsed only as `application/json`.
- Remediation: If create is meant to be public, add rate limiting and a max store size; if not, require the same admin token check used by `DELETE`.

### [LOW] Length pre-check in token comparison is a (negligible) timing side channel
- File: `src/routes/notes.js:75-79`
- Issue: The short-circuit on `provided.length !== expected.length` before `timingSafeEqual` reveals whether the supplied token matches the secret's length via response timing. This is standard practice and the impact is minimal, but it does leak the token length.
- Remediation: Acceptable as-is. To fully avoid it, hash both sides to a fixed width (e.g. `crypto.createHash('sha256')`) and `timingSafeEqual` the digests so lengths are always equal.

### [INFO] Vulnerable transitive dev-dependencies (jest → brace-expansion DoS)
- File: `package.json:16-19`
- Issue: `npm audit` reports 20 high-severity advisories, all transitive under `jest` (root cause `brace-expansion` ReDoS/DoS, GHSA-mh99-v99m-4gvg). These are devDependencies only and are not shipped/executed in production runtime.
- Remediation: Not urgent for runtime security. Run `npm audit fix` when convenient, or bump `jest` to a patched line; keep the fix out of the production dependency path.

### [INFO] No security response headers on server-rendered HTML
- File: `src/routes/notes.js:43-48`
- Issue: The `/search` HTML response sets no `Content-Security-Policy`, `X-Content-Type-Options`, or explicit charset. Escaping already blocks the seeded XSS, but a CSP is valuable defense-in-depth.
- Remediation: Add `helmet` (or manual headers) at the app level — at minimum `X-Content-Type-Options: nosniff` and a restrictive `Content-Security-Policy` such as `default-src 'none'`.

### [INFO] Loose id parsing in route params
- File: `src/store.js:17-18`, `src/store.js:31`
- Issue: `getNoteById`/`deleteNote` coerce `id` with `Number(id)`. Non-numeric ids become `NaN` and safely fall through to a 404/false, so there is no exploit, but there is no explicit "invalid id" validation.
- Remediation: Optional — validate that `req.params.id` matches `^\d+$` and return 400 for malformed ids for clearer contract behavior.

### [INFO] No rate limiting / request throttling
- File: `src/routes/notes.js` (all handlers)
- Issue: No throttling on any endpoint; combined with the open `POST` and the in-memory store, this allows resource-exhaustion abuse.
- Remediation: Add `express-rate-limit` (or equivalent) at the router/app level.

## Residual Risk / Recommendations
- The four seeded defects are confirmed fixed in the live source; no regressions were introduced (no source changes were made in this batch).
- Highest-value next action: add input-type validation on `POST /api/notes` (MEDIUM) to remove the stored-crash/DoS path through `/search`.
- Harden the deployment with security headers (helmet), rate limiting, and a bounded/persistent store instead of an unbounded in-memory array.
- Keep dev-dependency advisories triaged separately from runtime risk; they do not affect the shipped app but should be patched to keep CI clean.
