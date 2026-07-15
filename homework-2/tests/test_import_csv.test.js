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

describe('CSV import — POST /tickets/import', () => {
  it('imports all 50 valid rows and returns 201 summary', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('sample_tickets.csv')), 'sample_tickets.csv');
    expect(res.status).toBe(201);
    expect(res.body.format).toBe('csv');
    expect(res.body.total).toBe(50);
    expect(res.body.successful).toBe(50);
    expect(res.body.failed).toBe(0);
    expect(res.body.tickets).toHaveLength(50);
  });

  it('each imported ticket has _links', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('sample_tickets.csv')), 'sample_tickets.csv');
    expect(res.body.tickets[0]._links.self.href).toMatch(/^\/tickets\//);
    expect(res.body._links.collection.href).toBe('/tickets');
  });

  it('reports failed rows and succeeds for valid ones (partial success)', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('invalid_bad_email.csv')), 'invalid_bad_email.csv');
    expect(res.status).toBe(201);
    expect(res.body.successful).toBe(2);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].field).toContain('customer_email');
  });

  it('returns 400 when all rows fail validation', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('invalid_all_wrong.csv')), 'invalid_all_wrong.csv');
    expect(res.status).toBe(400);
    expect(res.body.successful).toBe(0);
    expect(res.body.failed).toBeGreaterThan(0);
  });

  it('returns 400 when no file is uploaded', async () => {
    const res = await request(app).post('/tickets/import');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('BadRequestError');
  });

  it('returns 400 for unsupported file extension', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.from('just plain text'), { filename: 'data.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('imports tickets are queryable after import', async () => {
    await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('sample_tickets.csv')), 'sample_tickets.csv');
    const list = await request(app).get('/tickets?category=account_access');
    expect(list.body.count).toBeGreaterThan(0);
  });
});
