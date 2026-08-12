"""Runtime Agent — Policy / Sanctions screen (NEW, extension Task 1.4).

Fourth cooperating agent. Sits between the fraud detector and the compliance checker and runs a
**configurable** sanctions / restricted-country screen driven entirely by the rule engine
(config/rules.json) — so screening policy is data, not code. Making it its own stage keeps the
sanctions decision independently auditable.

Rules (from rules.engine):
  - restricted country  — reject if metadata.country is in `sanctioned_countries`
  - restricted account  — reject if source/destination account is in `sanctioned_accounts`
                          (accounts are matched in memory and NEVER logged in plaintext)

On a hit  -> status='rejected', reason='sanctions screening hit', policy_flags += the reason,
             routed straight to results (short-circuits compliance).
Otherwise -> policy_flags += 'screened_clear', routed to compliance_checker.

Only transaction_id + outcome + cross_border reach the audit log — never account numbers.
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

AGENT_NAME = "policy_agent"


def screen(data: dict, engine=None) -> dict:
    """Pure sanctions screen. Returns the fields to merge into data (no I/O).

    Reads `sanctioned_countries` / `sanctioned_accounts` from the rule engine (defaults to the
    config/rules.json singleton; pass a custom engine to override in tests).
    """
    engine = load_rules() if engine is None else engine

    country = (data.get("metadata") or {}).get("country")
    sanctioned = engine.is_sanctioned(
        country=country,
        source_account=data.get("source_account"),
        destination_account=data.get("destination_account"),
    )

    policy_flags: list[str] = []
    if sanctioned:
        policy_flags.append("sanctions_hit")
        return {"policy_flags": policy_flags, "sanctioned": True,
                "status": "rejected", "reason": "sanctions screening hit"}

    policy_flags.append("screened_clear")
    return {"policy_flags": policy_flags, "sanctioned": False}


def process_message(message: dict, engine=None) -> dict:
    """Screen message['data'] and route onward (compliance) or to results (on a hit).

    Defensive: an already-rejected message passes straight through to results unchanged.
    """
    data = dict(message.get("data", {}))
    txn_id = data.get("transaction_id", "UNKNOWN")

    if data.get("status") == "rejected":
        audit(AGENT_NAME, txn_id, "skipped:already_rejected")
        return make_message(AGENT_NAME, "results", "transaction", data)

    result = screen(data, engine)
    sanctioned = result.pop("sanctioned")
    data.update(result)

    if sanctioned:
        audit(AGENT_NAME, txn_id, "rejected:sanctions_hit")
        return make_message(AGENT_NAME, "results", "transaction", data)

    audit(AGENT_NAME, txn_id, "screened_clear")
    return make_message(AGENT_NAME, "compliance_checker", "transaction", data)


if __name__ == "__main__":
    print("policy_agent is a pipeline agent; run it via integrator.py")
