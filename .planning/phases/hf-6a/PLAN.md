---
phase: hf-6a
plan: master
type: execute
branch: phase-1-stats-cleanup
exam_date: 2026-06-16
budget_days: 1
waves: 1
autonomous: false
feature_flag: null   # hotfix track uses deprecate-then-delete, not flags
requirements: [REQ-HF6a-1, REQ-HF6a-2, REQ-HF6a-3, REQ-HF6a-4, REQ-HF6a-5]
research_file: null
review_file: null
---

# Phase hf-6a — ERI Calibration: Snapshot Builder (Execution Plan)

> **Scope lock:** This plan implements hf-6a from `.planning/ROADMAP.md` and the five REQ-IDs in `.planning/REQUIREMENTS.md` (REQ-HF6a-1..5). Source of truth for the HF.6 design is `~/.claude/plans/wondrous-popping-sunrise.md` §HF.6 lines 122-130. Every task is executable by `gsd-executor` without further research. All scope-creep pressure toward hf-6b items (OLS fit, `compute_readiness_calibrated`, weight swap, HTML plumbing, `compute_all` re-wire, deletion of `compute_readiness`) is **banned** from this plan.

---

## Section 1 — Goal-Backward Statement

### Hebrew (עידן)

**סוף הדרך של hf-6a:** יש קובץ חדש `scripts/master-report/eri_calibration.py` עם פונקציה אחת — `build_daily_snapshots(history) → list[DailySnapshot]`. הפונקציה מקבלת את ההיסטוריה המלאה של התשובות (N ימים) ומחזירה N רשומות — אחת לכל יום — כשכל רשומה מכילה ארבעה מספרים בטווח סגור [0.0, 1.0]: accuracy, coverage, retention, consistency. אם ההיסטוריה ריקה או לא מספיקה — הפונקציה זורקת `ValueError` עם הודעה תיאורית (לא מחזירה `[]`, לא מתריעה בשקט, לא נופלת על default). הפונקציה **לא מחוברת עדיין ל-`compute_all`** — היא קיימת ונבדקת ע"י pytest, אבל לא משפיעה על ה-HTML ולא על ציון ה-readiness שהמשתמש רואה. `compute_readiness` הקיים ב-`generate_report.py:421-469` — **לא נוגעים בה**: זהה בייט-לבייט לפני ואחרי המיזוג, וארבעת הטסטים הקיימים ב-`test_compute_readiness.py` (שורות 59, 74, 87, 108) עוברים בלי עריכות. מיזוג ל-`main` לא משנה שום דבר עבור המשתמש — רק מוסיף קוד שיוחלף בתפקיד ב-hf-6b.

**קריטריוני הצלחה קשיחים (Hard acceptance):**
1. `scripts/master-report/eri_calibration.py` קיים, importable, ו-`build_daily_snapshots` חתומה בטיפוסים.
2. `DailySnapshot` היא `@dataclass(frozen=True)` עם שדות `date: str, accuracy: float, coverage: float, retention: float, consistency: float` — וכל ארבעת המרכיבים הם float בטווח הסגור `[0.0, 1.0]` (נבדק ב-assert בטסט).
3. שני טסטים חדשים עוברים: `test_build_daily_snapshots_shape_and_values` (synthetic N≥3-day history, התאמה ל-ground truth תוך 1e-6) + `test_build_daily_snapshots_raises_on_empty_history` (`ValueError` עם הודעה).
4. ארבעת הטסטים הקיימים ב-`test_compute_readiness.py` עוברים בלי עריכה.
5. `git diff main -- scripts/master-report/generate_report.py` — רק ההרחבה האדיטיבית של `fetch_data` לפי REQ-HF6a-2 (אם חל); בכל מקרה לא נוגעים בשורות 421-469 (`compute_readiness`) ולא בשורה 570 (קריאה ל-`compute_readiness`).
6. אף חלק של ה-HTML לא משתנה (אין עריכות ל-`generate_html`, אין keys חדשים ל-template, אין עמודה חדשה).

### English (measurable end state)

hf-6a succeeds iff **all** of the following are provable by automated command on `phase-1-stats-cleanup` branch before merge:

| # | REQ | Criterion | Proof Command / Evidence |
|---|-----|-----------|--------------------------|
| 1 | REQ-HF6a-1 | File `scripts/master-report/eri_calibration.py` exists and is importable; exports `build_daily_snapshots(history) -> list[DailySnapshot]` with type annotations. | `python -c "from scripts.master_report.eri_calibration import build_daily_snapshots, DailySnapshot; import inspect; print(inspect.signature(build_daily_snapshots))"` succeeds and shows typed signature (note: `scripts.master_report` with underscore because `master-report` hyphen is not a valid Python module name; executor adjusts via `sys.path.insert` in test file per `test_compute_readiness.py:29-31` precedent) |
| 2 | REQ-HF6a-1 | `DailySnapshot` is `@dataclass(frozen=True)` with exactly five fields: `date: str, accuracy: float, coverage: float, retention: float, consistency: float`. | `python` snippet: `from dataclasses import fields, is_dataclass; assert is_dataclass(DailySnapshot); assert DailySnapshot.__dataclass_params__.frozen; assert [(f.name, f.type) for f in fields(DailySnapshot)] == [('date', str), ('accuracy', float), ('coverage', float), ('retention', float), ('consistency', float)]` |
| 3 | REQ-HF6a-1 (LOCKED) | **Every ERI component returned is a `float` in the closed interval `[0.0, 1.0]`.** Citation: `~/.claude/plans/wondrous-popping-sunrise.md` line 128 defines `Readiness = w·components · 100, clipped [0, 100]`; for the `·100` scaling and the `[0,100]` clip to be well-defined, each component must already lie in `[0.0, 1.0]`. | `pytest scripts/master-report/tests/test_eri_calibration.py::test_build_daily_snapshots_shape_and_values -q` green; test body asserts `0.0 <= component <= 1.0` for each of accuracy, coverage, retention, consistency on every returned `DailySnapshot` |
| 4 | REQ-HF6a-2 | `fetch_data` still returns the six existing contract keys unchanged (`topics_user`, `topics_db`, `daily`, `srs`, `hourly_utc`, `total_db`) AND — per the probe decision in Task hf6a.T0 (ACTIVE) — adds a new key `answer_history` (raw per-answer rows) with no renamed/removed keys. | Diff of the `return {...}` block at `generate_report.py:188-196` against HEAD `b1584f3` shows only additive keys |
| 5 | REQ-HF6a-3 | Test `test_build_daily_snapshots_shape_and_values` passes: synthetic history of N≥3 days; returned list has exactly N entries in ascending date order; every component matches hand-computed ground truth within `1e-6`. | `pytest scripts/master-report/tests/test_eri_calibration.py::test_build_daily_snapshots_shape_and_values -q` green |
| 6 | REQ-HF6a-4 | Test `test_build_daily_snapshots_raises_on_empty_history` passes: calling with empty / `None` / insufficient input raises `ValueError` with descriptive message (matches pattern `raise ValueError("...")` used by `compute_readiness` at lines 425, 440, 450). | `pytest scripts/master-report/tests/test_eri_calibration.py::test_build_daily_snapshots_raises_on_empty_history -q` green; `grep -n "return \[\]" scripts/master-report/eri_calibration.py` returns 0 matches |
| 7 | REQ-HF6a-5 | `compute_readiness` at `scripts/master-report/generate_report.py:421-469` is **byte-identical** pre- vs post-hf6a merge. | `diff <(git show b1584f3:scripts/master-report/generate_report.py \| sed -n '421,469p') <(sed -n '421,469p' scripts/master-report/generate_report.py)` produces zero output |
| 8 | REQ-HF6a-5 | All 4 existing tests in `test_compute_readiness.py` pass unmodified. | `pytest scripts/master-report/tests/test_compute_readiness.py -q` green; `git diff b1584f3 -- scripts/master-report/tests/test_compute_readiness.py` is empty |
| 9 | REQ-HF6a-5 | `compute_all` still calls `compute_readiness(...)` at line 570; `build_daily_snapshots` is NOT referenced anywhere in `generate_report.py`. | `grep -n "compute_readiness(" scripts/master-report/generate_report.py` shows line 570; `grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py` returns 0 matches |
| 10 | scope-lock | No HTML change. `generate_html` and its template inputs are untouched. | `git diff b1584f3 -- scripts/master-report/generate_report.py \| grep -E "generate_html\|<td\|<tr\|html_template"` returns 0 matches |

