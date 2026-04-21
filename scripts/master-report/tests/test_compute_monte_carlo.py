"""Regression tests for ``compute_monte_carlo`` — empty-input guard + v2 port.

Context
-------
The April 18 run produced ``mc.median = 38.2`` and ``mc.p70 = 5.4%`` because
``topics_user`` was empty (wrong Supabase project -> no rows fetched), and every
topic fell through to a ``Beta(1.2, 1.8)`` "imaginary resident" prior whose mean
is ~40%. The MC dutifully simulated 10,000 exams for a user who hadn't studied
at all, and the HTML rendered it as her forecast.

Guarantees locked in by this test file
--------------------------------------
1. When ``topics_user`` is empty, raise ``ValueError`` naming the module and the
   empty input (HF.3 — already green).
2. The v2 port (HF.4) must:
   - Simulate a faithful 200-question exam per sim (not a weighted avg of Beta
     samples). The old algorithm produced an overconfident, low-variance
     distribution because it collapsed each sim to a single Beta sum.
   - Emit the richer v2 output shape: ``n_simulations``, ``exam_size``, ``mean``,
     ``std``, ``percentiles`` (dict with p5/p10/p25/p50/p75/p90/p95), ``thresholds``
     (dict with p_ge_60/65/70/75/80), ``histogram`` (2% bins).
   - Keep the flat compat keys the current HTML template reads: ``median``, ``p5``,
     ``p95``, ``p60``, ``p70``, ``p80``, ``hist``.
   - Be deterministic under a fixed ``seed`` argument.
3. For a known fixture (100% weight on a single topic with Beta(81, 21) posterior,
   analytic mean ≈ 79.4%), the 10k-sim median must land within ±1.5 of expected.
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


@pytest.mark.unit
class TestComputeMonteCarloV2Shape:
    """HF.4: richer v2 output keys must be present alongside flat compat keys."""

    TOPICS = [
        {"topic": "ACLS", "n": 100, "c": 75, "w": 25},
        {"topic": "PedsAnes", "n": 80, "c": 60, "w": 20},
    ]

    def _run(self, **kwargs):
        return compute_monte_carlo(
            _data(self.TOPICS), days_left=60, n_sim=2000, **kwargs
        )

    def test_emits_v2_nested_keys(self):
        result = self._run()
        v2_keys = {
            "n_simulations", "exam_size", "mean", "std",
            "percentiles", "thresholds", "histogram",
        }
        missing = v2_keys - set(result)
        assert not missing, f"Missing v2 output keys: {sorted(missing)}"

    def test_percentiles_dict_has_all_levels(self):
        percentiles = self._run()["percentiles"]
        for p in ("p5", "p10", "p25", "p50", "p75", "p90", "p95"):
            assert p in percentiles, f"Missing percentile {p} in {sorted(percentiles)}"

    def test_percentiles_are_monotonic_non_decreasing(self):
        p = self._run()["percentiles"]
        order = [p["p5"], p["p10"], p["p25"], p["p50"], p["p75"], p["p90"], p["p95"]]
        assert order == sorted(order), (
            f"Percentiles must be non-decreasing, got {order}"
        )

    def test_thresholds_dict_has_all_cutoffs(self):
        thresholds = self._run()["thresholds"]
        for t in ("p_ge_60", "p_ge_65", "p_ge_70", "p_ge_75", "p_ge_80"):
            assert t in thresholds, f"Missing threshold {t} in {sorted(thresholds)}"

    def test_thresholds_are_monotonic_non_increasing(self):
        t = self._run()["thresholds"]
        order = [t["p_ge_60"], t["p_ge_65"], t["p_ge_70"], t["p_ge_75"], t["p_ge_80"]]
        assert order == sorted(order, reverse=True), (
            f"P(>=threshold) must drop as threshold rises, got {order}"
        )

    def test_n_simulations_matches_argument(self):
        result = self._run()
        assert result["n_simulations"] == 2000

    def test_exam_size_is_200_by_default(self):
        """Step 1 exam is 200 questions. Default must match so downstream stats are honest."""
        result = self._run()
        assert result["exam_size"] == 200

    def test_flat_compat_keys_still_present(self):
        """HTML template at lines 685-745 reads these flat keys. Must not regress."""
        result = self._run()
        for key in ("median", "p5", "p95", "p60", "p70", "p80", "hist"):
            assert key in result, f"Flat key {key!r} missing — HTML template would break"


@pytest.mark.unit
class TestComputeMonteCarloDeterminism:
    """Given a seed, results must be byte-identical across runs. Required for CI."""

    TOPICS = [{"topic": "ACLS", "n": 100, "c": 75, "w": 25}]

    def test_same_seed_yields_same_median(self):
        a = compute_monte_carlo(_data(self.TOPICS), days_left=60, n_sim=2000, seed=42)
        b = compute_monte_carlo(_data(self.TOPICS), days_left=60, n_sim=2000, seed=42)
        assert a["median"] == b["median"]
        assert a["mean"] == b["mean"]
        assert a["percentiles"] == b["percentiles"]
        assert a["thresholds"] == b["thresholds"]

    def test_different_seeds_yield_different_output(self):
        """Sanity: seed is actually wired into the sampler, not a no-op."""
        a = compute_monte_carlo(_data(self.TOPICS), days_left=60, n_sim=2000, seed=42)
        b = compute_monte_carlo(_data(self.TOPICS), days_left=60, n_sim=2000, seed=7)
        assert (a["median"], a["mean"]) != (b["median"], b["mean"])


@pytest.mark.unit
class TestComputeMonteCarloAnalyticExpectation:
    """With a single-topic fixture whose posterior is analytically known,
    the MC median must land close to the Beta posterior mean.

    Fixture: 80/100 correct on ACLS, 100% DB weight on ACLS.
    Beta posterior = Beta(81, 21), mean = 81/102 ≈ 0.7941 → 79.4%.
    Tolerance per plan HF.4: ±1.5.
    """

    def test_median_close_to_analytic_mean(self):
        topics_user = [{"topic": "ACLS", "n": 100, "c": 80, "w": 20}]
        data = {
            "topics_user": topics_user,
            "topics_db": {"ACLS": 1000},
            "total_db": 1000,
        }
        result = compute_monte_carlo(data, days_left=60, n_sim=10000, seed=42)
        expected = 79.4  # 100 * 81/102
        assert abs(result["median"] - expected) < 1.5, (
            f"Median {result['median']} too far from analytic mean {expected}"
        )
        assert abs(result["mean"] - expected) < 1.5, (
            f"Mean {result['mean']} too far from analytic mean {expected}"
        )
