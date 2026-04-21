"""Honest retention curves using FSRS (Anki 2023) — HF.5.

Replaces the Ebbinghaus branch in ``generate_report.compute_ebbinghaus`` that
produced a phantom flat ``[100, 100, 100, 100, 100]`` curve whenever
``srs_total == 0`` (the April 18 bug). FSRS gives us a principled
spaced-repetition model whose per-card stability lets us compute honest
retention probabilities, and whose ``Optimizer`` can fit the 21-parameter
vector to the user's own review history once enough logs exist.

Public API — pinned by ``tests/test_fsrs_module.py``:

    build_review_logs(answer_history, spaced_repetition) -> list[ReviewLog]
    calibrate(review_logs)                               -> tuple[list[float], dict]
    compute_retention_curves(cards, parameters, days)    -> list[float]
    compute_decay_from_srs(srs_summary, spaced_repetition_rows,
                           answer_history_rows, days_left,
                           parameters=None)              -> dict

HF.3 invariant: no silent fallback curves — empty inputs raise ``ValueError``.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fsrs import Card, Rating, ReviewLog, Scheduler
from fsrs.optimizer import Optimizer

# Below this log count the Optimizer overfits noise, so we return the
# hard-coded FSRS defaults and flag meta.calibrated=False. Reports can
# surface that flag so the user knows predictions are "global" not "yours".
_MIN_LOGS_FOR_OPTIMIZER = 200

_BUCKET_ORDER = ("confident", "hesitant", "guessed")

# Mirrors the retired compute_ebbinghaus weights so curves stay comparable
# across reports until true per-card FSRS state is plumbed end-to-end.
_BUCKET_STAB_MULT = {"confident": 2.5, "hesitant": 1.5, "guessed": 0.8}


def _parse_timestamp(value: Any) -> datetime | None:
    """Parse Supabase ISO-8601 timestamps; return None for null/empty/invalid."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    s = str(value)
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _default_parameters() -> list[float]:
    return list(Scheduler().parameters)


def _retention(stability: float, day: float) -> float:
    """FSRS-4.5 retention formula: R(t) = (1 + t/(9·S))^(-1)."""
    if stability <= 0:
        return 0.0
    return (1.0 + day / (9.0 * stability)) ** -1.0


def _card_stability(card: Card, fallback: float) -> float:
    s = getattr(card, "stability", None)
    return float(s) if s is not None and s > 0 else fallback


def build_review_logs(
    answer_history: list[dict],
    spaced_repetition: list[dict],  # noqa: ARG001  reserved for per-card enrichment
) -> list[ReviewLog]:
    """Reconstruct ``fsrs.ReviewLog`` instances from answer_history rows.

    Rows with null or empty ``answered_at`` are skipped — FSRS needs a real
    timestamp and silently mapping "unknown when" to "now" would bias the
    Optimizer toward artificially recent history.
    """
    logs: list[ReviewLog] = []
    for row in answer_history:
        ts = _parse_timestamp(row.get("answered_at"))
        if ts is None:
            continue
        rating = Rating.Good if row.get("is_correct") else Rating.Again
        qid = row.get("question_id") or ""
        card_id = abs(hash(qid)) % (10**12) if qid else 0
        logs.append(
            ReviewLog(
                card_id=card_id,
                rating=rating,
                review_datetime=ts,
                review_duration=None,
            )
        )
    return logs


def calibrate(review_logs: list[ReviewLog]) -> tuple[list[float], dict]:
    """Fit FSRS parameters when enough history exists, else fall back.

    Returns ``(parameters, meta)`` where ``meta["calibrated"]`` tells the
    caller whether the params are user-fitted or global defaults. This
    flag is the honest signal the HF.5 report needs: "predicted from your
    data" vs "global average applied".
    """
    n = len(review_logs)
    if n < _MIN_LOGS_FOR_OPTIMIZER:
        return (
            _default_parameters(),
            {
                "calibrated": False,
                "n_logs": n,
                "reason": f"insufficient history ({n} < {_MIN_LOGS_FOR_OPTIMIZER} reviews)",
            },
        )
    params = list(Optimizer(review_logs).compute_optimal_parameters())
    # Post-hoc phantom-calibration guard. fsrs 6.3.1's Optimizer silently
    # returns DEFAULT_PARAMETERS from optimizer.py:202 when non-same-day
    # reviews < mini_batch_size=512, so our n ≥ 200 can still yield a
    # no-signal fit. Exact-equality is safe here because fsrs returns the
    # module-level tuple untouched in that branch; if a future fsrs release
    # trains under the threshold, swap this for ``max(abs(a-b) for a, b in
    # zip(params, _default_parameters())) < 1e-9``.
    if params == _default_parameters():
        return (
            params,
            {
                "calibrated": False,
                "n_logs": n,
                "reason": (
                    f"fsrs 6.3.1 optimizer returned unchanged defaults on {n} "
                    "review logs — insufficient gradient signal. Common cause: "
                    "fewer than ~512 non-same-day reviews (fsrs internal "
                    "mini_batch_size threshold). Continue accumulating review "
                    "history; retry when total reviews exceed 600."
                ),
            },
        )
    return (
        params,
        {
            "calibrated": True,
            "n_logs": n,
            "reason": f"optimized on {n} review logs",
        },
    )