---

## Section 2 — Wave Breakdown

### Wave 0 — Snapshot Builder (1 day)

**Goal:** Deliver `build_daily_snapshots` as a callable, tested, isolated function in a new file. Write the two RED tests first, conditionally extend `fetch_data` for raw `answer_history` access, implement the function to GREEN both tests, and verify the four existing `compute_readiness` tests and the line-421-469 byte-identity invariant are untouched. Nothing in this wave is wired into `compute_all`. Nothing in this wave changes the HTML. The entire phase is a single wave on purpose — scope is tight (one function, one dataclass, two tests, one conditional additive data-plumbing extension).

---

## Section 3 — Task Breakdown with Dependencies

**Legend:**
- **Effort:** S (≤1 h), M (1–3 h), L (3–6 h)
- **Agent:** sub-agent to invoke on the task
- **Commit:** every task = one commit. Format: `feat(hf-6a): <description>` / `test(hf-6a): <description>` / `docs(hf-6a): <description>`.

Each task block below obeys the deep-work rules: `<read_first>` enumerates the exact file lines the executor reads before coding; `<acceptance_criteria>` are grep- or command-verifiable; `<action>` names the concrete symbols; `<done_when>` is a single truth test.

---

### Wave 0 — Snapshot Builder

| ID | Task | Files | Test Files | Deps | Effort | Agent | Done-When |
|----|------|-------|-----------|------|--------|-------|-----------|
| **hf6a.T0** | **Probe: REQ-HF6a-2 decision.** | `.planning/phases/hf-6a/VERIFICATION.md` (create) | — | — | S | executor (read-only) | VERIFICATION.md records decision=ACTIVE with justification |
| **hf6a.T1** | **(TDD RED) Shape-and-values test.** | — | `scripts/master-report/tests/test_eri_calibration.py` (new) | hf6a.T0 | M | `tdd-guide` | pytest fails with `ModuleNotFoundError` on missing `eri_calibration` |
| **hf6a.T2** | **(TDD RED) Raises-on-empty test.** | — | `scripts/master-report/tests/test_eri_calibration.py` (append) | hf6a.T1 | S | `tdd-guide` | pytest fails with module-missing error |
| **hf6a.T3** | **Additive `fetch_data` extension.** | `scripts/master-report/generate_report.py` (surgical: Q5 query ~line 127 + return dict ~line 188-196 only) | — | hf6a.T2 | M | direct edit + `code-reviewer` post-pass | Diff is additive; lines 421-469 + line 570 byte-identical; ast.parse OK |
| **hf6a.T4** | **(TDD GREEN) Implement `build_daily_snapshots`.** | `scripts/master-report/eri_calibration.py` (new) | (T1, T2 pass) | hf6a.T3 | L | `tdd-guide` | pytest green for both new tests; no `return []`; no `try:` without paired `raise` |
| **hf6a.T5** | **Byte-identity invariant verification.** | `.planning/phases/hf-6a/VERIFICATION.md` (append) | — | hf6a.T4 | S | executor (verification only) | 3 proof commands succeed; VERIFICATION.md updated |
| **hf6a.T6** | **Human-verify checkpoint.** | — | — | hf6a.T5 | S | human (Idan) | Idan types "approved" |

---

#### hf6a.T0 — Probe decision: REQ-HF6a-2 (active or N/A)

```xml
<read_first>
  - scripts/master-report/generate_report.py lines 106-196 (fetch_data body — specifically lines 126-144 daily_list construction and lines 188-196 return dict).
  - .planning/REQUIREMENTS.md REQ-HF6a-2 (lines 35-53).
</read_first>

<action>
  Verify by code inspection, NOT by code generation:
    1. `daily_list` at lines 140-144 contains only `{"d", "n", "a"}` — lossy for per-day coverage (needs distinct question_ids), retention (needs per-repeat correctness), consistency (needs per-day accuracy chronology).
    2. `topics_history` at lines 106-124 is pre-aggregated by topic — no chronology.
    3. Raw per-answer rows (answered_at, is_correct, question_id, topic) are NOT surfaced anywhere in the returned dict at lines 188-196.

  Decision: REQ-HF6a-2 is ACTIVE. Record in .planning/phases/hf-6a/VERIFICATION.md:

    ## REQ-HF6a-2 Decision
    - decision: ACTIVE
    - justification: daily_list aggregates to {d,n,a}; topics_history pre-aggregates by topic;
      per-day coverage/retention/consistency reconstruction requires per-answer chronology
      (answered_at, is_correct, question_id, topic) that existing return keys do not provide.
    - scope of hf6a.T3 edit: widen .select() at line 127-128 to include question_id and
      questions(topic); add one additive key "answer_history" to the return dict. No existing
      key removed or renamed.
</action>

<acceptance_criteria>
  - File .planning/phases/hf-6a/VERIFICATION.md exists and contains the section "## REQ-HF6a-2 Decision" with decision=ACTIVE.
  - No code written yet (grep `ls scripts/master-report/eri_calibration.py` → not found).
  - No test written yet.
</acceptance_criteria>

<done_when>
  `grep -c "decision: ACTIVE" .planning/phases/hf-6a/VERIFICATION.md` returns ≥ 1.
</done_when>
```

