"""Runtime Agent 2 — Fraud Detector.

Second cooperating agent. Scores a validated transaction for risk using additive rules and
routes it to the compliance_checker. Cross-border risk is tracked in fields SEPARATE from
domestic risk so a reviewer can tell *why* a transaction was flagged (spec §2.2, §2.4, §3).

Rules (additive, independent — spec §2.4):
  - high-value amount > $10,000            -> +50, risk_flags += "high_value"
  - off-hours UTC timestamp, hour in [0,6) -> +20, risk_flags += "off_hours"
  - cross-border (metadata.country != US)  -> +20, cross_border_flags += "cross_border:<cc>"

Review routing:
  - fraud_review        = risk_score >= 50            (domestic fraud threshold, per §5/agents.md)
  - cross_border_review = cross_border is True        (distinct flag, per §3)
  - needs_review        = fraud_review or cross_border_review  (so TXN004 is routed to review
                          via cross_border_review even though its score is 40 < 50)
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from agents.common import HOME_COUNTRY, audit, make_message, money  # type: ignore
else:
    from .common import HOME_COUNTRY, audit, make_message, money

AGENT_NAME = "fraud_detector"

HIGH_VALUE_THRESHOLD = Decimal("10000")
HIGH_VALUE_POINTS = 50
OFF_HOURS_POINTS = 20
CROSS_BORDER_POINTS = 20
FRAUD_REVIEW_THRESHOLD = 50  # per specification.md §5 / agents.md

OFF_HOURS_START = 0  # inclusive
OFF_HOURS_END = 6    # exclusive


def _hour_utc(timestamp: str) -> int | None:
    """Return the UTC hour of an ISO-8601 timestamp, or None if it can't be parsed."""
    if not timestamp:
        return None
    try:
        dt = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).hour


def score_transaction(data: dict) -> dict:
    """Compute risk fields for a validated transaction and return them as a dict.

    Pure function (no I/O) so it is trivially unit-testable. Uses Decimal for money.
    """
    risk_score = 0
    risk_flags: list[str] = []
    cross_border_flags: list[str] = []

    # high-value (domestic risk dimension) — Decimal comparison, never float
    try:
        amount = money(data.get("amount"))
    except ValueError:
        amount = Decimal("0")
    if amount > HIGH_VALUE_THRESHOLD:
        risk_score += HIGH_VALUE_POINTS
        risk_flags.append("high_value")

    # off-hours (domestic risk dimension)
    hour = _hour_utc(data.get("timestamp", ""))
    if hour is not None and OFF_HOURS_START <= hour < OFF_HOURS_END:
        risk_score += OFF_HOURS_POINTS
        risk_flags.append("off_hours")

    # cross-border (separate dimension) — reuse the flag the validator already threaded in
    cross_border = bool(data.get("cross_border"))
    if cross_border:
        risk_score += CROSS_BORDER_POINTS
        country = (data.get("metadata") or {}).get("country", "??")
        cross_border_flags.append(f"cross_border:{country}")

    fraud_review = risk_score >= FRAUD_REVIEW_THRESHOLD
    cross_border_review = cross_border
    return {
        "risk_score": risk_score,
        "risk_flags": risk_flags,
        "cross_border_flags": cross_border_flags,
        "fraud_review": fraud_review,
        "cross_border_review": cross_border_review,
        "needs_review": fraud_review or cross_border_review,
    }


def process_message(message: dict) -> dict:
    """Score message['data'] and route to compliance_checker.

    Defensive: if an already-rejected message somehow arrives, pass it through to results
    unchanged (the integrator normally short-circuits before this agent runs).
    """
    data = dict(message.get("data", {}))
    txn_id = data.get("transaction_id", "UNKNOWN")

    if data.get("status") == "rejected":
        audit(AGENT_NAME, txn_id, "skipped:already_rejected")
        return make_message(AGENT_NAME, "results", "transaction", data)

    data.update(score_transaction(data))
    data["status"] = "scored"

    flags = data["risk_flags"] + data["cross_border_flags"]
    outcome = f"scored:{data['risk_score']}"
    if flags:
        outcome += f":{'|'.join(flags)}"
    audit(AGENT_NAME, txn_id, outcome)

    return make_message(AGENT_NAME, "compliance_checker", "transaction", data)


if __name__ == "__main__":
    print("fraud_detector is a pipeline agent; run it via integrator.py")
