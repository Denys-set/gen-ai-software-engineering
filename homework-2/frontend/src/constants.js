// Enum values mirrored from the backend Zod schema (src/schemas/ticketSchema.js).

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

// Tailwind classes for colored badges.
export const PRIORITY_STYLES = {
  urgent: 'bg-red-100 text-red-700 ring-red-200',
  high: 'bg-orange-100 text-orange-700 ring-orange-200',
  medium: 'bg-blue-100 text-blue-700 ring-blue-200',
  low: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export const STATUS_STYLES = {
  new: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  in_progress: 'bg-amber-100 text-amber-700 ring-amber-200',
  waiting_customer: 'bg-violet-100 text-violet-700 ring-violet-200',
  resolved: 'bg-teal-100 text-teal-700 ring-teal-200',
  closed: 'bg-slate-200 text-slate-600 ring-slate-300',
};

export const CATEGORY_STYLES = {
  account_access: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
  technical_issue: 'bg-rose-100 text-rose-700 ring-rose-200',
  billing_question: 'bg-green-100 text-green-700 ring-green-200',
  feature_request: 'bg-sky-100 text-sky-700 ring-sky-200',
  bug_report: 'bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200',
  other: 'bg-slate-100 text-slate-600 ring-slate-200',
};

// Turn "account_access" → "Account access" for display.
export function humanize(value) {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
