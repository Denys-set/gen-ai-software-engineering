/**
 * Transaction request validation (Task 2).
 *
 * `validateTransaction` is a pure function: it takes a request body and
 * returns an array of `{ field, message }` errors. An empty array means the
 * body is valid. Keeping it free of Express/HTTP concerns makes it trivial to
 * unit test and reuse.
 */

// Allowed account number format: ACC- followed by one or more alphanumerics.
const ACCOUNT_REGEX = /^ACC-[A-Za-z0-9]+$/;

// Allowed transaction types.
const VALID_TYPES = ['deposit', 'withdrawal', 'transfer'];

// Whitelist of accepted ISO 4217 currency codes.
const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD'];

/**
 * True when `value` is a finite number with at most 2 decimal places.
 * @param {number} value
 * @returns {boolean}
 */
function hasAtMostTwoDecimals(value) {
  // Scale by 100, then check the result is (within float tolerance) an integer.
  // The tolerance guards against binary floating-point noise, e.g. 100.5 * 100.
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

/**
 * Validate a transaction request body.
 *
 * @param {Object} body - the parsed request body
 * @returns {Array<{field: string, message: string}>} list of validation errors
 */
function validateTransaction(body) {
  const errors = [];
  const { amount, fromAccount, toAccount, currency, type } = body || {};

  // amount: positive number, at most 2 decimal places.
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    errors.push({ field: 'amount', message: 'Amount must be a positive number' });
  } else if (!hasAtMostTwoDecimals(amount)) {
    errors.push({ field: 'amount', message: 'Amount must have at most 2 decimal places' });
  }

  // fromAccount: ACC-XXXXX format.
  if (typeof fromAccount !== 'string' || !ACCOUNT_REGEX.test(fromAccount)) {
    errors.push({ field: 'fromAccount', message: 'fromAccount must match the format ACC-XXXXX' });
  }

  // toAccount: ACC-XXXXX format.
  if (typeof toAccount !== 'string' || !ACCOUNT_REGEX.test(toAccount)) {
    errors.push({ field: 'toAccount', message: 'toAccount must match the format ACC-XXXXX' });
  }

  // currency: must be a whitelisted ISO 4217 code.
  if (typeof currency !== 'string' || !VALID_CURRENCIES.includes(currency)) {
    errors.push({ field: 'currency', message: 'Invalid currency code' });
  }

  // type: must be one of the allowed transaction types.
  if (typeof type !== 'string' || !VALID_TYPES.includes(type)) {
    errors.push({ field: 'type', message: 'Type must be one of: deposit, withdrawal, transfer' });
  }

  return errors;
}

module.exports = {
  validateTransaction,
  ACCOUNT_REGEX,
  VALID_TYPES,
  VALID_CURRENCIES,
};
