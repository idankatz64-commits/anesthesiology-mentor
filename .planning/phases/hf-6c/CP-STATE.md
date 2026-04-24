---
phase: hf-6c
current_cp: CP1-verify
last_completed_cp: CP1
last_updated: 2026-04-24
mode: single-window
compactions_within_cp: 2
compactions_all_time: 3
re_anchor_tests: {passed: 0, failed: 0}
owner: work-window
protocol_version: v2.2
---

# CP-STATE — hf-6c (authoritative state sync)

> **Owner:** work-window (single-window mode v2.2 — advisor role collapsed into work-window).
> **Purpose:** Single source of truth for current GSD checkpoint position on hf-6c.
> **Update cadence:** after every CP transition, after every compaction, after every self-verification verdict.

## GSD position

- **Phase:** hf-6c — ERI calibration cutover (Wave C: T5 HTML surface → T6 wire-in → T7 legacy delete).
  Scope restricted to master-report HTML (`scripts/master-report/generate_report.py`) per user
  directive 2026-04-23 ("לא נקדים את המאוחר" — StatsView live-app is explicitly out of scope).
- **Current CP:** CP0 (bootstrap) — IN PROGRESS. REQUIREMENTS.md HF-6c section appended (REQ-HF6c-1..4
  + CP0 Design Decisions block DD-1..DD-4 + Option B exception policy). CP-STATE.md (this file) being
  written. STATE.md phase-transition update pending. Single bootstrap commit pending.
- **Last completed CP:** null (hf-6c just opened on top of hf-6b CP5 CLOSE at HEAD `5c1e3ea`).
- **Next CP:** CP1 — PLAN.md drafting via `gsd-planner` (when user schedules execution window; user is
  on-call, so planning is deferred to a future window). Wave C execution (T5/T6/T7) is CP2+ work.

## Predecessor anchor

- **hf-6b:** PHASE COMPLETE 2026-04-23, HEAD `5c1e3ea` on branch `phase-1-stats-cleanup`.
  CP0..CP5 all closed. `compute_readiness_calibrated` landed in
  `scripts/master-report/eri_calibration.py` as Split=B (callable-only, not wired into
  `compute_all`). 18 pytest cases GREEN under Option 5 criterion (R²>0.70 OR max-abs<12.0;
  observed R²≈0.7649, max_abs≈9.60). 3-feature OLS model (accuracy, coverage, retention +
  intercept; `consistency` dropped per REQ-HF6b-7 due to structural multicollinearity).
  Byte-identity lock on legacy `compute_readiness` lines 421-469 in `generate_report.py`
  vs hf-6a baseline `b1584f3` held through phase close.
- **hf-6a:** complete, HEAD `639ea3b` reference. `build_daily_snapshots` + `DailySnapshot`
  landed as Split=B. Lock declarations in `.planning/phases/hf-6a/VERIFICATION.md` authoritative.
- **Locks inherited from hf-6a, still held at hf-6c entry:**
  - Split=B lock: `compute_readiness_calibrated` callable-only, not imported by
    `generate_report.py`. Expected to release at hf-6c T6.
  - Byte-identity 421-469 lock: `git diff b1584f3..HEAD -- scripts/master-report/generate_report.py`
    for lines 421-469 = 0 lines. Expected to release at hf-6c T7.

## Window health (v2.2 — single-window, Option B thresholds)

| Scope | Within-CP | All-time (phase) | Status |
|-------|-----------|------------------|--------|
| single-window | 1 (see YAML `compactions_within_cp`) | 1 (observational) | CP0 entry — fresh budget |

**Compaction Gate Protocol (v2.2 — single-window, carried over from hf-6b):**
- **Soft threshold:** 5 compactions within current CP → wrap-up warning + state commit.
- **Hard threshold:** 10 compactions within current CP → wrap-up mandatory.
- **Per-CP reset:** on CP transition, within-CP counter resets to 0. All-time counter keeps
  incrementing within the phase (observational only; not a gate).
