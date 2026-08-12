"""FastAPI REST gateway over the file-based banking pipeline (extension Task 2).

A **thin adapter**: it accepts a transaction over HTTP, runs it through the *same* runtime agents
via ``integrator.process_record``, and returns the *same* result JSON. No business logic lives
here. Account numbers are masked by the pipeline before they reach any response.

Endpoints:
  GET  /health                     -> {status, version}
  POST /transactions               -> run one transaction, 201 + result (accounts masked)
  GET  /transactions/{id}          -> the stored result for one transaction (404 if absent)
  GET  /results                    -> summary list of every processed transaction

Run:  uvicorn api.app:app --port 8100      (or python -m api.app)
Docs: http://localhost:8100/docs  (auto OpenAPI)

context7 lookups that shaped this file are recorded in research-notes.md (Query 3 & 4).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Optional

# Resolve homework-6/ so the pipeline modules import whether launched via uvicorn or python -m.
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi import FastAPI, HTTPException, status  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

import agents.common as common  # noqa: E402
import integrator  # noqa: E402  (provides process_record — the shared single-record entrypoint)

API_VERSION = "1.0"

app = FastAPI(
    title="banking-pipeline-api",
    version=API_VERSION,
    description="HTTP gateway over the multi-agent banking transaction pipeline.",
)

# Files in results/ that are NOT per-transaction records.
_NON_TXN_FILES = {"summary.json", "summary.txt"}


# ---------------------------------------------------------------------------
# Request / response models (Pydantic v2)
# ---------------------------------------------------------------------------
class Metadata(BaseModel):
    channel: Optional[str] = None
    country: Optional[str] = None


class TransactionIn(BaseModel):
    """One raw transaction. `amount` is a STRING to preserve Decimal precision (never float)."""
    transaction_id: str
    timestamp: str
    source_account: str
    destination_account: str
    amount: str = Field(..., examples=["1500.00"])
    currency: str = Field(..., examples=["USD"])
    transaction_type: str = Field(..., examples=["transfer"])
    description: Optional[str] = None
    metadata: Optional[Metadata] = None


class SubmitResponse(BaseModel):
    transaction_id: Optional[str] = None
    status: Optional[str] = None
    result: dict


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health() -> dict:
    """Liveness probe."""
    return {"status": "ok", "version": API_VERSION}


@app.post("/transactions", status_code=status.HTTP_201_CREATED, response_model=SubmitResponse)
def submit_transaction(txn: TransactionIn) -> SubmitResponse:
    """Run one transaction through the full pipeline and return its terminal result.

    Account numbers in the response are already masked by the pipeline (spec §3).
    """
    record = txn.model_dump(exclude_none=True)
    result = integrator.process_record(record)
    return SubmitResponse(
        transaction_id=result.get("transaction_id"),
        status=result.get("status"),
        result=result,
    )


@app.get("/transactions/{transaction_id}")
def get_transaction(transaction_id: str) -> dict:
    """Return the stored result for one transaction, or 404 if it hasn't been processed."""
    path = common.RESULTS_DIR / f"{transaction_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"no result for {transaction_id}")
    envelope = json.loads(path.read_text(encoding="utf-8"))
    return envelope.get("data", envelope)


@app.get("/results")
def list_results() -> dict:
    """Summarize every processed transaction (PII-safe: id + status + risk only)."""
    results = []
    if common.RESULTS_DIR.exists():
        for p in sorted(common.RESULTS_DIR.glob("*.json")):
            if p.name in _NON_TXN_FILES:
                continue
            try:
                data = json.loads(p.read_text(encoding="utf-8")).get("data", {})
            except (ValueError, OSError):
                continue
            results.append({
                "transaction_id": data.get("transaction_id", p.stem),
                "final_status": data.get("status"),
                "risk_score": data.get("risk_score"),
            })
    return {"count": len(results), "results": results}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api.app:app", host="127.0.0.1", port=8100, log_level="info")
