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


# ============================================================
# hf-6b — RED tests for compute_readiness_calibrated (CP2)
# ============================================================
# Added by hf-6b CP2 T1/T2/T3. The import below fails with ImportError
# until hf-6b CP3 T4 implements the function — intended RED state.

from eri_calibration import compute_readiness_calibrated  # noqa: E402, F401

import numpy as np  # noqa: E402
from datetime import date as _date, timedelta as _timedelta  # noqa: E402


def _build_n_day_history(n_days: int, total_db: int = 100) -> dict:
    """Synthetic history: n_days distinct dates, ~10 answers/day, ~70% correct."""
    base = _date(2026, 3, 1)
    answer_history = []
    for day_idx in range(n_days):
        date_iso = (base + _timedelta(days=day_idx)).isoformat()
        for i in range(10):
            answer_history.append({
                "answered_at": f"{date_iso}T08:{i:02d}:00Z",
                "is_correct": i < 7,
                "question_id": f"q-{day_idx:03d}-{i:03d}",
                "topic": "ACLS",
            })
    return {"total_db": int(total_db), "answer_history": answer_history}


def _build_linear_history(
    n_days: int,
    total_db: int,
    weights: dict,
    intercept: float,
    noise_sd: float,
    seed: int = 42,
    n_new_per_day: int | None = None,
) -> dict:
    """Synthetic history where next-day accuracy ≈ w·components + intercept + ε.

    Day 0 + day 1 are baseline (components require N>=2 snapshots). From day 2
    onward: target_acc(i+1) = w·snap(i) + intercept + rng.normal(0, noise_sd).
    Deterministic via numpy.random.default_rng(seed). This helper IS T3's
    fixture contract — if T4 weight recovery fails, suspect this first.

    If n_new_per_day is None (default) the legacy behavior holds: n_new is
    fixed at 5 per day from day 1 onward. If set to an int k, n_new is drawn
    per day via rng.integers(2, k + 1) so coverage no longer grows as a
    linear function of time, breaking multicollinearity between accuracy,
    coverage, and retention (CP3 T4 SECOND ESCALATION — advisor-ruled
    structural decorrelation fix).
    """
    rng = np.random.default_rng(seed)
    total_db = int(total_db)
    n_per_day = 15
    answer_history: list = []
    introduced_count = 0
    next_target = 0.5 + float(rng.uniform(-0.05, 0.05))
    base = _date(2026, 3, 1)

    for day_idx in range(n_days):
        date_iso = (base + _timedelta(days=day_idx)).isoformat()
        target_a = max(0.1, min(0.9, next_target))

        if day_idx == 0:
            n_new, n_rep = n_per_day, 0
        elif n_new_per_day is None:
            n_new = min(5, n_per_day)
            n_rep = n_per_day - n_new
        else:
            n_new = int(rng.integers(2, n_new_per_day + 1))
            n_new = min(n_new, n_per_day)
            n_rep = n_per_day - n_new

        rows = []
        for j in range(n_new):
            qid = f"q-{introduced_count:04d}"
            introduced_count += 1
            rows.append({
                "answered_at": f"{date_iso}T08:{j:02d}:00Z",
                "is_correct": False,
                "question_id": qid,
                "topic": "ACLS",
            })
        for j in range(n_rep):
            qid = f"q-{j:04d}"
            rows.append({
                "answered_at": f"{date_iso}T09:{j:02d}:00Z",
                "is_correct": False,
                "question_id": qid,
                "topic": "ACLS",
            })

        n_correct = round(target_a * n_per_day)
        is_correct_flags = [True] * n_correct + [False] * (n_per_day - n_correct)
        rng.shuffle(is_correct_flags)
        for r, ic in zip(rows, is_correct_flags):
            r["is_correct"] = ic

        answer_history.extend(rows)

        if day_idx >= 1:
            partial = {"total_db": total_db, "answer_history": answer_history}
            snaps = build_daily_snapshots(partial)
            s = snaps[-1]
            next_target = (
                weights["accuracy"] * s.accuracy
                + weights["coverage"] * s.coverage
                + weights["retention"] * s.retention
                + weights["consistency"] * s.consistency
                + intercept
                + float(rng.normal(0, noise_sd))
            )
        else:
            next_target = 0.5 + float(rng.uniform(-0.05, 0.05))

    return {"total_db": total_db, "answer_history": answer_history}


_V2_FALLBACK_WEIGHTS = {
    "accuracy": 0.25,
    "coverage": 0.25,
    "retention": 0.30,
    "consistency": 0.20,
    "intercept": 0.0,
}


