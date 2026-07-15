import { ticketService } from '../services/ticketService.js';
import { importTickets } from '../services/importService.js';
import { BadRequestError } from '../utils/errors.js';
import { withTicketLinks, withCollectionLinks, ticketLinks } from '../utils/links.js';

/**
 * Thin HTTP layer: translate requests into service calls and map results to
 * status codes. Errors are thrown and handled by the error middleware.
 */
export const ticketController = {
  create(req, res) {
    const ticket = ticketService.create(req.body, {
      autoClassify: req.query.auto_classify === 'true',
    });
    res.status(201).json(withTicketLinks(ticket));
  },

  list(req, res) {
    const { category, priority, status, assigned_to } = req.query;
    const tickets = ticketService.list({ category, priority, status, assigned_to });
    res.status(200).json(withCollectionLinks(tickets));
  },

  getById(req, res) {
    const ticket = ticketService.getById(req.params.id);
    res.status(200).json(withTicketLinks(ticket));
  },

  update(req, res) {
    const ticket = ticketService.update(req.params.id, req.body);
    res.status(200).json(withTicketLinks(ticket));
  },

  remove(req, res) {
    ticketService.delete(req.params.id);
    res.status(204).send();
  },

  autoClassify(req, res) {
    const result = ticketService.autoClassify(req.params.id);
    res.status(200).json({
      ...result,
      _links: ticketLinks(req.params.id),
    });
  },

  getClassificationLog(req, res) {
    const log = ticketService.getClassificationLog(req.params.id);
    res.status(200).json({
      ticket_id: req.params.id,
      count: log.length,
      log,
      _links: ticketLinks(req.params.id),
    });
  },

  import(req, res) {
    if (!req.file) {
      throw new BadRequestError(
        'No file uploaded. Send a file under the "file" field (multipart/form-data).'
      );
    }
    const summary = importTickets({
      content: req.file.buffer,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
    });

    // 207-ish semantics via 201 when at least one imported, else 400.
    const statusCode = summary.successful > 0 ? 201 : 400;
    res.status(statusCode).json({
      ...summary,
      tickets: summary.tickets.map(withTicketLinks),
      _links: {
        collection: { href: '/tickets', method: 'GET' },
        import:     { href: '/tickets/import', method: 'POST' },
      },
    });
  },
};
