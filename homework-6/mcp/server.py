"""Custom FastMCP server — "pipeline-status".

Makes the banking pipeline queryable over MCP. Reads only from shared/results/ and exposes:

  - tool  get_transaction_status(transaction_id) -> dict   (final status of one transaction)
  - tool  list_pipeline_results()                -> dict   (summary of every processed txn)
  - resource pipeline://summary                  -> str    (latest run summary as text)

PII-safe: only transaction_id and outcome fields are ever returned — never account numbers or
names. Paths are resolved relative to THIS file so the server works from any launch directory.

Run (stdio):  python mcp/server.py
Built with FastMCP (context7: /prefecthq/fastmcp — see research-notes.md Query 2).
"""
from __future__ import annotations

import json
from pathlib import Path

from fastmcp import FastMCP

# Resolve shared/results relative to this file (mcp/ -> homework-6/), not the CWD.
RESULTS_DIR = Path(__file__).resolve().parent.parent / "shared" / "results"

# Files in results/ that are NOT per-transaction records.
NON_TXN_FILES = {"summary.json", "summary.txt", "audit.log"}

# Whitelisted, non-PII fields we are willing to surface from a result record.
_SAFE_FIELDS = (
    "risk_score", "reason", "cross_border",
    "compliance_flags", "cross_border_compliance_flags",
    "needs_review",
)

mcp = FastMCP("pipeline-status")


# ---------------------------------------------------------------------------
# Core logic (pure helpers — unit-testable without an MCP client)
# ---------------------------------------------------------------------------
def _load_record(path: Path) -> dict:
    """Load a result file and return its inner transaction `data` dict."""
    envelope = json.loads(path.read_text(encoding="utf-8"))
    return envelope.get("data", envelope)


def _safe_view(data: dict) -> dict:
    """Project a transaction record onto its non-PII, outcome-relevant fields."""
    view = {
        "transaction_id": data.get("transaction_id"),
        "final_status": data.get("status"),
    }
    for field in _SAFE_FIELDS:
        if field in data:
            view[field] = data[field]
    return view


def get_transaction_status_impl(transaction_id: str) -> dict:
    """Return the current status of a single transaction from shared/results/."""
    if not transaction_id:
        return {"transaction_id": transaction_id, "found": False,
                "message": "no transaction_id provided"}
    path = RESULTS_DIR / f"{transaction_id}.json"
    if not path.exists():
        return {"transaction_id": transaction_id, "found": False,
                "message": f"no result for {transaction_id} — run the pipeline first"}
    try:
        data = _load_record(path)
    except (ValueError, OSError) as exc:
        return {"transaction_id": transaction_id, "found": False,
                "message": f"could not read result: {exc}"}
    view = _safe_view(data)
    view["found"] = True
    return view


def list_pipeline_results_impl() -> dict:
    """Summarize every processed transaction in shared/results/."""
    if not RESULTS_DIR.exists():
        return {"count": 0, "results": [], "message": "no results yet — run the pipeline"}
    results = []
    for path in sorted(RESULTS_DIR.glob("*.json")):
        if path.name in NON_TXN_FILES:
            continue
        try:
            data = _load_record(path)
        except (ValueError, OSError):
            continue
        results.append({
            "transaction_id": data.get("transaction_id", path.stem),
            "final_status": data.get("status"),
            "risk_score": data.get("risk_score"),
        })
    return {"count": len(results), "results": results}


def read_summary_impl() -> str:
    """Return the latest pipeline run summary as text.

    Prefers a human-authored summary.txt; otherwise renders summary.json to readable text;
    otherwise returns a friendly not-yet-run message.
    """
    txt = RESULTS_DIR / "summary.txt"
    if txt.exists():
        return txt.read_text(encoding="utf-8")

    js = RESULTS_DIR / "summary.json"
    if js.exists():
        try:
            s = json.loads(js.read_text(encoding="utf-8"))
        except (ValueError, OSError) as exc:
            return f"summary.json present but unreadable: {exc}"
        cb = s.get("cross_border", {})
        lines = [
            "Pipeline Summary",
            f"  generated_at:        {s.get('generated_at')}",
            f"  total:               {s.get('total')}",
            f"  approved:            {s.get('approved')}",
            f"  rejected:            {s.get('rejected')}",
            f"  flagged_for_review:  {s.get('flagged_for_review')}",
            f"  cross_border:        total={cb.get('total')} "
            f"(approved={cb.get('approved')}, rejected={cb.get('rejected')})",
            "",
            "Transactions:",
        ]
        for t in s.get("transactions", []):
            lines.append(
                f"  {t.get('transaction_id')}: {t.get('status')} "
                f"(risk={t.get('risk_score')}, cross_border={t.get('cross_border')})"
                + (f" — {t.get('reason')}" if t.get("reason") else "")
            )
        return "\n".join(lines)

    return "No pipeline summary yet — run `python integrator.py` to generate one."


# ---------------------------------------------------------------------------
# MCP surface (thin wrappers delegating to the helpers above)
# ---------------------------------------------------------------------------
@mcp.tool
def get_transaction_status(transaction_id: str) -> dict:
    """Return the current status of a single transaction (final_status, risk_score, reason)."""
    return get_transaction_status_impl(transaction_id)


@mcp.tool
def list_pipeline_results() -> dict:
    """Return a summary of every processed transaction (transaction_id, final_status, risk_score)."""
    return list_pipeline_results_impl()


@mcp.resource("pipeline://summary")
def pipeline_summary() -> str:
    """Return the latest pipeline run summary as text."""
    return read_summary_impl()


if __name__ == "__main__":
    mcp.run()  # stdio transport by default
