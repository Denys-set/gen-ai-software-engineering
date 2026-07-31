---
name: unit-tests-FIRST
description: The FIRST principles (Fast, Independent, Repeatable, Self-validating, Timely) for writing trustworthy unit tests, with a checkable rule per letter, a pre-submit checklist, and a Jest example. Use when generating unit tests for changed code so every test is fast, deterministic, and self-validating.
---

# Unit Tests — FIRST

Trustworthy unit tests satisfy **FIRST**: **F**ast, **I**ndependent, **R**epeatable,
**S**elf-validating, **T**imely. A generated test that violates any letter is not done — fix it
or drop it. Tests must cover **only the new/changed code** listed in
`context/bugs/001/fix-summary.md`, never pre-existing behavior.

---

## F — Fast

Tests run in milliseconds so the whole suite is cheap to run on every change.

- **No real I/O:** no network calls, no disk reads/writes, no real database.
- **No sleeps / timers:** never `setTimeout`, `await sleep()`, or polling to "wait for" something.
- **In-process:** drive the Express app with `supertest(app)` — pass the app object, do **not**
  `app.listen()` and hit a live port.
- **Rule of thumb:** an individual test completes in < 50 ms; the file in < 1 s.

## I — Independent

Any test can run alone, in any order, and pass.

- **Reset shared state in `beforeEach`** (e.g. `store._reset()`), so leftover data from one test
  never leaks into the next.
- **No ordering dependencies:** test B must not rely on test A having created a record. If B needs
  a record, B creates it.
- **No shared mutable module-level fixtures** that tests mutate without resetting.

## R — Repeatable

Same input → same result, every run, on every machine.

- **Deterministic only:** no reliance on `Date.now()`, `new Date()`, `Math.random()`, timezone,
  locale, or network latency without controlling them (inject/stub or assert on shape, not exact
  value). E.g. assert `typeof note.createdAt === 'string'`, not a specific timestamp.
- **No environment coupling:** a test that reads `process.env` must set it explicitly in the test.
- Re-running the suite 100× yields 100 identical results.

## S — Self-validating

The test decides pass/fail by itself — no human eyeballing.

- **Explicit assertions** (`expect(...)`) with a clear boolean outcome. Every test has at least one
  meaningful assertion.
- **No `console.log`-and-inspect**, no commented-out expectations, no test that always passes.
- Assert the **specific** behavior (status code, body shape, exact field), not just "no throw".

## T — Timely

Written now, against the code that just changed.

- **Source of truth:** read `context/bugs/001/fix-summary.md` and the files it lists as changed.
- **One regression test per fixed defect** — a test that would have **failed before** the fix and
  **passes after** (that is what proves the fix and guards against reintroduction).
- **Scope discipline:** do NOT add tests for unrelated, unchanged code. New/changed behavior only.

---

## Pre-submit checklist

A generated test file ships only when every answer is **yes**:

| Letter | Check | Y/N |
|--------|-------|-----|
| **F** | No network/disk/db, no sleeps/timers, `supertest(app)` (no live port)? | ☐ |
| **I** | Shared state reset in `beforeEach`; every test passes when run alone / reordered? | ☐ |
| **R** | No uncontrolled `Date.now`/`random`/env/timezone; deterministic across runs? | ☐ |
| **S** | Every test has explicit `expect(...)` assertions; no log-inspection; asserts specifics? | ☐ |
| **T** | Covers only changed code from fix-summary.md; one regression test per fixed defect? | ☐ |

---

## Jest example (satisfies all five)

```js
const request = require('supertest');
const app = require('../src/app');       // F: in-process, no live port
const store = require('../src/store');

beforeEach(() => store._reset());         // I: reset shared state before each test

describe('BUG-1 fix — 404 on unknown note', () => {
  test('GET /api/notes/:id returns 404 when the note does not exist', async () => {
    const res = await request(app).get('/api/notes/999');
    expect(res.status).toBe(404);         // S: explicit, specific assertion
    // R: no timestamps/random involved; T: targets the exact changed behavior
  });
});

describe('BUG-2 fix — ids are unique after delete', () => {
  test('a new note does not reuse a deleted id', async () => {
    await request(app).delete('/api/notes/2').set('x-admin-token', process.env.ADMIN_TOKEN || 'test-token');
    const created = await request(app).post('/api/notes').send({ title: 'New' });
    expect(created.body.id).not.toBe(2);  // S: asserts the specific invariant
    expect(typeof created.body.createdAt).toBe('string'); // R: assert shape, not exact time
  });
});
```

Each test is fast (in-process), independent (`beforeEach` reset, self-contained data), repeatable
(no exact time/random assertions), self-validating (explicit `expect`), and timely (one regression
test per fixed defect, changed code only).
