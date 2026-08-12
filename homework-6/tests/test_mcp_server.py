"""Unit tests for the custom FastMCP server helpers (mcp/server.py).

The server module is loaded by file path (not `import mcp.server`) to avoid colliding with the
installed `mcp` SDK that fastmcp depends on.
"""
import importlib.util
import json
from pathlib import Path

import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("pipeline_status_server", BASE_DIR / "mcp" / "server.py")
server = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(server)


def _write_result(results_dir: Path, txn_id: str, data: dict):
    results_dir.mkdir(parents=True, exist_ok=True)
    (results_dir / f"{txn_id}.json").write_text(json.dumps({"message_id": "x", "data": data}))


@pytest.fixture
def results(tmp_path, monkeypatch):
    d = tmp_path / "results"
    d.mkdir()
    monkeypatch.setattr(server, "RESULTS_DIR", d)
    return d


def test_get_status_found(results):
    _write_result(results, "TXN005", {"transaction_id": "TXN005", "status": "approved",
                                      "risk_score": 50, "reason": None,
                                      "source_account": "ACC-****"})
    r = server.get_transaction_status_impl("TXN005")
    assert r["found"] is True
    assert r["final_status"] == "approved"
    assert r["risk_score"] == 50
    assert "source_account" not in r          # PII never surfaced


def test_get_status_missing(results):
    r = server.get_transaction_status_impl("NOPE")
    assert r["found"] is False
    assert "no result" in r["message"]


def test_get_status_empty_id(results):
    r = server.get_transaction_status_impl("")
    assert r["found"] is False


def test_get_status_corrupt_file(results):
    (results / "TXN009.json").write_text("{not json")
    r = server.get_transaction_status_impl("TXN009")
    assert r["found"] is False
    assert "could not read" in r["message"]


def test_list_results_skips_non_txn_files(results):
    _write_result(results, "TXN001", {"transaction_id": "TXN001", "status": "approved", "risk_score": 0})
    _write_result(results, "TXN002", {"transaction_id": "TXN002", "status": "rejected", "risk_score": None})
    (results / "summary.json").write_text("{}")     # must be skipped
    (results / "audit.log").write_text("noise")     # not .json, ignored
    r = server.list_pipeline_results_impl()
    assert r["count"] == 2
    ids = {row["transaction_id"] for row in r["results"]}
    assert ids == {"TXN001", "TXN002"}


def test_list_results_skips_corrupt(results):
    _write_result(results, "TXN001", {"transaction_id": "TXN001", "status": "approved", "risk_score": 0})
    (results / "TXN002.json").write_text("{broken")
    r = server.list_pipeline_results_impl()
    assert r["count"] == 1


def test_list_results_no_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "RESULTS_DIR", tmp_path / "does-not-exist")
    r = server.list_pipeline_results_impl()
    assert r["count"] == 0


def test_summary_from_json(results):
    (results / "summary.json").write_text(json.dumps({
        "generated_at": "t", "total": 1, "approved": 1, "rejected": 0,
        "flagged_for_review": 0, "cross_border": {"total": 0, "approved": 0, "rejected": 0},
        "transactions": [{"transaction_id": "TXN001", "status": "approved",
                          "risk_score": 0, "cross_border": False, "reason": None}],
    }))
    txt = server.read_summary_impl()
    assert "Pipeline Summary" in txt
    assert "TXN001" in txt


def test_summary_txt_preferred(results):
    (results / "summary.txt").write_text("HELLO SUMMARY")
    assert server.read_summary_impl() == "HELLO SUMMARY"


def test_summary_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "RESULTS_DIR", tmp_path / "nope")
    assert "No pipeline summary" in server.read_summary_impl()


def test_summary_corrupt_json(results):
    (results / "summary.json").write_text("{broken")
    assert "unreadable" in server.read_summary_impl()


def test_mcp_wrappers_callable(results):
    # exercise the thin @mcp.tool / @mcp.resource wrappers via their .fn (FastMCP FunctionTool)
    _write_result(results, "TXN001", {"transaction_id": "TXN001", "status": "approved", "risk_score": 0})
    get_fn = getattr(server.get_transaction_status, "fn", server.get_transaction_status)
    list_fn = getattr(server.list_pipeline_results, "fn", server.list_pipeline_results)
    sum_fn = getattr(server.pipeline_summary, "fn", server.pipeline_summary)
    assert get_fn("TXN001")["found"] is True
    assert list_fn()["count"] == 1
    assert isinstance(sum_fn(), str)
