"""Regression tests for ``compute_monte_carlo`` empty-input guard.

Context
-------
The April 18 run produced ``mc.median = 38.2`` and ``mc.p70 = 5.4%`` because
``topics_user`` was empty (wrong Supabase project -> no rows fetched), and every
topic fell through to a ``Beta(1.2, 1.8)`` "imaginary resident" prior whose mean
is ~40%. The MC dutifully simulated 10,000 exams for a user who hadn't studied
at all, and the HTML rendered it as her forecast.

Guarantee being locked in
-------------------------
When ``topics_user`` is empty, ``compute_monte_carlo`` MUST raise ``ValueError``
mentioning the module and the empty input. Never produce phantom numbers from
an unconditional prior.

Note
----
HF.4 will replace the function body wholesale with a faithful port of the v2
Beta-binomial implementation. This test locks in the empty-input guard so the
HF.4 rewrite cannot regress the fail-fast behaviour.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPT_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from generate_report import compute_monte_carlo  # noqa: E402


def _data(topics_user: list[dict]) -> dict:
    """Minimum ``data`` shape the function reads. Synthetic topic names only."""
    return {
        "topics_user": topics_user,
        "topics_db": {"ACLS": 500, "PedsAnes": 500},
        "total_db": 1000,
    }


@pytest.mark.unit
class TestComputeMonteCarloEmptyGuard:
    """Empty topics_user must raise, not silently sample from a generic prior."""

    def test_raises_when_topics_user_is_empty(self):
        with pytest.raises(ValueError) as exc:
            compute_monte_carlo(_data([]), days_left=60)
        msg = str(exc.value).lower()
        assert "monte" in msg or "mc" in msg, (
            f"Error must identify the module. Got: {exc.value!r}"
        )
        assert "topics_user" in msg or "empty" in msg, (
            f"Error must name the empty input. Got: {exc.value!r}"
        )


@pytest.mark.unit
class TestComputeMonteCarloHappyPath:
    """With real topics_user rows, MC produces numeric output in [0, 100]."""

    def test_median_is_in_valid_range(self):
        topics_user = [
            {"topic": "ACLS", "n": 100, "c": 75, "w": 25},
            {"topic": "PedsAnes", "n": 80, "c": 60, "w": 20},
        ]
        result = compute_monte_carlo(_data(topics_user), days_left=60, n_sim=2000)
        assert 0 <= result["median"] <= 100
        assert 0 <= result["p70"] <= 100

    def test_returns_all_expected_keys(self):
        topics_user = [{"topic": "ACLS", "n": 50, "c": 40, "w": 10}]
        result = compute_monte_carlo(_data(topics_user), days_left=60, n_sim=2000)
        expected = {"median", "p5", "p95", "p60", "p70", "p80", "hist"}
        assert expected.issubset(set(result))
