import request from 'supertest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createApp } from '../src/app.js';
import { ticketRepository } from '../src/repository/ticketRepository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fix = (name) => join(__dirname, 'fixtures', name);
const app = createApp();
beforeEach(() => ticketRepository.clear());

const VALID = {
  customer_id: 'I1',
  customer_email: 'integration@test.com',
  customer_name: 'Integration Tester',
  subject: 'Integration test subject',
  description: 'Integration test description that is long enough to pass validation.',
};

describe('Integration: complete ticket lifecycle', () => {
  it('creates, classifies, updates status through full lifecycle', async () => {
    // POST /tickets → save id
    const createRes = await request(app).post('/tickets').send(VALID);
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;
    expect(id).toBeDefined();

    // POST /tickets/:id/auto-classify → assert 200
    const classifyRes = await request(app).post(`/tickets/${id}/auto-classify`);
    expect(classifyRes.status).toBe(200);

    // PUT /tickets/:id { status: 'in_progress' } → assert 200
    const inProgressRes = await request(app)
      .put(`/tickets/${id}`)
      .send({ status: 'in_progress' });
    expect(inProgressRes.status).toBe(200);

    // PUT /tickets/:id { status: 'resolved' } → assert 200, assert resolved_at is not null
    const resolvedRes = await request(app)
      .put(`/tickets/${id}`)
      .send({ status: 'resolved' });
    expect(resolvedRes.status).toBe(200);
    expect(resolvedRes.body.resolved_at).not.toBeNull();

    // PUT /tickets/:id { status: 'closed' } → assert 200, assert status === 'closed'
    const closedRes = await request(app)
      .put(`/tickets/${id}`)
      .send({ status: 'closed' });
    expect(closedRes.status).toBe(200);
    expect(closedRes.body.status).toBe('closed');
  });
});

describe('Integration: bulk import then classify', () => {
  it('imports CSV, JSON, XML files and classifies a ticket from CSV', async () => {
    // Import sample_tickets.csv → assert 201, successful===50
    const csvImportRes = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('sample_tickets.csv')), 'sample_tickets.csv');
    expect(csvImportRes.status).toBe(201);
    expect(csvImportRes.body.successful).toBe(50);

    // Take first ticket ID from CSV import
    const firstTicketId = csvImportRes.body.tickets[0].id;

    // Import sample_tickets.json → assert 201, successful===20
    const jsonImportRes = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('sample_tickets.json')), 'sample_tickets.json');
    expect(jsonImportRes.status).toBe(201);
    expect(jsonImportRes.body.successful).toBe(20);

    // Import sample_tickets.xml → assert 201, successful===30
    const xmlImportRes = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('sample_tickets.xml')), 'sample_tickets.xml');
    expect(xmlImportRes.status).toBe(201);
    expect(xmlImportRes.body.successful).toBe(30);

    // Call POST /tickets/:id/auto-classify on first CSV ticket
    const classifyRes = await request(app).post(`/tickets/${firstTicketId}/auto-classify`);
    expect(classifyRes.status).toBe(200);

    // GET /tickets/:id → assert classification_confidence is not null
    const getRes = await request(app).get(`/tickets/${firstTicketId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.classification_confidence).not.toBeNull();
  });
});

describe('Integration: concurrent ticket creation', () => {
  it('creates 25 tickets concurrently with unique IDs', async () => {
    // Create array of 25 VALID objects (vary customer_id and customer_email per index)
    const tickets = Array.from({ length: 25 }, (_, i) => ({
      ...VALID,
      customer_id: `I${i + 1}`,
      customer_email: `integration${i + 1}@test.com`,
    }));

    // Fire all 25 with Promise.all
    const responses = await Promise.all(
      tickets.map((ticket) => request(app).post('/tickets').send(ticket))
    );

    // Assert all 25 responses have status 201
    responses.forEach((res) => {
      expect(res.status).toBe(201);
    });

    // GET /tickets → assert count === 25
    const listRes = await request(app).get('/tickets');
    expect(listRes.status).toBe(200);
    expect(listRes.body.count).toBe(25);

    // Assert all 25 IDs are unique (new Set(ids).size === 25)
    const ids = responses.map((res) => res.body.id);
    expect(new Set(ids).size).toBe(25);
  });
});

describe('Integration: combined category+priority filter', () => {
  it('filters tickets by category and priority combinations', async () => {
    // Create 6 tickets: indices 0-1 category=bug_report priority=high,
    // 2-3 category=bug_report priority=low, 4-5 category=billing_question priority=high
    const ticketData = [
      { ...VALID, customer_id: 'F1', customer_email: 'f1@test.com', category: 'bug_report', priority: 'high' },
      { ...VALID, customer_id: 'F2', customer_email: 'f2@test.com', category: 'bug_report', priority: 'high' },
      { ...VALID, customer_id: 'F3', customer_email: 'f3@test.com', category: 'bug_report', priority: 'low' },
      { ...VALID, customer_id: 'F4', customer_email: 'f4@test.com', category: 'bug_report', priority: 'low' },
      { ...VALID, customer_id: 'F5', customer_email: 'f5@test.com', category: 'billing_question', priority: 'high' },
      { ...VALID, customer_id: 'F6', customer_email: 'f6@test.com', category: 'billing_question', priority: 'high' },
    ];

    await Promise.all(ticketData.map((t) => request(app).post('/tickets').send(t)));

    // GET /tickets?category=bug_report&priority=high → assert count === 2
    const bugHighRes = await request(app).get('/tickets?category=bug_report&priority=high');
    expect(bugHighRes.status).toBe(200);
    expect(bugHighRes.body.count).toBe(2);

    // GET /tickets?category=bug_report → assert count === 4
    const bugRes = await request(app).get('/tickets?category=bug_report');
    expect(bugRes.status).toBe(200);
    expect(bugRes.body.count).toBe(4);

    // GET /tickets?category=billing_question&priority=high → assert count === 2
    const billingHighRes = await request(app).get('/tickets?category=billing_question&priority=high');
    expect(billingHighRes.status).toBe(200);
    expect(billingHighRes.body.count).toBe(2);
  });
});

describe('Integration: import with invalid rows', () => {
  it('handles partial and full import failures correctly', async () => {
    // Import invalid_bad_email.csv → assert status 201, successful===2, failed===1, errors[0].field contains 'customer_email'
    const badEmailRes = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('invalid_bad_email.csv')), 'invalid_bad_email.csv');
    expect(badEmailRes.status).toBe(201);
    expect(badEmailRes.body.successful).toBe(2);
    expect(badEmailRes.body.failed).toBe(1);
    expect(badEmailRes.body.errors[0].field).toContain('customer_email');

    ticketRepository.clear();

    // Import invalid_all_wrong.csv → assert status 400, body.successful===0
    const allWrongRes = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('invalid_all_wrong.csv')), 'invalid_all_wrong.csv');
    expect(allWrongRes.status).toBe(400);
    expect(allWrongRes.body.successful).toBe(0);
  });
});