- **Tier 1 rule:** every Hebrew response must include the current `📊 Compactions: X/5` count.

## Re-Anchor log

- (none yet — hf-6c just opened; Re-Anchor tests trigger only on fail-fast events or
  near-threshold compaction counts.)

## Recent events (newest on top)

- 2026-04-24 — **Wave C CODE COMPLETE — T5 + T6 + T7 all committed; CP1-verify in progress.**
  Three Wave C tasks executed in sequence per REQ-HF6c-1/2/3. All three SHAs now sit on
  `phase-1-stats-cleanup` ahead of `origin` along with the prior drift-fix commit:

  - **T5 (`8c2758c`) — `refactor(hf-6c): T5 surface ERI fit_quality via kpi-subtitle (+ r2 from calibrator)`**
    - Step 0: added `"r2": float(r_squared)` to `compute_readiness_calibrated` return dict
      (`eri_calibration.py`). Single additive key — algorithm/fit/contract unchanged per Q-1 ruling.
    - Step 0.5 (latent-bug fix discovered mid-T5): initialized `r_squared = 0.0` BEFORE the
      `n_pairs < _MIN_PAIRS_FOR_CALIBRATION` branch. Without this init, the insufficient_history /
      ValueError paths would hit `UnboundLocalError` on the new `"r2": float(r_squared)` line.
      Matches existing `ss_tot == 0.0` precedent for the poor_fit branch.
    - Step 1: added `.kpi-subtitle` + `.kpi-subtitle.fallback` CSS (green `#00D4CC` default,
      amber `#FFB020` fallback) to `generate_html` inline CSS.
    - Step 2: added `eri_card` Python block before the HTML template build; replaced the inline
      `kpi-card` HTML for ERI with `{eri_card}`. Hebrew subtitle templates match DD-2 verbatim:
      `"כיול מוצלח · R²={r2:.2f}"` / `"היסטוריה קצרה · R²={r2:.2f}"` /
      `"כיול חלש · R²={r2:.2f}"` / `"כיול לא זמין · R²=—"` (defensive 4th branch for missing key).
    - Step 2.5: updated `test_eri_calibration.py` key-set assertion to
      `{"readiness", "weights", "fit_quality", "r2"}` (4-key, was 3-key).
    - Verification: pytest 63/63 pass; adapted smoke (in-process template exercise across all 4
      branches) — all 4 subtitles render with correct color + correct Hebrew.

  - **T6 (`f4a750d`) — `refactor(hf-6c): T6 wire compute_readiness_calibrated into compute_all`**
    - Edit 1: `from eri_calibration import compute_readiness_calibrated` at module top.
      **→ Split=B callable-only lock RELEASED at this commit (as planned in CP0 DD-4 cutover).**
    - Edit 2: extended Q5 SELECT in `fetch_data` to include `question_id, questions(topic)` and
      built a raw `answer_history` list in the same loop that built the `daily` aggregation.
      Q5 ruling "minimum" respected — only `question_id + topic` added, no speculative columns.
    - Edit 3: added `"answer_history": answer_history` to `fetch_data` return dict.
    - Edit 4: new `_compute_sub_scores(data, basics)` helper — verbatim extraction of the
      per-component math (accuracy/coverage/critical/consistency) from the legacy function,
      minus the fixed-weight aggregation. All 3 HF.3 ValueError raises preserved (no attempts
      / no critical topics / <3 consistency days with n≥5).
    - Edit 5: replaced `readiness = compute_readiness(data, basics, mc, bootstrap)` at the
      compute_all call site with the Option B wire-in: sub_scores → components dict →
      history dict → `try: compute_readiness_calibrated(...) except ValueError as e:` with
      token parse (`str(e).split(":", 1)[0]`), stderr log, and `"—"` sentinel readiness on
      the caught branch. REQ-HF6c-2 / Option B policy compliance = full.
    - Edit 6: terminal ERI print guarded — renders
      `ERI:      — (calibration fallback: <token>)` on the sentinel path, regular
      `ERI:      {n}/100` otherwise.
    - PLAN drifts auto-resolved per user autonomy rule (scope: `scripts/master-report/*` = safe):
      import path = `from eri_calibration import ...` (NOT `scripts.master_report...` — hyphen
      in dir name blocks dotted import); `data["total_db"]` used directly (not `basics["total_db"]`
      which doesn't exist); single helper `_compute_sub_scores` instead of 6 separate helpers
      proposed in PLAN (semantically identical, avoids duplicated per-component computation).
    - Verification: pytest 63/63 pass (unchanged — T6 adds no new tests, but exercises the
      existing calibrator suite through the new wire-in). Adapted smoke (direct-import
      calibrator call on 4 synthetic histories) — calibrated / insufficient_history / ValueError
      `<2 days` / ValueError empty — all 4 Option B branches emit correct `fit_quality` +
      correct token parse + correct sentinel on the fallback path.

  - **T7 (`11d0f04`) — `refactor(hf-6c): T7 delete legacy compute_readiness + its tests`**
    - Deleted `compute_readiness(data, basics, mc, bootstrap)` entirely (~49 lines: the
      fixed-weight aggregator `0.25·acc + 0.25·cov + 0.30·crit + 0.20·cons`). The
      aggregation logic is now replaced by `compute_readiness_calibrated` (OLS on per-user
      history); the per-component ValueError invariants survive inside `_compute_sub_scores`.
      **→ Byte-identity 421-469 lock vs baseline `b1584f3` RELEASED at this commit.**
    - `git rm scripts/master-report/tests/test_compute_readiness.py` — 4 tests that pinned
      the v3 fallback-removal contract on the deleted function. Per Q-5 ruling "delete", no
      port to the calibrated path (its coverage lives in the hf-6b SPOKE suite which remains
      GREEN 18/18 post-T7). No `@pytest.mark.skip` half-measure.
    - Harmonized `_compute_sub_scores` docstring — dropped stale `"421-468"` line-range
      reference (the referenced function no longer exists).
    - Verification: pytest 59/59 pass (63 − 4 removed = 59, exactly as expected). Grep
      sweep: `grep "compute_readiness\b" scripts/master-report/` with `compute_readiness_calibrated`
      + `_compute_sub_scores` + `_legacy_v2` excluded → **1 hit** inside the
      `_compute_sub_scores` docstring note (`"deleted in hf-6c T7"`) — a historical comment,
      not a live reference.

  - **Locks status post-Wave-C (both as planned):**
    - Split=B callable-only lock: **RELEASED at T6** (compute_readiness_calibrated now
      imported + called from generate_report.py).
    - Byte-identity 421-469 lock vs `b1584f3`: **RELEASED at T7** (source function deleted).

  - **Commits ahead of `origin/phase-1-stats-cleanup` (4 total, atomic push window per REQ-HF6c-4):**
    1. `3393c0a` docs(hf-6c): CP1-post drift fix — PLAN.md paths + python3 executable corrections
    2. `8c2758c` refactor(hf-6c): T5 surface ERI fit_quality via kpi-subtitle (+ r2 from calibrator)
    3. `f4a750d` refactor(hf-6c): T6 wire compute_readiness_calibrated into compute_all
    4. `11d0f04` refactor(hf-6c): T7 delete legacy compute_readiness + its tests

  - **CP1-verify status:** pytest baseline = 59/59 GREEN. Syntax = OK. Live smoke-run against
    Supabase (Q-2 "live" ruling) still pending — will happen naturally next time user runs
    master-report. Per REQ-HF6c-4, the 4 commits push together as one atomic window to avoid
    any intermediate state where `generate_report.py` imports `compute_readiness_calibrated`
    but still defines (and would still try to call, via the old call site) the legacy
    `compute_readiness`. Current in-repo state: T6 + T7 are both applied, so the atomic
    invariant is preserved locally as well.

  - **Compaction counters at Wave-C completion:** `compactions_within_cp: 2` (CP1-post
    drift-fix session-resume + Wave-C session-resume), `compactions_all_time: 3`. Both well
    below soft-5 threshold — no wrap-up pressure.

  - **Next work:** ask user to approve `git push origin phase-1-stats-cleanup` per project
    `<git_workflow>` rule. After push: CP1-verify CLOSED → CP2 for manual smoke-verification
    (live Supabase run) + STATE.md phase-level update.

- 2026-04-24 — **CP1-post drift harmonization — PLAN.md paths + python3 executable corrections.**
  Pre-flight verification of PLAN.md surfaced 3 semantic drifts that would have blocked every
  automated verify block inside T5/T6/T7 before a single line of Wave C code ran. All 3 fixed
  in a single docs-only commit; no code file touched; no algorithm/contract/lock changed.

  - **Drift #1 (executable name):** PLAN.md used `python` as the CLI executable (4 occurrences
    across T5/T6/T7 `<automated>` verify blocks + CP1-verify smoke command). Local env has only
    `python3` at `/Library/Frameworks/Python.framework/Versions/3.13/bin/python3`; bare `python`
    returns `command not found`. **Fixed:** `python scripts/master-report/` →
    `python3 scripts/master-report/` (replace_all, 3 occurrences) + `python -c "from` →
    `python3 -c "from` (1 occurrence). Total: 4 edits.

  - **Drift #2 (test file path):** PLAN.md referenced `tests/test_compute_readiness.py` at the
    repo root (9 occurrences across frontmatter, T7 Step 5, pre_flight checklist, post_flight
    checklist, risks R-5, open_questions Q-5, success_criteria item 5). Actual path is
    `scripts/master-report/tests/test_compute_readiness.py` (co-located with other master-report
    tests under `scripts/master-report/tests/`). **Fixed:** replace_all
    `tests/test_compute_readiness.py` → `scripts/master-report/tests/test_compute_readiness.py`.
    Note: this ALSO corrected the `--ignore=` target in the pre_flight pytest command, since the
    ignore path used the same wrong prefix.

  - **Drift #3 (pytest test directory):** PLAN.md pre_flight checklist line 477 said
    `pytest tests/ -x ...`. There is no `tests/` directory at repo root — the only Python test
    suite lives at `scripts/master-report/tests/`. **Fixed:** `pytest tests/` →
    `pytest scripts/master-report/tests/` (single Edit on line 477).

  - **Classification — why this was semantic, not cosmetic:** Per feedback memory "Cosmetic vs
    semantic drift", cosmetic drift (stale line numbers, dates, SHAs) does NOT block CP progress.
    But executable names and file paths are SEMANTIC — they affect whether the automated verify
    blocks inside each task actually run. Running `python scripts/...` returns `command not found`;
    running `pytest tests/` returns `ERROR: file or directory not found`. Every smoke-run command
    in PLAN.md would have failed, blocking T5/T6/T7 at step zero. Fixing before execution = one
    docs commit. Fixing during execution = stop 4× (once per failed automated verify) mid-Wave-C.

  - **Scope of fix:** Docs-only. PLAN.md frontmatter + body (4 python3 swaps + 10 test-path swaps
    + 1 pytest-dir swap = 15 markdown edits total). CP-STATE.md event log (this entry).
    ZERO code files touched. ZERO locks affected. ZERO Q-1..Q-5 rulings changed.
    ZERO DD-1..DD-4 changes.

  - **Verification after edits (grep sweep, 2026-04-24):**
    - `grep -n "tests/test_compute_readiness.py" PLAN.md | grep -v "scripts/master-report/tests"` → 0
    - `grep -n "pytest tests/" PLAN.md` → 0
    - `grep -nE "(^|[^3a-zA-Z])python [a-z\\-]" PLAN.md` → 0 (no bare `python` executable calls)
    - `grep -nc "python3" PLAN.md` → 4 ✓
    - `grep -nc "scripts/master-report/tests/test_compute_readiness.py" PLAN.md` → 10 ✓

  - **Compaction counter update (v2.2 single-window Option B):** this fix executed across 2
    conversation windows (pre-compact drift-surfacing + post-compact drift-fix). Counter now
    reflects reality: `compactions_within_cp: 1` (session-resume compact), `compactions_all_time: 2`.
    Still well below soft-5 threshold.

  - **Lock status unchanged:**
    - Split=B callable-only lock: **HELD** (still releases at T6 wire-in).
    - Byte-identity 421-469 lock vs `b1584f3`: **HELD** (still releases at T7 delete).

  - **Next work:** commit this PLAN.md harmonization + CP-STATE.md event log (single commit:
    `docs(hf-6c): CP1-post drift fix — PLAN.md paths + python3 executable corrections`) →
    run pytest baseline with corrected paths → await user's "קדימה" → start T5.

