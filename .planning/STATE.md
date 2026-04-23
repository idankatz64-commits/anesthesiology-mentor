# GSD State

**as-of:** 2026-04-23
**current_phase:** hf-6b
**status:** CP3 Option (a) — Commits A-D landed clean (A=`3e27eaf` revert-Commit5, B=`71df35d` revert-Commit6, C=`d1e97e0` 3-feature OLS, D=`57d5811` REQ-HF6b-6 withdrawn + REQ-HF6b-7 appended + hf-6a VERIFICATION.md pointer). All invariants verified independently by advisor: Split=B held (grep `compute_readiness_calibrated` in `generate_report.py` → 0 matches); byte-identity 421-469 held (`diff b1584f3..HEAD -- generate_report.py` → 0 lines); G1 (docstring bias note on look-ahead) preserved; G2 (commit body cites O-1 disposition) preserved on Commit C. **pytest (uncommitted E applied):** 17/18 PASS, 1 FAIL on `test_recovers_planted_weights_within_tolerance` at PRIMARY_TOL=0.05. Diagnostic: fitted accuracy=0.6714 vs planted 0.30 (|diff|=0.37); fitted retention=−0.0117 vs planted 0.40 (|diff|=0.41); sum `w_acc + w_ret` preserved along correlation manifold; R² passes (branch = `"calibrated"`). **Root cause (structural, advisor-verified):** latent accuracy↔retention collinearity in fixture — FSRS-like retention reconstruction in `_build_linear_history` tracks accuracy because correct answers extend intervals. Collinearity was masked pre-C by consistency absorbing mass; dropping consistency exposed the pre-existing coupling. Coefficient recovery at ±0.05 mathematically unachievable under correlated features (textbook OLS identifiability: only `w_acc + w_ret` identified, individual weights rotationally ambiguous). **Disposition — Option 5 (ruled 2026-04-23, user-approved "מאשר הכל"):** redefine REQ-HF6b-2 acceptance criterion from **coefficient recovery** to **R² / prediction accuracy**. Rationale: coefficients are not individually identifiable under structural collinearity; application semantics care about readiness predictions, not per-feature weights; REQ-HF6b-7 (3-feature OLS) already declares weights non-interpretable. E (uncommitted draft enforcing PRIMARY_TOL=0.05 on coefficients) must be RESET and REWRITTEN, not committed. **Next (fresh work-window):** E' (rewritten test — R² or prediction-accuracy check per Option 5) + F (REQUIREMENTS.md REQ-HF6b-2 amendment + REQ-HF6b-7 clarification on non-interpretable weights) → pytest PASS → CP3 CLOSE → CP4 (code-review).
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
- **CP3 — ⏳ in progress (PARTIAL PASS; E+F pending fresh window).**
  Execution history across three dispositions:
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

**Wrap-up → fresh work-window → E' + F → CP3 CLOSE → CP4.**

At session resume:
1. **Fresh work-window** (new terminal, fresh context) receives handoff block
   citing HEAD `57d5811`, Option 5 ruling, and the two remaining tasks.
2. **Work-window executes:**
   - `git checkout HEAD -- scripts/master-report/tests/test_eri_calibration.py`
     (discard current E draft enforcing PRIMARY_TOL=0.05 on coefficients)
   - **Commit E':** Rewrite `test_recovers_planted_weights_within_tolerance`
     to check R² threshold (e.g., R² > 0.95) OR prediction-error tolerance
     (e.g., `|predicted_readiness − ground_truth| < 5.0` across N days).
     Keep 3-feature planted dict `{accuracy: 0.30, coverage: 0.20,
     retention: 0.40}`. Commit message: `test(hf-6b): R²/prediction-accuracy
     criterion (CP3 Option 5)`. Body: "Per CP3 HARD STOP v3 Option 5
     disposition — coefficient recovery mathematically unachievable under
     structural accuracy↔retention collinearity; acceptance redefined to
     prediction-level agreement."
   - **Commit F:** Amend `.planning/REQUIREMENTS.md`:
     - REQ-HF6b-2 acceptance clause: replace "fitted weights recovered within
       ±0.05" with "R² > 0.95 OR max-abs prediction error < 5.0 across N days
       of synthetic ground-truth data".
     - REQ-HF6b-7 clarification note: "3-feature OLS weights are NOT
       individually interpretable under residual accuracy↔retention
       collinearity; readiness predictions ARE identifiable and are the
       basis of verification."
     Commit message: `docs(hf-6b): REQ-HF6b-2 acceptance — R²/prediction
     accuracy (CP3 Option 5)`. Body cites same disposition + links E'.
   - **pytest:** `pytest scripts/master-report/tests/test_eri_calibration.py -q`
     → 18 passed (or 17 passed if test renamed, keep count accurate).
3. **Work-window paste-back to advisor:** 4 git-show-stats + pytest output +
   grep/diff invariant re-verification.
4. **Advisor CP3 close:** final verdict, CP3→CP4 transition, CP-STATE.md event
   appended, STATE.md rewritten.
5. **Push reminder to user:** Local branch has 15+ unpushed commits. Prompt
   about `git push` after CP3 CLOSE (per CLAUDE.md git workflow).

**CP3 CLOSE gate (all must hold):** Commits E' + F landed on
`phase-1-stats-cleanup`; pytest all tests GREEN under Option 5 criterion;
Split=B held; byte-identity 421-469 held; G1/G2 preserved through E' + F;
REQUIREMENTS.md REQ-HF6b-2 amendment + REQ-HF6b-7 clarification present in F
diff; CP-STATE.md event appended with CP3 CLOSE disposition.

**Risk clause:** If E' still shows R² < 0.95 or max prediction error > 5.0,
STOP — this would indicate fixture or algorithm defect NOT covered by
Option 5, requiring new advisor disposition. Do NOT loosen the R² threshold
without paste-back diagnostics (R², max err, per-day predicted vs ground
truth for 3 worst days).
