# Implementation Plan — Batch 001 (Notes app)

## Status: NO CHANGES REQUIRED

Source of truth: `context/bugs/001/research/verified-research.md` (verdict **PASS —
Research Quality: VERIFIED, 7/7 claims, score 1.00**).

The verified research concludes that all four seeded defects (BUG-1, BUG-2, SECURITY-1,
SECURITY-2) are **already fixed** in the current source. I independently re-read the target
files (`src/routes/notes.js` lines 1-88 and `src/store.js` lines 1-46) and confirmed every
BEFORE snippet below matches the current source verbatim and already contains the correct fix.

Because the root causes are absent and the intended fixes are present, the correct minimal plan
is to make **no edits**. Each defect is documented below with its exact current (already-fixed)
code so the Bug Fixer can confirm state without guessing. For every item BEFORE and AFTER are
identical: applying them is a no-op and preserves the green baseline.

> Note on the previous version of this file: an earlier plan (based on a superseded research
> doc that assumed the bugs were still live) listed stale BEFORE snippets such as
> `const ADMIN_TOKEN = 'admin123';` and `const id = notes.length + 1;`. Those strings do **not**
> exist in the current source and a mechanical fixer would fail to match them. This version
> replaces that plan and reflects the current source exactly.
>
> If the caller intended live defects for the pipeline to fix, the seeding did not land in this
> tree — re-confirm scope with the caller before changing code. Do not introduce defects to
> "reproduce" them.

---

### BUG-1 — Missing 404 on unknown note (already fixed)
- Target file: `src/routes/notes.js`
- Location: `GET /api/notes/:id` handler, lines 51-59
- Original defect (`bug-context.md`): an unknown id returned `200 OK` with body `null` because
  `store.getNoteById`'s `undefined` was passed straight to `res.json`.
- BEFORE:
  ```js
  // GET /api/notes/:id  -> single note
  // Returns 404 with a JSON error body when the note id is unknown.
  router.get('/:id', (req, res) => {
    const note = store.getNoteById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'not found' });
    }
    res.json(note);
  });
  ```
- AFTER (identical — no change):
  ```js
  // GET /api/notes/:id  -> single note
  // Returns 404 with a JSON error body when the note id is unknown.
  router.get('/:id', (req, res) => {
    const note = store.getNoteById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'not found' });
    }
    res.json(note);
  });
  ```
- Rationale: The `if (!note)` guard returns `404` with `{ error: 'not found' }` before any
  `res.json(note)` on the falsy path — exactly the expected behavior. The defect is not present;
  no change is needed.

---

### BUG-2 — ID collision after delete (already fixed)
- Target file: `src/store.js`
- Location: module-level counter (line 11) and `createNote` (lines 21-28)
- Original defect (`bug-context.md`): new id computed as `notes.length + 1`, so a deleted id
  could be reused after the array shrank.
- BEFORE (counter, line 11):
  ```js
  // Monotonic id counter: only ever increases, so a deleted id is never reused.
  let nextId = 3;
  ```
- AFTER (identical — no change):
  ```js
  // Monotonic id counter: only ever increases, so a deleted id is never reused.
  let nextId = 3;
  ```
- BEFORE (`createNote`, lines 21-28):
  ```js
  function createNote({ title, body }) {
    // Ids come from a monotonically increasing counter so a deleted id is never
    // reissued, even when `notes.length` shrinks after a delete.
    const id = nextId++;
    const note = { id, title, body, createdAt: new Date().toISOString() };
    notes.push(note);
    return note;
  }
  ```
- AFTER (identical — no change):
  ```js
  function createNote({ title, body }) {
    // Ids come from a monotonically increasing counter so a deleted id is never
    // reissued, even when `notes.length` shrinks after a delete.
    const id = nextId++;
    const note = { id, title, body, createdAt: new Date().toISOString() };
    notes.push(note);
    return note;
  }
  ```
- Rationale: Ids are drawn from a monotonic `nextId++` counter independent of `notes.length`,
  so a deleted id is never reissued; `_reset()` (line 43) correctly restores `nextId = 3`. The
  defect is not present; no change is needed.

---

### SECURITY-1 — Reflected XSS in search (already fixed)
- Target file: `src/routes/notes.js`
- Location: `escapeHtml` helper (lines 7-16) and `GET /api/notes/search` handler (lines 27-49)
- Original defect (`bug-context.md`): `q` interpolated directly into the HTML response without
  escaping, allowing reflected `<script>` execution.