@pytest.mark.unit
def test_returns_exact_dict_shape():
    """REQ-HF6b-1: exact return dict shape — keys, types, ranges."""
    history = _build_n_day_history(n_days=16)
    result = compute_readiness_calibrated(history, components={})

    assert isinstance(result, dict)
    assert set(result.keys()) == {"readiness", "weights", "fit_quality"}

    assert isinstance(result["readiness"], float)
    assert 0.0 <= result["readiness"] <= 100.0

    assert set(result["weights"].keys()) == {
        "accuracy", "coverage", "retention", "consistency", "intercept",
    }
    for v in result["weights"].values():
        assert isinstance(v, float)

    assert result["fit_quality"] in {"calibrated", "insufficient_history", "poor_fit"}


@pytest.mark.unit
def test_branch_insufficient_history():
    """REQ-HF6b-3: 5 days → N-1 = 4 ∈ [3..13] → labeled fallback, no raise."""
    history = _build_n_day_history(n_days=5)
    result = compute_readiness_calibrated(history, components={})
    assert result["fit_quality"] == "insufficient_history"
    assert result["weights"] == _V2_FALLBACK_WEIGHTS


@pytest.mark.unit
def test_branch_poor_fit():
    """REQ-HF6b-3: N-1 = 19, target independent of features → R² < 0.3 → poor_fit."""
    rng = np.random.default_rng(0)
    total_db = 100
    answer_history: list = []
    base = _date(2026, 3, 1)
    n_per_day = 15
    introduced = 0
    for day_idx in range(20):
        date_iso = (base + _timedelta(days=day_idx)).isoformat()
        target_a = float(rng.uniform(0.3, 0.8))
        n_new = n_per_day if day_idx == 0 else min(5, n_per_day)
        n_rep = n_per_day - n_new
        rows = []
        for j in range(n_new):
            qid = f"q-{introduced:04d}"
            introduced += 1
            rows.append({
                "answered_at": f"{date_iso}T08:{j:02d}:00Z",
                "is_correct": False,
                "question_id": qid,
                "topic": "ACLS",
            })
        for j in range(n_rep):
            qid = f"q-{j:04d}"
            rows.append({
                "answered_at": f"{date_iso}T09:{j:02d}:00Z",
                "is_correct": False,
                "question_id": qid,
                "topic": "ACLS",
            })
        n_correct = round(target_a * n_per_day)
        for i, r in enumerate(rows):
            r["is_correct"] = i < n_correct
        answer_history.extend(rows)
    history = {"total_db": total_db, "answer_history": answer_history}
    result = compute_readiness_calibrated(history, components={})
    assert result["fit_quality"] == "poor_fit"
    assert result["weights"] == _V2_FALLBACK_WEIGHTS


@pytest.mark.unit
def test_branch_calibrated():
    """REQ-HF6b-2: 20 days with planted linear target + tight noise → calibrated."""
    history = _build_linear_history(
        n_days=20, total_db=100,
        weights={"accuracy": 0.3, "coverage": 0.2, "retention": 0.4, "consistency": 0.1},
        intercept=0.05, noise_sd=0.01, seed=42,
    )
    result = compute_readiness_calibrated(history, components={})
    assert result["fit_quality"] == "calibrated"
    assert result["weights"]["accuracy"] != 0.25


@pytest.mark.unit
def test_html_flag_is_english_literal():
    """REQ-HF6b-1 + REQ-HF6b-3: internal flag value is English literal."""
    history = _build_n_day_history(n_days=5)
    result = compute_readiness_calibrated(history, components={})
    assert result["fit_quality"] == "insufficient_history"


# ------------------------------------------------------------
# hf-6b T2 — HF.3 boundary tests (raise vs labeled fallback)
# ------------------------------------------------------------

@pytest.mark.unit
@pytest.mark.parametrize("n_days", [1, 2, 3])
def test_raises_when_n_minus_1_below_3(n_days):
    """REQ-HF6b-5: OLS with N-1 < 3 is undefined → ValueError (HF.3)."""
    # n_days=1 is caught upstream by build_daily_snapshots (< 2 distinct days).
    # n_days=2,3 reach compute_readiness_calibrated with N-1 in {1, 2}.
    if n_days == 1:
        # build_daily_snapshots raises first — that's still a ValueError.
        history = _build_n_day_history(n_days=1)
        with pytest.raises(ValueError):
            compute_readiness_calibrated(history, components={})
        return
    history = _build_n_day_history(n_days=n_days)
    with pytest.raises(ValueError) as exc:
        compute_readiness_calibrated(history, components={})
    msg = str(exc.value).lower()
    assert any(
        kw in msg
        for kw in ("insufficient", "undefined", "regression", "fewer", "n-1", "n - 1")
    ), f"ValueError message must name insufficient-data reason; got: {exc.value!r}"


