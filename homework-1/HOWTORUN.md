# ▶️ How to Run the Banking Transactions API

Step-by-step instructions to run the API locally.

## 1. Prerequisites

- **Node.js 18 or newer** (the app uses the built-in `crypto.randomUUID()`; the
  seed script uses the global `fetch`). Check with:
  ```bash
  node --version
  ```
- **npm** (ships with Node). Check with:
  ```bash
  npm --version
  ```

## 2. Install dependencies

From the `homework-1` directory:

```bash
cd homework-1
npm install
```

## 3. Run the server

```bash
npm start          # production mode
```

For development with auto-reload on file changes:

```bash
npm run dev        # uses nodemon
```

Either way the API serves on **<http://localhost:3000>**. You should see:

```
Banking Transactions API listening on http://localhost:3000
```

Leave this terminal running and use a second terminal for the requests below.
(To run on a different port, set `PORT`, e.g. `PORT=4000 npm start`.)

## 4. Seed and test with the demo files

The `demo/` folder contains everything needed to exercise the API:

- **`demo/sample-data.json`** — four sample transactions (deposits, a transfer,
  and a withdrawal across `ACC-12345` / `ACC-67890`).
- **`demo/run.sh`** — helper script to start the server or seed sample data.
- **`demo/sample-requests.http`** — ready-to-send requests for the VS Code
  **REST Client** extension (or JetBrains HTTP Client). Open the file and click
  *Send Request* above any block.

With the server already running (step 3), seed it from a second terminal:

```bash
./demo/run.sh seed
```

You should see a `201` line with a new UUID for each of the four transactions.

> `demo/run.sh start` is an alternative way to launch the server (equivalent to
> `npm start`). The store is in-memory, so always start the server **before**
> seeding, and note that seeded data is cleared on restart.

## 5. Quick test (curl)

Run these in a second terminal while the server is up.

```bash
# 1) Create a transaction → 201 with the created record
curl -X POST localhost:3000/transactions \
  -H 'Content-Type: application/json' \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100.50,"currency":"USD","type":"transfer"}'

# 2) List all transactions
curl localhost:3000/transactions

# 3) Get an account balance (per currency)
curl localhost:3000/accounts/ACC-12345/balance

# 4) Trigger a validation error → 400 with a details array
curl -X POST localhost:3000/transactions \
  -H 'Content-Type: application/json' \
  -d '{"amount":-5}'
```

The validation error returns every problem at once, e.g.:

```json
{
  "error": "Validation failed",
  "details": [
    { "field": "amount", "message": "Amount must be a positive number" },
    { "field": "fromAccount", "message": "fromAccount must match the format ACC-XXXXX" }
  ]
}
```

## 6. Troubleshooting

**Port 3000 already in use** (`EADDRINUSE`). Either run on another port or stop
the process holding it:

```bash
PORT=4000 npm start          # run elsewhere
# — or find and kill the existing process —
lsof -ti:3000 | xargs kill   # macOS / Linux
```

**Missing dependencies** (`Cannot find module 'express'`). Install them from the
`homework-1` directory:

```bash
npm install
```

If installs behave oddly, clear and reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

**`crypto.randomUUID is not a function` / `fetch is not defined`.** Your Node.js
is older than 18 — upgrade Node and retry.

**`./demo/run.sh: Permission denied`.** Make the script executable:

```bash
chmod +x demo/run.sh
```