- BEFORE (`escapeHtml` helper, lines 7-16):
  ```js
  // Escape HTML special characters to prevent reflected/stored XSS when
  // interpolating user-supplied values into an HTML response.
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  ```
- AFTER (identical — no change):
  ```js
  // Escape HTML special characters to prevent reflected/stored XSS when
  // interpolating user-supplied values into an HTML response.
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  ```
- BEFORE (`/search` handler, lines 30-49):
  ```js
  router.get('/search', (req, res) => {
    const q = req.query.q || '';
    const results = store
      .listNotes()
      .filter((n) => n.title.includes(q) || n.body.includes(q));

    const rows = results
      .map(
        (n) =>
          `<li><strong>${escapeHtml(n.title)}</strong>: ${escapeHtml(n.body)}</li>`
      )
      .join('');

    res.send(
      `<!doctype html><html><body>` +
        `<h1>Results for ${escapeHtml(q)}</h1>` +
        `<ul>${rows}</ul>` +
        `</body></html>`
    );
  });
  ```
- AFTER (identical — no change):
  ```js
  router.get('/search', (req, res) => {
    const q = req.query.q || '';
    const results = store
      .listNotes()
      .filter((n) => n.title.includes(q) || n.body.includes(q));

    const rows = results
      .map(
        (n) =>
          `<li><strong>${escapeHtml(n.title)}</strong>: ${escapeHtml(n.body)}</li>`
      )
      .join('');

    res.send(
      `<!doctype html><html><body>` +
        `<h1>Results for ${escapeHtml(q)}</h1>` +
        `<ul>${rows}</ul>` +
        `</body></html>`
    );
  });
  ```
- Rationale: The query value `q` and both note fields (`n.title`, `n.body`) are passed through
  `escapeHtml()` before interpolation, which neutralizes `& < > " '`, so injected `<script>` is
  rendered inert. The defect is not present; no change is needed.

---

### SECURITY-2 — Hardcoded secret + insecure comparison (already fixed)
- Target file: `src/routes/notes.js`
- Location: `crypto` require (line 1), `ADMIN_TOKEN` constant (lines 18-20), and
  `DELETE /api/notes/:id` handler (lines 71-85)
- Original defect (`bug-context.md`): token hardcoded as `'admin123'` in source and compared
  with a loose, timing-unsafe `!=`.
- BEFORE (`ADMIN_TOKEN`, lines 18-20):
  ```js
  // SECURITY-2 fix: the admin token is read from an environment variable
  // (never committed to source) and compared using a constant-time check.
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
  ```
- AFTER (identical — no change):
  ```js
  // SECURITY-2 fix: the admin token is read from an environment variable
  // (never committed to source) and compared using a constant-time check.
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
  ```
- BEFORE (DELETE handler, lines 72-85):
  ```js
  router.delete('/:id', (req, res) => {
    const provided = Buffer.from(String(req.headers['x-admin-token'] || ''));
    const expected = Buffer.from(ADMIN_TOKEN);
    if (
      expected.length === 0 ||
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(provided, expected)
    ) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const ok = store.deleteNote(req.params.id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  });
  ```
- AFTER (identical — no change):
  ```js
  router.delete('/:id', (req, res) => {
    const provided = Buffer.from(String(req.headers['x-admin-token'] || ''));
    const expected = Buffer.from(ADMIN_TOKEN);
    if (
      expected.length === 0 ||
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(provided, expected)
    ) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const ok = store.deleteNote(req.params.id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  });
  ```
- Rationale: The token is read from `process.env.ADMIN_TOKEN` (no secret in source), an empty
  configured token rejects all requests (`expected.length === 0`), the length pre-check avoids
  `timingSafeEqual` throwing on unequal buffers, and the final comparison uses constant-time
  `crypto.timingSafeEqual` (required at line 1). The defect is not present; no change is needed.

---

## Test command

```
npm test
```

(from `package.json`: `jest --runInBand`)

## Expected result after all changes

No files are modified, so the baseline suite (`tests/notes.test.js`) remains green exactly as
it is today. All four seeded defects are already absent from the source, so none of them can
reproduce:

- BUG-1: `GET /api/notes/999` already returns `404`.
- BUG-2: deleting note 2 then creating a note yields id `3` (never a reused id).
- SECURITY-1: `GET /api/notes/search?q=<script>alert(1)</script>` returns escaped output
  (`&lt;script&gt;...`), so no markup executes.
- SECURITY-2: the token is read from `process.env.ADMIN_TOKEN` and compared in constant time.

If the caller expected live defects to fix, re-confirm the scope before proceeding — do not add
bugs to the codebase.