- 2026-04-23 — **CP1 OPEN — PLAN.md drafted by `gsd-planner`; all 5 open questions RESOLVED.**
  PLAN.md now at `.planning/phases/hf-6c/PLAN.md` (553+ lines, 3 tasks T5/T6/T7 + CP1-verify
  checkpoint; 2 files in `files_modified` + 1 deletion target). Planner surfaced 5 open questions;
  user rulings captured verbatim 2026-04-23: **"2. חי 3. FORCE 4. מינימום 5. למחוק קדימה"**.

  - **Q-1 RESOLVED = (c):** Expose `r2` from `compute_readiness_calibrated` via a 1-line
    additive change to its return dict in `eri_calibration.py` (lines 313-317 — `r_squared` is
    already computed on line 283 and was being discarded; just add `"r2": float(r_squared)`
    as a new key). Folded into T5 as Step 0. **NO algorithm/fit/error-contract change** — only
    the return shape grows by one key. DD-2 template (CP-STATE DD-2, above) now renders real
    R² value (e.g., `R²=0.76`) on the calibrated path; falls back to `"—"` only if the key is
    somehow missing. `eri_calibration.py` added to `files_modified` in PLAN.md frontmatter with
    explicit carve-out: 1-line additive ONLY, everything else remains FROZEN.

  - **Q-2 RESOLVED = live:** Smoke-run environment for T5/T6/T7 automated verify is **live
    Supabase** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` required). No fixture/mock path.
    Rationale: master-report is always run live in production — fixtures would be brittle and
    diverge from reality.

  - **Q-3 RESOLVED = FORCE ALLOWED** (user override of default revert-only policy):
    For `phase-1-stats-cleanup` branch ONLY, if CP1-verify FAILS post-push,
    `git push --force-with-lease origin phase-1-stats-cleanup` is authorized for rollback to
    pre-cutover SHA (`1246531` at CP0 entry). `git revert` remains as fallback if branch
    protection blocks force-push. **`main` branch is NOT covered** by this ruling — main
    remains force-push-prohibited per global `<git_workflow>` rule. `--force-with-lease`
    mandated (not bare `--force`) to abort on concurrent pushes. Co-worker warning documented
    in PLAN.md `<rollback_plan>`.

  - **Q-4 RESOLVED = minimum:** Q5 SELECT extension is `question_id, topic` ONLY — no
    speculative columns (`user_id`, `time_spent_ms`, etc.). YAGNI — additive SELECTs can be
    extended in a future phase if/when `build_daily_snapshots` actually needs more fields.

  - **Q-5 RESOLVED = delete:** `tests/test_compute_readiness.py` is DELETED in the T7 commit
    window via `git rm tests/test_compute_readiness.py`. No port to
    `compute_readiness_calibrated` (out of Wave C scope); no `@pytest.mark.skip`. Coverage of
    the calibrated path is tracked via hf-6b SPOKE suite (18/18 GREEN) — deletion does not
    leave a coverage hole for the new code.

  - **Drift fix during CP1 close:** The `gsd-planner` draft of PLAN.md T5 Step 2 used Hebrew
    wording (`"כיול: מדויק (R²=...)"`, `"כיול: התאמה חלשה — ציון משוקלל מ-fallback"`, etc.)
    that DID NOT match CP-STATE DD-2 verbatim templates (`"כיול מוצלח · R²={r2:.2f}"`,
    `"היסטוריה קצרה · R²={r2:.2f}"`, `"כיול חלש · R²={r2:.2f}"`). Semantic drift (user-facing
    text is semantic, per feedback memory). PLAN.md T5 Step 2 corrected to match DD-2 verbatim
    before CP1 commit. DD-2 remains authoritative.

  - **Lock status at CP1 open (unchanged from CP0 entry):**
    - Split=B callable-only lock: **HELD** (releases at T6 wire-in).
    - Byte-identity 421-469 lock vs `b1584f3`: **HELD** (releases at T7 delete).

  - **Compaction counter reset:** Per v2.2 Option B per-CP reset, `compactions_within_cp: 0`
    on CP1 entry. All-time counter remains at 1 (observational).

  - **Next work:** CP1 commit (PLAN.md + this CP-STATE.md event log) → user approves push →
    CP1 CLOSED → CP2 opens for Wave C execution (T5→T6→T7 atomic push window). Execution timing
    TBD by user availability.

- 2026-04-23 — **CP0 ENTRY — hf-6c opened on top of hf-6b CP5 CLOSE.** Fresh phase; all 4
  Design Decisions confirmed by user and encoded in REQUIREMENTS.md; Option B exception policy
  confirmed for T6 wire-in; Wave C deferred to future window per user availability (on-call).

  - **Scope restriction (user-directed, 2026-04-23 verbatim: "לא נקדים את המאוחר"):**
    master-report HTML only (`scripts/master-report/generate_report.py`). Live app StatsView
    (`src/components/StatsView.tsx` and related) is OUT OF SCOPE for hf-6c and will be addressed
    in a future phase if needed.

  - **CP0 Design Decisions (all user-approved; do not re-ask on resume):**
    - **DD-1 (HTML location of `fit_quality` surface) — Option 2 chosen:** new subtitle line
      below `kpi-value` inside the ERI `kpi-card` in `generate_report.py`. New `<div
      class="kpi-subtitle">` row, not replacing the existing number.
    - **DD-2 (Exact Hebrew wording) — Approach D1 chosen: clinical Hebrew + R² always shown:**
      `calibrated` → `"כיול מוצלח · R²={r2:.2f}"` (teal `#00D4CC`);
      `insufficient_history` → `"היסטוריה קצרה · R²={r2:.2f}"` (amber `#FFB020`);
      `poor_fit` → `"כיול חלש · R²={r2:.2f}"` (amber `#FFB020`).
      R² always shown; if NaN/unavailable render as `"—"`.
    - **DD-3 (Fallback display) — Option β chosen:** same line, amber color only on
      non-calibrated. Reuse existing `#FFB020` palette (same as דיוק KPI color). No separate
      banner, no icon, no tooltip — just color differentiation on the subtitle.
    - **DD-4 (Transition mode) — CUTOVER chosen:** Wave C replaces legacy `compute_readiness`
      in one atomic push window (T5→T6→T7). No shadow mode, no feature flag, no A/B.

  - **Exception handling policy for T6 wire-in (user-approved: Option B — catch + label):**
    caller of `compute_readiness_calibrated` wraps call in `try: ... except ValueError as e:`,
    parses the HF.3 token prefix (`"insufficient_history:"` / `"poor_fit:"`) from the exception
    message to set `fit_quality`, and renders the amber-labeled subtitle per DD-2/DD-3. Fallback
    `readiness` value when caught: render as `"—"` sentinel in the HTML `kpi-value` (do NOT
    substitute a numeric default). Rationale: DD-3 β already surfaces non-calibrated states →
    reuse that surface for caught exceptions; avoids "no report at all" on short-history days;
    HF.3-compliant (labeled fallback, not silent).

  - **REQUIREMENTS.md HF-6c section appended** (see `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/REQUIREMENTS.md`):
    - **REQ-HF6c-1** (T5 HTML surfacing): new `kpi-subtitle` div inside ERI `kpi-card`;
      Hebrew templates + color mapping per DD-1/DD-2/DD-3 verbatim.
    - **REQ-HF6c-2** (T6 wire-in with Option B exception policy): `try/except ValueError`,
      parse HF.3 token, render `"—"` sentinel for caught fallback readiness; Split=B lock
      releases at this commit.
    - **REQ-HF6c-3** (T7 legacy deletion): delete `compute_readiness` from `generate_report.py`;
      byte-identity 421-469 lock releases at this commit.
    - **REQ-HF6c-4** (atomic push window): T5→T6→T7 land as single push; forbidden partial
      states enumerated.

  - **Invariants at CP0 entry (inherited unchanged from hf-6b CP5 CLOSE):**
    - Split=B held: `grep compute_readiness_calibrated scripts/master-report/generate_report.py`
      → 0 matches.
    - Byte-identity 421-469 held: `git diff b1584f3..HEAD --
      scripts/master-report/generate_report.py` for lines 421-469 → 0 lines.
    - pytest GREEN (carried from hf-6b close): 18/18 under Option 5 criterion.
    - HF.3 no-silent-fallback contract on `compute_readiness_calibrated` intact per CP4 audit.

  - **Next CP (CP1) scope:** PLAN.md drafting via `gsd-planner`. Expected structure: 3 tasks
    (T5/T6/T7) in one wave; pre-flight snapshot; post-flight smoke-run on sample DB.
    Execution deferred to future window per user availability.

  - **Compaction counters at CP0 entry:** `compactions_within_cp: 1` (session-resume from
    compact auto-summary); `compactions_all_time: 1`. Below soft-5 threshold — no wrap-up needed.

  - **Commit plan:** single bootstrap commit `docs(hf-6c): CP0 bootstrap — REQUIREMENTS +
    CP-STATE + STATE transition` covering REQUIREMENTS.md (HF-6c section append) + this file
    (CP-STATE.md creation) + STATE.md (phase transition hf-6b → hf-6c).

  - **Push status:** pending user approval per `<git_workflow>` project rule (zero code
    background, push is the only backup; must not assume).

## Authoritative pointers

- **Canonical STATE:** `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/STATE.md`.
- **hf-6b CP-STATE (phase-complete reference):** `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/phases/hf-6b/CP-STATE.md`.
- **hf-6a VERIFICATION (lock declarations):** `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/phases/hf-6a/VERIFICATION.md`.
- **REQUIREMENTS (all REQ-HF6a/b/c):** `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/REQUIREMENTS.md`.
- **Master-report target file (Wave C target):** `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/generate_report.py` (ERI `kpi-card` ~line 745-751; legacy `compute_readiness` at 421-469).
- **Calibration module (callable source):** `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/eri_calibration.py`.
- **pytest suite:** `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/tests/test_eri_calibration.py`.
- **Emergency-recovery auto-memory:** `~/.claude/projects/-Users-idankatz15-Desktop-3-APP-DEV-repo-temp/memory/project_hf6c_cp0_state.md` (CP0 state snapshot, 4 DDs + Option B policy).
