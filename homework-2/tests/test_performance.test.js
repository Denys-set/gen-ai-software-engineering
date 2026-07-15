import request from 'supertest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createApp } from '../src/app.js';
import { ticketRepository } from '../src/repository/ticketRepository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fix = (name) => join(__dirname, 'fixtures', name);
const app = createApp();

const VALID = {
  customer_id: 'P1',
  customer_email: 'perf@test.com',
  customer_name: 'Perf Tester',
  subject: 'Performance test subject',
  description: 'Performance test description that is long enough to pass validation.',
};

const t = () => process.hrtime.bigint();

beforeEach(() => ticketRepository.clear());

describe('Perf: single create latency', () => {
  it('runs 10 sequential POST /tickets and checks mean latency < 100ms', async () => {
    const start = t();
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/tickets')
        .send({ ...VALID, customer_id: `P${i}`, customer_email: `perf${i}@test.com` });
    }
    const totalMs = Number(t() - start) / 1e6;
    const meanMs = totalMs / 10;

    console.table([{
      Test: 'Single Create Latency',
      Requests: 10,
      TotalMs: totalMs.toFixed(2),
      MeanMs: meanMs.toFixed(2),
      Threshold: '< 100ms mean',
      Status: meanMs < 100 ? 'PASS' : 'FAIL',
    }]);

    expect(meanMs).toBeLessThan(100);
  });
});

describe('Perf: bulk import 50-row CSV', () => {
  it('imports sample_tickets.csv and checks total < 1000ms and per-record < 20ms', async () => {
    const csvBuffer = readFileSync(fix('sample_tickets.csv'));

    const start = t();
    await request(app)
      .post('/tickets/import')
      .attach('file', csvBuffer, { filename: 'sample_tickets.csv', contentType: 'text/csv' });
    const totalMs = Number(t() - start) / 1e6;

    const perRecord = totalMs / 50;

    console.table([{
      Test: 'Bulk Import 50-row CSV',
      Requests: 1,
      TotalMs: totalMs.toFixed(2),
      MeanMs: perRecord.toFixed(2),
      Threshold: 'total < 1000ms, per-record < 20ms',
      Status: (totalMs < 1000 && perRecord < 20) ? 'PASS' : 'FAIL',
    }]);

    expect(totalMs).toBeLessThan(1000);
    expect(perRecord).toBeLessThan(20);
  });
});

describe('Perf: list/filter with populated store', () => {
  it('runs 10 sequential GET /tickets?category=account_access after CSV import and checks mean < 50ms', async () => {
    const csvBuffer = readFileSync(fix('sample_tickets.csv'));
    await request(app)
      .post('/tickets/import')
      .attach('file', csvBuffer, { filename: 'sample_tickets.csv', contentType: 'text/csv' });

    const start = t();
    for (let i = 0; i < 10; i++) {
      await request(app).get('/tickets?category=account_access');
    }
    const totalMs = Number(t() - start) / 1e6;
    const meanMs = totalMs / 10;

    console.table([{
      Test: 'List/Filter with Populated Store',
      Requests: 10,
      TotalMs: totalMs.toFixed(2),
      MeanMs: meanMs.toFixed(2),
      Threshold: '< 50ms mean',
      Status: meanMs < 50 ? 'PASS' : 'FAIL',
    }]);

    expect(meanMs).toBeLessThan(50);
  });
});

describe('Perf: auto-classify throughput', () => {
  it('classifies 10 tickets in parallel and checks mean wall-clock < 100ms', async () => {
    const ticketIds = [];
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/tickets')
        .send({ ...VALID, customer_id: `AC${i}`, customer_email: `autoclass${i}@test.com` });
      ticketIds.push(res.body.id);
    }

    const start = t();
    await Promise.all(
      ticketIds.map((id) => request(app).post(`/tickets/${id}/auto-classify`))
    );
    const totalMs = Number(t() - start) / 1e6;
    const meanMs = totalMs / 10;

    console.table([{
      Test: 'Auto-Classify Throughput',
      Requests: 10,
      TotalMs: totalMs.toFixed(2),
      MeanMs: meanMs.toFixed(2),
      Threshold: '< 100ms mean',
      Status: meanMs < 100 ? 'PASS' : 'FAIL',
    }]);

    expect(meanMs).toBeLessThan(100);
  });
});

describe('Perf: concurrency stress 25 parallel creates', () => {
  it('creates 25 tickets in parallel, all return 201 and total wall-clock < 3000ms', async () => {
    const thunks = Array.from({ length: 25 }, (_, i) =>
      () =>
        request(app)
          .post('/tickets')
          .send({
            ...VALID,
            customer_id: `STRESS${i}`,
            customer_email: `stress${i}@test.com`,
          })
    );

    const start = t();
    const results = await Promise.all(thunks.map((fn) => fn()));
    const totalMs = Number(t() - start) / 1e6;

    const statuses = results.map((r) => r.status);
    const allCreated = statuses.every((s) => s === 201);

    console.table([{
      Test: 'Concurrency Stress 25 Parallel Creates',
      Requests: 25,
      TotalMs: totalMs.toFixed(2),
      MeanMs: (totalMs / 25).toFixed(2),
      Threshold: '< 3000ms total, all 201',
      Status: (allCreated && totalMs < 3000) ? 'PASS' : 'FAIL',
    }]);

    expect(allCreated).toBe(true);
    expect(totalMs).toBeLessThan(3000);
  });
});
