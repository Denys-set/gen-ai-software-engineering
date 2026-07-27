const request = require('supertest');
const app = require('../src/app');
const store = require('../src/store');

// Baseline tests that describe the app's behavior BEFORE the pipeline runs.
// These pass against the seeded (buggy) code so `npm test` is green at the
// start. The Unit Test Generator agent adds regression tests for the fixes
// in tests/notes.fixed.test.js after the Bug Fixer applies changes.

beforeEach(() => store._reset());

describe('Notes API (baseline)', () => {
  test('GET /api/notes returns the seeded notes', async () => {
    const res = await request(app).get('/api/notes');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Welcome');
  });

  test('POST /api/notes creates a note', async () => {
    const res = await request(app)
      .post('/api/notes')
      .send({ title: 'Test', body: 'Body' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Test');
    expect(res.body.id).toBeDefined();
  });

  test('POST /api/notes requires a title', async () => {
    const res = await request(app).post('/api/notes').send({ body: 'no title' });
    expect(res.status).toBe(400);
  });

  test('GET /api/notes/:id returns a known note', async () => {
    const res = await request(app).get('/api/notes/1');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Welcome');
  });
});
