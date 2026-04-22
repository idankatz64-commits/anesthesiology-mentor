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