---

#### hf6a.T1 — (TDD RED) `test_build_daily_snapshots_shape_and_values`

```xml
<read_first>
  - scripts/master-report/tests/test_compute_readiness.py lines 22-33 (sys.path.insert precedent for importing from scripts/master-report/).
  - scripts/master-report/tests/test_compute_readiness.py lines 40-49 (test fixture construction pattern).
  - ~/.claude/plans/wondrous-popping-sunrise.md line 128 (the [0,1] component lock citation).
</read_first>

<action>
  Create scripts/master-report/tests/test_eri_calibration.py with imports copied from
  test_compute_readiness.py lines 22-33 (same sys.path pattern), then:

    from eri_calibration import build_daily_snapshots, DailySnapshot

  Construct a synthetic 3-day history fixture (fully deterministic, in-memory, no DB):

    history = {
        "total_db": 100,  # integer — for coverage denominator
        "answer_history": [
            # Day 0 (2026-03-01): 10 questions, 7 correct, 10 distinct q_ids (q-000..q-009)
            {"answered_at": "2026-03-01T08:00:00Z", "is_correct": True,  "question_id": "q-000", "topic": "ACLS"},
            # ... (9 more rows for day 0)
            # Day 1 (2026-03-02): 15 questions, 12 correct, 8 NEW distinct q_ids + 7 REPEATS of q-000..q-006
            # ... 15 rows for day 1
            # Day 2 (2026-03-03): 20 questions, 14 correct, 3 NEW distinct q_ids + 17 REPEATS
            # ... 20 rows for day 2
        ],
    }

  Hand-compute ground truth table (hardcoded constants in the test file):

    ground_truth = [
        # accuracy = correct/total for the day. coverage = distinct_qids_seen_to_date / total_db.
        # retention and consistency are omitted — Path C asserts range + day-0 invariant only.
        {"date": "2026-03-01", "accuracy": 0.7, "coverage": 0.10},
        {"date": "2026-03-02", "accuracy": 0.8, "coverage": 0.18},
        {"date": "2026-03-03", "accuracy": 0.7, "coverage": 0.21},
    ]

  Assertions (Path C — strict on stable components, behavioral on placeholder components):
    1. len(result) == 3
    2. [s.date for s in result] == ["2026-03-01", "2026-03-02", "2026-03-03"] (strictly ascending)
    3. Strict equality (accuracy + coverage — formulas stable across hf-6b swap):
         For each i in [0,1,2] and each c in {"accuracy","coverage"}:
           abs(getattr(result[i], c) - ground_truth[i][c]) < 1e-6
    4. Behavioral (retention + consistency — placeholder formulas; hf-6b will swap):
         4a. Range: for each i and each c in {"retention","consistency"}:
               assert 0.0 <= getattr(result[i], c) <= 1.0
         4b. Retention day-0 invariant: by Option A (repeats-ratio), day 0 has no prior
             history, so retention MUST be exactly 0.0 on day 0:
               assert result[0].retention == 0.0, "day 0 has no prior repeats — retention must be 0.0"
    5. [0,1] LOCK (accuracy + coverage — belt-and-suspenders):
         For each i and each c in {"accuracy","coverage"}:
           assert 0.0 <= getattr(result[i], c) <= 1.0, f"{c} on day {i} out of [0,1]"
       Citation comment in the test: `# Per wondrous-popping-sunrise.md line 128: Readiness = w·components · 100, clipped [0,100]`.

  Run `pytest scripts/master-report/tests/test_eri_calibration.py::test_build_daily_snapshots_shape_and_values -q`
  and confirm it FAILS with `ModuleNotFoundError: No module named 'eri_calibration'`.

  Commit: `test(hf-6a): RED — build_daily_snapshots shape and values`
</action>

<acceptance_criteria>
  - File scripts/master-report/tests/test_eri_calibration.py exists.
  - It imports `from eri_calibration import build_daily_snapshots, DailySnapshot`.
  - It contains the comment citing wondrous line 128.
  - pytest run exits non-zero with ModuleNotFoundError.
  - No implementation file written yet (`ls scripts/master-report/eri_calibration.py` → not found).
</acceptance_criteria>

<done_when>
  `pytest scripts/master-report/tests/test_eri_calibration.py::test_build_daily_snapshots_shape_and_values -q 2>&1 | grep -c "ModuleNotFoundError"` returns ≥ 1.
</done_when>
```

---

#### hf6a.T2 — (TDD RED) `test_build_daily_snapshots_raises_on_empty_history`

```xml
<read_first>
  - scripts/master-report/generate_report.py lines 425-429, 440-444, 450-454 (existing ValueError message pattern in compute_readiness — the loud-failure style being mirrored).
  - scripts/master-report/tests/test_compute_readiness.py lines 56-88 (the 3 existing raises-on-missing tests, patterns to mirror).
</read_first>

<action>
  Append to scripts/master-report/tests/test_eri_calibration.py:

    @pytest.mark.unit
    @pytest.mark.parametrize("bad_input,expected_substring", [
        ({"total_db": 100, "answer_history": []},                        "empty"),
        ({"total_db": 100, "answer_history": [_single_row]},             "days"),  # n_days=1 < 5 threshold
        (None,                                                            None),            # TypeError acceptable
    ])
    def test_build_daily_snapshots_raises_on_empty_history(bad_input, expected_substring):
        with pytest.raises((ValueError, TypeError)) as exc:
            build_daily_snapshots(bad_input)
        if expected_substring is not None:
            assert expected_substring in str(exc.value).lower()

  _single_row is a single-row dict matching the shape defined in T1.

  Run pytest → MUST FAIL with ModuleNotFoundError (module still missing).

  Commit: `test(hf-6a): RED — build_daily_snapshots raises on empty history`
</action>

<acceptance_criteria>
  - The test file now contains two test function definitions.
  - The parametrize decorator is present with the 3 cases above.
  - pytest still exits non-zero (ModuleNotFoundError).
  - Zero `return []` pattern anywhere in the test file (not a valid test assertion).
