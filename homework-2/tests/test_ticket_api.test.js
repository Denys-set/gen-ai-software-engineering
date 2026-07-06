import request from 'supertest';
import { createApp } from '../src/app.js';
import { ticketRepository } from '../src/repository/ticketRepository.js';

const app = createApp();

const VALID = {
  customer_id: 'C1',
  customer_email: 'alice@example.com',
  customer_name: 'Alice',
  subject: 'Cannot login to my account',
  description: 'I have been locked out and cannot access my dashboard after multiple attempts',
};

beforeEach(() => ticketRepository.clear());

// ─── CREATE ────────────────────────────────────────────────────────────────
describe('POST /tickets', () => {
  it('creates a ticket and returns 201 with _links', async () => {
    const res = await request(app).post('/tickets').send(VALID);
    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.customer_email).toBe(VALID.customer_email);
    expect(res.body.status).toBe('new');
    expect(res.body._links.self.href).toMatch(/\/tickets\//);
    expect(res.body._links.update.method).toBe('PUT');
    expect(res.body._links.delete.method).toBe('DELETE');
    expect(res.body._links.auto_classify.method).toBe('POST');
    expect(res.body._links.classification_log.method).toBe('GET');
  });

  it('returns 422 for missing required fields', async () => {
    const res = await request(app).post('/tickets').send({ customer_id: 'X' });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('ValidationError');
    expect(res.body.details).toBeInstanceOf(Array);
  });

  it('returns 422 for invalid email', async () => {
    const res = await request(app).post('/tickets').send({ ...VALID, customer_email: 'bad-email' });
    expect(res.status).toBe(422);
  });

  it('auto-classifies when ?auto_classify=true', async () => {
    const res = await request(app)
      .post('/tickets?auto_classify=true')
      .send({ ...VALID, subject: 'App crashes on login', description: 'The app crashes every time I try to sign in with 2fa' });
    expect(res.status).toBe(201);
    expect(res.body.classification_confidence).toBeGreaterThan(0);
    expect(res.body.manually_overridden).toBe(false);
  });

  it('does NOT auto-classify when flag is absent', async () => {
    const res = await request(app).post('/tickets').send(VALID);
    expect(res.status).toBe(201);
    expect(res.body.classification_confidence).toBeNull();
  });
});

// ─── LIST ─────────────────────────────────────────────────────────────────
describe('GET /tickets', () => {
  it('returns empty list with collection _links', async () => {
    const res = await request(app).get('/tickets');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.tickets).toEqual([]);
    expect(res.body._links.self.href).toBe('/tickets');
    expect(res.body._links.create.method).toBe('POST');
    expect(res.body._links.import.method).toBe('POST');
  });

  it('returns all tickets and each has _links', async () => {
    await request(app).post('/tickets').send(VALID);
    await request(app).post('/tickets').send({ ...VALID, customer_id: 'C2', customer_email: 'b@b.com' });
    const res = await request(app).get('/tickets');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.tickets[0]._links).toBeDefined();
  });

  it('filters by status', async () => {
    await request(app).post('/tickets').send(VALID);
    const resNew = await request(app).get('/tickets?status=new');
    expect(resNew.body.count).toBe(1);
    const resResolved = await request(app).get('/tickets?status=resolved');
    expect(resResolved.body.count).toBe(0);
  });

  it('filters by category', async () => {
    await request(app).post('/tickets').send({ ...VALID, category: 'bug_report' });
    await request(app).post('/tickets').send({ ...VALID, customer_id: 'C2', customer_email: 'b@b.com', category: 'billing_question' });
    const res = await request(app).get('/tickets?category=bug_report');
    expect(res.body.count).toBe(1);
    expect(res.body.tickets[0].category).toBe('bug_report');
  });

  it('filters by priority', async () => {
    await request(app).post('/tickets').send({ ...VALID, priority: 'urgent' });
    const res = await request(app).get('/tickets?priority=urgent');
    expect(res.body.count).toBe(1);
  });
});

