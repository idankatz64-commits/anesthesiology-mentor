"""Regression tests for ``compute_ols_trend`` fallback removal.

Context
-------
The April 18 run produced ``ols.slope/intercept/r_squared/p_value = NaN`` because
``scipy.stats.linregress`` silently returns NaN when given <2 points, and the
HTML template embedded those NaNs directly into the Chart.js annotation
(``'OLS (nan%/d)'``). The report rendered as if the user had a flat trend.

Guarantees being locked in
--------------------------
1. With ``< 3`` daily points, ``compute_ols_trend`` MUST raise ``ValueError``
   mentioning the module name and the minimum sample size. Never silent NaN.
2. With ``>= 3`` daily points and a clear linear signal, the slope MUST be
   positive (signal) and the p-value small (significance).
3. The trend_line length MUST equal the input length (no off-by-one regressions).
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPT_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from generate_report import compute_ols_trend  # noqa: E402


def _data(accs: list[float]) -> dict:
    """Build the minimum ``data`` dict shape compute_ols_trend reads."""
    return {"daily": [{"d": f"d{i}", "n": 10, "a": a} for i, a in enumerate(accs)]}


@pytest.mark.unit
class TestComputeOLSTrendGuards:
    """n < 3 must raise, not silently return NaN."""

    def test_raises_when_daily_is_empty(self):
        with pytest.raises(ValueError) as exc:
            compute_ols_trend(_data([]))
        msg = str(exc.value)
        assert "ols" in msg.lower()
        assert "3" in msg, f"Error must mention minimum sample size (3). Got: {msg!r}"

    def test_raises_when_only_one_day(self):
        with pytest.raises(ValueError):
            compute_ols_trend(_data([72.0]))

    def test_raises_when_only_two_days(self):
        """Two points give r2=1.0, p=NaN - mathematically meaningless as a trend."""
        with pytest.raises(ValueError):
            compute_ols_trend(_data([60.0, 80.0]))


@pytest.mark.unit
class TestComputeOLSTrendHappyPath:
    """With >= 3 points and real signal, produce real numbers."""

    def test_positive_linear_trend_yields_positive_slope(self):
        accs = [60.0 + 2.0 * i for i in range(10)]
        result = compute_ols_trend(_data(accs))
        assert result["slope"] > 0, f"Expected positive slope, got {result['slope']}"
        assert result["r_squared"] > 0.95, (
            f"Perfect linear data should have r2 near 1.0, got {result['r_squared']}"
        )
        assert result["p_value"] < 0.05, (
            f"Clear linear signal must be significant, got p={result['p_value']}"
        )

    def test_trend_line_length_matches_input(self):
        accs = [70.0, 72.0, 74.0, 71.0, 75.0]
        result = compute_ols_trend(_data(accs))
        assert len(result["trend_line"]) == len(accs)

    def test_returns_all_expected_keys(self):
        accs = [70.0, 72.0, 74.0]
        result = compute_ols_trend(_data(accs))
        assert set(result) == {"slope", "intercept", "r_squared", "p_value", "trend_line"}

    def test_no_nan_in_output(self):
        import math

        accs = [70.0, 72.0, 74.0]
        result = compute_ols_trend(_data(accs))
        for key in ("slope", "intercept", "r_squared", "p_value"):
            assert not math.isnan(result[key]), f"{key} is NaN - silent-failure regression"
