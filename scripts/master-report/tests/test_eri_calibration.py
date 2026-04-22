"""RED-gate tests for hf-6a ``build_daily_snapshots`` (CP3).

All three tests error at import collection with ``ModuleNotFoundError`` until
hf-6a CP4 creates ``scripts/master-report/eri_calibration.py``. This is the
desired RED-before-GREEN state.

Path C contract (locked in PLAN.md T1):
  - Strict 1e-6 equality on accuracy + coverage (formulas stable across hf-6b swap).
  - Range + day-0 invariant on retention + consistency (placeholder formulas;
    hf-6b will swap them out, so locking exact numbers would create fragile tests).
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPT_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from eri_calibration import build_daily_snapshots, DailySnapshot  # noqa: E402


_single_row = {
    "answered_at": "2026-03-01T08:00:00Z",
    "is_correct": True,
    "question_id": "q-000",
    "topic": "ACLS",
}


@pytest.mark.unit
def test_module_imports():
    """T0 smoke: module is importable and exports the public API.

    Fails at import with ``ModuleNotFoundError`` until CP4 creates the module.
    """
    assert build_daily_snapshots is not None
    assert DailySnapshot is not None


@pytest.mark.unit
def test_build_daily_snapshots_shape_and_values():
    """T1 (Path C): strict on accuracy+coverage, behavioral on retention+consistency.

    # Per wondrous-popping-sunrise.md line 128: Readiness = w·components · 100, clipped [0,100]
    """
    # Day 0 (2026-03-01): 10 rows, q-000..q-009, first 7 correct, last 3 incorrect.
    day0 = [
        {
            "answered_at": f"2026-03-01T08:{i:02d}:00Z",
            "is_correct": i < 7,
            "question_id": f"q-{i:03d}",
            "topic": "ACLS",
        }
        for i in range(10)
    ]

    # Day 1 (2026-03-02): 7 repeats of q-000..q-006 (all correct) + 8 NEW q-010..q-017
    # (first 5 correct, last 3 incorrect). Total: 12/15 correct.
    day1 = [
        {
            "answered_at": f"2026-03-02T08:{i:02d}:00Z",
            "is_correct": True,
            "question_id": f"q-{i:03d}",
            "topic": "ACLS",
        }
        for i in range(7)
    ] + [
        {
            "answered_at": f"2026-03-02T09:{i:02d}:00Z",
            "is_correct": i < 5,
            "question_id": f"q-{10 + i:03d}",
            "topic": "ACLS",
        }
        for i in range(8)
    ]

    # Day 2 (2026-03-03): 17 REPEATS q-000..q-016 (first 12 correct, last 5 incorrect)
    # + 3 NEW q-018..q-020 (first 2 correct, last 1 incorrect). Total: 14/20 correct.
    day2 = [
        {
            "answered_at": f"2026-03-03T08:{i:02d}:00Z",
            "is_correct": i < 12,
            "question_id": f"q-{i:03d}",
            "topic": "ACLS",
        }
        for i in range(17)
    ] + [
        {
            "answered_at": f"2026-03-03T09:{i:02d}:00Z",
            "is_correct": i < 2,
            "question_id": f"q-{18 + i:03d}",
            "topic": "ACLS",
        }
        for i in range(3)
    ]

    history = {"total_db": 100, "answer_history": day0 + day1 + day2}

    ground_truth = [
        # accuracy = correct/total for the day. coverage = distinct_qids_seen_to_date / total_db.
        # retention and consistency are omitted — Path C asserts range + day-0 invariant only.
        {"date": "2026-03-01", "accuracy": 0.7, "coverage": 0.10},
        {"date": "2026-03-02", "accuracy": 0.8, "coverage": 0.18},
        {"date": "2026-03-03", "accuracy": 0.7, "coverage": 0.21},
    ]

    result = build_daily_snapshots(history)

    # 1. Length
    assert len(result) == 3

    # 2. Dates strictly ascending
    assert [s.date for s in result] == ["2026-03-01", "2026-03-02", "2026-03-03"]

    # 3. Strict equality on accuracy + coverage (formulas stable across hf-6b swap)
    for i in range(3):
        for c in ("accuracy", "coverage"):
            assert abs(getattr(result[i], c) - ground_truth[i][c]) < 1e-6, (
                f"{c} on day {i}: got {getattr(result[i], c)}, want {ground_truth[i][c]}"
            )

    # 4a. Behavioral range on retention + consistency (placeholder formulas; hf-6b will swap)
    for i in range(3):
        for c in ("retention", "consistency"):
            v = getattr(result[i], c)
            assert 0.0 <= v <= 1.0, f"{c} on day {i} out of [0,1]: {v}"

    # 4b. Retention day-0 invariant: Option A (repeats-ratio) → day 0 has no prior history.
    assert result[0].retention == 0.0, "day 0 has no prior repeats — retention must be 0.0"

    # 5. [0,1] LOCK on accuracy + coverage (belt-and-suspenders)
    for i in range(3):
        for c in ("accuracy", "coverage"):
            v = getattr(result[i], c)
            assert 0.0 <= v <= 1.0, f"{c} on day {i} out of [0,1]"


@pytest.mark.unit
@pytest.mark.parametrize(
    "bad_input,expected_substring",
    [
        ({"total_db": 100, "answer_history": []}, "empty"),
        ({"total_db": 100, "answer_history": [_single_row]}, "days"),  # n_days=1 < 5 threshold
        (None, None),  # TypeError acceptable
    ],
)
def test_build_daily_snapshots_raises_on_empty_history(bad_input, expected_substring):
    """T2 (HF.3 invariant): insufficient input raises, no silent fallback."""
    with pytest.raises((ValueError, TypeError)) as exc:
        build_daily_snapshots(bad_input)
    if expected_substring is not None:
        assert expected_substring in str(exc.value).lower()
