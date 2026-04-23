---
phase: hf-6c
current_cp: CP1
last_completed_cp: CP0
last_updated: 2026-04-23
mode: single-window
compactions_within_cp: 0
compactions_all_time: 1
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
