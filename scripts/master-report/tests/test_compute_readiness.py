"""Regression tests for ``compute_readiness`` fallback removal.

Context
-------
The April 18 phantom ``readiness = 37.5`` came from the hidden ``50``-fallbacks
inside ``compute_readiness``: when topics_user was empty, the function returned
``ua_accuracy=50, critical_avg=50, consistency_score=50`` and the weighted
formula ``50*0.25 + 0*0.25 + 50*0.30 + 50*0.20 = 37.5``. The HTML showed this
as the user's real readiness.

Guarantee being locked in
-------------------------
If any required component is missing (no user attempts, no critical topics, or
fewer than 3 days of >=5-attempt sessions), ``compute_readiness`` MUST raise
``ValueError`` naming the missing component. No silent ``50``-fallbacks.

Note
----
HF.6 will replace this function wholesale with a regression-calibrated ERI
implementation. The guards locked in here must survive that rewrite.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPT_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from generate_report import compute_readiness  # noqa: E402


def _basics(coverage_pct: float = 40.0) -> dict:
    return {"coverage_pct": coverage_pct}


def _data(
    topics_user: list[dict] | None = None,
    daily: list[dict] | None = None,
    topics_db: dict | None = None,
) -> dict:
    return {
        "topics_user": topics_user or [],
        "daily": daily or [],
        "topics_db": topics_db or {"ACLS": 500, "PedsAnes": 500},
    }


@pytest.mark.unit
class TestComputeReadinessGuards:
    """Each missing component must raise ValueError mentioning its name."""

    def test_raises_when_topics_user_has_no_attempts(self):
        data = _data(topics_user=[], daily=[{"d": "d0", "n": 10, "a": 70.0}])
        with pytest.raises(ValueError) as exc:
            compute_readiness(data, _basics(), mc={}, bootstrap={})
        assert "accuracy" in str(exc.value).lower() or "topics_user" in str(exc.value).lower()

    def test_raises_when_no_critical_topics(self):
        """No topic meets (n>=5 AND db>=50) -> critical_avg was 50-fallback."""
        data = _data(
            topics_user=[{"topic": "Tiny", "n": 10, "c": 7, "w": 3}],
            topics_db={"Tiny": 10},
            daily=[
                {"d": "d0", "n": 10, "a": 70.0},
                {"d": "d1", "n": 10, "a": 72.0},
                {"d": "d2", "n": 10, "a": 74.0},
            ],
        )
        with pytest.raises(ValueError) as exc:
            compute_readiness(data, _basics(), mc={}, bootstrap={})
        assert "critical" in str(exc.value).lower()

    def test_raises_when_fewer_than_three_consistent_days(self):
        """len(daily with n>=5) < 3 -> consistency_score was 50-fallback."""
        data = _data(
            topics_user=[{"topic": "ACLS", "n": 50, "c": 35, "w": 15}],
            daily=[
                {"d": "d0", "n": 10, "a": 70.0},
                {"d": "d1", "n": 2, "a": 50.0},
            ],
        )
        with pytest.raises(ValueError) as exc:
            compute_readiness(data, _basics(), mc={}, bootstrap={})
        assert "consistency" in str(exc.value).lower() or "days" in str(exc.value).lower()


@pytest.mark.unit
class TestComputeReadinessHappyPath:
    """With all components present, readiness is in [0, 100] and uses no 50-fallback."""

    def test_returns_readiness_in_valid_range(self):
        data = _data(
            topics_user=[
                {"topic": "ACLS", "n": 100, "c": 80, "w": 20},
                {"topic": "PedsAnes", "n": 80, "c": 60, "w": 20},
            ],
            daily=[
                {"d": "d0", "n": 20, "a": 75.0},
                {"d": "d1", "n": 25, "a": 78.0},
                {"d": "d2", "n": 18, "a": 80.0},
                {"d": "d3", "n": 22, "a": 76.0},
            ],
        )
        result = compute_readiness(data, _basics(45.0), mc={}, bootstrap={})
        assert 0 <= result["readiness"] <= 100
        assert "accuracy_score" in result
        assert "coverage_score" in result
        assert "critical_score" in result
        assert "consistency_score" in result
