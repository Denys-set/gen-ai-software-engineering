# ▶️ How to Run the application

## Prerequisites
- Node.js 18+ (uses the built-in `crypto.randomUUID()`)
- npm

## Install
```bash
cd homework-1
npm install
```

## Run
```bash
npm start        # serves on http://localhost:3000
npm run dev      # auto-reload via nodemon
```

## Quick test
```bash
# Create a transaction
curl -X POST localhost:3000/transactions \
  -H 'Content-Type: application/json' \
  -d '{"fromAccount":"ACC-111","toAccount":"ACC-222","amount":100.5,"currency":"USD","type":"transfer"}'

# List all transactions
curl localhost:3000/transactions

# Get an account balance
curl localhost:3000/accounts/ACC-222/balance

# Trigger a validation error (400)
curl -X POST localhost:3000/transactions \
  -H 'Content-Type: application/json' \
  -d '{"amount":-5}'
```