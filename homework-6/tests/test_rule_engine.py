"""Unit tests for the configurable rule engine (rules/engine.py, extension Task 1)."""
import json

import pytest

from rules.engine import RuleConfigError, RuleEngine, load_rules

# A minimal, valid config used as the base for edge-case tests.
GOOD = {
    "home_country": "US",
    "iso_4217_whitelist": ["USD", "EUR", "GBP"],
    "high_value_amount": "10000",
    "high_value_points": 50,
    "off_hours_start": 0,
    "off_hours_end": 6,
    "off_hours_points": 20,
    "cross_border_points": 20,
    "fraud_review_threshold": 50,
    "ctr_threshold": "10000",
    "critical_risk_threshold": 70,
    "sanctioned_countries": [],
    "sanctioned_accounts": [],
}


def _engine(**over):
    cfg = dict(GOOD)
    cfg.update(over)
    return RuleEngine(cfg)


def test_default_config_loads():
    e = load_rules()
    assert e.home_country() == "US"
    assert e.is_valid_currency("USD") and not e.is_valid_currency("XYZ")


def test_from_file_roundtrip(tmp_path):
    p = tmp_path / "rules.json"
    p.write_text(json.dumps(GOOD))
    e = RuleEngine.from_file(p)
    assert e.fraud_review_threshold() == 50


def test_from_file_missing(tmp_path):
    with pytest.raises(RuleConfigError):
        RuleEngine.from_file(tmp_path / "nope.json")


def test_from_file_bad_json(tmp_path):
    p = tmp_path / "rules.json"
    p.write_text("{not json")
    with pytest.raises(RuleConfigError):
        RuleEngine.from_file(p)


@pytest.mark.parametrize("missing", ["home_country", "ctr_threshold", "iso_4217_whitelist"])
def test_missing_key_rejected(missing):
    cfg = dict(GOOD)
    del cfg[missing]
    with pytest.raises(RuleConfigError):
        RuleEngine(cfg)


def test_invalid_currency_code_rejected():
    with pytest.raises(RuleConfigError):
        _engine(iso_4217_whitelist=["US", "EURO"])  # wrong lengths


def test_empty_whitelist_rejected():
    with pytest.raises(RuleConfigError):
        _engine(iso_4217_whitelist=[])


def test_non_positive_threshold_rejected():
    with pytest.raises(RuleConfigError):
        _engine(high_value_amount="0")


def test_bad_off_hours_window_rejected():
    with pytest.raises(RuleConfigError):
        _engine(off_hours_start=6, off_hours_end=6)  # start not < end


def test_negative_points_rejected():
    with pytest.raises(RuleConfigError):
        _engine(cross_border_points=-1)


def test_high_value_boundary():
    e = _engine()
    assert e.is_high_value("10000.01") is True
    assert e.is_high_value("10000") is False        # strictly greater than
    assert e.is_high_value("9999.99") is False
    assert e.is_high_value("not-money") is False    # unparseable -> not high value


def test_ctr_boundary():
    e = _engine()
    assert e.requires_ctr("10000") is True          # >= threshold
    assert e.requires_ctr("9999.99") is False
    assert e.requires_ctr("bad") is False


def test_off_hours_window():
    e = _engine()
    assert e.off_hours_points_for("2026-03-16T02:47:00Z") == 20
    assert e.off_hours_points_for("2026-03-16T06:00:00Z") == 0    # end is exclusive
    assert e.off_hours_points_for("2026-03-16T10:00:00Z") == 0
    assert e.off_hours_points_for("not-a-date") == 0
    assert e.off_hours_points_for("") == 0


def test_is_sanctioned_by_country():
    e = _engine(sanctioned_countries=["KP"])
    assert e.is_sanctioned(country="KP") is True
    assert e.is_sanctioned(country="US") is False


def test_is_sanctioned_by_account():
    e = _engine(sanctioned_accounts=["ACC-BAD"])
    assert e.is_sanctioned(source_account="ACC-BAD") is True
    assert e.is_sanctioned(destination_account="ACC-BAD") is True
    assert e.is_sanctioned(source_account="ACC-OK") is False


def test_empty_sanctions_lists_never_hit():
    e = _engine()
    assert e.is_sanctioned(country="DE", source_account="ACC-1", destination_account="ACC-2") is False


def test_load_rules_reload():
    a = load_rules()
    b = load_rules()
    assert a is b                    # cached singleton
    assert load_rules(reload=True).home_country() == "US"
