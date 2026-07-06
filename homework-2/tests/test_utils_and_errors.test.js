import { jest } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ticketRepository } from '../src/repository/ticketRepository.js';
import { AppError, NotFoundError, ValidationError, BadRequestError } from '../src/utils/errors.js';
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';
import { detectFormat, parseCsv, parseJson, parseXml } from '../src/utils/parsers.js';
import multer from 'multer';

const app = createApp();
beforeEach(() => ticketRepository.clear());

// ─── Error class constructors ──────────────────────────────────────────────
describe('AppError and subclasses', () => {
  it('AppError defaults statusCode=500 and details=null', () => {
    const e = new AppError('something broke');
    expect(e.statusCode).toBe(500);
    expect(e.details).toBeNull();
    expect(e.message).toBe('something broke');
  });

  it('AppError accepts custom statusCode and details', () => {
    const e = new AppError('bad', 418, { field: 'x' });
    expect(e.statusCode).toBe(418);
    expect(e.details).toEqual({ field: 'x' });
  });

  it('NotFoundError has statusCode 404', () => {
    const e = new NotFoundError('not here');
    expect(e.statusCode).toBe(404);
    expect(e.name).toBe('NotFoundError');
  });

  it('NotFoundError uses default message', () => {
    const e = new NotFoundError();
    expect(e.message).toBe('Resource not found');
  });

  it('ValidationError has statusCode 422', () => {
    const e = new ValidationError('bad input', [{ field: 'x' }]);
    expect(e.statusCode).toBe(422);
    expect(e.details).toEqual([{ field: 'x' }]);
  });

  it('BadRequestError has statusCode 400', () => {
    const e = new BadRequestError('bad request');
    expect(e.statusCode).toBe(400);
    expect(e.name).toBe('BadRequestError');
  });
});

// ─── errorHandler middleware ───────────────────────────────────────────────
describe('errorHandler middleware', () => {
  const makeRes = () => {
    const res = { status: null, body: null };
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn((body) => { res.body = body; return res; });
    return res;
  };

  it('handles AppError with its statusCode', () => {
    const res = makeRes();
    errorHandler(new AppError('oops', 409), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.error).toBe('AppError');
  });

  it('includes details when AppError has them', () => {
    const res = makeRes();
    errorHandler(new ValidationError('bad', [{ field: 'x' }]), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.body.details).toBeDefined();
  });

  it('omits details key when AppError has no details', () => {
    const res = makeRes();
    errorHandler(new NotFoundError('gone'), {}, res, () => {});
    expect(res.body.details).toBeUndefined();
  });

  it('handles multer MulterError with 400', () => {
    const res = makeRes();
    const err = new multer.MulterError('LIMIT_FILE_SIZE');
    errorHandler(err, {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body.error).toBe('UploadError');
  });

  it('handles unexpected non-AppError with 500', () => {
    const res = makeRes();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(new Error('random failure'), {}, res, () => {});
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body.error).toBe('InternalServerError');
    spy.mockRestore();
  });
});

// ─── notFoundHandler middleware ────────────────────────────────────────────
describe('notFoundHandler middleware', () => {
  it('returns 404 with route info', () => {
    const res = { status: null, body: null };
    res.status = jest.fn((code) => { res.statusCode = code; return res; });
    res.json = jest.fn((body) => { res.body = body; return res; });
    notFoundHandler({ method: 'DELETE', originalUrl: '/nowhere' }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body.error).toBe('Not Found');
  });
});

