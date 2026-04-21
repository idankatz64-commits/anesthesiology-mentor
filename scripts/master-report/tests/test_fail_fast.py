"""Regression tests for the fail-fast sentinel.

Context
-------
The April 18 run of generate_report produced a report with phantom numbers
(readiness=37.5 from hidden `50` fallbacks, MC median=38.2 from a Beta(1.2, 1.8)
prior when topics_user=[], flat 100% Ebbinghaus retention curves, NaN OLS).

Root cause: ``fetch_data`` silently returned empty collections when the
``.env`` credentials pointed at the wrong Supabase project, and every downstream
compute step had a "return zeros on empty" branch. The script kept running and
rendered a report that looked real.

Guarantee being locked in
-------------------------
If ``fetch_data`` returns no user activity (both ``topics_user`` and ``daily``
empty), ``generate_report`` MUST abort with a non-zero exit and a message
containing the word ``ABORT``. Never again a phantom report.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Make ``generate_report`` importable without installing as a package.
SCRIPT_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from generate_report import abort_if_no_user_data  # noqa: E402


@pytest.mark.unit
class TestAbortIfNoUserData:
    """Sentinel behaviour: loud error on empty fetch, silent pass on activity."""

    def test_aborts_when_topics_user_and_daily_are_empty(self):
        """RLS blocked everything OR USER_ID is wrong -> both collections empty."""
        data = {
            "total_db": 1000,
            "topics_db": {"ACLS": 500, "PedsAnes": 500},
            "topics_user": [],
            "topics_history": [],
            "daily": [],
            "hourly_utc": [],
            "srs": {},
        }
        with pytest.raises(SystemExit) as exc_info:
            abort_if_no_user_data(data)
        assert "ABORT" in str(exc_info.value), (
            "Error message must contain 'ABORT' so the user sees the failure loudly"
        )

    def test_does_not_abort_when_topics_user_has_rows(self):
        """At least some user_answers rows -> real user, proceed with compute."""
        data = {
            "total_db": 1000,
            "topics_db": {"ACLS": 500},
            "topics_user": [{"topic": "ACLS", "n": 5, "c": 3, "w": 2}],
            "topics_history": [],
            "daily": [],
            "hourly_utc": [],
            "srs": {},
        }
        abort_if_no_user_data(data)  # must not raise

    def test_does_not_abort_when_daily_has_rows(self):
        """answer_history has rows -> real user, proceed with compute."""
        data = {
            "total_db": 1000,
            "topics_db": {"ACLS": 500},
            "topics_user": [],
            "topics_history": [],
            "daily": [{"d": "04/15", "n": 10, "a": 80.0}],
            "hourly_utc": [],
            "srs": {},
        }
        abort_if_no_user_data(data)  # must not raise

    def test_abort_message_mentions_recovery_steps(self):
        """The error must tell the user what to check, not just 'ABORT'."""
        data = {"topics_user": [], "daily": []}
        with pytest.raises(SystemExit) as exc_info:
            abort_if_no_user_data(data)
        msg = str(exc_info.value)
        assert any(
            hint in msg for hint in ("USER_ID", "RLS", "service_role", "SUPABASE_KEY")
        ), f"Error message missing diagnostic hints: {msg!r}"
