"""Integrator / Orchestrator for the multi-agent banking pipeline.

Sets up the shared/ directories, loads the raw transactions, wraps each in the standard message
envelope, and drives them through the agents in order:

    transaction_validator -> fraud_detector -> compliance_checker

Each message flows input/ -> processing/ -> output/ between stages (agents.md protocol). A
rejection at any stage short-circuits the rest. Every transaction's terminal message is written
to shared/results/<transaction_id>.json, a summary.json (with a cross-border breakdown) is
produced, and every step is appended to the audit log.

Run:  python integrator.py            (uses sample-transactions.json)
See specification.md §5 (Integrator) and agents.md.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import agents.common as common  # noqa: E402
from agents.common import make_message, move_to, read_message, write_message, audit, utc_now_iso  # noqa: E402
from agents import transaction_validator, fraud_detector, compliance_checker  # noqa: E402

# stage name -> handler; routing follows each message's target_agent
AGENTS = {
    "transaction_validator": transaction_validator.process_message,
    "fraud_detector": fraud_detector.process_message,
    "compliance_checker": compliance_checker.process_message,
}
FIRST_STAGE = "transaction_validator"


def _reset_shared() -> None:
    """Start each run clean: clear *.json from the shared stages and reset the audit log.

    Preserves .gitkeep files. The audit log is append-only *within* a run; we truncate it at
    the start so each run's trail is self-contained.
    """
    for d in (common.INPUT_DIR, common.PROCESSING_DIR, common.OUTPUT_DIR, common.RESULTS_DIR):
        d.mkdir(parents=True, exist_ok=True)
        for f in d.glob("*.json"):
            f.unlink()
    if common.AUDIT_LOG.exists():
        common.AUDIT_LOG.unlink()


def _process_one(record: dict) -> dict:
    """Drive a single transaction record through every stage; return its terminal data dict."""
    txn_id = record.get("transaction_id", "UNKNOWN")

    # integrator builds the initial envelope and drops it in input/
    message = make_message("integrator", FIRST_STAGE, "transaction", dict(record))
    path = write_message(common.INPUT_DIR, message)

    # route by target_agent until we reach the terminal target ("results")
    while message["target_agent"] in AGENTS:
        stage = message["target_agent"]
        path = move_to(path, common.PROCESSING_DIR)     # agent takes ownership: -> processing/
        incoming = read_message(path)
        outgoing = AGENTS[stage](incoming)              # agent does its work
        out_path = write_message(common.OUTPUT_DIR, outgoing)  # result -> output/
        path.unlink(missing_ok=True)                    # consumed the processing file
        message, path = outgoing, out_path

    # terminal message: persist to results/<transaction_id>.json (named by txn id, not msg id).
    # Sanctions screening (compliance) has already read the real account numbers upstream, so we
    # mask PII now — the durable result artifact must never store accounts in plaintext (spec §3).
    data = message["data"]
    for pii_field in ("source_account", "destination_account"):
        if pii_field in data:
            data[pii_field] = common.mask_account(data[pii_field])
    result_path = common.RESULTS_DIR / f"{txn_id}.json"
    with open(result_path, "w", encoding="utf-8") as fh:
        json.dump(message, fh, indent=2, ensure_ascii=False)
    path.unlink(missing_ok=True)                        # clean the leftover output/ file
    audit("integrator", txn_id, f"finalized:{data.get('status')}")
    return data


def _build_summary(results: list[dict]) -> dict:
    """Aggregate per-transaction outcomes into the pipeline summary (spec §4)."""
    approved = [d for d in results if d.get("status") == "approved"]
    rejected = [d for d in results if d.get("status") == "rejected"]
    flagged = [d for d in results if d.get("needs_review")]
    cross_border = [d for d in results if d.get("cross_border")]

    return {
        "generated_at": utc_now_iso(),
        "total": len(results),
        "approved": len(approved),
        "rejected": len(rejected),
        "flagged_for_review": len(flagged),
        "cross_border": {
            "total": len(cross_border),
            "approved": len([d for d in cross_border if d.get("status") == "approved"]),
            "rejected": len([d for d in cross_border if d.get("status") == "rejected"]),
        },
        "transactions": [
            {
                "transaction_id": d.get("transaction_id"),
                "status": d.get("status"),
                "cross_border": bool(d.get("cross_border")),
                "risk_score": d.get("risk_score"),
                "needs_review": bool(d.get("needs_review")),
                "reason": d.get("reason"),
                "compliance_flags": d.get("compliance_flags", []),
                "cross_border_compliance_flags": d.get("cross_border_compliance_flags", []),
            }
            for d in results
        ],
    }


def run_pipeline(transactions_path: str = "sample-transactions.json") -> dict:
    """Run the full pipeline over `transactions_path` and return the summary dict.

    Guarantees every input record lands in shared/results/ carrying an explicit cross_border
    boolean, writes shared/results/summary.json, and appends the audit trail.
    """
    path = Path(transactions_path)
    if not path.is_absolute():
        path = BASE_DIR / path

    _reset_shared()
    records = json.loads(path.read_text(encoding="utf-8"))

    results = [_process_one(record) for record in records]

    summary = _build_summary(results)
    with open(common.RESULTS_DIR / "summary.json", "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2, ensure_ascii=False)

    _print_summary(summary)
    return summary


def _print_summary(summary: dict) -> None:
    """Print a PII-free per-transaction summary (ids, outcomes, cross_border only)."""
    print("\n=== Pipeline Summary ===")
    print(f"Processed {summary['total']} transactions at {summary['generated_at']}")
    print(f"  approved={summary['approved']}  rejected={summary['rejected']}  "
          f"flagged_for_review={summary['flagged_for_review']}")
    cb = summary["cross_border"]
    print(f"  cross_border: total={cb['total']} (approved={cb['approved']}, rejected={cb['rejected']})")
    print()
    print(f"{'TXN ID':<10}{'STATUS':<10}{'CROSS_BORDER':<14}{'RISK':<6}{'REASON'}")
    print(f"{'-'*10}{'-'*10}{'-'*14}{'-'*6}{'-'*30}")
    for t in summary["transactions"]:
        print(f"{t['transaction_id']:<10}{t['status']:<10}{str(t['cross_border']):<14}"
              f"{str(t['risk_score'] if t['risk_score'] is not None else '-'):<6}{t['reason'] or ''}")


if __name__ == "__main__":
    run_pipeline()
