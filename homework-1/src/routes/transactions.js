const express = require('express');
const { transactions } = require('../store/transactions');
const { createTransaction } = require('../models/transaction');
const { validateTransaction } = require('../validators/transactionValidator');
const { validateDateFilters, filterTransactions } = require('../utils/helpers');

const router = express.Router();

/**
 * POST /transactions
 * Create a new transaction.
 *
 * Validation (Task 2) lives in transactionValidator and collects ALL errors.
 * On failure we return HTTP 400 with { error, details }.
 */
router.post('/', (req, res) => {
  const { fromAccount, toAccount, amount, currency, type, status } = req.body || {};

  const errors = validateTransaction(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const transaction = createTransaction({ fromAccount, toAccount, amount, currency, type, status });
  transactions.push(transaction);

  return res.status(201).json(transaction);
});

/**
 * GET /transactions
 * Return transactions, optionally filtered (Task 3).
 *
 * Query params (all optional, combined with AND logic):
 *   ?accountId=ACC-12345        match where fromAccount OR toAccount equals it
 *   ?type=transfer              match by transaction type
 *   ?from=2024-01-01&to=...     inclusive date range on `timestamp`
 *
 * With no params the full list is returned. Invalid dates yield a 400.
 */
router.get('/', (req, res) => {
  const { accountId, type, from, to } = req.query;

  const errors = validateDateFilters({ from, to });
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Invalid filter parameters', details: errors });
  }

  const result = filterTransactions(transactions, { accountId, type, from, to });
  return res.status(200).json(result);
});

/**
 * GET /transactions/:id
 * Return a single transaction by id, or 404 if not found.
 */
router.get('/:id', (req, res) => {
  const transaction = transactions.find((t) => t.id === req.params.id);

  if (!transaction) {
    return res.status(404).json({ error: 'transaction not found' });
  }

  return res.status(200).json(transaction);
});

module.exports = router;
