const express = require('express');
const { transactions } = require('../store/transactions');

const router = express.Router();

/**
 * GET /accounts/:accountId/balance
 * Compute the balance for an account from its transactions, kept separate
 * per currency (money in different currencies is not additive):
 *   credits = sum of amounts where toAccount === accountId
 *   debits  = sum of amounts where fromAccount === accountId
 *   balance = credits - debits  (computed independently for each currency)
 *
 * Returns { accountId, balances: [ { currency, balance }, ... ] }.
 */
router.get('/:accountId/balance', (req, res) => {
  const { accountId } = req.params;

  // Map of currency -> running balance.
  const byCurrency = new Map();

  const apply = (currency, delta) => {
    byCurrency.set(currency, (byCurrency.get(currency) || 0) + delta);
  };

  for (const t of transactions) {
    if (t.toAccount === accountId) apply(t.currency, t.amount);
    if (t.fromAccount === accountId) apply(t.currency, -t.amount);
  }

  const balances = Array.from(byCurrency, ([currency, balance]) => ({ currency, balance }));

  return res.status(200).json({ accountId, balances });
});

module.exports = router;
