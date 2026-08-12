"""Unit tests for the Transaction Validator agent."""
import json
from decimal import Decimal

import agents.common as common
import agents.transaction_validator as v


def _msg(make_txn, **over):
    return common.make_message("integrator", "transaction_validator", "transaction",
                               make_txn(**over))


def test_valid_transaction_passes(make_txn):
    out = v.process_message(_msg(make_txn))
    assert out["data"]["status"] == "validated"
    assert out["target_agent"] == "fraud_detector"
    assert out["data"]["reason"] is None


def test_missing_field_rejected(make_txn):
    m = _msg(make_txn)
    del m["data"]["currency"]
    out = v.process_message(m)
    assert out["data"]["status"] == "rejected"
    assert "currency" in out["data"]["reason"]
    assert out["target_agent"] == "results"


def test_invalid_currency_rejected(make_txn):
    out = v.process_message(_msg(make_txn, currency="XYZ"))
    assert out["data"]["status"] == "rejected"
    assert "XYZ" in out["data"]["reason"]


def test_negative_non_refund_rejected(make_txn):
    out = v.process_message(_msg(make_txn, amount="-100.00", transaction_type="transfer"))
    assert out["data"]["status"] == "rejected"
    assert "positive" in out["data"]["reason"]


def test_negative_refund_rejected_by_default(make_txn):
    # Default ALLOW_NEGATIVE_REFUNDS=False -> spec behavior (TXN007 is a rejection regression case).
    out = v.process_message(_msg(make_txn, amount="-100.00", transaction_type="refund"))
    assert out["data"]["status"] == "rejected"


def test_negative_refund_allowed_when_flag_enabled(make_txn, monkeypatch):
    # Flipping the flag enables the refund carve-out (the Step 2.3 alternative behavior).
    monkeypatch.setattr(v, "ALLOW_NEGATIVE_REFUNDS", True)
    out = v.process_message(_msg(make_txn, amount="-100.00", transaction_type="refund"))
    assert out["data"]["status"] == "validated"


def test_zero_amount_rejected(make_txn):
    out = v.process_message(_msg(make_txn, amount="0.00"))
    assert out["data"]["status"] == "rejected"
    assert "non-zero" in out["data"]["reason"]


def test_unparseable_amount_rejected(make_txn):
    out = v.process_message(_msg(make_txn, amount="not-money"))
    assert out["data"]["status"] == "rejected"
    assert "invalid amount" in out["data"]["reason"]


def test_decimal_parsing_no_float():
    amt = common.money("100.10")
    assert isinstance(amt, Decimal)
    assert str(amt) == "100.10"           # exact, not a float approximation
    assert not isinstance(amt, float)


def test_cross_border_flag_threaded(make_txn):
    out = v.process_message(_msg(make_txn, metadata={"country": "DE"}))
    assert out["data"]["cross_border"] is True


def test_domestic_not_cross_border(make_txn):
    out = v.process_message(_msg(make_txn, metadata={"country": "US"}))
    assert out["data"]["cross_border"] is False


def test_rejected_cross_border_still_carries_flag(make_txn):
    # A cross-border txn rejected at validation must still carry cross_border (spec §4).
    out = v.process_message(_msg(make_txn, currency="XYZ", metadata={"country": "GB"}))
    assert out["data"]["status"] == "rejected"
    assert out["data"]["cross_border"] is True


def test_audit_written_and_pii_free(make_txn):
    v.process_message(_msg(make_txn))
    log = common.AUDIT_LOG.read_text()
    assert "transaction_validator" in log and "T1" in log
    assert "ACC-1001" not in log  # PII never in audit


def test_dry_run_counts(tmp_path, capsys):
    records = [
        {"transaction_id": "T1", "timestamp": "2026-03-16T09:00:00Z",
         "source_account": "ACC-1", "destination_account": "ACC-2", "amount": "100.00",
         "currency": "USD", "transaction_type": "transfer", "metadata": {"country": "US"}},
        {"transaction_id": "T2", "timestamp": "2026-03-16T09:00:00Z",
         "source_account": "ACC-1", "destination_account": "ACC-2", "amount": "5.00",
         "currency": "XYZ", "transaction_type": "transfer", "metadata": {"country": "US"}},
    ]
    p = tmp_path / "tx.json"
    p.write_text(json.dumps(records))
    rc = v._dry_run(p)
    out = capsys.readouterr().out
    assert "Total: 2" in out and "Valid: 1" in out and "Invalid: 1" in out
    assert rc == 1  # non-zero because an invalid txn exists


def test_main_dry_run(tmp_path):
    p = tmp_path / "tx.json"
    p.write_text(json.dumps([{
        "transaction_id": "T1", "timestamp": "2026-03-16T09:00:00Z",
        "source_account": "ACC-1", "destination_account": "ACC-2", "amount": "100.00",
        "currency": "USD", "transaction_type": "transfer", "metadata": {"country": "US"}}]))
    assert v.main(["--dry-run", "--input", str(p)]) == 0


def test_main_no_args_prints_help(capsys):
    assert v.main([]) == 0
    assert "Transaction Validator" in capsys.readouterr().out
