// In-memory notes store for the sample Notes app.
// NOTE: This file intentionally contains a seeded bug (see BUG-2) for the
// agent pipeline to discover and fix. See context/bugs/001/bug-context.md.

let notes = [
  { id: 1, title: 'Welcome', body: 'Your first note', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, title: 'Groceries', body: 'Milk, eggs, bread', createdAt: '2026-01-02T00:00:00.000Z' },
];

// Monotonic id counter: only ever increases, so a deleted id is never reused.
let nextId = 3;

function listNotes() {
  return notes;
}

function getNoteById(id) {
  return notes.find((n) => n.id === Number(id));
}

function createNote({ title, body }) {
  // Ids come from a monotonically increasing counter so a deleted id is never
  // reissued, even when `notes.length` shrinks after a delete.
  const id = nextId++;
  const note = { id, title, body, createdAt: new Date().toISOString() };
  notes.push(note);
  return note;
}

function deleteNote(id) {
  const idx = notes.findIndex((n) => n.id === Number(id));
  if (idx === -1) return false;
  notes.splice(idx, 1);
  return true;
}

// Test helper: reset the store to a known state between tests.
function _reset() {
  notes = [
    { id: 1, title: 'Welcome', body: 'Your first note', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 2, title: 'Groceries', body: 'Milk, eggs, bread', createdAt: '2026-01-02T00:00:00.000Z' },
  ];
  nextId = 3;
}

module.exports = { listNotes, getNoteById, createNote, deleteNote, _reset };
