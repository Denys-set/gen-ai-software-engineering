"""Configurable rule engine — the data-driven policy brain of the pipeline.

Loads ``config/rules.json`` once and answers every policy question the runtime agents ask, so
thresholds and lists live in *data*, not scattered Python constants. Money is always
``decimal.Decimal`` (via :func:`agents.common.money`) — never ``float``.

Public surface:
    RuleEngine.from_file(path) -> RuleEngine     # explicit load (tests inject custom configs)
    load_rules() -> RuleEngine                    # cached default singleton (config/rules.json)

See EXTENSION-PROMPTS.md Task 1 (Steps 1.1–1.2).
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

# Resolve homework-6/ so ``agents.common`` imports whether run as a package or a script.
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from agents.common import money  # noqa: E402  (Decimal-safe money parser, never float)

DEFAULT_CONFIG_PATH = BASE_DIR / "config" / "rules.json"


class RuleConfigError(ValueError):
    """Raised when config/rules.json is missing required keys or has invalid values."""


class RuleEngine:
    """Evaluates banking policy from a validated config dict. Pure — no I/O after load."""

    def __init__(self, config: dict):
        self._raw = config
        self._validate(config)
        # Pre-parse the hot values.
        self._home_country: str = config["home_country"]
        self._currencies: set[str] = {c.upper() for c in config["iso_4217_whitelist"]}
        self._high_value_amount: Decimal = money(config["high_value_amount"])
        self._high_value_points: int = int(config["high_value_points"])
        self._off_hours_start: int = int(config["off_hours_start"])
        self._off_hours_end: int = int(config["off_hours_end"])
        self._off_hours_points: int = int(config["off_hours_points"])
        self._cross_border_points: int = int(config["cross_border_points"])
        self._fraud_review_threshold: int = int(config["fraud_review_threshold"])
        self._ctr_threshold: Decimal = money(config["ctr_threshold"])
        self._critical_risk_threshold: int = int(config["critical_risk_threshold"])
        self._sanctioned_countries: set[str] = set(config["sanctioned_countries"])
        self._sanctioned_accounts: set[str] = set(config["sanctioned_accounts"])

    # -- construction --------------------------------------------------------
    @classmethod
    def from_file(cls, path=DEFAULT_CONFIG_PATH) -> "RuleEngine":
        path = Path(path)
        try:
            config = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise RuleConfigError(f"rules config not found: {path}") from exc
        except json.JSONDecodeError as exc:
            raise RuleConfigError(f"rules config is not valid JSON: {exc}") from exc
        return cls(config)

    # -- validation ----------------------------------------------------------
    _REQUIRED = (
        "home_country", "iso_4217_whitelist", "high_value_amount", "high_value_points",
        "off_hours_start", "off_hours_end", "off_hours_points", "cross_border_points",
        "fraud_review_threshold", "ctr_threshold", "critical_risk_threshold",
        "sanctioned_countries", "sanctioned_accounts",
    )

    @classmethod
    def _validate(cls, c: dict) -> None:
        missing = [k for k in cls._REQUIRED if k not in c]
        if missing:
            raise RuleConfigError(f"rules config missing keys: {', '.join(missing)}")

        wl = c["iso_4217_whitelist"]
        if not isinstance(wl, list) or not wl:
            raise RuleConfigError("iso_4217_whitelist must be a non-empty list")
        for code in wl:
            if not (isinstance(code, str) and len(code) == 3 and code.isalpha()):
                raise RuleConfigError(f"invalid ISO-4217 code: {code!r}")

        for key in ("high_value_amount", "ctr_threshold"):
            try:
                if money(c[key]) <= 0:
                    raise RuleConfigError(f"{key} must be positive")
            except (ValueError, ArithmeticError) as exc:
                raise RuleConfigError(f"{key} is not a valid monetary value: {c[key]!r}") from exc

        for key in ("high_value_points", "off_hours_points", "cross_border_points",
                    "fraud_review_threshold", "critical_risk_threshold"):
            if not isinstance(c[key], int) or isinstance(c[key], bool) or c[key] < 0:
                raise RuleConfigError(f"{key} must be a non-negative integer")

        s, e = c["off_hours_start"], c["off_hours_end"]
        if not (isinstance(s, int) and isinstance(e, int) and 0 <= s < e <= 24):
            raise RuleConfigError("off_hours_start/end must be ints with 0 <= start < end <= 24")

        if not (isinstance(c["home_country"], str) and c["home_country"]):
            raise RuleConfigError("home_country must be a non-empty string")

        for key in ("sanctioned_countries", "sanctioned_accounts"):
            if not isinstance(c[key], list):
                raise RuleConfigError(f"{key} must be a list")

    # -- jurisdiction --------------------------------------------------------
    def home_country(self) -> str:
        return self._home_country

    def is_valid_currency(self, code) -> bool:
        return isinstance(code, str) and code.upper() in self._currencies

    # -- fraud scoring -------------------------------------------------------
    def is_high_value(self, amount) -> bool:
        try:
            return money(amount) > self._high_value_amount
        except ValueError:
            return False

    def high_value_points(self) -> int:
        return self._high_value_points

    def off_hours_points_for(self, timestamp) -> int:
        """Return off-hours points if the UTC hour is in [start, end), else 0."""
        hour = _hour_utc(timestamp)
        if hour is not None and self._off_hours_start <= hour < self._off_hours_end:
            return self._off_hours_points
        return 0

    def cross_border_points(self) -> int:
        return self._cross_border_points

    def fraud_review_threshold(self) -> int:
        return self._fraud_review_threshold

    # -- compliance ----------------------------------------------------------
    def requires_ctr(self, amount) -> bool:
        try:
            return money(amount) >= self._ctr_threshold
        except ValueError:
            return False

    def critical_risk_threshold(self) -> int:
        return self._critical_risk_threshold

    # -- sanctions -----------------------------------------------------------
    def is_sanctioned(self, country=None, source_account=None, destination_account=None) -> bool:
        if country is not None and country in self._sanctioned_countries:
            return True
        return (
            source_account in self._sanctioned_accounts
            or destination_account in self._sanctioned_accounts
        )

    def sanctioned_countries(self) -> set[str]:
        return set(self._sanctioned_countries)

    def sanctioned_accounts(self) -> set[str]:
        return set(self._sanctioned_accounts)


def _hour_utc(timestamp) -> int | None:
    """UTC hour of an ISO-8601 timestamp, or None if unparseable. Naive stamps are treated UTC."""
    if not timestamp:
        return None
    try:
        dt = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).hour


# ---------------------------------------------------------------------------
# Cached default singleton
# ---------------------------------------------------------------------------
_ENGINE: "RuleEngine | None" = None


def load_rules(*, reload: bool = False) -> RuleEngine:
    """Return the cached default engine (config/rules.json). Pass reload=True to re-read."""
    global _ENGINE
    if _ENGINE is None or reload:
        _ENGINE = RuleEngine.from_file(DEFAULT_CONFIG_PATH)
    return _ENGINE
