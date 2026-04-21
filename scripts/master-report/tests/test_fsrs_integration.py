"""Integration test — HF.5b wire-up of ``fsrs_module`` into ``generate_report``.

HF.3 invariant: a module that is never called is itself a silent fallback.
Before HF.5b, ``fsrs_module.compute_decay_from_srs`` was green in isolation
but ``generate_report.compute_all`` still routed retention through the legacy
``compute_ebbinghaus`` (which produces a phantom flat ``[100, 100, 100, 100,
100]`` curve when ``srs_total == 0`` — the original April 18 bug). This test
locks in the wire-up.

Design
------
* ``patch.object(generate_report, "compute_decay_from_srs", create=True)``
  uses ``create=True`` so the test fails cleanly in the RED phase (the
  attribute does not yet exist on the module) and passes in the GREEN phase
  once the import + call is added.
* ``compute_marginal_gains`` is stubbed — it runs ~30s of Monte Carlo and is
  unrelated to the decay wire-up we are verifying.
* The fixture is minimal but realistic so the surrounding ``compute_*``
  functions all succeed (>=3 daily points, a topic meeting the critical
  threshold, etc.). That keeps the test focused on the *wire-up contract*
  rather than on compensating for a weak fixture.
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

SCRIPT_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import generate_report  # noqa: E402


def _fixture_data() -> dict:
    """Minimal but realistic ``data`` matching ``fetch_data``'s output shape."""
    return {
        "total_db": 100,
        "topics_db": {"ACLS": 40, "PedsAnes": 60},
        "topics_user": [
            {"topic": "ACLS", "n": 20, "c": 14, "w": 6},
            {"topic": "PedsAnes", "n": 15, "c": 10, "w": 5},
        ],
        "topics_history": {},
        "daily": [
            {"d": "2026-04-01", "n": 10, "a": 70.0},
            {"d": "2026-04-02", "n": 12, "a": 75.0},
            {"d": "2026-04-03", "n": 8, "a": 80.0},
        ],
        "hourly_utc": [{"h": h, "n": 0, "a": 0} for h in range(24)],
        "srs": {
            "confident": {"total": 10, "due": 2, "avg_interval": 14.0},
            "hesitant": {"total": 5, "due": 1, "avg_interval": 5.0},
            "guessed": {"total": 2, "due": 1, "avg_interval": 2.0},
        },
    }


_FAKE_DECAY = {
    "days": [0, 7, 14, 30, 66],
    "curves": {
        "confident": [100.0, 95.0, 90.0, 80.0, 70.0],
        "hesitant": [100.0, 85.0, 75.0, 60.0, 50.0],
        "guessed": [100.0, 70.0, 55.0, 40.0, 30.0],
        "total": [100.0, 88.0, 78.0, 65.0, 55.0],
    },
}


@pytest.mark.integration
class TestFsrsWireUp:
    """``generate_report.compute_all`` MUST route retention through fsrs_module."""

    def test_compute_all_calls_compute_decay_from_srs(self):
        data = _fixture_data()
        days_left = 66

        with patch.object(
            generate_report,
            "compute_decay_from_srs",
            create=True,
            return_value=_FAKE_DECAY,
        ) as mock_decay, patch.object(
            generate_report, "compute_marginal_gains", return_value=[]
        ):
            out = generate_report.compute_all(data, days_left=days_left)

        assert mock_decay.call_count == 1, (
            "compute_all must call fsrs_module.compute_decay_from_srs. "
            "If the call count is 0, the legacy compute_ebbinghaus path is "
            "still live — that is the silent-fallback HF.5b is closing."
        )

        args = mock_decay.call_args.args
        kwargs = mock_decay.call_args.kwargs

        srs_summary = kwargs.get("srs_summary", args[0] if args else None)
        assert srs_summary == data["srs"], (
            "srs_summary must be forwarded untouched from data['srs']."
        )

        if "has_history" in kwargs:
            has_history = kwargs["has_history"]
        else:
            has_history = args[1] if len(args) >= 2 else None
        assert has_history is True, (
            "has_history must be True when daily/srs rows exist in the fixture."
        )

        forwarded_days = kwargs.get(
            "days_left", args[2] if len(args) >= 3 else None
        )
        assert forwarded_days == days_left, (
            f"days_left forwarding broken: expected {days_left}, got {forwarded_days}."
        )

        assert out["decay"] is _FAKE_DECAY, (
            "compute_all must surface the fsrs_module payload as output['decay']."
        )
