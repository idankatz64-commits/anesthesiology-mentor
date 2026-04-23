"""ERI calibration — daily snapshot builder (hf-6a).

Scope:
  - Callable function `build_daily_snapshots(history) -> list[DailySnapshot]`.
  - NOT wired into compute_all in hf-6a (Split=B lock per REQ-HF6a-5).
  - hf-6b will consume these snapshots for regression calibration in a future phase.

Component lock:
  Per ~/.claude/plans/wondrous-popping-sunrise.md line 128:
    Readiness = w·components · 100, clipped [0, 100]
  For the `·100` scaling to be well-defined, each component MUST be a float in [0.0, 1.0].
  This lock is enforced by test_build_daily_snapshots_shape_and_values.

HF.3 invariant:
  No silent fallbacks. Empty / insufficient input raises ValueError.

Retention (hf-6a placeholder):
  For hf-6a, retention on day d = correct_repeats_on_day_d / total_repeats_on_day_d,
  where a "repeat" is an answer on a question_id that has been seen on any prior day.
  If no repeats on day d, retention = 0.0.
  hf-6b will refine this with FSRS-based retention reconstruction.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DailySnapshot:
    date: str
    accuracy: float
    coverage: float
    retention: float
    consistency: float


def _clip(x: float) -> float:
    """Clip a float into the closed interval [0.0, 1.0]."""
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return float(x)


def build_daily_snapshots(history: dict[str, Any]) -> list[DailySnapshot]:
    """Compute per-day ERI component snapshots from a user's full answer history.

    Args:
        history: dict with keys:
            - "total_db": int, total questions available in DB (coverage denominator).
            - "answer_history": list[dict] with per-answer rows. Each row:
                {"answered_at": str (ISO 8601 UTC), "is_correct": bool,
                 "question_id": str, "topic": str}.

    Returns:
        list[DailySnapshot], one per distinct date in history["answer_history"],
        sorted ascending by date. Every component is a float in [0.0, 1.0].

    Raises:
        ValueError: if history is missing required keys, answer_history is empty,
            or fewer than 2 distinct days are present (consistency needs >= 2 days
            to compute stdev). Message names the missing component.
        TypeError: if history is None.
    """
    if history is None:
        raise TypeError(
            "build_daily_snapshots: history is None; expected a dict with "
            "'total_db' and 'answer_history' keys."
        )
    if not isinstance(history, dict):
        raise ValueError(
            f"build_daily_snapshots: history must be a dict, got {type(history).__name__}."
        )

    total_db = history.get("total_db")
    rows = history.get("answer_history")

    if total_db is None or not isinstance(total_db, int) or total_db <= 0:
        raise ValueError(
            "build_daily_snapshots: history['total_db'] missing or non-positive; "
            "cannot compute coverage without a DB-size denominator."
        )
    if not rows:
        raise ValueError(
            "build_daily_snapshots: empty answer_history; cannot build snapshots "
            "from nothing (HF.3 invariant: no silent fallback)."
        )

    # Group rows by date ("YYYY-MM-DD" from ISO 8601 answered_at[:10]).
    by_date: dict[str, list[dict]] = {}
    for row in rows:
        d = row["answered_at"][:10]  # precedent: generate_report.py line 134
        by_date.setdefault(d, []).append(row)

    sorted_dates = sorted(by_date.keys())

    if len(sorted_dates) < 2:
        raise ValueError(
            f"build_daily_snapshots: consistency component requires >= 2 distinct "
            f"days in answer_history, got {len(sorted_dates)}. Refusing to produce "
            f"a single-day snapshot whose consistency is undefined (HF.3)."
        )

    # Running state across days (immutable-ish: we rebuild per iteration).
    seen_qids: set[str] = set()
    daily_accuracies: list[float] = []
    snapshots: list[DailySnapshot] = []

    for d in sorted_dates:
        day_rows = by_date[d]
        n = len(day_rows)
        correct = sum(1 for r in day_rows if r["is_correct"])

        # accuracy = correct / n, in [0, 1]
        accuracy = _clip(correct / n) if n > 0 else 0.0

        # retention = correct_repeats / total_repeats on this day, [0, 1]
        repeats = [r for r in day_rows if r["question_id"] in seen_qids]
        if repeats:
            correct_repeats = sum(1 for r in repeats if r["is_correct"])
            retention = _clip(correct_repeats / len(repeats))
        else:
            retention = 0.0

        # Update seen_qids AFTER retention calc so day d's own q_ids don't count as repeats.
        for r in day_rows:
            seen_qids.add(r["question_id"])

        # coverage = cumulative distinct q_ids / total_db, [0, 1]
        coverage = _clip(len(seen_qids) / total_db)

        # consistency — stdev-normalized on accuracies up to and including today.
        # 1.0 - min(1.0, stdev / 0.5), clipped.
        daily_accuracies.append(accuracy)
        if len(daily_accuracies) >= 2:
            sd = statistics.stdev(daily_accuracies)
            consistency = _clip(1.0 - min(1.0, sd / 0.5))
        else:
            consistency = 0.0

        snapshots.append(
            DailySnapshot(
                date=d,
                accuracy=accuracy,
                coverage=coverage,
                retention=retention,
                consistency=consistency,
            )
        )

    return snapshots


# ============================================================
# hf-6b — personalized readiness via OLS calibration (CP3 T4)
# ============================================================

import numpy as np  # noqa: E402

V2_FALLBACK_WEIGHTS: dict[str, float] = {
    "accuracy": 0.25,
    "coverage": 0.25,
    "retention": 0.30,
    "consistency": 0.20,
    "intercept": 0.0,
}

_MIN_PAIRS_FOR_REGRESSION: int = 3
_MIN_PAIRS_FOR_CALIBRATION: int = 14
_MIN_R_SQUARED_FOR_CALIBRATION: float = 0.3
_READINESS_CLIP_LOW: float = 0.0
_READINESS_CLIP_HIGH: float = 100.0


def compute_readiness_calibrated(
    history: dict[str, Any],
    components: dict[str, float],
) -> dict[str, Any]:
    """Personalized readiness via OLS calibration on daily snapshots (hf-6b).

    Fits next-day accuracy against same-day snapshot features
    (accuracy, coverage, retention) + intercept using ordinary least
    squares on the user's own history. Returns fitted readiness,
    recovered weights, and a fit_quality flag describing the branch taken.

    Consistency is excluded from the OLS regression due to structural
    multicollinearity with accuracy (REQ-HF6b-7): the stdev-of-accuracies
    formula that defines consistency mathematically contains the accuracy
    column, producing an unidentifiable column in X. The weights dict
    still has a "consistency" key (hardcoded 0.0 in the calibrated
    branch; V2_FALLBACK_WEIGHTS["consistency"] in fallback branches)
    for ABI compatibility with REQ-HF6b-1.

    Contract (REQ-HF6b-1):
        Returns dict with exactly the keys
        {"readiness", "weights", "fit_quality"}.
        - readiness: float in [0, 100] (clipped).
        - weights: dict with keys
          {"accuracy", "coverage", "retention", "consistency", "intercept"};
          all values are float.
        - fit_quality: one of
          {"calibrated", "insufficient_history", "poor_fit"}
          (English literals -- machine contract; HTML surface is T5's job).

    Branch table (HF.3; REQ-HF6b-3 + REQ-HF6b-5):
        N-1 < 3              -> raise ValueError (undefined regression).
        3 <= N-1 < 14        -> labeled fallback, fit_quality="insufficient_history".
        N-1 >= 14, R^2 < 0.3  -> labeled fallback, fit_quality="poor_fit".
        N-1 >= 14, R^2 >= 0.3 -> OLS coefficients, fit_quality="calibrated".
        (N = number of DailySnapshots returned by build_daily_snapshots.)

    Note: retention feature is slightly optimistic because FSRS parameters
    used to reconstruct per-day retention were calibrated on the full history,
    including days that occur after each snapshot. This is an accepted
    look-ahead bias per CP2 O-1 disposition (c); see REQUIREMENTS.md §9.

    Degenerate-target case (O-3 polish):
        If ss_tot == 0 (zero variance in next-day accuracy targets), R^2
        is set to 0.0 -> enters poor_fit branch with labeled V2 fallback.
        HF.3 compliant -- labeled, never silent.

    Args:
        history: same shape as build_daily_snapshots; dict with keys
            "total_db" (int) and "answer_history" (list of rows).
        components: dict with at least the four feature keys
            ("accuracy", "coverage", "retention", "consistency") in
            [0, 1]. Missing keys default to 0.0 -- safe because readiness
            is always clipped to [0, 100].

    Returns:
        dict with keys {"readiness", "weights", "fit_quality"} per
        contract above.

    Raises:
        ValueError: if the underlying history yields fewer than 4
            distinct days (N <= 3 -> N-1 <= 2). Also propagates any
            ValueError from build_daily_snapshots (e.g., single-day
            history, empty answer_history).
    """
    snapshots = build_daily_snapshots(history)
    n_pairs = len(snapshots) - 1

    if n_pairs < _MIN_PAIRS_FOR_REGRESSION:
        raise ValueError(
            "compute_readiness_calibrated: insufficient history for "
            f"regression -- need N-1 >= {_MIN_PAIRS_FOR_REGRESSION} "
            f"training pairs, got N-1 = {n_pairs}. OLS on fewer pairs is "
            "undefined (HF.3 -- labeled raise, not silent)."
        )

    if n_pairs < _MIN_PAIRS_FOR_CALIBRATION:
        weights: dict[str, float] = dict(V2_FALLBACK_WEIGHTS)
        fit_quality = "insufficient_history"
    else:
        x_rows: list[list[float]] = []
        y_vals: list[float] = []
        for i in range(n_pairs):
            s = snapshots[i]
            # REQ-HF6b-7: 3 features + intercept (consistency excluded —
            # see docstring for rationale).
            x_rows.append(
                [s.accuracy, s.coverage, s.retention, 1.0]
            )
            y_vals.append(snapshots[i + 1].accuracy)
        x_matrix = np.array(x_rows, dtype=float)
        y_vector = np.array(y_vals, dtype=float)

        coef, _residuals, _rank, _sv = np.linalg.lstsq(
            x_matrix, y_vector, rcond=None
        )

        y_pred = x_matrix @ coef
        ss_res = float(np.sum((y_vector - y_pred) ** 2))
        y_mean = float(np.mean(y_vector))
        ss_tot = float(np.sum((y_vector - y_mean) ** 2))

        if ss_tot == 0.0:
            r_squared = 0.0
        else:
            r_squared = 1.0 - ss_res / ss_tot

        if r_squared < _MIN_R_SQUARED_FOR_CALIBRATION:
            weights = dict(V2_FALLBACK_WEIGHTS)
            fit_quality = "poor_fit"
        else:
            # REQ-HF6b-7: 3-feature OLS — coef is length 4
            # (acc, cov, ret, intercept). Consistency hardcoded 0.0 in
            # calibrated branch; V2_FALLBACK_WEIGHTS retains 0.20 in
            # fallback branches.
            weights = {
                "accuracy": float(coef[0]),
                "coverage": float(coef[1]),
                "retention": float(coef[2]),
                "consistency": 0.0,
                "intercept": float(coef[3]),
            }
            fit_quality = "calibrated"

    raw_readiness = (
        weights["accuracy"] * float(components.get("accuracy", 0.0))
        + weights["coverage"] * float(components.get("coverage", 0.0))
        + weights["retention"] * float(components.get("retention", 0.0))
        + weights["consistency"] * float(components.get("consistency", 0.0))
        + weights["intercept"]
    ) * 100.0
    readiness = max(
        _READINESS_CLIP_LOW, min(_READINESS_CLIP_HIGH, raw_readiness)
    )

    return {
        "readiness": float(readiness),
        "weights": weights,
        "fit_quality": fit_quality,
    }
