# Bug Context — Batch 001 (Notes app)

Seeded defects in the sample Notes app for the 4-agent pipeline to research, verify, plan,
fix, security-review, and test. Two functional bugs + two security issues.

Run the app for reproduction: `npm install && npm start` (listens on http://localhost:3000).
Baseline tests (`npm test`) are green **before** the pipeline runs — none of these defects
break the baseline suite; they surface only on the untested paths below.

---

## BUG-1 — Missing 404 on unknown note

- **Type:** Functional / incorrect status code
- **File:** `src/routes/notes.js` — `GET /api/notes/:id` handler
- **Symptom:** Requesting a non-existent id returns `200 OK` with a body of `null` instead of
  `404 Not Found`. `store.getNoteById` returns `undefined`, which the handler passes straight to
  `res.json`.
- **Reproduce:**
  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/notes/999   # prints 200
  curl -s http://localhost:3000/api/notes/999                                    # prints null
  ```
- **Expected:** `404` with a JSON error body, e.g. `{ "error": "not found" }`.

---

## BUG-2 — ID collision after delete

- **Type:** Functional / data integrity
- **File:** `src/store.js` — `createNote`
- **Symptom:** The new id is computed as `notes.length + 1`. After a note is deleted the array
  length no longer maps to the highest id, so a newly created note can reuse an existing id.
- **Reproduce:**
  ```bash
  # delete note 2, then create a new note — it is assigned id 2 again
  curl -s -X DELETE -H "x-admin-token: admin123" http://localhost:3000/api/notes/2
  curl -s -X POST -H "Content-Type: application/json" -d '{"title":"New"}' \
    http://localhost:3000/api/notes                                              # id is 2 again
  ```
- **Expected:** IDs are monotonic and unique for the life of the process — a deleted id is never
  reissued (track a `nextId` counter that only increases).

---

## SECURITY-1 — Reflected XSS in search

- **Type:** Security / Cross-Site Scripting (reflected)
- **File:** `src/routes/notes.js` — `GET /api/notes/search`
- **Symptom:** The `q` query parameter is interpolated directly into an HTML response without
  escaping, so arbitrary markup/script is reflected back and executes in the browser.
- **Reproduce:**
  ```bash
  curl -s "http://localhost:3000/api/notes/search?q=<script>alert(1)</script>"
  # -> <h1>Results for <script>alert(1)</script></h1>
  ```
- **Expected:** User input is HTML-escaped before rendering (or the endpoint returns JSON), so
  `<script>` cannot execute.

---

## SECURITY-2 — Hardcoded secret + insecure comparison

- **Type:** Security / hardcoded credential + weak auth check
- **File:** `src/routes/notes.js` — module constant `ADMIN_TOKEN` and the `DELETE /api/notes/:id`
  handler
- **Symptom:** The admin token is hardcoded in source (`'admin123'`) and compared with a loose,
  non-constant-time `!=`. The secret is committed to the repo and the comparison is timing-unsafe.
- **Reproduce:** The token is visible in `src/routes/notes.js`; anyone reading the source can
  delete notes:
  ```bash
  curl -s -X DELETE -H "x-admin-token: admin123" http://localhost:3000/api/notes/1 -w "%{http_code}\n"
  ```
- **Expected:** The token is read from an environment variable (e.g. `process.env.ADMIN_TOKEN`),
  not hardcoded, and compared with a constant-time comparison (`crypto.timingSafeEqual`).

---

## Summary

| ID | Type | File | Severity intent |
|----|------|------|-----------------|
| BUG-1 | Missing 404 | `src/routes/notes.js` | functional |
| BUG-2 | ID collision | `src/store.js` | functional |
| SECURITY-1 | Reflected XSS | `src/routes/notes.js` | HIGH |
| SECURITY-2 | Hardcoded secret + weak compare | `src/routes/notes.js` | HIGH |
