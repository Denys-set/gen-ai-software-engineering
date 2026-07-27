# Fix Summary — Batch 001

## Changes Made

No source file changes were made. The implementation plan
(`context/bugs/001/implementation-plan.md`, Status: **NO CHANGES REQUIRED**) determined that all
four seeded defects (BUG-1, BUG-2, SECURITY-1, SECURITY-2) are already fixed in the current
source, with BEFORE and AFTER snippets identical for every item. I independently re-verified each
BEFORE snippet against the current source verbatim before concluding no edits were needed.

### BUG-1 — Missing 404 on unknown note (already fixed, verified)
- File: `src/routes/notes.js`
- Location: `GET /:id` handler, lines 51-59
- Verification: Read the live file at lines 51-59. Content matches the plan's BEFORE/AFTER
  snippet exactly — the `if (!note)` guard returns `404` with `{ error: 'not found' }` before
  `res.json(note)` is ever reached on the falsy path.
- Action: none (no edit applied)
- Test result: PASS (`npm test` green after verification, no edit made)

### BUG-2 — ID collision after delete (already fixed, verified)
- File: `src/store.js`
- Location: module-level counter (line 11) and `createNote` (lines 21-28)
- Verification: Read the live file. `let nextId = 3;` at line 11 and `const id = nextId++;`
  inside `createNote` at lines 21-28 match the plan's BEFORE/AFTER snippets exactly. `_reset()`
  (lines 38-44) correctly restores `nextId = 3`, confirming the counter is independent of
  `notes.length`.
- Action: none (no edit applied)
- Test result: PASS (`npm test` green after verification, no edit made)

### SECURITY-1 — Reflected XSS in search (already fixed, verified)
- File: `src/routes/notes.js`
- Location: `escapeHtml` helper (lines 7-16) and `GET /search` handler (lines 30-49)
- Verification: Read the live file. `escapeHtml()` (lines 7-16) and the `/search` handler
  (lines 30-49) match the plan's BEFORE/AFTER snippets exactly. `q`, `n.title`, and `n.body` are
  all passed through `escapeHtml()` before interpolation into the HTML response.
- Action: none (no edit applied)
- Test result: PASS (`npm test` green after verification, no edit made)

### SECURITY-2 — Hardcoded secret + insecure comparison (already fixed, verified)
- File: `src/routes/notes.js`
- Location: `crypto` require (line 1), `ADMIN_TOKEN` constant (lines 18-20), and
  `DELETE /:id` handler (lines 72-85)
- Verification: Read the live file. `const crypto = require('crypto');` at line 1,
  `const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';` at line 20, and the `DELETE /:id` handler
  at lines 72-85 match the plan's BEFORE/AFTER snippets exactly. The token is sourced from an
  environment variable (no hardcoded secret), an empty configured token rejects all requests
  (`expected.length === 0`), and the comparison uses `crypto.timingSafeEqual` (constant-time)
  after a length pre-check.
- Action: none (no edit applied)
- Test result: PASS (`npm test` green after verification, no edit made)

## Overall Status
ALL FIXES ALREADY PRESENT — no source edits applied — tests green

## Test Run
```
npm test

> homework-4-notes-pipeline@1.0.0 test
> jest --runInBand

PASS tests/notes.fixed.test.js
PASS tests/notes.test.js

Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        0.344 s, estimated 1 s
Ran all test suites.
```

## Manual Verification
- BUG-1: `curl -i http://localhost:3000/api/notes/999` — expect `HTTP/1.1 404` with body
  `{"error":"not found"}`.
- BUG-2: `curl -X DELETE -H "x-admin-token: $ADMIN_TOKEN" http://localhost:3000/api/notes/2 && curl -X POST -H "Content-Type: application/json" -d '{"title":"New"}' http://localhost:3000/api/notes` —
  expect the newly created note to have `id: 3` (never a reused/collided id).
- SECURITY-1: `curl -s "http://localhost:3000/api/notes/search?q=<script>alert(1)</script>"` —
  expect the response body to contain the escaped string
  `&lt;script&gt;alert(1)&lt;/script&gt;`, not an executable `<script>` tag.
- SECURITY-2: `curl -i -X DELETE http://localhost:3000/api/notes/1` (no `x-admin-token` header, or
  a wrong one) — expect `HTTP/1.1 401` with body `{"error":"unauthorized"}`; only the correct
  `ADMIN_TOKEN` env value via the `x-admin-token` header succeeds.

## Changed Files
None. No source files were modified in this batch.

## References
- Plan: context/bugs/001/implementation-plan.md
- Verified research: context/bugs/001/research/verified-research.md
