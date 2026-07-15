import { parse as parseCsvSync } from 'csv-parse/sync';
import { XMLParser } from 'fast-xml-parser';
import { BadRequestError } from './errors.js';

/**
 * Supported import formats.
 */
export const FORMAT = {
  CSV: 'csv',
  JSON: 'json',
  XML: 'xml',
};

/**
 * Detect the file format from a filename extension and/or mimetype.
 * @returns {'csv'|'json'|'xml'}
 */
export function detectFormat({ filename = '', mimetype = '' } = {}) {
  const name = String(filename).toLowerCase();
  const type = String(mimetype).toLowerCase();

  if (name.endsWith('.csv') || type.includes('csv')) return FORMAT.CSV;
  if (name.endsWith('.json') || type.includes('json')) return FORMAT.JSON;
  if (name.endsWith('.xml') || type.includes('xml')) return FORMAT.XML;

  throw new BadRequestError(
    'Unsupported or undetectable file format. Use .csv, .json, or .xml.'
  );
}

const CSV_ARRAY_FIELDS = ['tags'];

/**
 * Normalize a flat record (from CSV) by:
 *  - splitting delimited array fields (tags)
 *  - lifting dotted keys (metadata.source) into nested objects
 */
function normalizeFlatRecord(record) {
  const out = {};
  const metadata = {};

  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = rawKey.trim();
    let value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

    if (CSV_ARRAY_FIELDS.includes(key)) {
      value =
        value === '' || value == null
          ? []
          : String(value)
              .split(/[;|]/)
              .map((t) => t.trim())
              .filter(Boolean);
      out[key] = value;
      continue;
    }

    if (key.startsWith('metadata.')) {
      metadata[key.slice('metadata.'.length)] = value;
      continue;
    }

    out[key] = value;
  }

  if (Object.keys(metadata).length > 0) {
    out.metadata = { ...(out.metadata || {}), ...metadata };
  }

  return out;
}

/**
 * Parse a CSV buffer/string into an array of raw record objects.
 */
export function parseCsv(content) {
  let records;
  try {
    records = parseCsvSync(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    throw new BadRequestError(`Malformed CSV file: ${err.message}`);
  }
  return records.map(normalizeFlatRecord);
}

/**
 * Parse a JSON buffer/string into an array of raw record objects.
 * Accepts either a top-level array or { tickets: [...] }.
 */
export function parseJson(content) {
  let data;
  try {
    data = JSON.parse(content.toString());
  } catch (err) {
    throw new BadRequestError(`Malformed JSON file: ${err.message}`);
  }

  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.tickets)) return data.tickets;

  throw new BadRequestError(
    'JSON must be an array of tickets or an object with a "tickets" array.'
  );
}

/**
 * Parse an XML buffer/string into an array of raw record objects.
 * Expected shape: <tickets><ticket>...</ticket></tickets>.
 */
export function parseXml(content) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
    parseTagValue: false,
  });

  let data;
  try {
    data = parser.parse(content.toString());
  } catch (err) {
    throw new BadRequestError(`Malformed XML file: ${err.message}`);
  }

  const ticketsNode = data?.tickets?.ticket ?? data?.ticket;
  if (!ticketsNode) {
    throw new BadRequestError(
      'XML must contain <tickets><ticket>...</ticket></tickets>.'
    );
  }

  const list = Array.isArray(ticketsNode) ? ticketsNode : [ticketsNode];

  return list.map((node) => {
    const record = { ...node };
    if (record.tags != null) {
      const tagValue = record.tags?.tag ?? record.tags;
      if (Array.isArray(tagValue)) {
        record.tags = tagValue.map(String);
      } else if (typeof tagValue === 'string') {
        record.tags = tagValue
          .split(/[;|,]/)
          .map((t) => t.trim())
          .filter(Boolean);
      } else if (tagValue && typeof tagValue === 'object') {
        record.tags = [];
      }
    }
    return record;
  });
}

/**
 * Parse raw file content into an array of records based on the detected format.
 */
export function parseByFormat(content, format) {
  switch (format) {
    case FORMAT.CSV:
      return parseCsv(content);
    case FORMAT.JSON:
      return parseJson(content);
    case FORMAT.XML:
      return parseXml(content);
    default:
      throw new BadRequestError(`Unsupported format: ${format}`);
  }
}
