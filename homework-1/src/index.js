const express = require('express');

const transactionsRouter = require('./routes/transactions');
const accountsRouter = require('./routes/accounts');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Feature routers
app.use('/transactions', transactionsRouter);
app.use('/accounts', accountsRouter);

// 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Centralized error handler (mounted last). Returns JSON { error }.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'internal server error' });
});

// Only start listening when run directly (keeps the app importable in tests).
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Banking Transactions API listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