def compute_retention_curves(
    cards: list[Card],
    parameters: list[float],
    days: list[int],
) -> list[float]:
    """Average retention across cards for each day in ``days``.

    Raises ``ValueError`` if ``cards`` is empty — HF.3 fail-fast, no phantom
    100% fallback. Cards with unset stability fall back to ``parameters[2]``
    (the FSRS initial-Good stability), which models "just learned".
    """
    if not cards:
        raise ValueError("insufficient cards for retention curve")
    fallback_stability = (
        float(parameters[2]) if parameters and len(parameters) > 2 else 2.3
    )
    stabilities = [_card_stability(c, fallback_stability) for c in cards]
    curve: list[float] = []
    for day in days:
        retentions = [_retention(s, float(day)) for s in stabilities]
        avg = sum(retentions) / len(retentions)
        curve.append(round(avg * 100.0, 1))
    return curve


def _bucket_card(
    avg_interval: float,
    multiplier: float,
    fallback_stability: float,
) -> Card:
    """Seed one representative Card for a confidence bucket.

    We don't yet have per-card FSRS state in the DB, so we derive a bucket
    stability from ``avg_interval * multiplier`` (mirrors the old Ebbinghaus
    logic). When ``avg_interval`` is missing, fall back to the fresh-card
    stability so the curve still decays honestly.
    """
    s = max(0.01, float(avg_interval) * multiplier) if avg_interval else fallback_stability
    return Card(stability=s)


def compute_decay_from_srs(
    srs_summary: dict,
    has_history: bool,
    days_left: int,
    parameters: list[float] | None = None,
) -> dict:
    """Build the 4-curve payload the HTML report reads.

    Contract pinned by ``generate_report.py:822-825`` — four curve keys
    (``confident``, ``hesitant``, ``guessed``, ``total``) plus ``days``.

    Args:
        srs_summary: Aggregated bucket data (confident/hesitant/guessed),
            each with ``total`` + ``avg_interval``. Shape matches
            ``fetch_data`` output at ``generate_report.py:178-194``.
        has_history: ``True`` if the user has any answer_history or
            spaced_repetition records. Used only to distinguish the two
            empty-SRS cases: an "empty user" (raise under HF.3) vs an
            "active user with zero tracked SRS cards" (return defaults).
            Prior versions took raw row lists and reduced them to
            ``bool(...)`` internally — interface-dishonest, since the
            rows themselves were never inspected.
        days_left: Number of days to project the last retention point to.
        parameters: Optional fitted FSRS parameter vector. Calibration
            wiring, if added in a future HF, will route ``calibrate()``
            output through this kwarg.

    HF.3 invariant: when SRS buckets are empty *and* no history exists,
    raise ``ValueError`` instead of returning a flat-100% phantom curve.
    """
    total_tracked = sum(
        int((srs_summary.get(b, {}) or {}).get("total") or 0) for b in _BUCKET_ORDER
    )
    if total_tracked == 0 and not has_history:
        raise ValueError(
            "insufficient SRS and history data to compute retention "
            "(fail-fast per HF.3; caller must handle the no-data state)"
        )

    days = [0, 7, 14, 30, int(days_left)]
    params = list(parameters) if parameters else _default_parameters()
    fallback_stability = float(params[2]) if len(params) > 2 else 2.3

    curves: dict[str, list[float]] = {}
    weights: dict[str, int] = {}
    for bucket in _BUCKET_ORDER:
        info = srs_summary.get(bucket) or {}
        avg_interval = float(info.get("avg_interval") or 0.0)
        weights[bucket] = int(info.get("total") or 0)
        card = _bucket_card(
            avg_interval=avg_interval,
            multiplier=_BUCKET_STAB_MULT[bucket],
            fallback_stability=fallback_stability,
        )
        curves[bucket] = compute_retention_curves(
            cards=[card], parameters=params, days=days
        )

    total_weight = sum(weights.values())
    if total_weight == 0:
        # History exists (otherwise we'd have raised) but SRS totals are zero —
        # equal-weight average keeps the curve honest without fabricating counts.
        total_curve = [
            round(sum(curves[b][i] for b in _BUCKET_ORDER) / len(_BUCKET_ORDER), 1)
            for i in range(len(days))
        ]
    else:
        total_curve = [
            round(
                sum(curves[b][i] * weights[b] for b in _BUCKET_ORDER) / total_weight,
                1,
            )
            for i in range(len(days))
        ]
    curves["total"] = total_curve
    return {"days": days, "curves": curves}
