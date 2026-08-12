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
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from agents.common import audit, make_message  # type: ignore
    from rules.engine import load_rules  # type: ignore
else:
    from .common import audit, make_message
    from rules.engine import load_rules

AGENT_NAME = "fraud_detector"

# All thresholds/points now come from the configurable rule engine (config/rules.json) —
# see EXTENSION-PROMPTS.md Task 1. Pass a custom engine to score_transaction() to override.


def score_transaction(data: dict, engine=None) -> dict:
    """Compute risk fields for a validated transaction and return them as a dict.

    Pure function (no I/O) so it is trivially unit-testable. Uses Decimal for money and reads
    every threshold from the rule engine (defaults to the config/rules.json singleton).
    """
    engine = load_rules() if engine is None else engine

    risk_score = 0
    risk_flags: list[str] = []
    cross_border_flags: list[str] = []

    # high-value (domestic risk dimension) — Decimal comparison, never float
    if engine.is_high_value(data.get("amount")):
        risk_score += engine.high_value_points()
        risk_flags.append("high_value")

    # off-hours (domestic risk dimension) — engine returns points (0 when outside the window)
    off_hours_points = engine.off_hours_points_for(data.get("timestamp", ""))
    if off_hours_points > 0:
        risk_score += off_hours_points
        risk_flags.append("off_hours")

    # cross-border (separate dimension) — reuse the flag the validator already threaded in
    cross_border = bool(data.get("cross_border"))
    if cross_border:
        risk_score += engine.cross_border_points()
        country = (data.get("metadata") or {}).get("country", "??")
        cross_border_flags.append(f"cross_border:{country}")

    fraud_review = risk_score >= engine.fraud_review_threshold()
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

    # Route to the policy_agent (sanctions screen) which then hands off to compliance_checker.
    return make_message(AGENT_NAME, "policy_agent", "transaction", data)


if __name__ == "__main__":
    print("fraud_detector is a pipeline agent; run it via integrator.py")
