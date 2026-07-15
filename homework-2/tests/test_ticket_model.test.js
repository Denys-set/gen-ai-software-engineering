import { createTicketSchema, updateTicketSchema, CATEGORIES, PRIORITIES, STATUSES } from '../src/schemas/ticketSchema.js';

const BASE = {
  customer_id: 'C1',
  customer_email: 'alice@example.com',
  customer_name: 'Alice',
  subject: 'Valid subject line',
  description: 'This description is long enough to pass the minimum length validation check.',
};

describe('createTicketSchema', () => {
  it('accepts a valid minimal ticket and fills defaults', () => {
    const result = createTicketSchema.safeParse(BASE);
    expect(result.success).toBe(true);
    expect(result.data.category).toBe('other');
    expect(result.data.priority).toBe('medium');
    expect(result.data.status).toBe('new');
    expect(result.data.tags).toEqual([]);
    expect(result.data.metadata.source).toBe('api');
    expect(result.data.metadata.device_type).toBe('desktop');
  });

  it('rejects missing customer_id', () => {
    const { customer_id, ...rest } = BASE;
    const result = createTicketSchema.safeParse(rest);
    expect(result.success).toBe(false);
    const fields = result.error.issues.map(i => i.path[0]);
    expect(fields).toContain('customer_id');
  });

  it('rejects invalid email format', () => {
    const result = createTicketSchema.safeParse({ ...BASE, customer_email: 'not-an-email' });
    expect(result.success).toBe(false);
    const fields = result.error.issues.map(i => i.path[0]);
    expect(fields).toContain('customer_email');
  });

  it('rejects subject exceeding 200 characters', () => {
    const result = createTicketSchema.safeParse({ ...BASE, subject: 'x'.repeat(201) });
    expect(result.success).toBe(false);
    const fields = result.error.issues.map(i => i.path[0]);
    expect(fields).toContain('subject');
  });

  it('rejects description shorter than 10 characters', () => {
    const result = createTicketSchema.safeParse({ ...BASE, description: 'short' });
    expect(result.success).toBe(false);
    const fields = result.error.issues.map(i => i.path[0]);
    expect(fields).toContain('description');
  });

  it('rejects description exceeding 2000 characters', () => {
    const result = createTicketSchema.safeParse({ ...BASE, description: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category enum value', () => {
    const result = createTicketSchema.safeParse({ ...BASE, category: 'not_a_category' });
    expect(result.success).toBe(false);
    const fields = result.error.issues.map(i => i.path[0]);
    expect(fields).toContain('category');
  });

  it('rejects invalid priority enum value', () => {
    const result = createTicketSchema.safeParse({ ...BASE, priority: 'super_urgent' });
    expect(result.success).toBe(false);
    const fields = result.error.issues.map(i => i.path[0]);
    expect(fields).toContain('priority');
  });

  it('rejects invalid status enum value', () => {
    const result = createTicketSchema.safeParse({ ...BASE, status: 'maybe' });
    expect(result.success).toBe(false);
    const fields = result.error.issues.map(i => i.path[0]);
    expect(fields).toContain('status');
  });

  it('accepts all valid category values', () => {
    for (const cat of CATEGORIES) {
      const result = createTicketSchema.safeParse({ ...BASE, category: cat });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid priority values', () => {
    for (const pri of PRIORITIES) {
      const result = createTicketSchema.safeParse({ ...BASE, priority: pri });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid status values', () => {
    for (const st of STATUSES) {
      const result = createTicketSchema.safeParse({ ...BASE, status: st });
      expect(result.success).toBe(true);
    }
  });

  it('accepts full ticket with all optional fields', () => {
    const result = createTicketSchema.safeParse({
      ...BASE,
      category: 'bug_report',
      priority: 'urgent',
      status: 'in_progress',
      assigned_to: 'agent-007',
      tags: ['crash', 'mobile'],
      metadata: { source: 'chat', browser: 'Firefox', device_type: 'mobile' },
    });
    expect(result.success).toBe(true);
    expect(result.data.assigned_to).toBe('agent-007');
    expect(result.data.tags).toEqual(['crash', 'mobile']);
  });
});

describe('updateTicketSchema', () => {
  it('accepts a partial update with one field', () => {
    const result = updateTicketSchema.safeParse({ status: 'resolved' });
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('resolved');
  });

  it('rejects an empty update object', () => {
    const result = updateTicketSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects invalid status in update', () => {
    const result = updateTicketSchema.safeParse({ status: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('accepts resolved_at datetime in update', () => {
    const result = updateTicketSchema.safeParse({
      status: 'resolved',
      resolved_at: '2024-01-15T10:30:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
