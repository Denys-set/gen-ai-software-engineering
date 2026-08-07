"""Shared plumbing for the multi-agent banking pipeline.

Every runtime agent (transaction_validator, fraud_detector, compliance_checker) and the
integrator use these helpers so message handling, atomic file moves, money parsing, and
PII-safe audit logging stay consistent. Stdlib only — no third-party deps, and never `float`
for money.

See specification.md (§3 Implementation Notes) and agents.md for the binding rules.
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

# ---------------------------------------------------------------------------
# Locations
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent          # homework-6/
SHARED_DIR = BASE_DIR / "shared"
INPUT_DIR = SHARED_DIR / "input"
PROCESSING_DIR = SHARED_DIR / "processing"
OUTPUT_DIR = SHARED_DIR / "output"
RESULTS_DIR = SHARED_DIR / "results"
AUDIT_LOG = RESULTS_DIR / "audit.log"

# Home jurisdiction for cross-border determination (spec §3: a named constant, not a
# magic string scattered across agents). A txn is cross-border iff metadata.country != this.
HOME_COUNTRY = "US"

# Money is always quantized to 2 places with banker-safe ROUND_HALF_UP.
CENTS = Decimal("0.01")


# ---------------------------------------------------------------------------
# Time
# ---------------------------------------------------------------------------
def utc_now_iso() -> str:
    """Current time as an ISO-8601 UTC string, e.g. '2026-03-16T10:00:00Z'."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


# ---------------------------------------------------------------------------
# Message envelope
# ---------------------------------------------------------------------------
def make_message(source: str, target: str, msg_type: str, data: dict) -> dict:
    """Build the standard message envelope with a uuid4 id and ISO-8601 UTC timestamp."""
    return {
        "message_id": str(uuid.uuid4()),
        "timestamp": utc_now_iso(),
        "source_agent": source,
        "target_agent": target,
        "message_type": msg_type,
        "data": data,
    }


def read_message(path) -> dict:
    """Load a message JSON file from `path`."""
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def write_message(directory, message: dict):
    """Write `message` to `directory/<message_id>.json` atomically.

    Uses a temp file in the same directory + os.replace so a reader never sees a
    half-written file. Returns the final Path.
    """
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    message_id = message["message_id"]
    final = directory / f"{message_id}.json"
    tmp = directory / f".{message_id}.json.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(message, fh, indent=2, ensure_ascii=False)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, final)
    return final


def move_to(message_path, dest_dir):
    """Move a message file between shared/ stages, keeping its filename. Returns new Path."""
    message_path = Path(message_path)
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / message_path.name
    os.replace(message_path, dest)
    return dest


# ---------------------------------------------------------------------------
# Audit log  (PII-safe — transaction ids + outcomes only)
# ---------------------------------------------------------------------------
def audit(agent_name: str, transaction_id: str, outcome: str, *, log_path=None) -> None:
    """Append one audit line: '<ISO-8601 UTC> | <agent> | <txn_id> | <outcome>'.

    NEVER pass account numbers or names here — only transaction ids and outcomes are safe.
    `log_path` is overridable so tests can isolate the audit trail (tmp_path). When omitted it
    resolves the module-level AUDIT_LOG at call time, so tests may monkeypatch common.AUDIT_LOG.
    """
    log_path = Path(log_path) if log_path is not None else AUDIT_LOG
    log_path.parent.mkdir(parents=True, exist_ok=True)
    line = f"{utc_now_iso()} | {agent_name} | {transaction_id} | {outcome}\n"
    with open(log_path, "a", encoding="utf-8") as fh:
        fh.write(line)


def mask_account(value: str) -> str:
    """Mask an account identifier for safe display, e.g. 'ACC-1001' -> 'ACC-****'.

    Keeps everything up to and including the first '-', masks the rest. Falls back to
    masking all but the first char for values without a '-'.
    """
    if value is None:
        return ""
    text = str(value)
    if "-" in text:
        head, _, tail = text.partition("-")
        return f"{head}-{'*' * len(tail)}"
    if len(text) <= 1:
        return "*" * len(text)
    return text[0] + "*" * (len(text) - 1)


# ---------------------------------------------------------------------------
# Money
# ---------------------------------------------------------------------------
def money(value, *, require_positive: bool = False) -> Decimal:
    """Parse a monetary value into a Decimal via Decimal(str(value)).

    - Never uses float. Rejects non-finite values (NaN / Infinity).
    - When `require_positive` is True, rejects values <= 0.
    Raises ValueError on any of the above so callers can reject the transaction cleanly.
    """
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(f"invalid monetary value: {value!r}") from exc
    if not amount.is_finite():
        raise ValueError(f"non-finite monetary value: {value!r}")
    if require_positive and amount <= 0:
        raise ValueError(f"amount must be positive: {value!r}")
    return amount


def quantize_money(amount: Decimal) -> Decimal:
    """Normalise a Decimal to 2 places with ROUND_HALF_UP (banking rounding)."""
    from decimal import ROUND_HALF_UP

    return amount.quantize(CENTS, rounding=ROUND_HALF_UP)
