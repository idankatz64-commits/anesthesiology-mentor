# GSD State

**as-of:** 2026-04-23
**current_phase:** hf-6b
**status:** hf-6b **PHASE COMPLETE** (2026-04-23). CP0..CP5 all closed on `phase-1-stats-cleanup`. CP5 (wrap-up + cross-phase handshake to hf-6c) closed administratively: CP4 CLOSE recorded in Commit 1 (`c1d0098`); CP5 CLOSE + handshake recorded in Commit 2 (this commit). Phase-level merge-gate deferred to end of hf-6c per hf-6a precedent (runs once for hf-6a + hf-6b + hf-6c together). **Deliverables:** `compute_readiness_calibrated` in `scripts/master-report/eri_calibration.py` — 3-feature OLS calibration (accuracy, coverage, retention + intercept; `consistency` dropped per REQ-HF6b-7 due to structural multicollinearity with rolling-window formula); 18 pytest cases GREEN (R²≈0.7649, max_abs≈9.60 under Option 5 criterion R²>0.70 OR max-abs<12.0); Split=B (callable-only, not wired into `compute_all`); byte-identity 421-469 lock on legacy `compute_readiness` held against hf-6a baseline `b1584f3`. **Wave C (T5/T6/T7 — HTML surface + wire-in + legacy delete) deferred to hf-6c by design** — both hf-6a locks release atomically at hf-6c T6+T7. **Invariants at phase close:** Split=B held; byte-identity 421-469 held; G1 docstring bias preserved; G2 commit-body citations present on Commits C (`d1e97e0`) + E (`73c0240`); pytest 18/18 GREEN re-verified pre-push.
**branch:** phase-1-stats-cleanup

> **HEAD omitted by policy** — use `git rev-parse HEAD` live when needed.
> Rationale: captured SHAs drift after amends/rebases (prior hf-6a pre-amend bug);
> live lookup is authoritative and zero-drift.

---

## Citations policy

Function/block references in `.planning/` docs cite **name**, not line number.
Line numbers and SHAs are advisory — may drift without constituting a spec error.
Verify live via `grep` or `git rev-parse HEAD` before acting on any specific value.

Rationale: as code evolves, line numbers shift and SHAs change on amend. Chasing
them in docs creates churn without improving correctness. Semantic claims (range
locks, byte-identity invariants, scope boundaries, contract shapes) are
load-bearing; line numbers and SHAs are not.

---

## Active checkpoints (hf-6b)

- **CP0 — ✅ complete** (2026-04-23). Bootstrap: REQ-HF6b-1..5 appended to
  REQUIREMENTS.md; CP-STATE.md created under `.planning/phases/hf-6b/`;
  two design decisions adjudicated and approved by user:
  (a) `fit_quality` flag surfaces as USER-VISIBLE HTML text (Law 1 anchor —
  flag-never-displayed IS silent fallback); internal flag values stay English
  literals `{"calibrated", "insufficient_history", "poor_fit"}`, visible HTML
  language at executor's discretion.
  (b) HEAD SHA line removed from STATE.md; citations policy extended to cover
  SHAs (use `git rev-parse HEAD` live).
  Data-leakage risk (FSRS look-ahead bias in retention reconstruction) flagged
  in REQUIREMENTS.md "Not-a-REQ" section — deferred to CP2 brainstorm.
- **CP1 — ✅ complete** (2026-04-23). PLAN.md written by `gsd-planner` (1
  iteration, 871 lines, 7 tasks T1..T7 across 3 waves); `gsd-plan-checker`
  verdict PASS-WITH-NOTES; advisor verdict PASS. Wave A: T1/T2/T3 RED tests
  (parallel). Wave B: T4 GREEN implementation. Wave C: T5→T6→T7 (serial,
  single push window) — releases BOTH hf-6a locks atomically (Split=B +
  byte-identity 421-469). REQ-HF6b-1..5 coverage map complete. **O-1
  resolved as (c) document-and-accept** (FSRS look-ahead bias in retention
  reconstruction — out of hotfix scope; guardrails: T4 docstring states
  bias direction; T4 commit body cites disposition). **O-2 no-change**
  (2-arg signature confirmed). Committed `15f84c3`.
