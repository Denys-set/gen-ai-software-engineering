"""Shared pytest fixtures.

Isolates every test from the real shared/ directories by pointing the agents.common path
constants (and AUDIT_LOG) at a per-test tmp_path. Because common.audit() resolves AUDIT_LOG at
call time and integrator.py reads common.<DIR> at call time, monkeypatching the module attributes
here fully isolates the agents, the integrator, and the audit log.
"""
import sys
from pathlib import Path

import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

import agents.common as common  # noqa: E402


@pytest.fixture(autouse=True)
def isolate_shared(tmp_path, monkeypatch):
    """Redirect all shared/ I/O to a temp dir for the duration of each test."""
    shared = tmp_path / "shared"
    dirs = {name: shared / name for name in ("input", "processing", "output", "results")}
    for d in dirs.values():
        d.mkdir(parents=True)
    monkeypatch.setattr(common, "SHARED_DIR", shared)
    monkeypatch.setattr(common, "INPUT_DIR", dirs["input"])
    monkeypatch.setattr(common, "PROCESSING_DIR", dirs["processing"])
    monkeypatch.setattr(common, "OUTPUT_DIR", dirs["output"])
    monkeypatch.setattr(common, "RESULTS_DIR", dirs["results"])
    monkeypatch.setattr(common, "AUDIT_LOG", dirs["results"] / "audit.log")
    yield shared


@pytest.fixture
def make_txn():
    """Factory for a valid raw transaction dict; override any field via kwargs."""
    def _make(**overrides):
        data = {
            "transaction_id": "T1",
            "timestamp": "2026-03-16T09:00:00Z",
            "source_account": "ACC-1001",
            "destination_account": "ACC-2001",
            "amount": "100.00",
            "currency": "USD",
            "transaction_type": "transfer",
            "description": "test",
            "metadata": {"channel": "online", "country": "US"},
        }
        data.update(overrides)
        return data
    return _make
