# Test Report — Batch 001

## Scope
Covers the four defects verified as already fixed in `context/bugs/001/fix-summary.md`, all in `src/routes/notes.js` and `src/store.js` (no source edits were made this batch — only regression tests were authored/verified):
- **BUG-1** — `GET /api/notes/:id` returns 404 for an unknown id (`src/routes/notes.js`)
- **BUG-2** — `createNote` uses a monotonic `nextId` counter so a deleted id is never reissued (`src/store.js`)
- **SECURITY-1** — `escapeHtml()` sanitizes `q`, `title`, `body` before interpolation into the `/search` HTML response (`src/routes/notes.js`)
- **SECURITY-2** — `DELETE /:id` requires a valid `x-admin-token` compared via `crypto.timingSafeEqual`, sourced from `process.env.ADMIN_TOKEN` (`src/routes/notes.js`)

Tests live in `tests/notes.fixed.test.js`, run in-process against `src/app` via `supertest`, with `store._reset()` in `beforeEach`. No tests were added for unrelated/unchanged behavior — that remains covered by `tests/notes.test.js`.

## Tests Added

| Defect | Test name | What it proves |
|--------|-----------|-----------------|
| BUG-1 | `returns 404 with a JSON error body for an id that does not exist` | `GET /api/notes/999` returns `404` + `{ error: 'not found' }` instead of a crash/200/undefined body |
| BUG-2 | `a note created after a delete does not reuse the deleted id` | Deleting id 2 then creating a note yields id `3` (never `2`); the deleted id is absent and the new id present in the subsequent list |
| SECURITY-1 | `a <script> payload in q is HTML-escaped, not reflected raw` | A `<script>alert(1)</script>` query param is rendered as `&lt;script&gt;...&lt;/script&gt;`, never as a raw executable tag |
| SECURITY-2 | `rejects a wrong token with 401 and leaves the note intact` | A wrong `x-admin-token` is rejected with `401` and the note is not deleted |
| SECURITY-2 | `rejects a missing token with 401` | No `x-admin-token` header also yields `401` |
| SECURITY-2 | `accepts the correct token and deletes the note` | The correct env-sourced token yields `204` and the note is subsequently `404` |

## FIRST Compliance
- **F (Fast):** All tests drive `src/app` in-process via `supertest(app)` — no `app.listen()`, no real network/disk/DB, no sleeps or timers. Full file runs in ~0.2s (6 tests, each 1-10ms).
- **I (Independent):** `beforeEach(() => store._reset())` restores the seeded store (ids 1, 2, `nextId = 3`) before every test; each test creates/deletes only the data it needs and does not depend on execution order. Verified by running `tests/notes.fixed.test.js` standalone — all 6 pass identically to the full-suite run.
- **R (Repeatable):** No assertions on exact timestamps or random values — `createdAt` is asserted only as `typeof ... === 'string'`. `ADMIN_TOKEN` is set explicitly at the top of the test file (`process.env.ADMIN_TOKEN = 'test-admin-token-123'`) before `require('../src/app')`, so the test controls its own env rather than relying on ambient state.
- **S (Self-validating):** Every test has explicit, specific `expect(...)` assertions (status codes, exact body shapes, e.g. `{ error: 'not found' }`, `{ error: 'unauthorized' }`, exact escaped-string containment/non-containment) — no console-log inspection, no vacuous "doesn't throw" checks.
- **T (Timely):** Each test targets exactly the changed/verified behavior named in `fix-summary.md` — one focused test (or small group) per defect, and each test would have failed against the pre-fix behavior described in the seeded bug context (missing 404 guard, `notes.length`-based id reuse, unescaped HTML interpolation, hardcoded/insecure token comparison).

## Test Run Results

Full suite:
```
> homework-4-notes-pipeline@1.0.0 test
> jest --runInBand

PASS tests/notes.fixed.test.js
PASS tests/notes.test.js

Test Suites: 2 passed, 2 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        0.396 s, estimated 1 s
Ran all test suites.
```

Standalone run of the fixed-defect suite (verbose, confirms independence):
```
PASS tests/notes.fixed.test.js
  BUG-1 fix — GET /api/notes/:id 404 on unknown id
    ✓ returns 404 with a JSON error body for an id that does not exist (10 ms)
  BUG-2 fix — ids are never reissued after a delete
    ✓ a note created after a delete does not reuse the deleted id (9 ms)
  SECURITY-1 fix — search results escape user input
    ✓ a <script> payload in q is HTML-escaped, not reflected raw (2 ms)
  SECURITY-2 fix — admin token required on DELETE /api/notes/:id
    ✓ rejects a wrong token with 401 and leaves the note intact (2 ms)
    ✓ rejects a missing token with 401 (1 ms)
    ✓ accepts the correct token and deletes the note (4 ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        0.213 s, estimated 1 s
Ran all test suites matching /tests\/notes.fixed.test.js/i.
```

Pass/fail counts: **10 passed / 0 failed** (6 new regression tests + 4 baseline tests).

## Overall Status
GREEN — all 4 defects (BUG-1, BUG-2, SECURITY-1, SECURITY-2) have passing regression tests that satisfy FIRST; baseline suite (`tests/notes.test.js`) remains green; no gaps identified against the scope defined in `fix-summary.md`.

## References
- Fixes covered: `context/bugs/001/fix-summary.md`
- Test file: `tests/notes.fixed.test.js`
- Baseline tests: `tests/notes.test.js` (unmodified)
