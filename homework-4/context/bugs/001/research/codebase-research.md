# Codebase Research — Batch 001

## Summary
0 of 4 seeded defects are present in the current source — all four (BUG-1, BUG-2,
SECURITY-1, SECURITY-2) already contain the expected fix, each with an explicit
comment noting the fix. This research documents where each defect *would have been*
and verifies, with verbatim snippets, that the fixed behavior is what is actually in
the code today.

## Claims

### BUG-1 — NOT FOUND: `GET /api/notes/:id` already returns 404 for missing notes
- Reference: `src/routes/notes.js:51-59`
- Snippet:
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
- Why it causes the symptom: **It does not — the defect described in bug-context.md
  (`store.getNoteById` returning `undefined` and being passed straight to `res.json`,
  yielding `200`/`null`) is not present.** The handler at line 55 explicitly checks
  `if (!note)` and returns `res.status(404).json({ error: 'not found' })` at line 56
  before ever calling `res.json(note)` (line 58). Requesting an unknown id today
  correctly returns `404` with `{ "error": "not found" }`. Flagging as not-found
  rather than fabricating a buggy reference.

### BUG-2 — NOT FOUND: `createNote` already uses a monotonic `nextId` counter
- Reference: `src/store.js:11` and `src/store.js:21-28`
- Snippet:
  ```js
  // Monotonic id counter: only ever increases, so a deleted id is never reused.
  let nextId = 3;
  ```
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
- Why it causes the symptom: **It does not — the defect described in bug-context.md
  (`id = notes.length + 1`, colliding with an existing id after a delete shrinks the
  array) is not present.** The id is derived from the module-level `nextId` counter
  (declared at line 11, initialized to `3`) which is incremented (`nextId++`) on
  every call to `createNote` (line 24), independent of `notes.length`. `deleteNote`
  (lines 30-35) still calls `notes.splice(idx, 1)` and shrinks the array, but because
  id assignment no longer reads `notes.length`, a note created after a delete gets a
  fresh, never-before-used id rather than reusing an id still logically retired.
  Flagging as not-found rather than fabricating a buggy reference.

### SECURITY-1 — NOT FOUND: `q` is HTML-escaped before interpolation
- Reference: `src/routes/notes.js:9-16` (`escapeHtml` helper) and `src/routes/notes.js:30-49` (`/search` handler)
- Snippet:
  ```js
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  ```
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
- Why it causes the symptom: **It does not — the defect described in bug-context.md
  (raw `q` interpolated verbatim into `<h1>Results for ${q}</h1>` with no escaping,
  allowing `<script>` to be reflected and execute) is not present.** Every
  user-controlled value written into the HTML response — the query string at line 45
  (`escapeHtml(q)`) and each note's `title`/`body` in the results list (line 39,
  `escapeHtml(n.title)` / `escapeHtml(n.body)`) — is passed through the `escapeHtml`
  helper (lines 9-16), which replaces `&`, `<`, `>`, `"`, and `'` with their HTML
  entity equivalents. A request with `q=<script>alert(1)</script>` is reflected back
  as the literal text `&lt;script&gt;alert(1)&lt;/script&gt;`, which renders as
  inert text rather than executing. Flagging as not-found rather than fabricating a
  buggy reference.

### SECURITY-2 — NOT FOUND: token is read from env and compared with `crypto.timingSafeEqual`
- Reference: `src/routes/notes.js:20` (constant) and `src/routes/notes.js:72-85` (handler)
- Snippet:
  ```js
  // SECURITY-2 fix: the admin token is read from an environment variable
  // (never committed to source) and compared using a constant-time check.
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
  ```
  ```js
  // DELETE /api/notes/:id  -> delete a note (admin only)
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
- Why it causes the symptom: **It does not — the defect described in bug-context.md
  (`const ADMIN_TOKEN = 'admin123'` hardcoded in source, compared with loose `!=`)
  is not present.** `ADMIN_TOKEN` (line 20) is read from `process.env.ADMIN_TOKEN`
  (falling back to an empty string, not a literal secret) rather than being a
  hardcoded string literal. The `DELETE /:id` handler (lines 72-85) converts both
  the provided header and the expected token to `Buffer`s and only proceeds to
  `crypto.timingSafeEqual` (line 78) — a constant-time comparison — after first
  rejecting when `expected.length === 0` (no token configured) or when the buffer
  lengths differ (line 76-77, which itself must be checked before calling
  `timingSafeEqual`, since that function throws on mismatched buffer lengths rather
  than being unsafe). No loose `!=` comparison against a hardcoded secret remains.
  Flagging as not-found rather than fabricating a buggy reference.

## Files inspected
- `src/routes/notes.js` (lines 1-87, full file)
- `src/store.js` (lines 1-46, full file)
- `context/bugs/001/bug-context.md` (lines 1-87, full file)
- `context/bugs/001/research/codebase-research.md` (prior version, superseded by this document)
- `context/bugs/001/research/verified-research.md` (prior verifier output, for context on prior findings)
