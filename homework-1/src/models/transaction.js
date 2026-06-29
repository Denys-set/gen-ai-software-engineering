const crypto = require('crypto');

/**
 * Factory for a Transaction record.
 *
 * Auto-generates `id` (UUID) and `timestamp` (ISO 8601), and defaults
 * `status` to "completed" when the caller did not provide one.
 *
 * @param {Object} input
 * @param {string} input.fromAccount
 * @param {string} input.toAccount
 * @param {number} input.amount
 * @param {string} input.currency
 * @param {string} input.type
 * @param {string} [input.status]
 * @returns {Object} the created transaction
 */
function createTransaction({ fromAccount, toAccount, amount, currency, type, status }) {
  return {
    id: crypto.randomUUID(),
    fromAccount,
    toAccount,
    amount,
    currency,
    type,
    status: status || 'completed',
    timestamp: new Date().toISOString(),
  };
}

module.exports = { createTransaction };
