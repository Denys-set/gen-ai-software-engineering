"""Unit tests for the new Policy / Sanctions agent (agents/policy_agent.py, extension Task 1.4)."""
import agents.common as common
import agents.policy_agent as p
from rules.engine import RuleEngine

BASE_RULES = {
    "home_country": "US",
    "iso_4217_whitelist": ["USD", "EUR", "GBP"],
    "high_value_amount": "10000", "high_value_points": 50,
    "off_hours_start": 0, "off_hours_end": 6, "off_hours_points": 20,
    "cross_border_points": 20, "fraud_review_threshold": 50,
    "ctr_threshold": "10000", "critical_risk_threshold": 70,
    "sanctioned_countries": [], "sanctioned_accounts": [],
}


def _engine(**over):
    cfg = dict(BASE_RULES)
    cfg.update(over)
    return RuleEngine(cfg)


def _data(**over):
    d = {
        "transaction_id": "T", "amount": "100.00", "status": "scored",
        "source_account": "ACC-1", "destination_account": "ACC-2",
        "metadata": {"country": "US"},
    }
    d.update(over)
    return d


def test_clean_txn_routes_to_compliance():
    out = p.process_message(
        common.make_message("f", "policy_agent", "transaction", _data()),
        engine=_engine(),
    )
    assert out["target_agent"] == "compliance_checker"
    assert out["data"]["policy_flags"] == ["screened_clear"]
    assert out["data"]["status"] == "scored"          # not rejected


def test_sanctioned_country_rejected():
    out = p.process_message(
        common.make_message("f", "policy_agent", "transaction",
                            _data(metadata={"country": "KP"})),
        engine=_engine(sanctioned_countries=["KP"]),
    )
    assert out["target_agent"] == "results"
    assert out["data"]["status"] == "rejected"
    assert out["data"]["reason"] == "sanctions screening hit"
    assert "sanctions_hit" in out["data"]["policy_flags"]


def test_sanctioned_account_rejected():
    out = p.process_message(
        common.make_message("f", "policy_agent", "transaction",
                            _data(destination_account="ACC-BAD")),
        engine=_engine(sanctioned_accounts=["ACC-BAD"]),
    )
    assert out["data"]["status"] == "rejected"


def test_already_rejected_passthrough():
    out = p.process_message(
        common.make_message("f", "policy_agent", "transaction", _data(status="rejected")),
    )
    assert out["target_agent"] == "results"
    assert "policy_flags" not in out["data"]           # untouched


def test_screen_is_pure():
    r = p.screen(_data(metadata={"country": "KP"}), engine=_engine(sanctioned_countries=["KP"]))
    assert r["status"] == "rejected" and r["sanctioned"] is True


def test_audit_has_no_pii():
    p.process_message(
        common.make_message("f", "policy_agent", "transaction",
                            _data(source_account="ACC-1", destination_account="ACC-BAD")),
        engine=_engine(sanctioned_accounts=["ACC-BAD"]),
    )
    log = common.AUDIT_LOG.read_text()
    assert "policy_agent" in log
    assert "ACC-BAD" not in log and "ACC-1" not in log   # accounts never logged
