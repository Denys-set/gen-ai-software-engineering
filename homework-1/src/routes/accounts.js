const express = require('express');
const { transactions } = require('../store/transactions');
const { computeBalances } = require('../utils/helpers');

const router = express.Router();

/**
 * GET /accounts/:accountId/balance
 * Return the account's balance per currency:
 *   { accountId, balances: [ { currency, balance }, ... ] }
 */
router.get('/:accountId/balance', (req, res) => {
  const { accountId } = req.params;
  const balances = computeBalances(transactions, accountId);

  return res.status(200).json({ accountId, balances });
});

/**
 * GET /accounts/:accountId/interest?rate=0.05&days=30
 * Compute simple interest on the account's current balance:
 *   interest = balance * rate * (days / 365)
 *
 * Reuses the balance logic in computeBalances. Because balances are tracked
 * per currency, an optional ?currency= selects which one to use; it may be
 * omitted when the account holds exactly one currency.
 */
router.get('/:accountId/interest', (req, res) => {
  const { accountId } = req.params;
  const { rate, days, currency } = req.query;

  // Validate rate: positive number.
  const rateNum = Number(rate);
  if (rate === undefined || !Number.isFinite(rateNum) || rateNum <= 0) {
    return res.status(400).json({ error: 'rate must be a positive number (e.g. 0.05)' });
  }

  // Validate days: positive integer.
  const daysNum = Number(days);
  if (days === undefined || !Number.isInteger(daysNum) || daysNum <= 0) {
    return res.status(400).json({ error: 'days must be a positive integer' });
  }

  const balances = computeBalances(transactions, accountId);

  // Resolve which currency balance to apply interest to.
  let selected;
  if (currency !== undefined) {
    selected = balances.find((b) => b.currency === currency) || { currency, balance: 0 };
  } else if (balances.length <= 1) {
    selected = balances[0] || { currency: null, balance: 0 };
  } else {
    return res.status(400).json({
      error: 'Account holds multiple currencies; specify one via ?currency=',
      currencies: balances.map((b) => b.currency),
    });
  }

  const interest = Number((selected.balance * rateNum * (daysNum / 365)).toFixed(2));

  return res.status(200).json({
    accountId,
    balance: selected.balance,
    rate: rateNum,
    days: daysNum,
    interest,
    currency: selected.currency,
  });
});

module.exports = router;
