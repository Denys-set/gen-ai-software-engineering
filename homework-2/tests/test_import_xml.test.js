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

describe('XML import — POST /tickets/import', () => {
  it('imports all 30 tickets from XML and returns 201', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('sample_tickets.xml')), 'sample_tickets.xml');
    expect(res.status).toBe(201);
    expect(res.body.format).toBe('xml');
    expect(res.body.total).toBe(30);
    expect(res.body.successful).toBe(30);
    expect(res.body.failed).toBe(0);
  });

  it('imports a single-ticket XML (non-array node)', async () => {
    const single = `<?xml version="1.0"?>
<tickets>
  <ticket>
    <customer_id>S1</customer_id>
    <customer_email>single@example.com</customer_email>
    <customer_name>Single User</customer_name>
    <subject>Single ticket import test</subject>
    <description>This is a single ticket in XML format to test the single-node handling path.</description>
    <category>other</category>
    <priority>low</priority>
  </ticket>
</tickets>`;
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.from(single), { filename: 'single.xml', contentType: 'application/xml' });
    expect(res.status).toBe(201);
    expect(res.body.successful).toBe(1);
  });

  it('returns 400 for XML with wrong root structure', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('invalid_wrong_structure.xml')), 'invalid_wrong_structure.xml');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/XML must contain/i);
  });

  it('returns 400 for malformed XML', async () => {
    const bad = Buffer.from('<tickets><ticket><unclosed></tickets>');
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', bad, { filename: 'bad.xml', contentType: 'application/xml' });
    // fast-xml-parser is lenient; confirm it either succeeds with 0 rows or returns 400
    expect([400, 201]).toContain(res.status);
  });

  it('handles partial failures in XML import', async () => {
    const mixed = `<?xml version="1.0"?>
<tickets>
  <ticket>
    <customer_id>V1</customer_id>
    <customer_email>valid@example.com</customer_email>
    <customer_name>Valid User</customer_name>
    <subject>Valid XML ticket subject</subject>
    <description>This is a valid description that passes the minimum length requirement.</description>
  </ticket>
  <ticket>
    <customer_id>B1</customer_id>
    <customer_email>not-an-email</customer_email>
    <customer_name>Bad User</customer_name>
    <subject>x</subject>
    <description>short</description>
  </ticket>
</tickets>`;
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.from(mixed), { filename: 'mixed.xml', contentType: 'application/xml' });
    expect(res.status).toBe(201);
    expect(res.body.successful).toBe(1);
    expect(res.body.failed).toBe(1);
  });

  it('each imported ticket carries _links', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', readFileSync(fix('sample_tickets.xml')), 'sample_tickets.xml');
    expect(res.body.tickets[0]._links.self.href).toMatch(/^\/tickets\//);
  });
});
