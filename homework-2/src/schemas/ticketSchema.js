import { z } from 'zod';

export const CATEGORIES = [
  'account_access',
  'technical_issue',
  'billing_question',
  'feature_request',
  'bug_report',
  'other',
];

export const PRIORITIES = ['urgent', 'high', 'medium', 'low'];

export const STATUSES = [
  'new',
  'in_progress',
  'waiting_customer',
  'resolved',
  'closed',
];

export const SOURCES = ['web_form', 'email', 'api', 'chat', 'phone'];

export const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'];

const metadataSchema = z
  .object({
    source: z.enum(SOURCES).default('api'),
    browser: z.string().default(''),
    device_type: z.enum(DEVICE_TYPES).default('desktop'),
  })
  .default({ source: 'api', browser: '', device_type: 'desktop' });

/**
 * Fields a client is allowed to send when creating a ticket.
 * Server-managed fields (id, created_at, updated_at, resolved_at) are excluded.
 */
export const createTicketSchema = z.object({
  customer_id: z.string().min(1, 'customer_id is required'),
  customer_email: z.string().email('customer_email must be a valid email'),
  customer_name: z.string().min(1, 'customer_name is required'),
  subject: z
    .string()
    .min(1, 'subject must be 1-200 chars')
    .max(200, 'subject must be 1-200 chars'),
  description: z
    .string()
    .min(10, 'description must be 10-2000 chars')
    .max(2000, 'description must be 10-2000 chars'),
  category: z.enum(CATEGORIES).default('other'),
  priority: z.enum(PRIORITIES).default('medium'),
  status: z.enum(STATUSES).default('new'),
  assigned_to: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  metadata: metadataSchema,
});

/**
 * Update schema — every field optional, but at least one must be provided.
 */
export const updateTicketSchema = createTicketSchema
  .partial()
  .extend({
    resolved_at: z.string().datetime().nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required to update',
  });

/**
 * Flatten a ZodError into the import-error shape: { row, field, message }.
 */
export function zodIssuesToErrors(error, row = null) {
  return error.issues.map((issue) => ({
    row,
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}
