"""Unit tests for the Fraud Detector agent."""
import agents.common as common
import agents.fraud_detector as f


def _data(**over):
    d = {
        "transaction_id": "T", "amount": "100.00",
        "timestamp": "2026-03-16T09:00:00Z", "currency": "USD",
        "cross_border": False, "metadata": {"country": "US"},
    }
    d.update(over)
    return d


def test_high_value_adds_flag_and_review():
    r = f.score_transaction(_data(amount="25000.00"))
    assert "high_value" in r["risk_flags"]
    assert r["risk_score"] == 50
    assert r["fraud_review"] is True


def test_off_hours_adds_flag():
    r = f.score_transaction(_data(timestamp="2026-03-16T02:47:00Z"))
    assert "off_hours" in r["risk_flags"]
    assert r["risk_score"] == 20


def test_cross_border_tracked_separately():
    r = f.score_transaction(_data(cross_border=True, metadata={"country": "DE"}))
    assert r["cross_border_flags"] == ["cross_border:DE"]
    assert r["cross_border_review"] is True
    assert r["risk_flags"] == []            # kept distinct from domestic flags


def test_off_hours_plus_cross_border_additive():
    r = f.score_transaction(_data(timestamp="2026-03-16T02:47:00Z",
                                  cross_border=True, metadata={"country": "DE"}))
    assert r["risk_score"] == 40            # 20 + 20, independent
    assert r["needs_review"] is True        # routed to review via cross_border_review
    assert r["fraud_review"] is False       # below the 50 fraud threshold


def test_75000_scores_high_and_flagged():
    r = f.score_transaction(_data(amount="75000.00"))
    assert r["risk_score"] == 50
    assert r["fraud_review"] is True


def test_9999_not_high_value():
    r = f.score_transaction(_data(amount="9999.99"))
    assert "high_value" not in r["risk_flags"]
    assert r["risk_score"] == 0


def test_clean_transaction_cleared():
    r = f.score_transaction(_data(amount="100.00"))
    assert r["risk_score"] == 0
    assert r["fraud_review"] is False
    assert r["needs_review"] is False


def test_bad_timestamp_ignored():
    r = f.score_transaction(_data(timestamp="not-a-date"))
    assert "off_hours" not in r["risk_flags"]


def test_naive_timestamp_treated_as_utc():
    r = f.score_transaction(_data(timestamp="2026-03-16T03:00:00"))  # no Z
    assert "off_hours" in r["risk_flags"]


def test_bad_amount_scores_zero_high_value():
    r = f.score_transaction(_data(amount="oops"))
    assert "high_value" not in r["risk_flags"]


def test_process_message_routes_to_compliance():
    m = common.make_message("v", "fraud_detector", "transaction",
                            _data(amount="25000.00", status="validated"))
    out = f.process_message(m)
    assert out["target_agent"] == "compliance_checker"
    assert out["data"]["status"] == "scored"
    assert out["data"]["risk_score"] == 50


def test_process_message_passthrough_when_rejected():
    m = common.make_message("v", "fraud_detector", "transaction", _data(status="rejected"))
    out = f.process_message(m)
    assert out["target_agent"] == "results"
    assert "risk_score" not in out["data"]
