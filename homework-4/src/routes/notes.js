const crypto = require('crypto');
const express = require('express');
const store = require('../store');

const router = express.Router();

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

// SECURITY-2 fix: the admin token is read from an environment variable
// (never committed to source) and compared using a constant-time check.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// GET /api/notes  -> list all notes
router.get('/', (req, res) => {
  res.json(store.listNotes());
});

// GET /api/notes/search?q=...  -> server-rendered search results page
// SECURITY-1 fix: user-supplied `q` (and note fields) are HTML-escaped via
// escapeHtml() before interpolation, preventing reflected/stored XSS.
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

// GET /api/notes/:id  -> single note
// Returns 404 with a JSON error body when the note id is unknown.
router.get('/:id', (req, res) => {
  const note = store.getNoteById(req.params.id);
  if (!note) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(note);
});

// POST /api/notes  -> create a note
router.post('/', (req, res) => {
  const { title, body } = req.body || {};
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  const note = store.createNote({ title, body: body || '' });
  res.status(201).json(note);
});

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

module.exports = router;
