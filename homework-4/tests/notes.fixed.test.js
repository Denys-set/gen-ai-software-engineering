// Regression tests for the fixes described in context/bugs/001/fix-summary.md.
// One test (or small group) per fixed defect: BUG-1, BUG-2, SECURITY-1, SECURITY-2.
//
// SECURITY-2 requires ADMIN_TOKEN to be configured. `src/routes/notes.js` reads
// `process.env.ADMIN_TOKEN` once, at module-load time, so we set it explicitly
// *before* requiring the app in this file (R: no environment coupling — the
// test controls the env var itself instead of relying on ambient state).
process.env.ADMIN_TOKEN = 'test-admin-token-123';

const request = require('supertest');
const app = require('../src/app');
const store = require('../src/store');

beforeEach(() => store._reset()); // I: reset shared store state before every test

describe('BUG-1 fix — GET /api/notes/:id 404 on unknown id', () => {
  test('returns 404 with a JSON error body for an id that does not exist', async () => {
    const res = await request(app).get('/api/notes/999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });
});

describe('BUG-2 fix — ids are never reissued after a delete', () => {
  test('a note created after a delete does not reuse the deleted id', async () => {
    const del = await request(app)
      .delete('/api/notes/2')
      .set('x-admin-token', process.env.ADMIN_TOKEN);
    expect(del.status).toBe(204);

    const created = await request(app)
      .post('/api/notes')
      .send({ title: 'New note' });

    expect(created.status).toBe(201);
    expect(created.body.id).not.toBe(2);
    expect(created.body.id).toBe(3); // deterministic: seeded ids are 1,2, nextId starts at 3
    expect(typeof created.body.createdAt).toBe('string'); // R: assert shape, not exact time

    const list = await request(app).get('/api/notes');
    const ids = list.body.map((n) => n.id);
    expect(ids).not.toContain(2);
    expect(ids).toContain(3);
  });
});

describe('SECURITY-1 fix — search results escape user input', () => {
  test('a <script> payload in q is HTML-escaped, not reflected raw', async () => {
    const payload = '<script>alert(1)</script>';
    const res = await request(app)
      .get('/api/notes/search')
      .query({ q: payload });

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('SECURITY-2 fix — admin token required on DELETE /api/notes/:id', () => {
  test('rejects a wrong token with 401 and leaves the note intact', async () => {
    const res = await request(app)
      .delete('/api/notes/1')
      .set('x-admin-token', 'wrong-token');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });

    const stillThere = await request(app).get('/api/notes/1');
    expect(stillThere.status).toBe(200);
  });

  test('rejects a missing token with 401', async () => {
    const res = await request(app).delete('/api/notes/1');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  test('accepts the correct token and deletes the note', async () => {
    const res = await request(app)
      .delete('/api/notes/1')
      .set('x-admin-token', process.env.ADMIN_TOKEN);

    expect(res.status).toBe(204);

    const after = await request(app).get('/api/notes/1');
    expect(after.status).toBe(404);
  });
});
