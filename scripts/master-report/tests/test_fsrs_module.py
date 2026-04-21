"""RED-phase regression tests for ``scripts/master-report/fsrs_module.py`` (HF.5).

Why this file exists
--------------------
The April 18 master report had a phantom retention curve (flat
``[100.0, 100.0, 100.0, 100.0, 100.0]``) because ``compute_ebbinghaus`` in
``generate_report.py`` fell through to ``curves["total"] = [100.0] * len(days)``
whenever ``srs_total == 0``. HF.5 replaces that whole branch with FSRS
(Anki 2023) — a principled spaced-repetition scheduler whose per-card
stability lets us compute honest retention probabilities.

Contract this file locks in
---------------------------
Three primitives plus one integration function:

* ``build_review_logs(answer_history, spaced_repetition) -> list[ReviewLog]``
* ``calibrate(review_logs) -> tuple[list[float], dict]``
* ``compute_retention_curves(cards, parameters, days) -> list[float]``
* ``compute_decay_from_srs(srs_summary, spaced_repetition_rows,
      answer_history_rows, days_left, parameters=None) -> dict``

The HTML template at ``generate_report.py:822-825`` reads four curve keys —
``confident``, ``hesitant``, ``guessed``, ``total`` — plus ``days``. Any
rename breaks the rendered report, so ``TestHtmlContract`` pins the exact
key set.

Invariant from HF.3: empty inputs must **raise**, never return a 100% fallback.
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

# The module under test lives next to generate_report.py, not inside tests/.
# Mirror the existing import pattern used by test_compute_monte_carlo.py.
SCRIPT_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

# Skip the entire file if fsrs isn't installed (CI without optional deps).
pytest.importorskip("fsrs")
from fsrs import Card, Rating, Scheduler  # noqa: E402

# Intentionally importing a module that doesn't exist yet — this is RED.
from fsrs_module import (  # type: ignore[import-not-found]  # noqa: E402
    build_review_logs,
    calibrate,
    compute_decay_from_srs,
    compute_retention_curves,
)


# ════════════════════════════════════════════════════════════
# Helpers + fixtures (private to this file)
# ════════════════════════════════════════════════════════════

_UTC = timezone.utc
_T0 = datetime(2026, 1, 1, tzinfo=_UTC)


def _default_parameters() -> list[float]:
    """FSRS default 21-parameter vector, read from a fresh Scheduler."""
    return list(Scheduler().parameters)


def _shifted_parameters() -> list[float]:
    """Defaults scaled by 1.3 — deterministic non-default params.

    ``_synthetic_review_logs`` feeds logs back into the Optimizer. If the
    generator uses default params, the MLE trivially equals defaults and the
    test ``params != _default_parameters()`` can't prove the Optimizer moved.
    Shifting by 1.3 guarantees a different generating distribution, so the
    Optimizer must actually descend gradients to fit the data.
    """
    return [p * 1.3 for p in _default_parameters()]


def _history_row(
    qid: str,
    is_correct: bool,
    answered_at: str | None,
    user_id: str = "u",
) -> dict:
    """One row shaped exactly like production ``answer_history``."""
    return {
        "user_id": user_id,
        "question_id": qid,
        "is_correct": is_correct,
        "answered_at": answered_at,
    }


def _srs_row(
    qid: str,
    confidence: str,
    interval: int = 7,
    next_review_date: str = "2026-04-22",
    user_id: str = "u",
) -> dict:
    """One row shaped exactly like production ``spaced_repetition``."""
    return {
        "user_id": user_id,
        "question_id": qid,
        "confidence": confidence,
        "interval": interval,
        "next_review_date": next_review_date,
    }


def _synthetic_review_logs(n: int) -> list:
    """Generate ``n`` real FSRS ``ReviewLog`` instances via the Scheduler.

    Two-stage signal preservation so the Optimizer can actually fit:

    1. **Non-default generator params.** Scheduler is seeded with
       ``_shifted_parameters()`` (defaults × 1.3), not defaults. The next
       ``review_datetime`` is chained to ``card.due``, which is how those
       params reach the ReviewLog stream (ReviewLog itself carries no
       scheduler state — intervals are the only leaked signal).

    2. **Enough cards to cross fsrs' mini_batch_size=512.** fsrs 6.3.1's
       Optimizer silently returns DEFAULT_PARAMETERS when the number of
       *non-same-day* reviews is below 512 (``optimizer.py:202``). A single
       card capped at ``max_seq_len=64`` can never reach that threshold, no
       matter how many logs we synthesise. So we spread ``n`` across
       ``max(1, n // 66)`` cards (~66 logs per card, 12 cards at n=800) —
       which, with the ``i % 7`` Again pattern, yields ≈55 non-same-day
       reviews per card → 660+ total at n=800 (empirically verified).

    For small n (e.g. the ``insufficient_logs`` test calls n=10) the formula
    collapses to a single card, preserving the original single-card shape.
    """
    n_cards = max(1, n // 66)
    base, remainder = divmod(n, n_cards)
    scheduler = Scheduler(parameters=_shifted_parameters())
    logs: list = []
    for c_idx in range(n_cards):
        card = Card()
        review_dt = _T0
        per_card = base + (1 if c_idx < remainder else 0)
        # i%7 (not i%4): fewer Again-resets so shifted intervals have more room
        # to accumulate before the card's stability is reset to an initial state.
        for i in range(per_card):
            rating = Rating.Again if i % 7 == 0 else Rating.Good
            card, log = scheduler.review_card(card, rating, review_datetime=review_dt)
            logs.append(log)
            review_dt = card.due
    return logs


@pytest.fixture
def default_parameters() -> list[float]:
    return _default_parameters()


@pytest.fixture
def synthetic_cards() -> list:
    """Ten Card objects sharing the Scheduler defaults.

    The GREEN implementation of fsrs_module owns any "set stability" helper;
    here we use the public Card constructor and let fsrs_module's retention
    math read card state. Tests assert *behaviour* of the module, not
    internal attribute names.
    """
    return [Card() for _ in range(10)]


@pytest.fixture
def srs_summary_full() -> dict:
    """The ``data['srs']`` shape produced by ``fetch_data`` when all buckets
    are populated. Mirrors generate_report.py:178-185 exactly.
    """
    return {
        "confident": {"total": 10, "due": 2, "avg_interval": 14.0},
        "hesitant": {"total": 5, "due": 3, "avg_interval": 7.0},
        "guessed": {"total": 3, "due": 3, "avg_interval": 3.0},
    }


@pytest.fixture
def srs_rows_full() -> list[dict]:
    """Eighteen spaced_repetition rows spanning all three confidence buckets."""
    buckets = ("confident", "hesitant", "guessed")
    return [
        _srs_row(qid=f"q-{i:03d}", confidence=buckets[i % 3])
        for i in range(18)
    ]


@pytest.fixture
def history_rows_full() -> list[dict]:
    """Thirty answer_history rows with alternating correctness."""
    return [
        _history_row(
            qid=f"q-{i % 18:03d}",
            is_correct=(i % 2 == 0),
            answered_at=f"2026-04-{(i % 28) + 1:02d}T08:00:00Z",
        )
        for i in range(30)
    ]


# ════════════════════════════════════════════════════════════
# 1. build_review_logs
# ════════════════════════════════════════════════════════════


@pytest.mark.unit
class TestBuildReviewLogs:
    """Reconstruction of ``fsrs.ReviewLog`` entries from our Supabase rows."""

    def test_empty_inputs_yield_empty_list(self):
        assert build_review_logs([], []) == []

    def test_correct_answer_maps_to_rating_good(self):
        rows = [_history_row("q-1", True, "2026-04-10T08:00:00Z")]
        logs = build_review_logs(rows, [])
        assert len(logs) == 1
        assert logs[0].rating == Rating.Good

    def test_incorrect_answer_maps_to_rating_again(self):
        rows = [_history_row("q-1", False, "2026-04-10T08:00:00Z")]
        logs = build_review_logs(rows, [])
        assert len(logs) == 1
        assert logs[0].rating == Rating.Again

    def test_skips_rows_with_null_timestamp(self):
        rows = [
            _history_row("q-1", True, "2026-04-10T08:00:00Z"),
            _history_row("q-2", True, None),
            _history_row("q-3", False, ""),
        ]
        logs = build_review_logs(rows, [])
        assert len(logs) == 1  # only the first row survives


# ════════════════════════════════════════════════════════════
# 2. calibrate
# ════════════════════════════════════════════════════════════


@pytest.mark.unit
class TestCalibrate:
    """FSRS parameter fitting, with a safe fallback when history is thin."""

    def test_insufficient_logs_falls_back_to_defaults(self):
        logs = _synthetic_review_logs(n=10)
        params, meta = calibrate(logs)
        assert meta["calibrated"] is False
        assert meta["n_logs"] == 10
        assert "insufficient" in meta["reason"].lower()
        assert isinstance(params, list)
        assert len(params) == 21
        # Fallback must return defaults, not a garbage vector.
        assert params == _default_parameters()

    def test_between_our_threshold_and_fsrs_threshold(self):
        """Phantom-calibration guard in the 200 ≤ n < 512 danger zone.

        fsrs 6.3.1's Optimizer short-circuits at ``optimizer.py:202`` when the
        number of *non-same-day* reviews is below ``mini_batch_size=512``, and
        silently returns ``DEFAULT_PARAMETERS`` without any training signal.
        Our own threshold ``_MIN_LOGS_FOR_OPTIMIZER=200`` is lower, so there is
        a gap where ``calibrate()`` enters the Optimizer branch but receives
        defaults back. Without post-hoc detection, ``meta["calibrated"]``
        would lie: ``True`` even though nothing was actually fit — a sibling
        of the HF.3 phantom-curve bug in ``compute_ebbinghaus``.

        This test pins the honest behaviour: in that zone, meta must report
        ``calibrated=False`` with a reason string that mentions defaults or
        the fsrs mini-batch threshold.
        """
        logs = _synthetic_review_logs(n=300)
        params, meta = calibrate(logs)
        assert meta["calibrated"] is False, (
            "phantom-calibration: Optimizer ran but returned defaults; "
            "meta must say so explicitly instead of claiming success"
        )
        assert meta["n_logs"] == 300
        assert params == _default_parameters()
        reason = meta["reason"].lower()
        assert "default" in reason or "mini_batch" in reason, (
            f"reason must explain the phantom-calibration; got: {meta['reason']!r}"
        )

    @pytest.mark.slow
    def test_enough_logs_triggers_optimizer(self):
        """Full Optimizer round-trip when history crosses fsrs' 512 threshold.

        n=800 with the 12-card generator produces ~660 non-same-day reviews —
        well above fsrs' ``mini_batch_size=512`` — so the Optimizer actually
        trains. Expect ~1.5-3s runtime (real torch gradient descent) and
        params that differ from defaults in at least one index.
        """
        logs = _synthetic_review_logs(n=800)
        params, meta = calibrate(logs)
        assert meta["calibrated"] is True, (
            f"expected calibrated=True at n=800; meta={meta!r}. "
            "If this fails, fsrs internals likely changed — check "
            "optimizer.py for a new mini_batch_size."
        )
        assert meta["n_logs"] == 800
        assert len(params) == 21
        # Fitted params should differ from defaults on a non-trivial history.
        assert params != _default_parameters()


# ════════════════════════════════════════════════════════════
# 3. compute_retention_curves (primitive)
# ════════════════════════════════════════════════════════════


@pytest.mark.unit
class TestComputeRetentionCurves:
    """R(t) = (1 + t/(9·S))^(-1) averaged across cards, per day."""

    def test_empty_cards_raises_not_returns_100(self, default_parameters):
        with pytest.raises(ValueError, match=r"(?i)insufficient"):
            compute_retention_curves(
                cards=[], parameters=default_parameters, days=[0, 7, 14, 30, 66]
            )

    def test_retention_at_t_zero_is_approximately_100(
        self, synthetic_cards, default_parameters
    ):
        curve = compute_retention_curves(
            cards=synthetic_cards,
            parameters=default_parameters,
            days=[0, 7, 14, 30, 66],
        )
        assert len(curve) == 5
        assert curve[0] == pytest.approx(100.0, abs=0.5)

    def test_retention_is_monotonic_non_increasing(
        self, synthetic_cards, default_parameters
    ):
        curve = compute_retention_curves(
            cards=synthetic_cards,
            parameters=default_parameters,
            days=[0, 7, 14, 30, 66],
        )
        for i in range(len(curve) - 1):
            assert curve[i] >= curve[i + 1] - 1e-6, (
                f"non-monotonic at i={i}: {curve[i]} < {curve[i + 1]}"
            )

    def test_retention_decays_on_long_horizons(
        self, synthetic_cards, default_parameters
    ):
        short = compute_retention_curves(
            cards=synthetic_cards, parameters=default_parameters, days=[66]
        )
        long_ = compute_retention_curves(
            cards=synthetic_cards, parameters=default_parameters, days=[365]
        )
        assert long_[0] < short[0], (
            f"expected decay over time, got R(365)={long_[0]} ≥ R(66)={short[0]}"
        )


# ════════════════════════════════════════════════════════════
# 4. compute_decay_from_srs — HTML contract integration (Test 9)
# ════════════════════════════════════════════════════════════


@pytest.mark.unit
class TestHtmlContract:
    """The rendered HTML at generate_report.py:822-825 reads four curve keys.

    Per the user's explicit instruction:
      "השתמש בשמות המפתחות בדיוק כמו ב-data['srs']: confident, hesitant,
      guessed, total. זה מה שהטמפלייט קורא."
    We pin those exact names and lengths so no future refactor can silently
    break the chart.
    """

    def test_returns_exactly_four_curve_keys(
        self, srs_summary_full, srs_rows_full, history_rows_full
    ):
        result = compute_decay_from_srs(
            srs_summary=srs_summary_full,
            spaced_repetition_rows=srs_rows_full,
            answer_history_rows=history_rows_full,
            days_left=66,
        )
        assert set(result["curves"].keys()) == {
            "confident",
            "hesitant",
            "guessed",
            "total",
        }

    def test_days_list_matches_days_left(
        self, srs_summary_full, srs_rows_full, history_rows_full
    ):
        result = compute_decay_from_srs(
            srs_summary=srs_summary_full,
            spaced_repetition_rows=srs_rows_full,
            answer_history_rows=history_rows_full,
            days_left=66,
        )
        assert result["days"] == [0, 7, 14, 30, 66]

    def test_each_curve_is_five_floats_in_valid_range(
        self, srs_summary_full, srs_rows_full, history_rows_full
    ):
        result = compute_decay_from_srs(
            srs_summary=srs_summary_full,
            spaced_repetition_rows=srs_rows_full,
            answer_history_rows=history_rows_full,
            days_left=66,
        )
        for name, curve in result["curves"].items():
            assert len(curve) == 5, f"{name!r} must have 5 points, got {len(curve)}"
            for v in curve:
                assert 0.0 <= v <= 100.0, f"{name!r} has out-of-range value {v}"

    def test_empty_srs_and_history_raises_not_returns_flat_100(self):
        empty_srs = {
            "confident": {"total": 0, "due": 0, "avg_interval": 1.0},
            "hesitant": {"total": 0, "due": 0, "avg_interval": 1.0},
            "guessed": {"total": 0, "due": 0, "avg_interval": 1.0},
        }
        with pytest.raises(ValueError, match=r"(?i)insufficient"):
            compute_decay_from_srs(
                srs_summary=empty_srs,
                spaced_repetition_rows=[],
                answer_history_rows=[],
                days_left=66,
            )
