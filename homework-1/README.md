# 🏦 Homework 1: Banking Transactions API

> **Student Name**: Denys Kubrakov
> **Date Submitted**: 2026-06-29
> **AI Tools Used**: Claude Code (Opus)

---

## 📋 Project Overview

A minimal **in-memory Banking Transactions REST API** built with Node.js and
Express. It lets you create transactions between accounts, look them up
individually or as a filtered history, and derive per-account balances and
simple interest — all without a database. Transactions are validated on the way
in, and balances are computed on demand from the transaction log rather than
stored as mutable state.

## ✨ Features Implemented

- **Core API (Task 1)** — create a transaction, list all transactions, fetch a
  transaction by id, and get an account balance. Transactions get an
  auto-generated UUID `id`, an ISO 8601 `timestamp`, and a default `status` of
  `completed`. Returns appropriate status codes (`200`, `201`, `400`, `404`).
- **Validation (Task 2)** — every create request is validated and **all**
  errors are returned together as `{ error, details }`: positive `amount` with
  at most 2 decimal places, `fromAccount`/`toAccount` matching `ACC-XXXXX`,
  whitelisted ISO 4217 `currency`, and `type` of `deposit | withdrawal | transfer`.
- **History / Filtering (Task 3)** — `GET /transactions` accepts optional
  `accountId`, `type`, and `from`/`to` date-range query params, combined with
  AND logic. A date-only `to` is extended to end-of-day so the full day is
  included; invalid dates return `400`.
- **Simple Interest (Task 4B)** — `GET /accounts/:accountId/interest` computes
  `balance × rate × (days / 365)` on the account's current balance, reusing the
  same balance logic as the balance endpoint.

> Balances are tracked **per currency** (money in different currencies is not
> additive), so the balance endpoint returns an array of `{ currency, balance }`
> and the interest endpoint accepts an optional `?currency=` when an account
> holds more than one.

## 📚 API Reference

Base URL: `http://localhost:3000`

| Method | Path | Description | Example |
|--------|------|-------------|---------|
| `GET` | `/` | Health check, returns `{ "status": "ok" }`. | `curl localhost:3000/` |
| `POST` | `/transactions` | Create a transaction. `201` on success, `400` with `details` on validation failure. | `curl -X POST localhost:3000/transactions -H 'Content-Type: application/json' -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100.50,"currency":"USD","type":"transfer"}'` |
| `GET` | `/transactions` | List transactions; optional filters `accountId`, `type`, `from`, `to`. | `curl "localhost:3000/transactions?accountId=ACC-12345&type=transfer"` |
| `GET` | `/transactions/:id` | Get one transaction by id, or `404`. | `curl localhost:3000/transactions/<id>` |
| `GET` | `/accounts/:accountId/balance` | Account balance per currency: `{ accountId, balances: [{ currency, balance }] }`. | `curl localhost:3000/accounts/ACC-12345/balance` |
| `GET` | `/accounts/:accountId/interest` | Simple interest on the current balance. Requires `rate` (positive) and `days` (positive integer); `currency` optional. | `curl "localhost:3000/accounts/ACC-12345/interest?rate=0.05&days=30"` |

**Transaction shape:**

```json
{
  "id": "85b2f985-ae07-44df-b71f-e979c656808e",
  "fromAccount": "ACC-00000",
  "toAccount": "ACC-12345",
  "amount": 1000.00,
  "currency": "USD",
  "type": "deposit",
  "status": "completed",
  "timestamp": "2026-06-29T12:00:00.000Z"
}
```

## 🏗️ Architecture & Decisions

**Node.js + Express.** Express keeps routing and JSON parsing minimal so the
focus stays on the domain logic. The only runtime dependency is `express`;
`nodemon` is a dev dependency for auto-reload.

**In-memory store.** Transactions live in a single module-level array
(`src/store/transactions.js`). Node caches required modules, so every importer
shares the same array — giving an app-wide store with zero database setup, as
the assignment allows. Trade-off: data resets on restart, which is fine for a
demo/learning project.

**Balance derived from transactions.** Balances are never stored as mutable
fields. `computeBalances` folds over the transaction log — crediting the
`toAccount` and debiting the `fromAccount` for each transaction — and groups the
result by currency. This keeps the log as the single source of truth and means
the balance and interest endpoints can't drift out of sync with the data. The
interest endpoint reuses `computeBalances` directly.

**Centralized validation.** All create-request validation lives in
`src/validators/transactionValidator.js` as a pure `validateTransaction(body)`
function that returns an array of `{ field, message }` errors (empty = valid).
It has no Express/HTTP concerns, so it's easy to test and reuse, and the route
simply turns a non-empty result into a `400`. Date-filter validation lives
beside the filtering logic in `src/utils/helpers.js` for the same reason.

**Folder structure:**

```
homework-1/
├── src/
│   ├── index.js                      # Express app: wiring, health check, 404 + error handler
│   ├── routes/
│   │   ├── transactions.js           # POST / GET /transactions, GET /transactions/:id
│   │   └── accounts.js               # GET /accounts/:id/balance and /interest
│   ├── models/
│   │   └── transaction.js            # createTransaction() factory (id, timestamp, status)
│   ├── validators/
│   │   └── transactionValidator.js   # pure validateTransaction() (Task 2)
│   ├── store/
│   │   └── transactions.js           # shared in-memory array
│   └── utils/
│       └── helpers.js                # filterTransactions, validateDateFilters, computeBalances
├── demo/                             # run script + sample requests/data
├── docs/screenshots/
├── HOWTORUN.md
└── package.json
```

## 🧰 Tech Stack

- **Runtime:** Node.js 18+ (uses the built-in `crypto.randomUUID()`)
- **Framework:** Express 4
- **Dev tooling:** nodemon (auto-reload)
- **Storage:** in-memory array (no database)

## 🤖 AI Usage

This project was built with **Claude Code (Anthropic Claude — Opus model)**, used as a
pair-programming assistant from the terminal. No other AI tools were used.

I worked in a **prompt → review → test → refine** loop:

1. **Prompt** — each task was driven by a focused, self-contained prompt, starting from a shared
   project-context block so the AI always knew the model, folder layout, and conventions.
2. **Review** — I read every generated file rather than blind-pasting, checking it against the
   task requirements and the in-memory-storage constraint.
3. **Test** — I ran the API and exercised each endpoint with `curl` and the demo scripts
   (`demo/run.sh`, `demo/smoke-test.sh`) before moving on.
4. **Refine** — when output was wrong or incomplete, I iterated with a reusable refinement prompt
   until it passed.

📄 The exact prompts I used, in order, are logged in **[PROMPTS.md](./PROMPTS.md)**.
📸 Screenshots of the AI interactions and the running API are in
**[`docs/screenshots/`](./docs/screenshots/)**.

## ▶️ How to Run

See **[HOWTORUN.md](./HOWTORUN.md)** for full setup, run, seed, and test
instructions. In short: `npm install`, then `npm start`, and the API serves on
<http://localhost:3000>.

<div align="center">

*This project was completed as part of the AI-Assisted Development course.*

</div>
