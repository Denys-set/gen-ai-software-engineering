"""Unit tests for the Compliance Checker agent."""
import agents.common as common
import agents.compliance_checker as comp


def _data(**over):
    d = {
        "transaction_id": "T", "amount": "100.00", "cross_border": False,
        "risk_score": 0, "needs_review": False,
        "source_account": "ACC-1", "destination_account": "ACC-2",
    }
    d.update(over)
    return d


def test_normal_transaction_approved():
    r = comp.evaluate(_data())
    assert r["status"] == "approved"
    assert r["reason"] is None
    assert r["compliance_flags"] == []


def test_large_wire_gets_ctr_flag():
    r = comp.evaluate(_data(amount="25000.00"))
    assert "CTR" in r["compliance_flags"]
    assert r["status"] == "approved"


def test_ctr_boundary_below_threshold():
    r = comp.evaluate(_data(amount="9999.99"))
    assert "CTR" not in r["compliance_flags"]


def test_cross_border_edd_separate_from_ctr():
    r = comp.evaluate(_data(cross_border=True))
    assert r["cross_border_compliance_flags"] == ["EDD"]
    assert r["compliance_flags"] == []       # EDD is NOT a CTR flag


def test_critical_risk_rejected():
    r = comp.evaluate(_data(risk_score=75))
    assert r["status"] == "rejected"
    assert "critical risk" in r["reason"]


def test_sanctioned_account_rejected():
    r = comp.evaluate(_data(destination_account="BAD-ACC"), sanctions={"BAD-ACC"})
    assert r["status"] == "rejected"
    assert "sanctions" in r["reason"]


def test_bad_amount_defaults_to_zero_and_approves():
    r = comp.evaluate(_data(amount="oops"))
    assert r["status"] == "approved"


def test_process_message_result_shape():
    m = common.make_message("f", "compliance_checker", "transaction",
                            _data(amount="25000.00", needs_review=True, status="scored"))
    out = comp.process_message(m)
    d = out["data"]
    assert out["target_agent"] == "results"
    assert d["status"] == "approved"
    for key in ("compliance_flags", "cross_border_compliance_flags", "status", "reason"):
        assert key in d


def test_process_message_passthrough_when_rejected():
    m = common.make_message("f", "compliance_checker", "transaction", _data(status="rejected"))
    out = comp.process_message(m)
    assert out["target_agent"] == "results"


def test_process_message_audits(make_txn=None):
    m = common.make_message("f", "compliance_checker", "transaction", _data(risk_score=75))
    comp.process_message(m)
    log = common.AUDIT_LOG.read_text()
    assert "compliance_checker" in log
    assert "ACC-1" not in log  # PII never logged