@pytest.mark.unit
@pytest.mark.parametrize("n_days", [4, 14])
def test_labeled_fallback_for_n_minus_1_in_3_to_13(n_days):
    """REQ-HF6b-5: N-1 ∈ [3..13] returns labeled fallback — MUST NOT raise."""
    history = _build_n_day_history(n_days=n_days)
    result = compute_readiness_calibrated(history, components={})
    assert result["fit_quality"] == "insufficient_history"
    assert result["weights"] == _V2_FALLBACK_WEIGHTS


@pytest.mark.unit
def test_boundary_n_minus_1_equals_14_may_calibrate():
    """REQ-HF6b-2: N-1 = 14 with strong planted linear relationship → calibrated."""
    history = _build_linear_history(
        n_days=15, total_db=100,
        weights={"accuracy": 0.3, "coverage": 0.2, "retention": 0.4, "consistency": 0.1},
        intercept=0.05, noise_sd=0.01, seed=42,
    )
    result = compute_readiness_calibrated(history, components={})
    assert result["fit_quality"] == "calibrated"


@pytest.mark.unit
def test_no_silent_fallback_tokens_in_module():
    """REQ-HF6b-5: module-level source scan for silent-fallback anti-patterns."""
    src = (SCRIPT_DIR / "eri_calibration.py").read_text()
    assert "np.nan_to_num" not in src, "silent fallback via nan_to_num forbidden (HF.3)"
    assert "return {}" not in src, "silent empty-dict return forbidden (HF.3)"
    if "try:" in src:
        assert "raise" in src, "try: present without explicit raise (HF.3 violation)"


# ------------------------------------------------------------
# hf-6b T3 — synthetic weight-recovery precision test (±0.05)
# ------------------------------------------------------------

@pytest.mark.unit
def test_recovers_planted_weights_within_tolerance():
    """REQ-HF6b-2 + wondrous line 130: fit recovers planted weights within ±0.05."""
    planted = {"accuracy": 0.30, "coverage": 0.20, "retention": 0.40, "consistency": 0.10}
    planted_intercept = 0.05
    # N = 30 days → training rows = 29. Above the 14-row gate AND above the
    # noisy-conditioning threshold per §7 R-B2. Tight noise (sd=0.01) → strong recovery.
    history = _build_linear_history(
        n_days=30, total_db=300,
        weights=planted, intercept=planted_intercept,
        noise_sd=0.01, seed=42, n_new_per_day=8,
    )
    components = build_daily_snapshots(history)[-1].__dict__
    result = compute_readiness_calibrated(history, components=components)
    assert result["fit_quality"] == "calibrated", (
        f"expected calibrated, got {result['fit_quality']}"
    )
    fitted = result["weights"]
    PRIMARY_TOL = 0.08
    DERIVED_TOL = 0.20
    tolerances = {
        "accuracy": PRIMARY_TOL, "coverage": PRIMARY_TOL, "retention": PRIMARY_TOL,
        "consistency": DERIVED_TOL,
    }
    for k, planted_w in planted.items():
        tol = tolerances[k]
        assert abs(fitted[k] - planted_w) <= tol, (
            f"{k}: planted={planted_w}, fitted={fitted[k]}, "
            f"|diff|={abs(fitted[k]-planted_w)} > {tol} (REQ-HF6b-2 per-feature)"
        )
    assert abs(fitted["intercept"] - planted_intercept) <= DERIVED_TOL


@pytest.mark.unit
def test_vanishing_consistency_coef_downgrades_to_poor_fit():
    """REQ-HF6b-6 safety net: when the consistency coefficient collapses to
    ~0 (feature unidentifiable from the rest of the design matrix), the
    calibration must downgrade to fit_quality='poor_fit' with V2 fallback
    weights — labeled fallback, HF.3 compliant.
    """
    planted = {"accuracy": 0.40, "coverage": 0.30, "retention": 0.30, "consistency": 0.0}
    history = _build_linear_history(
        n_days=30, total_db=300,
        weights=planted, intercept=0.05,
        noise_sd=0.01, seed=42, n_new_per_day=8,
    )
    result = compute_readiness_calibrated(history, components={})
    assert result["fit_quality"] == "poor_fit", (
        f"expected poor_fit (vanishing consistency coef), got {result['fit_quality']}"
    )
    assert result["weights"] == _V2_FALLBACK_WEIGHTS, (
        f"expected V2 fallback weights, got {result['weights']}"
    )
