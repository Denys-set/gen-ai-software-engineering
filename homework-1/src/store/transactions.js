/**
 * In-memory data store for transactions.
 *
 * For Task 1 we keep a single module-level array. Because Node caches
 * required modules, every importer shares the same `transactions` array,
 * which gives us a simple app-wide store with no database.
 */

const transactions = [];

module.exports = { transactions };
