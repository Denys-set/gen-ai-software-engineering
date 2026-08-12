"""Full-pipeline integration test — runs the integrator over the sample data in an isolated
shared/ (via the autouse tmp_path fixture) and asserts all 8 transactions land in results."""
import json
import re

import agents.common as common
import integrator


def test_full_pipeline_all_transactions_land():
    sample = integrator.BASE_DIR / "sample-transactions.json"
    summary = integrator.run_pipeline(str(sample))

    results_dir = common.RESULTS_DIR
    result_files = sorted(results_dir.glob("TXN*.json"))
    ids = sorted(p.stem for p in result_files)

    # all 8 sample transactions produced a result
    assert len(result_files) == 8
    assert ids == [f"TXN00{i}" for i in range(1, 9)]

    for path in result_files:
        data = json.loads(path.read_text())["data"]
        assert data["status"] in ("approved", "rejected")
        assert "cross_border" in data                       # spec §4: always present
        # PII masked — no plaintext ACC-<digits> anywhere in the persisted record
        assert re.search(r"ACC-\d", json.dumps(data)) is None

    # summary + audit artifacts written
    assert (results_dir / "summary.json").exists()
    assert (results_dir / "audit.log").exists()

    # summary counts are internally consistent
    assert summary["total"] == 8
    assert summary["approved"] + summary["rejected"] == 8
    assert summary["cross_border"]["total"] == 2            # TXN004 + TXN007


def test_pipeline_expected_outcomes():
    sample = integrator.BASE_DIR / "sample-transactions.json"
    summary = integrator.run_pipeline(str(sample))
    by_id = {t["transaction_id"]: t for t in summary["transactions"]}

    assert by_id["TXN006"]["status"] == "rejected"          # bad currency
    assert by_id["TXN007"]["status"] == "rejected"          # non-positive amount
    assert by_id["TXN007"]["cross_border"] is True          # still flagged though rejected
    assert by_id["TXN002"]["status"] == "approved"
    assert by_id["TXN002"]["risk_score"] == 50              # high-value
    assert by_id["TXN004"]["cross_border"] is True