</acceptance_criteria>

<done_when>
  `pytest scripts/master-report/tests/test_eri_calibration.py -q 2>&1 | grep -c "ModuleNotFoundError"` returns ≥ 1 AND
  `grep -c "def test_" scripts/master-report/tests/test_eri_calibration.py` returns 2.
</done_when>
```

---

#### hf6a.T3 — Additive `fetch_data` extension for `answer_history` raw key

```xml
<read_first>
  - scripts/master-report/generate_report.py lines 126-144 (Q5 Daily performance query — current .select("answered_at, is_correct") to be widened).
  - scripts/master-report/generate_report.py lines 106-124 (topics_history block — for the join syntax precedent, see line 109: `.select("is_correct, questions(topic)")`).
  - scripts/master-report/generate_report.py lines 188-196 (return dict — where the new additive key lands).
  - scripts/master-report/generate_report.py lines 421-469 (compute_readiness body — MUST NOT be touched; byte-identity invariant).
  - scripts/master-report/generate_report.py line 570 (compute_readiness call site — MUST NOT move).
</read_first>

<action>
  Surgical edit, additive only. Change ONE query and ADD ONE key.

  1. At ~line 127-131, widen the Q5 query select clause:
       BEFORE: res = (supabase.table("answer_history")
                     .select("answered_at, is_correct")
                     ...
       AFTER:  res = (supabase.table("answer_history")
                     .select("answered_at, is_correct, question_id, questions(topic)")
                     ...
     (Note: join syntax `questions(topic)` matches the precedent at line 109.)

  2. Immediately after the existing `daily_list = [...]` comprehension (around line 144)
     and BEFORE the Q6 Hourly performance block starts, build `answer_history_raw`:

       answer_history_raw = [
           {
               "answered_at": row["answered_at"],
               "is_correct": bool(row["is_correct"]),
               "question_id": row.get("question_id", ""),
               "topic": (row["questions"]["topic"] if row.get("questions") else "Unknown"),
           }
           for row in res.data
       ]

     Use the SAME `res.data` already fetched (do NOT re-query).

  3. At the return dict (lines 188-196), add ONE key:
       "answer_history": answer_history_raw,

     Keep all six existing keys in place: total_db, topics_db, topics_user,
     topics_history, daily, hourly_utc, srs. (Note: the current return dict already has
     7 keys including topics_history — the "six existing contract keys" named in
     REQ-HF6a-2 are the REQ's enumeration; the actual code preserves all current keys.)

  DO NOT touch:
    - Lines 421-469 (compute_readiness body) — must be byte-identical to b1584f3.
    - Line 570 (readiness = compute_readiness(...) call site) — must not move.
    - generate_html function and any HTML template code path.
    - Any test file under scripts/master-report/tests/.

  Commit: `feat(hf-6a): fetch_data additive answer_history key`
</action>

<acceptance_criteria>
  - `python -c "import ast; ast.parse(open('scripts/master-report/generate_report.py').read())"` succeeds (valid syntax).
  - `diff <(git show b1584f3:scripts/master-report/generate_report.py | sed -n '421,469p') <(sed -n '421,469p' scripts/master-report/generate_report.py)` produces ZERO output.
  - `grep -n "readiness = compute_readiness(data, basics, mc, bootstrap)" scripts/master-report/generate_report.py` returns a line number that, when read, shows the line is still at or extremely close to 570 (±2 lines allowed due to the additive block before it; the call itself is textually identical).
  - `git diff b1584f3 -- scripts/master-report/generate_report.py | grep -E "generate_html|html_template|<td|<tr"` returns 0 matches.
  - `grep -n "\"answer_history\":" scripts/master-report/generate_report.py` returns ≥ 1 match within the return dict region.
  - `grep -c "def " scripts/master-report/generate_report.py` returns the same count as at b1584f3 (no new or removed functions).
</acceptance_criteria>

<done_when>
  All five grep/diff assertions above pass AND `pytest scripts/master-report/tests/test_compute_readiness.py -q` still exits 0 (legacy tests survive — they mock data, so the widened select doesn't affect them).
</done_when>
```

---

#### hf6a.T4 — (TDD GREEN) Implement `build_daily_snapshots` + `DailySnapshot`

```xml
<read_first>
  - scripts/master-report/generate_report.py lines 425-429 (ValueError message style — mirror this).
  - scripts/master-report/generate_report.py lines 455 (statistics.stdev usage precedent).
  - ~/.claude/rules/python/coding-style.md (type hints on all signatures; @dataclass(frozen=True) for immutability).
  - ~/.claude/plans/wondrous-popping-sunrise.md line 128 (the [0,1] component lock — components * 100 clipped [0,100]).
  - scripts/master-report/tests/test_eri_calibration.py (the tests that must go GREEN).
</read_first>

<action>
  Create scripts/master-report/eri_calibration.py (new file). Structure:

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
                or fewer than 2 distinct days are present (consistency needs ≥ 2 days
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

  Adjust hf6a.T1's hardcoded ground_truth values to match these exact formulas
  (executor computes them by hand: tests go GREEN on first run after this file is written).

  Run `pytest scripts/master-report/tests/test_eri_calibration.py -q` → both tests PASS.

  Commit: `feat(hf-6a): build_daily_snapshots + DailySnapshot dataclass`
</action>

<acceptance_criteria>
  - `pytest scripts/master-report/tests/test_eri_calibration.py -q` exits 0 with 2+ tests passing.
  - `grep -n "return \[\]" scripts/master-report/eri_calibration.py` returns 0 matches.
  - `grep -n "try:" scripts/master-report/eri_calibration.py` returns 0 matches (or, if present, each try must be paired with an explicit `raise` in its except — no silent swallowing).
  - `grep -n "print(" scripts/master-report/eri_calibration.py` returns 0 matches (per ~/.claude/rules/python/hooks.md: use `logging`, not `print`).
  - `grep -n "@dataclass(frozen=True)" scripts/master-report/eri_calibration.py` returns ≥ 1 match.
  - `python -c "from dataclasses import fields, is_dataclass; import sys; sys.path.insert(0, 'scripts/master-report'); from eri_calibration import DailySnapshot; assert is_dataclass(DailySnapshot) and DailySnapshot.__dataclass_params__.frozen and [(f.name, f.type) for f in fields(DailySnapshot)] == [('date', str), ('accuracy', float), ('coverage', float), ('retention', float), ('consistency', float)]; print('ok')"` prints "ok".
  - No edits to any file other than `scripts/master-report/eri_calibration.py`.
</acceptance_criteria>

<done_when>
  `pytest scripts/master-report/tests/test_eri_calibration.py -q` exits 0 AND all 5 grep assertions pass.
</done_when>
```

---

#### hf6a.T5 — Byte-identity invariant verification (REQ-HF6a-5)

```xml
<read_first>
  - scripts/master-report/generate_report.py lines 421-469 (current compute_readiness body).
  - scripts/master-report/tests/test_compute_readiness.py (the 4 legacy tests).
</read_first>

<action>
  Run three proof commands in sequence and record results in .planning/phases/hf-6a/VERIFICATION.md
  under "## REQ-HF6a-5 Byte-Identity Proof":

    # Proof 1 — lines 421-469 unchanged
    diff <(git show b1584f3:scripts/master-report/generate_report.py | sed -n '421,469p') \
         <(sed -n '421,469p' scripts/master-report/generate_report.py)
    # Expected: zero output.

    # Proof 2 — legacy test file unchanged
    git diff b1584f3 -- scripts/master-report/tests/test_compute_readiness.py
    # Expected: empty.

    # Proof 3 — legacy tests green
    pytest scripts/master-report/tests/test_compute_readiness.py -q
    # Expected: 4 passed.

    # Proof 4 — build_daily_snapshots NOT wired into compute_all (Split=B lock)
    grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py
    # Expected: 0 matches.

    # Proof 5 — no HTML change
    git diff b1584f3 -- scripts/master-report/generate_report.py | grep -E "generate_html|html_template|<td|<tr"
    # Expected: 0 matches.

    # Proof 6 — no hf-6b scope creep
    grep -rn "compute_readiness_calibrated\|fit_quality\|OLS\|weight_swap" scripts/master-report/
    # Expected: 0 matches.

  Append all six results verbatim to VERIFICATION.md.

  Commit: `docs(hf-6a): REQ-HF6a-5 byte-identity proof recorded`
</action>

<acceptance_criteria>
  - All 6 proofs produce the expected result.
  - VERIFICATION.md contains a "## REQ-HF6a-5 Byte-Identity Proof" section with the 6 command outputs.
</acceptance_criteria>

<done_when>
  `grep -c "Byte-Identity Proof" .planning/phases/hf-6a/VERIFICATION.md` returns ≥ 1 AND
  re-running the 6 proofs locally reproduces the recorded expected results.
</done_when>
```

---

#### hf6a.T6 — Human-verify checkpoint (Idan approval)

```xml
<read_first>
  - .planning/phases/hf-6a/VERIFICATION.md (all sections filled by T0 and T5).
  - Output of: pytest scripts/master-report/tests/ -q
  - Output of: git diff b1584f3...HEAD -- scripts/master-report/
</read_first>

<action>
  Present to Idan (as a single status message):
    1. pytest scripts/master-report/tests/ -q → show green result (≥ 6 tests: 4 legacy + 2 new).
    2. python -c "import sys; sys.path.insert(0, 'scripts/master-report'); from eri_calibration import build_daily_snapshots, DailySnapshot; print('ok')" → prints "ok".
    3. grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py → 0 matches (proves Split=B).
    4. diff <(git show b1584f3:scripts/master-report/generate_report.py | sed -n '421,469p') <(sed -n '421,469p' scripts/master-report/generate_report.py) → empty (proves REQ-HF6a-5).
    5. git diff b1584f3...HEAD -- scripts/master-report/ → full diff for Idan review.

  Pause. Wait for Idan's "approved" (or specific issues opened as follow-up sub-tasks).
</action>

<acceptance_criteria>
  - Idan has typed "approved" in chat.
  - OR: specific issues filed as hf6a.T6.N sub-tasks for follow-up.
</acceptance_criteria>

<done_when>
  Explicit "approved" from Idan in chat.
</done_when>
```

---

**Wave 0 commit chain (6 commits + 0 commits for T6 human checkpoint):**
```
docs(hf-6a): REQ-HF6a-2 probe decision (ACTIVE)
test(hf-6a): RED — build_daily_snapshots shape and values
test(hf-6a): RED — build_daily_snapshots raises on empty history
feat(hf-6a): fetch_data additive answer_history key
feat(hf-6a): build_daily_snapshots + DailySnapshot dataclass
docs(hf-6a): REQ-HF6a-5 byte-identity proof recorded
```

---

## Section 4 — Acceptance Criteria Per Wave

### Wave 0 Done When

**Functional (REQ-HF6a-1 & REQ-HF6a-3):**
- [ ] `scripts/master-report/eri_calibration.py` exists and is importable (via the `sys.path.insert(0, 'scripts/master-report')` precedent used by `test_compute_readiness.py:29-31`).
- [ ] `DailySnapshot` is `@dataclass(frozen=True)` with exactly the fields `date: str, accuracy: float, coverage: float, retention: float, consistency: float`.
- [ ] **`build_daily_snapshots` returns a `list[DailySnapshot]` where every component (`accuracy`, `coverage`, `retention`, `consistency`) is a `float` in the closed interval `[0.0, 1.0]` on every returned element.** Citation: `~/.claude/plans/wondrous-popping-sunrise.md` line 128 — `Readiness = w·components · 100, clipped [0, 100]` — the subsequent `·100` scaling and `[0,100]` clip are only well-defined if each component is already in `[0.0, 1.0]`; any other unit produces a nonsense readiness score. *(Advisor CP1 observation resolution — also locked in the RED test in hf6a.T1.)*
- [ ] `pytest scripts/master-report/tests/test_eri_calibration.py::test_build_daily_snapshots_shape_and_values -q` green — N≥3-day synthetic history, ground-truth match within 1e-6.

**No-silent-fallback (REQ-HF6a-4):**
- [ ] `pytest scripts/master-report/tests/test_eri_calibration.py::test_build_daily_snapshots_raises_on_empty_history -q` green — empty / `None` / insufficient input raises `ValueError` (or `TypeError` for `None`) with descriptive message.
- [ ] `grep -n "return \[\]" scripts/master-report/eri_calibration.py` returns 0 matches.
- [ ] `grep -n "try:" scripts/master-report/eri_calibration.py` returns 0 matches (no `try/except` swallowing). If a `try:` is justified, it must be documented inline and paired with an explicit `raise` in the `except` branch — never a bare `pass`.
- [ ] `grep -n "print(" scripts/master-report/eri_calibration.py` returns 0 matches (use `logging` per `~/.claude/rules/python/hooks.md`).

**Additive-only data plumbing (REQ-HF6a-2):**
- [ ] `fetch_data` return dict still contains all existing keys from `b1584f3` (`total_db`, `topics_db`, `topics_user`, `topics_history`, `daily`, `hourly_utc`, `srs`).
- [ ] `fetch_data` return dict additionally contains the new key `answer_history` with list-of-dicts shape `[{"answered_at": str, "is_correct": bool, "question_id": str, "topic": str}, ...]`.
- [ ] No existing key renamed or removed (verified by diff against `b1584f3`).

**Byte-identity invariant (REQ-HF6a-5):**
- [ ] `diff <(git show b1584f3:scripts/master-report/generate_report.py | sed -n '421,469p') <(sed -n '421,469p' scripts/master-report/generate_report.py)` produces zero output (byte-identical `compute_readiness`).
- [ ] `compute_all` still contains the literal call `readiness = compute_readiness(data, basics, mc, bootstrap)` (line number may shift by ±2 due to the additive `answer_history_raw` block inserted earlier, but the textual call is identical).
- [ ] All 4 existing tests in `test_compute_readiness.py` pass (`pytest scripts/master-report/tests/test_compute_readiness.py -q` green) with `git diff b1584f3 -- scripts/master-report/tests/test_compute_readiness.py` empty.
- [ ] `grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py` returns 0 matches (proves Split=B: callable only, not wired into `compute_all`).

**No HTML change:**
- [ ] `git diff b1584f3 -- scripts/master-report/generate_report.py | grep -E "generate_html|html_template|<td|<tr"` returns 0 matches.
- [ ] No new files under `scripts/master-report/templates/` (if such a directory exists) or any other HTML asset path.

**Scope-creep lockout (Out-of-Scope items NOT present):**
- [ ] `grep -rn "compute_readiness_calibrated" scripts/master-report/` returns 0 matches.
- [ ] `grep -rn "fit_quality\|OLS\|ols_fit\|weight_swap" scripts/master-report/` returns 0 matches.
- [ ] No feature flag added (hotfix track uses deprecate-then-delete, not flags).

**Idan human-verify (hf6a.T6):**
- [ ] Idan has typed "approved" at the T6 checkpoint OR specific sub-task items opened as follow-ups.

---

## Section 5 — Rollback Strategy

| Trigger | Rollback Action | Recovery Time |
|---------|----------------|---------------|
| Any test regression in `pytest scripts/master-report/tests/` that didn't exist at `b1584f3` | `git revert <commit-sha>` for the offending commit. hf-6a is purely additive (new file + one additive `fetch_data` key); reverting has zero user impact because nothing is wired into `compute_all` or the HTML. | < 5 minutes |
| Accidental edit to `compute_readiness` (lines 421-469) detected by merge-gate byte-identity check | Do NOT merge. `git restore --source=b1584f3 -- scripts/master-report/generate_report.py`, then re-apply **only** the Q5-query + return-dict edits from hf6a.T3. | < 10 minutes |
| `answer_history` new key causes a downstream consumer to break (unlikely — no existing code reads it yet) | Revert hf6a.T3 commit only. Tests for `eri_calibration.py` still pass because `build_daily_snapshots` tests use a synthetic in-memory `history` dict, not live `fetch_data` output. | < 5 minutes |
| Post-merge: any surprise on the live report output | **This should be impossible.** hf-6a adds a new file that is never called from `compute_all`, plus an additive dict key that no consumer reads. If a surprise happens anyway: `git revert <merge-commit-sha>` + redeploy. | < 5 minutes |

**Safety anchor tag (create before merge):**
- `hf-6a-wave-0-complete` — tagged after hf6a.T6 approved.

---

## Section 6 — Merge-Gate Checklist (pre-merge to `main`)

All items must be checked before squash-merging `phase-1-stats-cleanup` → `main` for the hf-6a scope. *(Note: the branch name `phase-1-stats-cleanup` is shared with Phase 1. hf-6a touches only Python files under `scripts/master-report/`; Phase 1 touches only TypeScript under `src/` and `e2e/`. File sets are disjoint — no merge conflicts expected.)*

### Byte-identity invariant (REQ-HF6a-5)
- [ ] `diff <(git show b1584f3:scripts/master-report/generate_report.py | sed -n '421,469p') <(sed -n '421,469p' scripts/master-report/generate_report.py)` produces **zero** output.
- [ ] `git diff b1584f3 -- scripts/master-report/tests/test_compute_readiness.py` is empty.
- [ ] `grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py` returns **0** matches.

### Legacy tests untouched
- [ ] `pytest scripts/master-report/tests/test_compute_readiness.py -q` → 4 passed, 0 failed.
- [ ] Callers at lines 59, 74, 87, 108 of `test_compute_readiness.py` still read `compute_readiness(data, _basics(...), mc={}, bootstrap={})` unchanged.

### New tests green
- [ ] `pytest scripts/master-report/tests/test_eri_calibration.py -q` → 2 passed (minimum), 0 failed.
- [ ] `pytest scripts/master-report/tests/ -q` (full directory) → 6 passed (minimum), 0 failed.

### No HTML change
- [ ] `git diff b1584f3 -- scripts/master-report/generate_report.py | grep -E "generate_html|html_template|<td|<tr"` returns 0 matches.
- [ ] No new template files under `scripts/master-report/` (outside `eri_calibration.py` and the new test file).

### No hf-6b scope creep
- [ ] `grep -rn "compute_readiness_calibrated\|fit_quality\|OLS\|weight_swap" scripts/master-report/` returns 0 matches.
- [ ] No feature flag added anywhere in the diff.
- [ ] `compute_readiness` is still present in `generate_report.py` at lines 421-469 (deprecate-then-delete precedent from HF.5b — deletion lives in hf-6b).

### Build & types
- [ ] `python -c "import ast; ast.parse(open('scripts/master-report/generate_report.py').read())"` OK.
- [ ] `python -c "import ast; ast.parse(open('scripts/master-report/eri_calibration.py').read())"` OK.
- [ ] `python -m py_compile scripts/master-report/eri_calibration.py` OK.
- [ ] Type annotations on all function signatures in the new file (per `~/.claude/rules/python/coding-style.md`).
- [ ] `DailySnapshot` is `@dataclass(frozen=True)` (immutability per `~/.claude/rules/common/coding-style.md`).

### Security & secrets
- [ ] No new environment variables required.
- [ ] No hardcoded secrets: `grep -iE "(api_key|secret|token|password)" scripts/master-report/eri_calibration.py` returns 0 matches.

### Git hygiene
- [ ] Commit messages follow `feat(hf-6a):` / `test(hf-6a):` / `docs(hf-6a):` convention.
- [ ] No temporary debug code (`print(...)`, commented-out blocks) in `eri_calibration.py`.
- [ ] `hf-6a-wave-0-complete` tag created before merge.

### Idan approval
- [ ] Idan typed "approved" at the hf6a.T6 checkpoint.

---

## Section 7 — Known Risks & Mitigations

Phase-hf-6a-relevant risks only. Risks strictly in hf-6b scope are noted but out of scope.

| ID | Risk | Status | Mitigation |
|----|------|--------|-----------|
| **R-01** | Accidental edit to `compute_readiness` (lines 421-469) breaks REQ-HF6a-5 byte-identity. | **MITIGATED** | hf6a.T5 runs an explicit byte-identity diff before merge. Merge-gate repeats the check. Rollback is a `git restore` of those 49 lines from `b1584f3`. |
| **R-02** | REQ-HF6a-2 probe reveals extension is NOT needed → wasted design effort. | **RESOLVED AT PLANNING** | Probe (hf6a.T0) concluded ACTIVE: `daily_list` is `{d,n,a}`-only and `topics_history` is pre-aggregated by topic — neither carries per-answer chronology needed for per-day coverage/retention/consistency. Extension is a one-term widen of the Q5 `.select(...)` + one additive key in the return dict. |
| **R-03** | `retention` component formula for hf-6a is a placeholder (not FSRS-based); hf-6b will refine. | **ACCEPTED** | hf-6a scope is the snapshot builder contract + data plumbing, not the retention model. The placeholder formula (`correct_repeats / total_repeats` on day d, clipped to [0,1]) produces a float in [0,1] that satisfies REQ-HF6a-1. hf-6b's OLS fit operates on this placeholder until FSRS retention is wired in hf-6b-or-later. Documented in `eri_calibration.py` docstring. |
| **R-04** | `build_daily_snapshots` synthetic ground truth in hf6a.T1 drifts from actual SRS retention semantics. | **DEFERRED** to hf-6b | In hf-6a, the test uses a hand-computed ground truth against the **placeholder** retention formula. hf-6b will add a second test that compares against FSRS-reconstructed retention. Not an hf-6a concern. |
| **R-05** | Adding `answer_history` raw key bloats the returned dict and slows downstream processing. | **LOW** | One additional Supabase column in the Q5 query; the raw list is N rows (typical user has O(1000) answers). At current scale, memory/time impact is negligible. If it becomes an issue in hf-6b, the list can be lazily constructed then. |
| **R-06** | Frozen dataclass blocks in-place mutation during test setup. | **ACCEPTED / DESIRED** | Per `~/.claude/rules/common/coding-style.md` immutability rule, `DailySnapshot` MUST be frozen. Tests construct `DailySnapshot` instances via the dataclass constructor; they do not mutate after creation. |
| **R-07** | Confusing file location: user has two working copies (`repo-temp/` and `anesthesiology-mentor-main/`). | **RESOLVED** | Work happens in `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/` per `~/CLAUDE.md`. The outdated `anesthesiology-mentor-main/` copy is explicitly banned. |
| **R-08** | Scope-creep pressure toward OLS fit / `compute_readiness_calibrated` / weight swap / HTML plumbing during implementation. | **HARD-LOCKED** | Section 8 lists every hf-6b item with an explicit BAN. Merge-gate grep assertions enforce absence (`grep -rn "compute_readiness_calibrated\|fit_quality\|OLS" scripts/master-report/` == 0). |
| **R-09** | Branch shared with Phase 1 (`phase-1-stats-cleanup`) — risk of tangled merges. | **MONITORED** | hf-6a touches only Python files under `scripts/master-report/`; Phase 1 touches only TypeScript under `src/` and `e2e/`. File sets are disjoint — no merge conflicts expected. If Phase 1 lands first, hf-6a is a clean follow-up commit chain. |
| **R-10** | Type annotations missing on new function signatures (violates `~/.claude/rules/python/coding-style.md`). | **MITIGATED** | hf6a.T4 `done-when` requires typed signatures. Merge-gate confirms `DailySnapshot` field types via `inspect` / `dataclasses.fields`. |
| **R-11** | Import path: `scripts/master-report/` has a hyphen which is not a valid Python module name. | **MITIGATED** | Precedent at `test_compute_readiness.py:29-31` uses `sys.path.insert(0, str(SCRIPT_DIR))` to make `from generate_report import ...` work. hf6a.T1's test file copies this pattern for `from eri_calibration import ...`. Production callers in hf-6b will use the same pattern (or the repo will be restructured to `scripts/master_report/` — deferred). |

---

## Section 8 — Out of Scope (explicit exclusions)

The following are **hf-6b scope** and MUST NOT appear in any hf-6a task or commit. Grep-enforced in the merge-gate checklist. Scope-creep pressure toward any of these → STOP, open an issue for hf-6b, do not plan past it in hf-6a.

| Exclusion | Future Phase | Why Out of Scope for hf-6a |
|-----------|-------------|----------------------------|
| `compute_readiness_calibrated(history, components) → {readiness, weights, fit_quality}` function | hf-6b | That's the OLS-calibrated replacement. hf-6a delivers only the snapshot builder that feeds it. |
| OLS regression fit (`y = w_acc·accuracy + w_cov·coverage + w_ret·retention + w_cons·consistency + intercept`) | hf-6b | Requires multiple days of calibration data; modeling decision belongs to hf-6b. |
| R² / n-days fallback logic to v2 weights `{0.25, 0.25, 0.30, 0.20}` | hf-6b | No fallback exists without a fit; fit belongs to hf-6b. |
| `fit_quality="insufficient_history"` flag | hf-6b | No flag without a fit. |
| Any plumbing of `fit_quality` to the HTML template or `generate_html` | hf-6b | hf-6a has zero HTML changes. |
| Re-wiring `compute_all` to call `compute_readiness_calibrated` instead of `compute_readiness` | hf-6b | Split=B lock: hf-6a is callable-only. |
| Deletion of `compute_readiness` (lines 421-469) | hf-6b | Deprecate-then-delete precedent (HF.5b): old function stays until new is wired + verified. |
| Feature flag for v3 readiness toggle | Never (hotfix track uses deprecate-then-delete, not flags) | Dead-code path until hf-6b wires it — no flag needed. |
| FSRS parameter integration into `retention` component | hf-6b or later | hf-6a uses a placeholder retention formula (documented in the file's docstring). FSRS integration and its data-leakage concerns (ROADMAP §hf-6b CP2 note) are deferred. |
| Data-leakage mitigation for retention reconstruction (FSRS default params vs time-series CV) | hf-6b | Modeling decision; ROADMAP §hf-6b brainstorming note explicitly says "do NOT resolve in hf-6a". |
| Changes to any `generate_html` code path | hf-6b or later | Merge-gate grep rejects any diff matching `generate_html\|html_template\|<td\|<tr`. |
| Changes to any test file other than the new `test_eri_calibration.py` | hf-6b | `git diff b1584f3 -- scripts/master-report/tests/test_compute_readiness.py` must be empty. |
| Schema changes to Supabase `answer_history` / `questions` / `spaced_repetition` tables | Never in hf-6a (read-only) | Raw per-answer data already exists in `answer_history`; only new code is a wider `.select(...)` in the Q5 query. |
| Any edit to `src/` TypeScript/React code | Never in hf-6a | Python-only scope. |

---

## Appendix A — Sub-Agent Dispatch Summary

| Task IDs | Primary Agent | Rationale |
|----------|---------------|-----------|
| hf6a.T0 | executor (manual read) | Discovery only — no code generation needed |
| hf6a.T1, hf6a.T2 | `tdd-guide` | Test-first; RED phase; synthetic fixture construction |
| hf6a.T3 | direct edit + `code-reviewer` post-pass | Surgical edit to `fetch_data` — additive only; minimal diff; must not touch lines 421-469 |
| hf6a.T4 | `tdd-guide` | GREEN phase; function implementation to satisfy T1 + T2; documented placeholder retention formula |
| hf6a.T5 | executor (verification only — `security-reviewer` optional post-pass) | Byte-identity diff + legacy test re-run; no new code |
| hf6a.T6 | **Human (Idan)** | Visual sign-off on full diff + test output — only Idan can approve |

**Database-reviewer agent NOT needed in hf-6a** — zero schema changes. The widened `.select(...)` uses columns that already exist in `answer_history` and `questions`.

---

## Appendix B — File Inventory (created / modified in hf-6a)

### Created (new files)
```
scripts/master-report/eri_calibration.py              — build_daily_snapshots + DailySnapshot dataclass
scripts/master-report/tests/test_eri_calibration.py   — 2 tests (shape-and-values, raises-on-empty)
.planning/phases/hf-6a/PLAN.md                        — this file
.planning/phases/hf-6a/VERIFICATION.md                — REQ-HF6a-2 probe decision + REQ-HF6a-5 byte-identity proof
```

### Modified (surgical)
```
scripts/master-report/generate_report.py              — ~line 127: widen .select() to include question_id + questions(topic);
                                                        immediately after daily_list (~line 144): build answer_history_raw list;
                                                        ~line 188-196: add one key "answer_history": answer_history_raw to return dict.
                                                        NO other changes. Lines 421-469 byte-identical to b1584f3.
                                                        Call site for compute_readiness preserved (textually unchanged; line number
                                                        may shift by ±2 due to the additive block inserted before it).
```

### Untouched (explicitly preserved)
```
scripts/master-report/generate_report.py:421-469      — compute_readiness body (byte-identical to b1584f3; merge-gate proves this)
scripts/master-report/generate_report.py — compute_all readiness = compute_readiness(...) call (textually identical)
scripts/master-report/generate_report.py — generate_html and all HTML-template code paths
scripts/master-report/tests/test_compute_readiness.py — 4 tests preserved verbatim
scripts/master-report/fsrs_module.py                  — HF.5b artifact, untouched
scripts/master-report/tests/test_fsrs_module.py        — untouched
scripts/master-report/tests/test_fsrs_integration.py   — untouched
scripts/master-report/tests/test_compute_ols_trend.py  — untouched
scripts/master-report/tests/test_compute_monte_carlo.py — untouched
scripts/master-report/tests/test_fail_fast.py          — untouched
scripts/master-report/tests/conftest.py                — untouched
scripts/master-report/_legacy_v2/*                     — untouched
src/**                                                 — Python-only scope; zero frontend changes
supabase/migrations/*                                  — zero schema changes
```

---

## Appendix C — Quick-Reference Commands

```bash
# Working directory (always use this one — NOT anesthesiology-mentor-main/)
cd /Users/idankatz15/Desktop/3_APP_DEV/repo-temp

# Run all master-report tests (per task)
pytest scripts/master-report/tests/ -q

# Run only the new hf-6a tests (fast feedback during T1, T2, T4)
pytest scripts/master-report/tests/test_eri_calibration.py -q

# Run only the legacy compute_readiness tests (hf6a.T5 proof #3)
pytest scripts/master-report/tests/test_compute_readiness.py -q

# Byte-identity proof for compute_readiness (REQ-HF6a-5 — merge gate)
diff <(git show b1584f3:scripts/master-report/generate_report.py | sed -n '421,469p') \
     <(sed -n '421,469p' scripts/master-report/generate_report.py)
# (must produce zero output)

# Prove build_daily_snapshots is NOT wired into compute_all (REQ-HF6a-5 — Split=B)
grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py
# (must return 0 matches)

# Prove no hf-6b scope creep
grep -rn "compute_readiness_calibrated\|fit_quality\|OLS\|weight_swap" scripts/master-report/
# (must return 0 matches)

# Prove no HTML change
git diff b1584f3 -- scripts/master-report/generate_report.py | grep -E "generate_html|html_template|<td|<tr"
# (must return 0 matches)

# Prove no silent fallbacks in eri_calibration.py (REQ-HF6a-4)
grep -n "return \[\]" scripts/master-report/eri_calibration.py
grep -n "try:" scripts/master-report/eri_calibration.py
# (both must return 0 matches; if any `try:`, it MUST be paired with an explicit `raise` in its except)

# Prove no print statements (per ~/.claude/rules/python/hooks.md)
grep -n "print(" scripts/master-report/eri_calibration.py
# (must return 0 matches)

# Prove DailySnapshot is frozen with correct fields
python -c "
import sys
sys.path.insert(0, 'scripts/master-report')
from eri_calibration import DailySnapshot
from dataclasses import fields, is_dataclass
assert is_dataclass(DailySnapshot), 'not a dataclass'
assert DailySnapshot.__dataclass_params__.frozen, 'not frozen'
print([(f.name, f.type) for f in fields(DailySnapshot)])
"
# (must print exactly: [('date', <class 'str'>), ('accuracy', <class 'float'>),
#                      ('coverage', <class 'float'>), ('retention', <class 'float'>),
#                      ('consistency', <class 'float'>)])

# Tag before merge
git tag hf-6a-wave-0-complete
```

---

**End of PLAN.md.** Ready for `gsd-executor`.
