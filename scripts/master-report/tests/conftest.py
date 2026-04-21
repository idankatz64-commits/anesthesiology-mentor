"""Shared pytest fixtures for master-report tests.

Auto-discovered by pytest; every test module in this directory receives
these fixtures by parameter name (no imports needed).

The FakeSupabase here mimics only the narrow read-only surface the generator
uses: ``.table(name).select(...).execute()`` returning an object with ``.data``
and ``.count``. Tests can override per-table rows via ``set_table``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest


@dataclass
class _QueryResult:
    """Mimics supabase-py's execute() response shape."""
    data: list[dict[str, Any]] = field(default_factory=list)
    count: int | None = None


class _FakeQueryBuilder:
    """Fluent chain mimicking supabase-py's query builder.

    Only implements the methods generate_report.py actually calls.
    """

    def __init__(self, rows: list[dict[str, Any]], return_count: bool = False):
        self._rows = list(rows)
        self._return_count = return_count

    def select(self, *_columns: str, count: str | None = None) -> "_FakeQueryBuilder":
        self._return_count = count == "exact"
        return self

    def eq(self, field: str, value: Any) -> "_FakeQueryBuilder":
        self._rows = [r for r in self._rows if r.get(field) == value]
        return self

    def gte(self, field: str, value: Any) -> "_FakeQueryBuilder":
        self._rows = [r for r in self._rows if r.get(field) is not None and r[field] >= value]
        return self

    def lte(self, field: str, value: Any) -> "_FakeQueryBuilder":
        self._rows = [r for r in self._rows if r.get(field) is not None and r[field] <= value]
        return self

    def order(self, *_args: Any, **_kwargs: Any) -> "_FakeQueryBuilder":
        return self

    def limit(self, n: int) -> "_FakeQueryBuilder":
        self._rows = self._rows[:n]
        return self

    def execute(self) -> _QueryResult:
        return _QueryResult(
            data=self._rows,
            count=len(self._rows) if self._return_count else None,
        )


class FakeSupabase:
    """In-memory stand-in for the supabase client.

    Seeded with empty tables by default. Tests populate rows via ``set_table``.
    """

    def __init__(self) -> None:
        self._tables: dict[str, list[dict[str, Any]]] = {
            "questions": [],
            "user_answers": [],
            "answer_history": [],
            "spaced_repetition": [],
            "categories": [],
        }

    def set_table(self, name: str, rows: list[dict[str, Any]]) -> None:
        self._tables[name] = list(rows)

    def table(self, name: str) -> _FakeQueryBuilder:
        return _FakeQueryBuilder(self._tables.get(name, []))


@pytest.fixture
def fake_supabase() -> FakeSupabase:
    """A FakeSupabase with no rows. Tests call ``set_table`` to populate."""
    return FakeSupabase()


@pytest.fixture
def sample_user_id() -> str:
    """Canonical synthetic user id used across tests."""
    return "test-user-1"


@pytest.fixture
def sample_questions() -> list[dict[str, Any]]:
    """Minimal synthetic question bank covering 3 topics."""
    return [
        {"id": "q-001", "topic": "ACLS"},
        {"id": "q-002", "topic": "ACLS"},
        {"id": "q-003", "topic": "Pediatric Anesthesia"},
        {"id": "q-004", "topic": "Pediatric Anesthesia"},
        {"id": "q-005", "topic": "Cardiovascular Monitoring"},
    ]


@pytest.fixture
def sample_user_answers(sample_user_id: str) -> list[dict[str, Any]]:
    """Synthetic user_answers rows with known accuracy per topic."""
    return [
        {"user_id": sample_user_id, "question_id": "q-001",
         "correct_count": 3, "answered_count": 5},
        {"user_id": sample_user_id, "question_id": "q-002",
         "correct_count": 4, "answered_count": 6},
        {"user_id": sample_user_id, "question_id": "q-003",
         "correct_count": 2, "answered_count": 4},
    ]


@pytest.fixture
def sample_answer_history(sample_user_id: str) -> list[dict[str, Any]]:
    """Synthetic answer_history with ISO-8601 UTC timestamps."""
    return [
        {"user_id": sample_user_id, "question_id": "q-001",
         "is_correct": True,  "answered_at": "2026-04-10T08:30:00Z"},
        {"user_id": sample_user_id, "question_id": "q-001",
         "is_correct": False, "answered_at": "2026-04-11T09:15:00Z"},
        {"user_id": sample_user_id, "question_id": "q-002",
         "is_correct": True,  "answered_at": "2026-04-12T14:00:00Z"},
    ]


@pytest.fixture
def sample_spaced_repetition(sample_user_id: str) -> list[dict[str, Any]]:
    """Synthetic SRS rows. Dates use ISO-8601 YYYY-MM-DD."""
    return [
        {"user_id": sample_user_id, "question_id": "q-001",
         "ease": 2.5, "interval": 7, "next_review": "2026-04-22",
         "reviews_count": 4},
        {"user_id": sample_user_id, "question_id": "q-002",
         "ease": 2.3, "interval": 3, "next_review": "2026-04-20",
         "reviews_count": 2},
    ]


@pytest.fixture
def seeded_supabase(
    fake_supabase: FakeSupabase,
    sample_questions: list[dict[str, Any]],
    sample_user_answers: list[dict[str, Any]],
    sample_answer_history: list[dict[str, Any]],
    sample_spaced_repetition: list[dict[str, Any]],
) -> FakeSupabase:
    """A FakeSupabase pre-populated with the sample rows."""
    fake_supabase.set_table("questions", sample_questions)
    fake_supabase.set_table("user_answers", sample_user_answers)
    fake_supabase.set_table("answer_history", sample_answer_history)
    fake_supabase.set_table("spaced_repetition", sample_spaced_repetition)
    return fake_supabase
