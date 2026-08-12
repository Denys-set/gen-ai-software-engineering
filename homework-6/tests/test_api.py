"""Integration tests for the REST API gateway (api/app.py, extension Task 2).

Uses FastAPI's TestClient — no live server needed. The autouse `isolate_shared` fixture (conftest)
redirects shared/ to a tmp dir, so these tests never touch the real results.
"""
import pytest
from fastapi.testclient import TestClient

from api.app import app


@pytest.fixture
def client():
    return TestClient(app)


def _txn(**over):
    d = {
        "transaction_id": "APIT1", "timestamp": "2026-03-16T09:00:00Z",
        "source_account": "ACC-1001", "destination_account": "ACC-2001",
        "amount": "1500.00", "currency": "USD", "transaction_type": "transfer",
        "metadata": {"channel": "api", "country": "US"},
    }
    d.update(over)
    return d


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_submit_approved_and_masked(client):
    r = client.post("/transactions", json=_txn(amount="25000.00"))
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "approved"
    # PII masked in the response
    assert body["result"]["source_account"] == "ACC-****"
    assert body["result"]["destination_account"] == "ACC-****"
    assert "CTR" in body["result"]["compliance_flags"]     # >= $10k


def test_submit_bad_currency_rejected(client):
    r = client.post("/transactions", json=_txn(transaction_id="APITBAD", currency="XYZ"))
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "rejected"
    assert "XYZ" in body["result"]["reason"]


def test_get_transaction_after_submit(client):
    client.post("/transactions", json=_txn(transaction_id="APITGET"))
    r = client.get("/transactions/APITGET")
    assert r.status_code == 200
    assert r.json()["transaction_id"] == "APITGET"
    assert r.json()["status"] == "approved"


def test_get_unknown_transaction_404(client):
    r = client.get("/transactions/DOES-NOT-EXIST")
    assert r.status_code == 404


def test_results_count_matches(client):
    client.post("/transactions", json=_txn(transaction_id="APITA"))
    client.post("/transactions", json=_txn(transaction_id="APITB", currency="XYZ"))
    r = client.get("/results")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    ids = {row["transaction_id"] for row in body["results"]}
    assert ids == {"APITA", "APITB"}


def test_missing_field_422(client):
    bad = _txn()
    del bad["currency"]
    r = client.post("/transactions", json=bad)
    assert r.status_code == 422        # Pydantic validation error