// ─── GET BY ID ────────────────────────────────────────────────────────────
describe('GET /tickets/:id', () => {
  it('returns ticket with _links', async () => {
    const created = await request(app).post('/tickets').send(VALID);
    const res = await request(app).get(`/tickets/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body._links.self.href).toBe(`/tickets/${created.body.id}`);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/tickets/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFoundError');
  });
});

// ─── UPDATE ───────────────────────────────────────────────────────────────
describe('PUT /tickets/:id', () => {
  it('updates ticket and returns 200 with _links', async () => {
    const created = await request(app).post('/tickets').send(VALID);
    const res = await request(app)
      .put(`/tickets/${created.body.id}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    expect(res.body._links).toBeDefined();
  });

  it('sets manually_overridden=true when category is changed', async () => {
    const created = await request(app).post('/tickets').send(VALID);
    const res = await request(app)
      .put(`/tickets/${created.body.id}`)
      .send({ category: 'bug_report', priority: 'high' });
    expect(res.body.manually_overridden).toBe(true);
    expect(res.body.category).toBe('bug_report');
  });

  it('does NOT set manually_overridden for status-only update', async () => {
    const created = await request(app).post('/tickets').send(VALID);
    const res = await request(app)
      .put(`/tickets/${created.body.id}`)
      .send({ status: 'in_progress' });
    expect(res.body.manually_overridden).toBe(false);
  });

  it('sets resolved_at when status transitions to resolved', async () => {
    const created = await request(app).post('/tickets').send(VALID);
    const res = await request(app)
      .put(`/tickets/${created.body.id}`)
      .send({ status: 'resolved' });
    expect(res.body.resolved_at).not.toBeNull();
  });

  it('returns 422 for invalid update body', async () => {
    const created = await request(app).post('/tickets').send(VALID);
    const res = await request(app)
      .put(`/tickets/${created.body.id}`)
      .send({ status: 'not_a_valid_status' });
    expect(res.status).toBe(422);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).put('/tickets/ghost').send({ status: 'new' });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE ───────────────────────────────────────────────────────────────
describe('DELETE /tickets/:id', () => {
  it('deletes ticket and returns 204', async () => {
    const created = await request(app).post('/tickets').send(VALID);
    const res = await request(app).delete(`/tickets/${created.body.id}`);
    expect(res.status).toBe(204);
    const check = await request(app).get(`/tickets/${created.body.id}`);
    expect(check.status).toBe(404);
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).delete('/tickets/no-such-id');
    expect(res.status).toBe(404);
  });
});

// ─── AUTO-CLASSIFY ENDPOINT ───────────────────────────────────────────────
describe('POST /tickets/:id/auto-classify', () => {
  it('classifies ticket and returns result shape with _links', async () => {
    const created = await request(app).post('/tickets').send({
      ...VALID,
      subject: 'Crash on login page',
      description: 'The app crashes every time I try to sign in. Getting an error message.',
    });
    const res = await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      category: expect.any(String),
      priority: expect.any(String),
      confidence: expect.any(Number),
      reasoning: expect.any(String),
      keywords_found: expect.any(Array),
    });
    expect(res.body._links.self.href).toBe(`/tickets/${created.body.id}`);
  });

  it('updates ticket category and priority after classification', async () => {
    const created = await request(app).post('/tickets').send({
      ...VALID,
      subject: 'Cannot access account locked out',
      description: 'I am completely locked out. Cannot sign in at all.',
    });
    await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    const ticket = await request(app).get(`/tickets/${created.body.id}`);
    expect(ticket.body.category).toBe('account_access');
    expect(ticket.body.classification_confidence).toBeGreaterThan(0);
  });

  it('returns 404 for unknown ticket', async () => {
    const res = await request(app).post('/tickets/ghost/auto-classify');
    expect(res.status).toBe(404);
  });
});

// ─── CLASSIFICATION LOG ────────────────────────────────────────────────────
describe('GET /tickets/:id/classification-log', () => {
  it('returns empty log for ticket never classified', async () => {
    const created = await request(app).post('/tickets').send(VALID);
    const res = await request(app).get(`/tickets/${created.body.id}/classification-log`);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.log).toEqual([]);
    expect(res.body._links).toBeDefined();
  });

  it('log grows with each auto-classify call', async () => {
    const created = await request(app).post('/tickets').send(VALID);
    await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    const res = await request(app).get(`/tickets/${created.body.id}/classification-log`);
    expect(res.body.count).toBe(2);
  });

  it('log entry has correct shape', async () => {
    const created = await request(app).post('/tickets').send(VALID);
    await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    const res = await request(app).get(`/tickets/${created.body.id}/classification-log`);
    const entry = res.body.log[0];
    expect(entry.source).toBe('auto');
    expect(entry.timestamp).toBeDefined();
    expect(entry.inputs.subject).toBe(VALID.subject);
    expect(entry.result.category).toBeDefined();
    expect(entry.result.confidence).toBeDefined();
  });

  it('manual override appears in log with correct source', async () => {
    const created = await request(app).post('/tickets').send(VALID);
    await request(app).put(`/tickets/${created.body.id}`).send({ category: 'bug_report' });
    const res = await request(app).get(`/tickets/${created.body.id}/classification-log`);
    expect(res.body.count).toBe(1);
    expect(res.body.log[0].source).toBe('manual_override');
  });

  it('returns 404 for unknown ticket', async () => {
    const res = await request(app).get('/tickets/ghost/classification-log');
    expect(res.status).toBe(404);
  });
});

// ─── HEALTH ───────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ─── 404 FOR UNKNOWN ROUTES ────────────────────────────────────────────────
describe('unknown routes', () => {
  it('returns 404 for unregistered path', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });
});
