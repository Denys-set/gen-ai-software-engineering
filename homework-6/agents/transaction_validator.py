"""Runtime Agent 1 — Transaction Validator.

First cooperating agent in the pipeline. Validates a raw transaction and forwards only valid
ones to the fraud_detector; rejected transactions are routed to results with a reason. See
specification.md §5 (Transaction Validator) and agents.md.

Also provides a `--dry-run` CLI used by the /validate-transactions skill (Task 3): it validates
every record in sample-transactions.json and prints total / valid / invalid counts + reasons
WITHOUT writing to shared/.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Support both "python agents/transaction_validator.py" and "import agents.transaction_validator".
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from agents.common import (  # type: ignore
        BASE_DIR, HOME_COUNTRY, audit, make_message, money,
    )
else:
    from .common import BASE_DIR, HOME_COUNTRY, audit, make_message, money

AGENT_NAME = "transaction_validator"

# Every field the validator requires to be present and non-empty.
REQUIRED_FIELDS = (
    "transaction_id",
    "timestamp",
    "source_account",
    "destination_account",
    "amount",
    "currency",
    "transaction_type",
)

# ISO-4217 currency whitelist (common codes; extend as needed). "XYZ" is intentionally absent.
ISO_4217 = {
    "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK",
    "DKK", "CNY", "HKD", "SGD", "INR", "BRL", "ZAR", "MXN", "PLN", "AED",
}

# --- Contested rule (see spec §2.3 vs. Step 2.3 prompt) --------------------------------------
# Spec §2.3 declares TXN007 (a -100.00 refund) a REJECTION regression case: non-positive amounts
# are rejected regardless of type. The Step 2.3 prompt instead asks for a refund carve-out that
# ALLOWS negatives when transaction_type == "refund". Because agents.md makes the spec
# authoritative ("change specification.md first, then the code"), the default follows the spec.
# Flip this to True (and update specification.md §2.3/§4) to enable the refund carve-out.
ALLOW_NEGATIVE_REFUNDS = False


def _is_cross_border(data: dict) -> bool:
    """Cross-border iff metadata.country is present and != HOME_COUNTRY. Jurisdiction, not PII."""
    country = (data.get("metadata") or {}).get("country")
    return country is not None and country != HOME_COUNTRY


def validate_data(data: dict) -> str | None:
    """Return a rejection reason string, or None if the transaction is valid.

    Reasons never contain PII — only field names, currency codes, and transaction ids.
    """
    # 1. required fields present and non-empty
    for field in REQUIRED_FIELDS:
        if field not in data or data[field] in (None, ""):
            return f"missing required field: {field}"

    # 2. amount parses as Decimal and satisfies the sign policy
    try:
        amount = money(data["amount"])
    except ValueError:
        return f"invalid amount: {data['amount']!r}"
    if amount == 0:
        return "amount must be non-zero"
    if amount < 0:
        is_refund = data.get("transaction_type") == "refund"
        if not (ALLOW_NEGATIVE_REFUNDS and is_refund):
            return "amount must be positive"

    # 3. currency is a valid ISO-4217 code
    currency = data["currency"]
    if currency not in ISO_4217:
        return f"unsupported currency: {currency}"

    return None


def process_message(message: dict) -> dict:
    """Validate the transaction in message['data'] and return the routed outgoing message.

    - Computes `cross_border` ONCE and threads it through data (spec §3) so every downstream
      agent and every result record carries it, even on rejection.
    - On success: data.status = "validated", routed to fraud_detector.
    - On failure: data.status = "rejected" with a reason, routed to results.
    Audits the decision (transaction id + outcome only — no PII).
    """
    data = dict(message.get("data", {}))
    txn_id = data.get("transaction_id", "UNKNOWN")

    # Cross-border is determined here, once, before validation may short-circuit — so a
    # rejected cross-border txn (e.g. TXN007) still carries cross_border in its result.
    data["cross_border"] = _is_cross_border(data)
    data.setdefault("cross_border_flags", [])

    reason = validate_data(data)
    if reason is not None:
        data["status"] = "rejected"
        data["reason"] = reason
        audit(AGENT_NAME, txn_id, f"rejected:{reason}")
        return make_message(AGENT_NAME, "results", "transaction", data)

    data["status"] = "validated"
    data.setdefault("reason", None)
    audit(AGENT_NAME, txn_id, "validated")
    return make_message(AGENT_NAME, "fraud_detector", "transaction", data)


# ---------------------------------------------------------------------------
# CLI — dry-run for the /validate-transactions skill
# ---------------------------------------------------------------------------
def _dry_run(transactions_path: Path) -> int:
    records = json.loads(Path(transactions_path).read_text(encoding="utf-8"))
    rows = []
    valid = invalid = 0
    for record in records:
        data = dict(record)
        data["cross_border"] = _is_cross_border(data)
        reason = validate_data(data)
        txn_id = data.get("transaction_id", "UNKNOWN")
        if reason is None:
            valid += 1
            rows.append((txn_id, "VALID", ""))
        else:
            invalid += 1
            rows.append((txn_id, "INVALID", reason))
        # dry-run does not touch shared/ — print an audit-style line to stdout instead
        print(f"[audit] {AGENT_NAME} | {txn_id} | {'valid' if reason is None else f'rejected:{reason}'}")

    print()
    print(f"Total: {len(records)}   Valid: {valid}   Invalid: {invalid}")
    print()
    print(f"{'TXN ID':<10} {'RESULT':<8} REASON")
    print(f"{'-'*10} {'-'*8} {'-'*40}")
    for txn_id, result, reason in rows:
        print(f"{txn_id:<10} {result:<8} {reason}")
    return 0 if invalid == 0 else 1


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Transaction Validator agent")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Validate sample-transactions.json and print counts/reasons without writing to shared/.",
    )
    parser.add_argument(
        "--input", default=str(BASE_DIR / "sample-transactions.json"),
        help="Path to the transactions JSON (default: sample-transactions.json).",
    )
    args = parser.parse_args(argv)

    if args.dry_run:
        return _dry_run(Path(args.input))

    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
