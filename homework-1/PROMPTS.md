# Prompt Log — Homework 1: Banking Transactions API

This is the companion **prompt log** for the project — the exact prompts I ran with the AI
assistant, organized by task and in execution order (copy-paste ready). For the narrative of
*how* I used AI (tool, workflow, and how I verified its output), see the **AI Usage** section of
**[README.md](./README.md)**.

**AI tool used:** Claude Code (Anthropic Claude — Opus model).

**Project at a glance:**
- **Stack:** Node.js + Express
- **Storage:** in-memory (no database)
- **Task 4 feature implemented:** Option B (Simple Interest)

**How to use this log:** run the prompts top-to-bottom. Each prompt is self-contained but assumes
the project context defined in the *Project Setup* prompt below.

---

## Shared context block (paste at the top of any prompt if starting a fresh AI session)

```
You are my pair-programming assistant. We are building a minimal REST API called the
"Banking Transactions API" using Node.js and Express, with in-memory storage (no database).

The Transaction model is:
{
  "id": "string (auto-generated, e.g. UUID)",
  "fromAccount": "string",
  "toAccount": "string",
  "amount": "number",
  "currency": "string (ISO 4217: USD, EUR, GBP, ...)",
  "type": "string (deposit | withdrawal | transfer)",
  "timestamp": "ISO 8601 datetime (auto-generated)",
  "status": "string (pending | completed | failed)"
}

Folder layout to follow:
src/index.js, src/routes/transactions.js, src/routes/accounts.js,
src/models/transaction.js, src/validators/transactionValidator.js, src/utils/helpers.js

Conventions: clear error handling, correct HTTP status codes (200/201/400/404),
small focused functions, and code I can run with `npm start` on port 3000.
Explain briefly what each file does after you generate it.
```

---

## 0️⃣ Project Setup / Scaffolding

```
Scaffold a new Node.js + Express project for the Banking Transactions API described above.

Deliver:
1. A package.json with: express dependency, a "start" script ("node src/index.js"),
   and a "dev" script using nodemon. Name it "banking-transactions-api", version 1.0.0.
2. The folder structure: src/index.js (Express app + server on port 3000, JSON body parsing,
   a basic health route GET / returning {status:"ok"}), plus empty placeholder files for
   routes/, models/, validators/, and utils/ as listed in the shared context.
3. A .gitignore that excludes node_modules/, .env, *.log, and OS files (.DS_Store).
4. Centralized error-handling middleware mounted last in index.js that returns JSON
   { "error": "..." } and the right status code.

Show me the exact npm commands to install dependencies and start the server.
```

---

## 1️⃣ Task 1 — Core API Implementation (Required)

```
Implement Task 1: the core REST API for the Banking Transactions API.

Create these four endpoints:
- POST /transactions            -> create a transaction, return 201 with the created object
- GET  /transactions            -> list all transactions, return 200
- GET  /transactions/:id        -> get one transaction by id; 200 if found, 404 if not
- GET  /accounts/:accountId/balance -> compute and return the account balance, 200

Rules:
- Use an in-memory array as the store (in src/models/transaction.js or a small store module).
- On POST, auto-generate `id` (UUID) and `timestamp` (ISO 8601), and default `status` to
  "completed" unless provided. Accept from Account, toAccount, amount, currency, type from the body.
- Validate that `amount` is a positive number; if not, return 400 with a JSON error message.
- Balance logic: for the given accountId, sum amounts where toAccount == accountId (credits)
  and subtract amounts where fromAccount == accountId (debits). Return
  { "accountId": "...", "balance": <number>, "currency": "..." }.
- Return correct status codes: 201 create, 200 reads, 400 bad input, 404 not found.

Put routes in src/routes/transactions.js and src/routes/accounts.js, mount them in src/index.js.
Keep validation minimal here (just positive amount) — deeper validation comes in Task 2.
```

---

## 2️⃣ Task 2 — Transaction Validation (Required)

```
Implement Task 2: full request validation for creating transactions.

Put all validation logic in src/validators/transactionValidator.js and call it from the
POST /transactions handler.

Validation rules:
- amount: must be a positive number with at most 2 decimal places.
- fromAccount and toAccount: must match the format ACC-XXXXX where X is alphanumeric
  (regex: /^ACC-[A-Za-z0-9]+$/).
- currency: must be a valid ISO 4217 code. Validate against a whitelist constant including at
  least USD, EUR, GBP, JPY, CHF, CAD, AUD.
- type: must be one of deposit | withdrawal | transfer.

When validation fails, return HTTP 400 with this exact shape, collecting ALL errors (not just the first):
{
  "error": "Validation failed",
  "details": [
    { "field": "amount", "message": "Amount must be a positive number" },
    { "field": "currency", "message": "Invalid currency code" }
  ]
}

Write the validator as a pure function that takes the request body and returns an array of
{field, message} errors (empty array = valid), so it is easy to unit test. Show me 2-3 example
curl requests that trigger different validation errors.
```

---

## 3️⃣ Task 3 — Transaction History / Filtering (Required)

```
Implement Task 3: filtering on the GET /transactions endpoint via query parameters.

Support these filters:
- ?accountId=ACC-12345  -> match transactions where fromAccount OR toAccount equals it
- ?type=transfer        -> match by transaction type
- ?from=2024-01-01&to=2024-01-31 -> inclusive date range filter on `timestamp`
- All filters must be combinable (AND logic) and all are optional.

Requirements:
- Validate date params parse as valid dates; if `from`/`to` are invalid, return 400 with a clear message.
- If no filters are passed, return all transactions (current behavior).
- Keep the filtering logic in a small reusable helper in src/utils/helpers.js.

Show me curl examples for: filter by account, filter by type, filter by date range,
and a combined filter (account + type).
```

