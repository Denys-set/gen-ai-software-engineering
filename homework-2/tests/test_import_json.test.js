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

describe('JSON import — POST /tickets/import', () => {
  it('imports all 20 tickets from array-format JSON and returns 201', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('sample_tickets.json')), 'sample_tickets.json');
    expect(res.status).toBe(201);
    expect(res.body.format).toBe('json');
    expect(res.body.total).toBe(20);
    expect(res.body.successful).toBe(20);
    expect(res.body.failed).toBe(0);
  });

  it('imports from { tickets: [...] } wrapper format', async () => {
    const wrapped = JSON.stringify({ tickets: [
      {
        customer_id: 'W1',
        customer_email: 'w@example.com',
        customer_name: 'Wrap User',
        subject: 'Wrapped format ticket',
        description: 'This ticket is inside a tickets wrapper object for testing.',
      },
    ]});
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.from(wrapped), { filename: 'wrapped.json', contentType: 'application/json' });
    expect(res.status).toBe(201);
    expect(res.body.successful).toBe(1);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('invalid_malformed.json')), 'invalid_malformed.json');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Malformed JSON/i);
  });

  it('returns 400 for JSON with wrong top-level structure', async () => {
    const bad = JSON.stringify({ data: 'not a ticket array' });
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.from(bad), { filename: 'bad.json', contentType: 'application/json' });
    expect(res.status).toBe(400);
  });

  it('handles partial validation failures in JSON import', async () => {
    const mixed = JSON.stringify([
      {
        customer_id: 'G1',
        customer_email: 'good@example.com',
        customer_name: 'Good',
        subject: 'Valid ticket subject',
        description: 'This is a valid description that is long enough to pass.',
      },
      {
        customer_id: 'B1',
        customer_email: 'not-an-email',
        customer_name: 'Bad',
        subject: 'x',
        description: 'short',
      },
    ]);
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.from(mixed), { filename: 'mixed.json', contentType: 'application/json' });
    expect(res.status).toBe(201);
    expect(res.body.successful).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('each imported ticket carries _links in response', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('sample_tickets.json')), 'sample_tickets.json');
    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.tickets)).toBe(true);
    expect(res.body.tickets.length).toBeGreaterThan(0);
    expect(res.body.tickets[0]._links.self.href).toMatch(/^\/tickets\//);
    expect(res.body._links.collection.href).toBe('/tickets');
  });
});
