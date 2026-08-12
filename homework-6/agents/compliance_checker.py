"""Runtime Agent 3 — Compliance Checker (terminal agent).

Third cooperating agent. Applies compliance rules to a validated, fraud-scored transaction and
makes the terminal approved/rejected decision, then routes the message to results
(spec §5 + §2.4).

Rules:
  (1) CTR threshold        — amount >= $10,000 attaches a "CTR" compliance flag (domestic).
  (2) Cross-border EDD      — a cross-border transaction attaches an "EDD" (enhanced due
                              diligence) flag, tracked SEPARATELY from the domestic CTR flag
                              (spec §2.4 / §3): cross_border_compliance_flags vs compliance_flags.
  (3) Sanctions screening   — reject if source/destination account is on a configurable list.
  (4) Critical risk         — reject if risk_score >= 70.
  Otherwise -> approve. Review flags (fraud_review / cross_border_review) annotate but do not
  block an otherwise-clean transaction.

Never logs account numbers in plaintext — sanctions are matched in memory; audit records the
transaction id + outcome only.
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

AGENT_NAME = "compliance_checker"

# CTR + critical-risk thresholds now come from the configurable rule engine (config/rules.json) —
# see EXTENSION-PROMPTS.md Task 1. Sanctions screening is the new policy_agent's job, but this
# agent keeps an optional in-memory `sanctions` override for its own unit tests.
SANCTIONS_LIST: set[str] = set()


def evaluate(data: dict, sanctions: set[str] | None = None, engine=None) -> dict:
    """Pure compliance evaluation. Returns the fields to merge into data.

    No I/O — trivially unit-testable. Money handling and thresholds come from the rule engine.
    """
    engine = load_rules() if engine is None else engine
    sanctions = SANCTIONS_LIST if sanctions is None else sanctions

    compliance_flags: list[str] = []
    cross_border_compliance_flags: list[str] = []

    if engine.requires_ctr(data.get("amount")):
        compliance_flags.append("CTR")

    if data.get("cross_border"):
        cross_border_compliance_flags.append("EDD")  # enhanced due diligence

    sanctioned = (
        data.get("source_account") in sanctions
        or data.get("destination_account") in sanctions
    )
    risk_score = int(data.get("risk_score", 0) or 0)

    if sanctioned:
        status, reason = "rejected", "sanctions screening hit"
    elif risk_score >= engine.critical_risk_threshold():
        status, reason = "rejected", f"critical risk score {risk_score}"
    else:
        status, reason = "approved", None

    return {
        "compliance_flags": compliance_flags,
        "cross_border_compliance_flags": cross_border_compliance_flags,
        "status": status,
        "reason": reason,
    }


def process_message(message: dict) -> dict:
    """Decide the terminal outcome for message['data'] and route to results.

    Defensive: an already-rejected message passes straight through to results unchanged.
    """
    data = dict(message.get("data", {}))
    txn_id = data.get("transaction_id", "UNKNOWN")

    if data.get("status") == "rejected":
        audit(AGENT_NAME, txn_id, "skipped:already_rejected")
        return make_message(AGENT_NAME, "results", "transaction", data)

    result = evaluate(data)
    data.update(result)

    flags = data["compliance_flags"] + data["cross_border_compliance_flags"]
    if data["status"] == "approved":
        outcome = "approved"
        if data.get("needs_review"):
            outcome = "approved:flagged_for_review"
    else:
        outcome = f"rejected:{data['reason']}"
    if flags:
        outcome += f":{'|'.join(flags)}"
    audit(AGENT_NAME, txn_id, outcome)

    return make_message(AGENT_NAME, "results", "transaction", data)


if __name__ == "__main__":
    print("compliance_checker is a pipeline agent; run it via integrator.py")
