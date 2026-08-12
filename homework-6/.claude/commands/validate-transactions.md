---
description: Validate all transactions in sample-transactions.json (dry-run) without running the full pipeline; report valid/invalid counts + reasons.
---

# /validate-transactions — validate without processing

Validate every transaction in `sample-transactions.json` **without** running the fraud/compliance
stages or writing to `shared/`. Work from the `homework-6/` project root and use **`python3.12`**.

Steps:

1. **Run the validator in dry-run mode.**
   ```bash
   python3.12 agents/transaction_validator.py --dry-run
   ```
   This validates required fields, positive `Decimal` amount, and ISO-4217 currency for each
   record. It prints per-decision audit lines to stdout and writes **nothing** to `shared/`.

2. **Report the counts.** From the command's output, report:
   - **Total** transactions
   - **Valid** count (routed onward to the fraud detector in a real run)
   - **Invalid** count, with the **reason** for each rejection

3. **Show the results table.** The command already prints a `TXN ID | RESULT | REASON` table —
   surface it. Expected against the sample data: 8 total, 6 valid, 2 invalid
   (`TXN006` unsupported currency `XYZ`; `TXN007` non-positive amount).

Finish with a one-line verdict, e.g. "8 checked → 6 valid, 2 invalid."
