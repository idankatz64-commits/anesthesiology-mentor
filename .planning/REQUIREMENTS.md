# Requirements — Hotfix Track

**as-of:** 2026-04-22
**active phase:** hf-6a
**source:** `~/.claude/plans/wondrous-popping-sunrise.md` §HF.6 (lines 122-130)

REQ-IDs are written ONLY for the currently active phase. Requirements for hf-6b
will be added after hf-6a merges and its data contract is frozen.

---

## hf-6a — ERI calibration — snapshot builder

### REQ-HF6a-1 — `build_daily_snapshots` function

**Goal.** Implement `build_daily_snapshots(history) → list[DailySnapshot]` in a
new file `scripts/master-report/eri_calibration.py`. For each day in the user's
full answer history, compute the four ERI components: accuracy, coverage,
retention, consistency.

**Source.** wondrous-popping-sunrise.md line 124:
> "Compute daily snapshots of (accuracy, coverage, retention, consistency) across
> the user's full history"

**Acceptance criteria.**
- File `scripts/master-report/eri_calibration.py` exists and is importable.
- `build_daily_snapshots` is a top-level callable with a typed signature.
- Return value is a list of per-day records containing:
  `date`, `accuracy`, `coverage`, `retention`, `consistency`.
- Each component is a float in `[0, 1]` (or whatever unit the OLS fit in hf-6b
  expects — to be confirmed during planning).

---

### REQ-HF6a-2 — `fetch_data` signature extension (conditional)

**Goal.** If building daily snapshots requires raw `answer_history` granularity
(probe confirmed `daily` is already aggregated to `{d, n, a}`), extend
`fetch_data` (`scripts/master-report/generate_report.py:126-143`) to surface the
raw data WITHOUT removing existing return fields.

**Source.** Probe finding (no wondrous line): `daily_list` in `fetch_data` yields
only `date`/`attempts`/`accuracy_pct` — insufficient for per-day coverage,
retention, consistency reconstruction.

**Acceptance criteria.**
- `fetch_data` still returns the existing contract keys: `topics_user`,
  `topics_db`, `daily`, `srs`, `hourly_utc`, `total_db`.
- If extension is needed: a new key (e.g., `answer_history`) is added; no key is
  removed or renamed.
- If extension is NOT needed (snapshot builder can reconstruct from existing
  keys): this REQ is marked N/A during planning — justified in PLAN.md.

---

### REQ-HF6a-3 — Integration test

**Goal.** A pytest integration test that feeds a synthetic user history into
`build_daily_snapshots` and asserts shape + values against a hand-computed
ground truth.

**Source.** wondrous line 130 (synthetic-history testing pattern) + scope
requirement from Message 3.

**Acceptance criteria.**
- Test file `scripts/master-report/tests/test_eri_calibration.py` exists.
- Test case `test_build_daily_snapshots_shape_and_values` passes:
  - Synthetic history of N ≥ 3 days is constructed as a fixture.
  - Returned list has exactly N entries.
  - For each day, all four components match ground truth within float
    tolerance (`abs(a - b) < 1e-6` or equivalent).
- Test runs under `pytest scripts/master-report/tests/ -q` alongside existing
  tests.

---

### REQ-HF6a-4 — HF.3 invariant (no silent fallbacks)

**Goal.** `build_daily_snapshots` MUST raise on insufficient data. It must not
return silent defaults or empty lists without an explicit, loud contract.

**Source.** HF.3 hard rule (commit `3236022`): silent fallbacks are banned.

**Acceptance criteria.**
- Explicit test case `test_build_daily_snapshots_raises_on_empty_history` —
  calling with empty / invalid input raises `ValueError` with a descriptive
  message.
- Code review (CP1) confirms no `try/except ... pass` swallowing,
  no `return []` on insufficient data path without an accompanying explicit
  documented contract that makes the emptiness meaningful.

---

### REQ-HF6a-5 — deprecate-then-delete invariant

**Goal.** Existing `compute_readiness` (generate_report.py:415-469) is NOT
modified, NOT deleted, and NOT replaced as the production caller in hf-6a.
Follows the precedent set by HF.5b (`compute_ebbinghaus` → `compute_decay_from_srs`
where the old function remained until the new one was wired in).

**Source.** Scope Q4 lock (Message 3) + HF.5b precedent.

**Acceptance criteria.**
- `compute_readiness` signature and body at
  `scripts/master-report/generate_report.py:415-469` are byte-identical
  pre- vs post-hf6a merge.
- `compute_all` (generate_report.py:556-641) still calls
  `compute_readiness(...)` at line 570.
- Existing 4 tests in
  `scripts/master-report/tests/test_compute_readiness.py` (callers at lines
  59, 74, 87, 108) still pass without edits.
- `build_daily_snapshots` is callable from tests but NOT called from
  `compute_all` in this phase.