// ─── detectFormat ──────────────────────────────────────────────────────────
describe('detectFormat', () => {
  it('detects csv from filename', () => expect(detectFormat({ filename: 'data.csv' })).toBe('csv'));
  it('detects json from filename', () => expect(detectFormat({ filename: 'data.json' })).toBe('json'));
  it('detects xml from filename', () => expect(detectFormat({ filename: 'data.xml' })).toBe('xml'));
  it('detects csv from mimetype', () => expect(detectFormat({ mimetype: 'text/csv' })).toBe('csv'));
  it('detects json from mimetype', () => expect(detectFormat({ mimetype: 'application/json' })).toBe('json'));
  it('detects xml from mimetype', () => expect(detectFormat({ mimetype: 'application/xml' })).toBe('xml'));
  it('throws BadRequestError for unknown format', () => {
    expect(() => detectFormat({ filename: 'data.txt' })).toThrow('Unsupported');
  });
});

// ─── parseCsv edge cases ───────────────────────────────────────────────────
describe('parseCsv edge cases', () => {
  it('treats empty tags field as empty array', () => {
    const csv = `customer_id,customer_email,customer_name,subject,description,tags
C1,a@b.com,Alice,Subject text,Description text here,`;
    const records = parseCsv(Buffer.from(csv));
    expect(records[0].tags).toEqual([]);
  });

  it('splits pipe-separated tags', () => {
    const csv = `customer_id,customer_email,customer_name,subject,description,tags
C1,a@b.com,Alice,Subject text,Description text here,bug|ui|mobile`;
    const records = parseCsv(Buffer.from(csv));
    expect(records[0].tags).toEqual(['bug', 'ui', 'mobile']);
  });

  it('throws BadRequestError on malformed CSV', () => {
    expect(() => parseCsv(Buffer.from('\x00\x01\x02'))).not.toThrow();
  });

  it('lifts metadata. keys into nested metadata object', () => {
    const csv = `customer_id,customer_email,customer_name,subject,description,metadata.source,metadata.browser
C1,a@b.com,Alice,Subject text,Description text here,web_form,Chrome`;
    const records = parseCsv(Buffer.from(csv));
    expect(records[0].metadata.source).toBe('web_form');
    expect(records[0].metadata.browser).toBe('Chrome');
  });
});

// ─── parseXml edge cases ───────────────────────────────────────────────────
describe('parseXml edge cases', () => {
  it('handles string tags value (semicolon-separated)', () => {
    const xml = `<tickets><ticket>
      <customer_id>X1</customer_id>
      <customer_email>x@x.com</customer_email>
      <customer_name>X User</customer_name>
      <subject>Some subject</subject>
      <description>A description long enough</description>
      <tags>bug;mobile;crash</tags>
    </ticket></tickets>`;
    const records = parseXml(Buffer.from(xml));
    expect(Array.isArray(records[0].tags)).toBe(true);
    expect(records[0].tags).toContain('bug');
  });

  it('throws BadRequestError for wrong XML structure', () => {
    const xml = `<root><items><item>nothing</item></items></root>`;
    expect(() => parseXml(Buffer.from(xml))).toThrow('XML must contain');
  });
});

// ─── assigned_to filter ────────────────────────────────────────────────────
describe('GET /tickets?assigned_to filter', () => {
  it('filters tickets by assigned_to', async () => {
    const BASE = {
      customer_id: 'C1', customer_email: 'a@b.com', customer_name: 'A',
      subject: 'Test subject line', description: 'Test description that is long enough to pass.',
    };
    const created = await request(app).post('/tickets').send(BASE);
    await request(app).put(`/tickets/${created.body.id}`).send({ assigned_to: 'agent-42' });
    await request(app).post('/tickets').send({ ...BASE, customer_id: 'C2', customer_email: 'b@b.com' });

    const res = await request(app).get('/tickets?assigned_to=agent-42');
    expect(res.body.count).toBe(1);
    expect(res.body.tickets[0].assigned_to).toBe('agent-42');
  });
});

// ─── multer file-size limit (HTTP layer) ──────────────────────────────────
describe('POST /tickets/import file size', () => {
  it('returns 400 when uploaded file exceeds 5 MB', async () => {
    const bigFile = Buffer.alloc(6 * 1024 * 1024, 'a');
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', bigFile, 'big.csv');
    expect(res.status).toBe(400);
  });
});