---

## 4️⃣ Task 4 — Option B: Simple Interest Calculation

```
Implement Task 4 Option B: a simple-interest endpoint.

Endpoint: GET /accounts/:accountId/interest?rate=0.05&days=30

Behavior:
- Compute the account's current balance (reuse the Task 1 balance logic — do not duplicate it).
- Simple interest = balance * rate * (days / 365).
- Return 200 with:
  {
    "accountId": "...",
    "balance": <number>,
    "rate": <number>,
    "days": <number>,
    "interest": <number rounded to 2 decimals>,
    "currency": "..."
  }

Validation:
- `rate` must be a positive number (e.g. 0.05). `days` must be a positive integer.
- Missing or invalid rate/days -> 400 with a clear JSON error message.

Add this route to src/routes/accounts.js. Show me a sample curl call and its expected response.
```

---

## 5️⃣ Documentation — README.md

```
Fill in homework-1/README.md for this project. Keep the existing template header
(Student Name, Date Submitted, AI Tools Used) and complete the rest.

Include these sections:
- Project Overview: what the API does (in-memory banking transactions REST API).
- Features Implemented: bullet list mapping to the tasks — Core API (Task 1), Validation (Task 2),
  History/Filtering (Task 3), Simple Interest (Task 4B).
- API Reference: a table of all endpoints with method, path, description, and example.
- Architecture & Decisions: Node.js + Express, in-memory store rationale, folder structure,
  how validation is centralized, how balance is derived from transactions.
- Tech Stack and how to run (link to HOWTORUN.md).

Write it in clean Markdown. Be concise and accurate to the code we built — do not invent endpoints.
```

---

## 6️⃣ Documentation — HOWTORUN.md

```
Write homework-1/HOWTORUN.md with clear step-by-step instructions to run the Banking
Transactions API locally.

Include:
1. Prerequisites (Node.js version, npm).
2. Install: `npm install`.
3. Run: `npm start` (and `npm run dev` for nodemon), note it serves on http://localhost:3000.
4. How to seed/test using the demo files (demo/run.sh, demo/sample-requests.http,
   demo/sample-data.json).
5. A "Quick test" section with 3-4 ready curl commands: create a transaction, list all,
   get balance, and trigger a validation error.
6. Troubleshooting: port already in use, missing dependencies.

Use numbered steps and fenced code blocks. Keep it copy-paste friendly.
```

---

## 7️⃣ Demo Files

### 8a. `demo/run.sh`

```
Create demo/run.sh — a bash script that starts the Banking Transactions API.

It should:
- Print a friendly banner.
- Run `npm install` if node_modules is missing.
- Start the server with `npm start`.
- Be executable (remind me to run `chmod +x demo/run.sh`).
Include a shebang line and basic error handling (exit on failure).
```

### 8b. `demo/sample-requests.http`

```
Create demo/sample-requests.http using the VS Code REST Client format (### separated requests)
against http://localhost:3000. Cover every endpoint we built:

1. POST /transactions (a valid transfer using ACC-XXXXX accounts, amount 100.50 USD)
2. POST /transactions that FAILS validation (negative amount + invalid currency) to show the 400 error shape
3. GET /transactions (all)
4. GET /transactions?accountId=ACC-12345
5. GET /transactions?type=transfer
6. GET /transactions?from=2024-01-01&to=2024-12-31
7. GET /transactions/:id (use a placeholder id with a comment)
8. GET /accounts/ACC-12345/balance
9. GET /accounts/ACC-12345/interest?rate=0.05&days=30

Add a short comment above each request explaining what it demonstrates.
Also generate an equivalent demo/sample-requests.sh using curl for users without the REST Client extension.
```

### 8c. `demo/sample-data.json`

```
Create demo/sample-data.json with an array of 6-8 realistic sample transactions that match our
Transaction model. Requirements:
- Use account numbers in ACC-XXXXX format (e.g. ACC-12345, ACC-67890, ACC-11111).
- Mix of types: deposit, withdrawal, transfer.
- Valid ISO 4217 currencies (USD, EUR, GBP).
- Realistic amounts with up to 2 decimals, ISO 8601 timestamps across a few different dates,
  and statuses (mostly completed, one pending).
Then write a tiny note in a comment-free JSON (valid JSON only) — and separately, tell me a curl
loop I can use to POST every record from this file into the running API.
```

---

## 8️⃣ Refinement / Debugging (reusable iteration prompt)

```
The code you generated has an issue: <describe the exact symptom — error message, wrong output,
failing endpoint, or status code>.

Here is the relevant file / snippet:
<paste code>

And here is what I did and what happened:
<paste the request + actual response/stack trace>

Fix the root cause without changing the public API (endpoints, request/response shapes) or breaking
the other tasks. Explain what was wrong and what you changed. Keep the in-memory storage approach.
```

---

## 9️⃣ (Optional) Screenshot / Test Helper

```
Generate a single bash script (demo/smoke-test.sh) that I can run against the live server to
produce clean, screenshot-friendly output for my submission. It should sequentially:
1. Create a valid transaction and print the response.
2. Trigger a validation error (negative amount) and print the 400 response.
3. List all transactions.
4. Print an account balance.
5. Print a simple-interest calculation.

Use curl with -s and pretty-print JSON (via `jq` if available, otherwise raw). Add echo separators
with labels before each step so the screenshots are self-explanatory.
```
