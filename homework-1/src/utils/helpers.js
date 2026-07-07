/**
 * Shared helpers.
 *
 * Filtering logic for GET /transactions (Task 3) lives here so it stays
 * pure and unit-testable, free of Express/HTTP concerns.
 */

// Matches a date-only string like "2024-01-31" (no time component).
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate the `from`/`to` date query params.
 *
 * Both are optional. When present they must parse to a valid date.
 *
 * @param {Object} params
 * @param {string} [params.from]
 * @param {string} [params.to]
 * @returns {Array<{field: string, message: string}>} validation errors (empty = valid)
 */
function validateDateFilters({ from, to } = {}) {
  const errors = [];

  if (from !== undefined && Number.isNaN(Date.parse(from))) {
    errors.push({ field: 'from', message: 'from must be a valid date (e.g. 2024-01-01)' });
  }
  if (to !== undefined && Number.isNaN(Date.parse(to))) {
    errors.push({ field: 'to', message: 'to must be a valid date (e.g. 2024-01-31)' });
  }

  return errors;
}

/**
 * Filter a list of transactions by optional criteria (AND logic).
 *
 * Any criterion left undefined is ignored, so passing an empty object returns
 * the full list. Callers should validate date params first via
 * {@link validateDateFilters}.
 *
 * @param {Array<Object>} transactions
 * @param {Object} [filters]
 * @param {string} [filters.accountId] - match if fromAccount OR toAccount equals it
 * @param {string} [filters.type] - match by transaction type
 * @param {string} [filters.from] - inclusive lower bound on `timestamp`
 * @param {string} [filters.to] - inclusive upper bound on `timestamp`
 * @returns {Array<Object>} the filtered transactions
 */
function filterTransactions(transactions, { accountId, type, from, to } = {}) {
  // A date-only `to` (e.g. "2024-01-31") is extended to end-of-day so the
  // whole day is included rather than just its midnight boundary.
  const fromTime = from !== undefined ? Date.parse(from) : null;
  const toTime =
    to !== undefined
      ? Date.parse(DATE_ONLY_REGEX.test(to) ? `${to}T23:59:59.999Z` : to)
      : null;

  return transactions.filter((t) => {
    if (accountId !== undefined && t.fromAccount !== accountId && t.toAccount !== accountId) {
      return false;
    }
    if (type !== undefined && t.type !== type) {
      return false;
    }

    if (fromTime !== null || toTime !== null) {
      const ts = Date.parse(t.timestamp);
      if (fromTime !== null && ts < fromTime) {
        return false;
      }
      if (toTime !== null && ts > toTime) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Compute an account's balance from its transactions, kept separate per
 * currency (money in different currencies is not additive):
 *   credits = sum of amounts where toAccount === accountId
 *   debits  = sum of amounts where fromAccount === accountId
 *   balance = credits - debits  (independently for each currency)
 *
 * @param {Array<Object>} transactions
 * @param {string} accountId
 * @returns {Array<{currency: string, balance: number}>}
 */
function computeBalances(transactions, accountId) {
  const byCurrency = new Map();

  const apply = (currency, delta) => {
    byCurrency.set(currency, (byCurrency.get(currency) || 0) + delta);
  };

  for (const t of transactions) {
    if (t.toAccount === accountId) apply(t.currency, t.amount);
    if (t.fromAccount === accountId) apply(t.currency, -t.amount);
  }

  return Array.from(byCurrency, ([currency, balance]) => ({ currency, balance }));
}

module.exports = { validateDateFilters, filterTransactions, computeBalances };
