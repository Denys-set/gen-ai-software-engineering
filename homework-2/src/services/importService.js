import { detectFormat, parseByFormat } from '../utils/parsers.js';
import { ticketService } from './ticketService.js';

/**
 * Import tickets from a raw file buffer.
 *
 * Detects the format, parses records, then validates & inserts each one.
 * Valid rows are imported even when others fail (partial success).
 *
 * @returns {{ total, successful, failed, errors: Array<{row, field, message}>, tickets: object[] }}
 */
export function importTickets({ content, filename, mimetype }) {
  const format = detectFormat({ filename, mimetype });
  const records = parseByFormat(content, format);

  const summary = {
    format,
    total: records.length,
    successful: 0,
    failed: 0,
    errors: [],
    tickets: [],
  };

  records.forEach((record, index) => {
    const row = index + 1;
    const result = ticketService.createFromRecord(record, row);
    if (result.ticket) {
      summary.successful += 1;
      summary.tickets.push(result.ticket);
    } else {
      summary.failed += 1;
      summary.errors.push(...result.errors);
    }
  });

  return summary;
}