- **CP2 — ✅ complete** (2026-04-23). Three RED commits on `phase-1-stats-cleanup`:
  `aa33a82` (T3, synthetic weight recovery ±0.05), `7c06979` (T2, HF.3 boundary +
  silent-fallback-token scan), `dde6002` (T1, fit_quality branches + dict-shape
  contract). Appended 10 hf-6b test functions + 2 helpers (`_build_n_day_history`,
  `_build_linear_history`) to `scripts/master-report/tests/test_eri_calibration.py`.
  pytest fails at collection with `ImportError: cannot import name
  'compute_readiness_calibrated'` — expected RED. All four lock/gate invariants
  independently verified by advisor: symbol absent, Split=B held, byte-identity
  421-469 held, pytest non-zero. Three-commit structure chosen for `git bisect`
  granularity. No deviations from PLAN.md.
- **CP3 — ✅ complete** (2026-04-23, CLOSED post-Option-5 at HEAD `3125b78`).
  **Final outcome:** Commits A..F + state-sync `3125b78` all on `phase-1-stats-cleanup`;
  pytest 18/18 GREEN under Option 5 criterion (R²>0.70 OR max-abs<12.0; observed
  R²≈0.7649, max_abs≈9.60); all four lock/gate invariants re-verified (Split=B,
  byte-identity 421-469, G1, G2). The "Pending execution (fresh work-window
  required)" block below is preserved as historical audit trail — E' was landed as
  Commit E (`73c0240`) + F as Commit F (`480d76b`) in a fresh window on 2026-04-23.
  Execution history across three dispositions (historical record):
  - **v1 (β2 + α fallback):** Commits `5be6d03` + `0af734a`. PRIMARY features
    fit (|diff| < 0.09) but consistency −0.257 and intercept +0.343 failed even
    at widened ±0.20 tolerance. Diagnosis: cumulative-stdev consistency formula
    stabilizes → near-constant → coefficient mass shifts to intercept.
  - **v2 (C+ rolling-window + safety net per REQ-HF6b-6):** Commits `f8adbf7` +
    `0f8bfd8`. Commit 3 tolerance-tightening applied to working tree, pytest
    showed 3 FAILs: [F1] `test_branch_poor_fit` now `"calibrated"` on random
    data; [F2] PRIMARY features collapsed (acc |diff|=0.199, cov |diff|=0.206);
    [F3] safety-net bypassed (OLS assigned spurious −0.243 to consistency via
    accuracy↔consistency collinearity). Commit 3 reverted pre-commit (no orphan
    edits). Root cause: rolling-window `consistency = 1 − stdev(accuracies[−W:])/0.5`
    contains today's accuracy **by construction** → instantaneous multicollinearity
    independent of window size. Primary-feature fail at 0.05 is terminal per
    Risk v3 — `_CONSISTENCY_WINDOW=5` retry NOT authorized for this failure
    mode. Invariants preserved throughout: Split=B + byte-identity 421-469 +
    G1/G2 + REQ-HF6a-1 all held.
  - **v3 (Option (a) — 3-feature model, drop consistency from OLS):**
    Commits **A=`3e27eaf`** (revert Commit 5 `f8adbf7`), **B=`71df35d`** (revert
    Commit 6 `0f8bfd8`), **C=`d1e97e0`** (append `compute_readiness_calibrated`
    with 3-feature design matrix `[acc, cov, ret, 1.0]` → 4 coefficients, hardcode
    `weights["consistency"] = 0.0` for ABI stability), **D=`57d5811`**
    (REQUIREMENTS.md: REQ-HF6b-6 flagged `⚠️ DRAFTED AND WITHDRAWN` per D-α
    retracted-on-arrival pattern + REQ-HF6b-7 appended superseding it;
    hf-6a VERIFICATION.md pointer rephrased to "superseded in hf-6b by
    REQ-HF6b-7 (3-feature OLS model); REQ-HF6b-6 drafted but withdrawn on
    arrival per CP3 HARD STOP v3 Option (a)"). All 4 commits
    **independently verified** by advisor via `git show` + full-diff
    inspection: Commit C's 3-feature unpack matches spec (`coef[0..2]` for
    acc/cov/ret; `coef[3]` for intercept; `weights["consistency"] = 0.0`
    hardcoded); G1 docstring retained + enhanced with REQ-HF6b-7 rationale;
    G2 citation present in Commit C body. Working tree:
    `test_eri_calibration.py` edits (uncommitted E draft — `_build_linear_history`
    drops consistency term; `test_branch_calibrated`/`boundary_n_minus_1` drop
    `consistency: 0.1` from planted dicts; `test_recovers_planted_weights`
    restored to PRIMARY_TOL=0.05 with 3-feature planted `{acc:0.30, cov:0.20,
    ret:0.40}`).

  **pytest result (with uncommitted E applied):** 17 passed, 1 FAIL on
  `test_recovers_planted_weights_within_tolerance`:
  - fitted accuracy = 0.6714 (planted 0.30, |diff| = 0.37)
  - fitted retention = −0.0117 (planted 0.40, |diff| = 0.41)
  - fitted coverage = 0.1932 (planted 0.20, |diff| = 0.007 ✅)
  - fitted intercept = 0.141 (planted 0.10, |diff| = 0.041 ✅)
  - `w_acc + w_ret` = 0.660 (planted 0.700) — **sum preserved** along
    correlation manifold
  - R² > 0.99 → `fit_quality == "calibrated"` ✅

  **Root cause — structural collinearity, NOT a code bug:** In
  `_build_linear_history`, `retention` is reconstructed via FSRS-like formulas
  where **correct answers extend review intervals**. This creates a latent
  coupling: `retention(day) ≈ f(cumulative_accuracy(day))`. Pre-Commit C,
  consistency absorbed much of this correlation; dropping consistency exposed
  the pre-existing accuracy↔retention coupling. This is a **textbook OLS
  identifiability failure under structural multicollinearity**: when features
  are correlated by construction, only linear combinations are identified
  (here: the sum `w_acc + w_ret`), never individual coefficients.
  Tightening tolerance will always fail; loosening tolerance yields a
  cosmetic pass that masks the unsolvable math.

  **Advisor disposition — Option 5 (user-approved "מאשר הכל" 2026-04-23):**
  Redefine REQ-HF6b-2 acceptance criterion from **coefficient recovery
  (±tol on each fitted weight)** to **R² / prediction accuracy (readiness
  predictions agree with synthetic ground truth within tolerance)**.
  Rationale:
  - **Mathematical:** OLS on correlated features cannot recover individual
    coefficients — only predictions are identifiable. Enforcing coefficient
    recovery is enforcing the unachievable.
  - **Application semantics:** Consumers of `compute_readiness_calibrated`
    use the `readiness` scalar (0-100), not individual weights. Prediction
    accuracy is the true acceptance criterion.
  - **REQ-HF6b-7 alignment:** REQ-HF6b-7 already declares weights
    non-interpretable in the 3-feature model; REQ-HF6b-2 should be harmonized
    with that stance.
  - **Scope containment:** No algorithm change, no feature-set change, no
    further CP3 dispositional escalation needed.

  **Pending execution (fresh work-window required):**
  - **E' (rewritten test):** `git checkout HEAD -- scripts/master-report/tests/test_eri_calibration.py`
    to discard current draft; rewrite `test_recovers_planted_weights_within_tolerance`
    (consider rename to `test_predictions_match_planted_within_tolerance`) to
    verify R² threshold OR max prediction-error across N days, NOT per-feature
    coefficient diffs. Keep 3-feature planted dict. Commit message cites
    Option 5 ruling.
  - **F (REQUIREMENTS.md):** Amend REQ-HF6b-2 acceptance criterion (from
    coefficient recovery to R²/prediction accuracy); clarify REQ-HF6b-7 note
    on non-interpretable weights; commit cites Option 5.
  - **pytest:** 18/18 GREEN after E' + F.
  - **CP3 CLOSE:** advisor final verdict on all invariants + transition to CP4.

  **Why fresh window:** work-window 6/10 compactions within-CP3 at time of
  CP3 v3 close; advisor ~3+/10. Pushing work-window further risks hitting
  hard-10 mid-execution. User explicitly flagged this concern (direct quote:
  "תוך כדי המשימה הוא עשה כבר פעמיי COMPACT, נראה לי לא היה חכם לתת לו
  לבצע משימה בסדר גודל הזה לפני חלון חדש") — protocol v2.2 candidate rule:
  "execution itself adds compactions at ~1 unit/commit; size work accordingly."

  **Invariants (verified at current HEAD `57d5811`):**
  - Split=B held: `grep "compute_readiness_calibrated\|from eri_calibration"
    scripts/master-report/generate_report.py` → 0 matches
  - Byte-identity 421-469 held: `git diff b1584f3..HEAD --
    scripts/master-report/generate_report.py` → 0 lines
  - G1 docstring bias statement preserved + extended with REQ-HF6b-7 rationale
  - G2 commit body citation of O-1 disposition present on Commit C
  - REQ-HF6a-1 (`consistency ∈ [0, 1]`) held: `_clip` still applied in
    `build_daily_snapshots`
- **CP4 — ✅ complete** (2026-04-23, PASS at HEAD `37cb763`). Code-review
  audit on `compute_readiness_calibrated` in
  `scripts/master-report/eri_calibration.py`. Four criteria verified:
  - **(a) Raise-vs-fallback boundary:** PASS. Every error path raises
    labeled `ValueError` with HF.3 token prefix (`"insufficient_history:"`,
    `"poor_fit:"`, plus propagated `ValueError` from `build_daily_snapshots`
    for None / bad-dict / empty-rows / <2-days). Happy path returns dict with
    `fit_quality ∈ {"calibrated","insufficient_history","poor_fit"}`.
    `_clip(x)` helper (three returns) correctly classified as non-boundary
    per HF.3 — pure float-clamp, not error paths. Constants
    (`_MIN_PAIRS_FOR_REGRESSION=3`, `_MIN_PAIRS_FOR_CALIBRATION=14`,
    `_MIN_R_SQUARED=0.3`, `V2_FALLBACK_WEIGHTS`) match REQ-HF6b-7 3-feature
    model; `weights["consistency"] = 0.0` hardcoded for ABI stability per
    CP3 Commit C (`d1e97e0`).
  - **(b) No-silent-fallback grep scan:** PASS.
    `grep -rn "return V2_FALLBACK_WEIGHTS" scripts/master-report/eri_calibration.py`
    → 0 matches (no naked fallbacks).
    `grep -rn "except.*:\s*return" scripts/master-report/eri_calibration.py`
    → 0 matches (no silent exception swallowing). Every path out of
    `compute_readiness_calibrated` either raises or returns a dict with
    labeled `fit_quality` — HF.3 invariant intact.
  - **(c) Split=B byte-identity re-check:** PASS. (c.1)
    `grep -n "build_daily_snapshots\|compute_readiness_calibrated\|eri_calibration"
    scripts/master-report/generate_report.py` → 0 matches (callable-only lock
    held). (c.2) `git diff b1584f3..HEAD -- scripts/master-report/generate_report.py`
    inspected for 421-469 region → 0 changes (byte-identity vs hf-6a baseline
    held; lock active until hf-6c Wave C T7). (c.3) AST walker on
    `eri_calibration.py` module-level statements → 0 import-time side effects
    (all executable code inside function bodies or dataclass decorators).
  - **(d) Verdict:** PASS. All 4 criteria clean. No REQ-HF6b-8 needed.
    Advance to CP5.

  **Cosmetic drift noted (non-blocking per `feedback_cosmetic_vs_semantic`):**
  CP4 resume instruction referenced path `b1584f3:scripts/master-report/eri_calibration.py`
  for byte-identity baseline, but that file did not exist at `b1584f3` (created
  mid-hf-6b in Commit C `d1e97e0`). Byte-identity intent was against
  `compute_readiness` in `generate_report.py` (the 421-469 block locked in
  hf-6a). Scope intent verified against the correct file; no semantic block.

  **Invariants re-verified at `37cb763` (HEAD at CP4 entry):**
  - Split=B held: grep 0 matches on generate_report.py
  - Byte-identity 421-469 held: diff 0 lines vs b1584f3
  - G1 docstring bias statement present in `eri_calibration.py`
  - G2 commit body citations present on Commit C (`d1e97e0`) and Commit E (`73c0240`)
  - pytest 18/18 GREEN re-confirmed via `python3 -m pytest
    scripts/master-report/tests/test_eri_calibration.py -v`

  **Per-CP reset:** `compactions_within_cp` held at 0 (CP4 ran within fresh
  window budget; no compaction triggered during audit).

## Recently completed phases

- **hf-6a — ✅ complete** (HEAD `639ea3b` at time of CP4 close; verify live).
  CP0-CP4 all PASS. `build_daily_snapshots` + `DailySnapshot` landed as
  Split=B (callable-only, not wired into `compute_all`). Byte-identity lock
  on `compute_readiness` active until hf-6b explicit deprecation. CP5/CP6
  deferred to end of hf-6c (merge-gate runs once for all three phases).
  See `.planning/phases/hf-6a/VERIFICATION.md` for 6 proofs.

## Completed phases (pre-GSD)

- hf-1 through hf-5b — merged git history (`c875c2c..b1584f3`). Not tracked
  in ROADMAP by design.

## Next action

**hf-6c CP0 — bootstrap next phase.** hf-6b is phase-complete; next action
sits with hf-6c. See Cross-phase handshake block below for scope + locks
that release on arrival.

---

## Cross-phase handshake to hf-6c

hf-6b closes scope-contained. **Wave C (T5/T6/T7) — HTML surface + wire-in +
legacy delete — is deferred to hf-6c by design.** hf-6c is expected to break
both hf-6a locks in a single atomic push window.

### Lock releases expected in hf-6c

- **Split=B lock release (hf-6c T6):** wire `compute_readiness_calibrated`
  into `compute_all` (or equivalent caller in `generate_report.py`).
  Immediately before the T6 commit, `grep compute_readiness_calibrated
  scripts/master-report/generate_report.py` will transition from **0 matches
  (current)** to **≥1 match**. This is expected and correct — the Split=B
  lock exists precisely to defer wire-in from hf-6b to hf-6c.
- **Byte-identity 421-469 lock release (hf-6c T7):** delete the legacy
  `compute_readiness` function from `generate_report.py`. `git diff
  b1584f3..HEAD -- scripts/master-report/generate_report.py` for lines
  421-469 will transition from **0 lines (current)** to the full deletion
  diff. T7 MUST land atomically with T5+T6 — partial state (new function
  wired but legacy still present, or legacy deleted but new function not
  wired) is forbidden.
- **Wave C serial push window:** T5 → T6 → T7 land as a single push window
  (all three commits staged, tested, pushed together). Between pushes is
  NOT a valid checkpoint — the repo must be self-consistent before any
  push reaches `origin/phase-1-stats-cleanup`.

### Invariants that remain authoritative in hf-6c

- **Option 5 REQ-HF6b-2 criterion** (R² > 0.70 OR max-abs < 12.0 on [0,100]
  readiness scale). Test lives in
  `scripts/master-report/tests/test_eri_calibration.py::test_predictions_match_planted_within_tolerance`
  and continues to run once wire-in happens. Observed at hf-6b close:
  R²≈0.7649, max_abs≈9.60.
- **REQ-HF6b-7 note:** 3-feature OLS model. `consistency` dropped from
  regression (coefficient hardcoded to 0.0 for ABI stability). Coefficients
  are non-interpretable by spec due to structural collinearity (FSRS
  retention reconstruction couples retention to cumulative accuracy);
  predictions are the acceptance criterion. hf-6c HTML surface (T5) must
  surface `fit_quality ∈ {"calibrated","insufficient_history","poor_fit"}`
  as user-visible text per CP0 Design Decision 2 (flag-never-displayed IS
  silent fallback per Law 1 extension).
- **HF.3 no-silent-fallback:** every error path in
  `compute_readiness_calibrated` raises labeled `ValueError` with HF.3
  token prefix. Wiring into `compute_all` must preserve this — caller must
  either let the `ValueError` propagate (for genuinely unrecoverable
  states) or catch it and surface a labeled fallback in the HTML output
  (not a silent defaults-dict).

### Merge-gate schedule

Phase-level merge-gate (CP6-equivalent) is **deferred to end of hf-6c per
hf-6a precedent** — runs once for all three phases (hf-6a + hf-6b + hf-6c)
together. hf-6c CP6 is the single merge-gate for the entire stats-cleanup
stack.

### Entry point for hf-6c

Read (in this order):
1. This STATE.md (current phase + handshake).
2. `.planning/phases/hf-6b/CP-STATE.md` CP5 CLOSE event (detailed wrap-up).
3. `.planning/phases/hf-6a/VERIFICATION.md` (hf-6a proofs, especially the
   lock declarations).
4. `.planning/REQUIREMENTS.md` REQ-HF6b-1..7 (including the WITHDRAWN
   REQ-HF6b-6 audit block — intentional for audit trail).

`.planning/phases/hf-6c/` directory does NOT exist yet — hf-6c CP0 will
create it (REQUIREMENTS extension + PLAN.md + CP-STATE.md scaffolding).
Branch `phase-1-stats-cleanup` continues to be the working branch.

### Auto-memory anchor

Emergency recovery state snapshot at
`~/.claude/projects/-Users-idankatz15-Desktop-3-APP-DEV-repo-temp/memory/project_hf6b_state_sync.md`
— read in fresh hf-6c windows to recover hf-6b close state (branch SHAs,
pytest counts, invariant status) without re-reading full planning docs.
