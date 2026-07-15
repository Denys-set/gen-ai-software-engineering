import { v4 as uuidv4 } from 'uuid';
import { ticketRepository } from '../repository/ticketRepository.js';
import {
  createTicketSchema,
  updateTicketSchema,
  zodIssuesToErrors,
} from '../schemas/ticketSchema.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import {
  classify,
  logDecision,
  getDecisionLog,
} from './classificationService.js';

function nowIso() {
  return new Date().toISOString();
}

/**
 * Build a full ticket entity from validated create-input, filling
 * server-managed fields.
 */
function buildTicket(validated) {
  const timestamp = nowIso();
  return {
    id: uuidv4(),
    ...validated,
    resolved_at: validated.status === 'resolved' ? timestamp : null,
    classification_confidence: null,
    manually_overridden: false,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export const ticketService = {
  /**
   * Validate input and create a ticket. Throws ValidationError (422) on bad input.
   *
   * @param {object} input
   * @param {{ autoClassify?: boolean }} [options]
   */
  create(input, options = {}) {
    const parsed = createTicketSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Ticket validation failed',
        zodIssuesToErrors(parsed.error)
      );
    }
    const ticket = buildTicket(parsed.data);
    const saved = ticketRepository.create(ticket);

    if (options.autoClassify) {
      const result = classify(saved.subject, saved.description);
      logDecision(saved.id, { subject: saved.subject, description: saved.description }, result, 'auto');
      const classified = {
        ...saved,
        category: result.category,
        priority: result.priority,
        classification_confidence: result.confidence,
        manually_overridden: false,
        updated_at: nowIso(),
      };
      return ticketRepository.update(saved.id, classified);
    }

    return saved;
  },

  /**
   * Validate a single record in the bulk-import context.
   * Returns { ticket } on success or { errors } on failure (does not throw).
   */
  createFromRecord(record, row) {
    const parsed = createTicketSchema.safeParse(record);
    if (!parsed.success) {
      return { errors: zodIssuesToErrors(parsed.error, row) };
    }
    const ticket = ticketRepository.create(buildTicket(parsed.data));
    return { ticket };
  },

  list(filters) {
    return ticketRepository.findAll(filters);
  },

  getById(id) {
    const ticket = ticketRepository.findById(id);
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);
    return ticket;
  },

  update(id, input) {
    const existing = ticketRepository.findById(id);
    if (!existing) throw new NotFoundError(`Ticket ${id} not found`);

    const parsed = updateTicketSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Ticket update validation failed',
        zodIssuesToErrors(parsed.error)
      );
    }

    const merged = {
      ...existing,
      ...parsed.data,
      metadata: parsed.data.metadata
        ? { ...existing.metadata, ...parsed.data.metadata }
        : existing.metadata,
      id: existing.id,
      created_at: existing.created_at,
      updated_at: nowIso(),
    };

    // Auto-manage resolved_at when transitioning status.
    if (parsed.data.status === 'resolved' && !existing.resolved_at) {
      merged.resolved_at = nowIso();
    }

    // Track manual override when category or priority is explicitly changed.
    if (parsed.data.category !== undefined || parsed.data.priority !== undefined) {
      merged.manually_overridden = true;
      logDecision(
        id,
        { subject: merged.subject, description: merged.description },
        {
          category: merged.category,
          priority: merged.priority,
          confidence: null,
          reasoning: 'Manual override via PUT request.',
          keywords_found: [],
        },
        'manual_override'
      );
    }

    return ticketRepository.update(id, merged);
  },

  /**
   * Run auto-classification on an existing ticket, update it, and return
   * the classification result.
   */
  autoClassify(id) {
    const ticket = ticketRepository.findById(id);
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);

    const result = classify(ticket.subject, ticket.description);
    logDecision(id, { subject: ticket.subject, description: ticket.description }, result, 'auto');

    const updated = {
      ...ticket,
      category: result.category,
      priority: result.priority,
      classification_confidence: result.confidence,
      manually_overridden: false,
      updated_at: nowIso(),
    };
    ticketRepository.update(id, updated);

    return result;
  },

  /**
   * Return the classification decision log for a ticket.
   */
  getClassificationLog(id) {
    const ticket = ticketRepository.findById(id);
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);
    return getDecisionLog(id);
  },

  delete(id) {
    const deleted = ticketRepository.delete(id);
    if (!deleted) throw new NotFoundError(`Ticket ${id} not found`);
    return true;
  },
};
