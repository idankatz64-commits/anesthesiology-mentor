# Requirements — Hotfix Track

**as-of:** 2026-04-23
**active phase:** hf-6b
**source:** `~/.claude/plans/wondrous-popping-sunrise.md` §HF.6 (lines 122-130)

REQ-IDs for hf-6a remain documented below (phase complete, data contract
frozen — `build_daily_snapshots` + `DailySnapshot` landed as Split=B).
REQ-HF6b-* appended below after hf-6a closes; hf-6c REQs will follow after
hf-6b merges.

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
- Each component is a float in `[0, 1]` (range locked at CP1 per PLAN.md).

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

---

## hf-6b — ERI calibration — OLS regression

Consumer of hf-6a's `build_daily_snapshots` + `DailySnapshot` contract.
Replaces the legacy `compute_readiness` in `compute_all` (deprecate-then-delete
per HF.5b precedent). Surfaces a `fit_quality` flag to the HTML so the user
can tell a calibrated score from a fallback score.

### REQ-HF6b-1 — `compute_readiness_calibrated` function signature

**Goal.** Implement `compute_readiness_calibrated(history, components) →
{readiness, weights, fit_quality}` in `scripts/master-report/eri_calibration.py`.
Consumes the output of `build_daily_snapshots` (REQ-HF6a-1).

**Source.** `~/.claude/plans/wondrous-popping-sunrise.md` lines 122-123:
> "New function `compute_readiness_calibrated(history, components) →
> {readiness, weights, fit_quality}`"

**Acceptance criteria.**
- Function is a top-level callable in `eri_calibration.py` with a typed
  signature.
- Return value is a dict with exactly three keys:
  - `readiness: float` in the closed interval `[0.0, 100.0]` (per wondrous
    line 128: `Readiness = w·components · 100, clipped [0, 100]`).
  - `weights: dict[str, float]` with keys
    `{accuracy, coverage, retention, consistency, intercept}` holding the
    fitted (or fallback) coefficients.
  - `fit_quality: str` in the closed set
    `{"calibrated", "insufficient_history", "poor_fit"}`.
- Dict keys and `fit_quality` values remain English string literals (machine
  contract; matches wondrous spec verbatim).

---

### REQ-HF6b-2 — OLS fit contract

> **⚠️ SUPERSEDED in part by REQ-HF6b-7 (2026-04-23, CP3 disposition).**
> The `w_cons·consistency` term in the Goal formula below is historical.
> Production is a **3-feature OLS** (accuracy, coverage, retention + intercept);
> `weights["consistency"]` is hardcoded to `0.0` for ABI stability.
> Acceptance criterion was also amended per Option 5 (prediction accuracy, not
> coefficient recovery) — see the "Note (2026-04-23, Option 5 disposition)" block
> below and REQ-HF6b-7 for the current contract.

**Goal.** When data is sufficient (n ≥ 14 days AND resulting R² ≥ 0.3), fit
OLS regression `y = w_acc·accuracy + w_cov·coverage + w_ret·retention +
w_cons·consistency + intercept`, where y is next-day accuracy.

**Source.** wondrous lines 125-126:
> "Use the subsequent-day accuracy as the target y"
> "Fit OLS: y = w_acc·accuracy + w_cov·coverage + w_ret·retention +
> w_cons·consistency + intercept"

**Acceptance criteria.**
- Feature matrix X: rows are days from `build_daily_snapshots` output
  (length N = number of distinct days in history).
- Target y: next-day accuracy. Last day has no next day → excluded from
  training (so effective training rows = N - 1).
- OLS solved with a standard library (numpy.linalg.lstsq or statsmodels);
  executor's choice documented in PLAN.md T-task.
- Intercept term included (column of 1s in X, or library-handled intercept).
- When fit succeeds (N - 1 ≥ 14 AND R² ≥ 0.3): `fit_quality="calibrated"`,
  `weights` = fitted coefficients.
- Test (per wondrous line 130, amended 2026-04-23 per CP3 Option 5
  disposition): under planted linear synthetic data with tight per-answer
  noise, the fitted 3-feature OLS model predicts next-day accuracy within
  tolerance: **R² > 0.70 OR max-abs error < 12.0 on the [0,100] readiness
  scale** (thresholds account for daily-accuracy quantization at
  1/n_per_day).

> **Note (2026-04-23, Option 5 disposition).** Original per-feature
> coefficient-recovery criterion was dropped — structural multicollinearity
> in the fixture (accuracy/coverage/retention all grow monotonically)
> creates an equivalence class of OLS solutions, so coefficient recovery
> is not identifiable. Prediction accuracy on observed targets is the
> sound empirical criterion.

---

### REQ-HF6b-3 — Fallback + `fit_quality` HTML surfacing (Law 1 anchor)

**Goal.** When data is insufficient (N - 1 < 14) or the fit is poor
(R² < 0.3), fall back to v2 weights
`{accuracy: 0.25, coverage: 0.25, retention: 0.30, consistency: 0.20,
intercept: 0.0}` AND surface the `fit_quality` flag as **user-visible text**
in the rendered HTML.

**Source.** wondrous line 127:
> "If R² < 0.3 or n < 14 days: fall back to v2 weights `{0.25, 0.25, 0.30,
> 0.20}` with a `fit_quality='insufficient_history'` flag the HTML can
> surface"

**Law 1 extension (authoritative interpretation for this REQ).** A flag never
displayed IS a silent fallback. The phrase "HTML can surface" is interpreted
STRICTLY: the flag MUST appear as text the user actually sees on the rendered
HTML when `fit_quality ≠ "calibrated"`. A flag that sits in the payload dict
but is never rendered does not satisfy this REQ.

**Acceptance criteria.**
- When N - 1 < 14: `fit_quality="insufficient_history"`, weights = v2
  defaults (above), readiness computed with those weights.
- When N - 1 ≥ 14 AND R² < 0.3: `fit_quality="poor_fit"`, weights = v2
  defaults, readiness computed with those weights.
- When N - 1 ≥ 14 AND R² ≥ 0.3: `fit_quality="calibrated"`, weights = OLS
  fit (from REQ-HF6b-2).
- HTML template (in `generate_html` or its dedicated section) includes a
  visible element — badge, banner, tooltip, or inline text — that renders a
  user-facing message when `fit_quality ≠ "calibrated"`. Hidden HTML
  comments, `display:none` styles, or `data-*` attributes that are not
  rendered do NOT satisfy this REQ.
- **Language of the user-facing message:** executor's choice — Hebrew OR
  English. Hebrew preferred to match the Hebrew-first UI of YouShellNotPass;
  English acceptable. Internal `fit_quality` string values remain English
  literals (see REQ-HF6b-1).
- Integration test (integration-checker at CP6): with a synthetic 5-day
  history (N - 1 = 4, triggers `insufficient_history`), the rendered HTML
  output must contain the user-visible warning text (verifiable by grep on
  the rendered HTML string).

---

### REQ-HF6b-4 — Wire-in to `compute_all` + delete legacy `compute_readiness`

**Goal.** Replace the legacy `compute_readiness` call in `compute_all`
(`scripts/master-report/generate_report.py`, called at the readiness
computation site) with `compute_readiness_calibrated`. Delete the legacy
`compute_readiness` function per the deprecate-then-delete precedent
established by HF.5b (`compute_ebbinghaus` → `compute_decay_from_srs` at
commit `b1584f3`).

**Source.** wondrous §HF.6 (implied by "new function" replacing existing
readiness computation) + HF.5b deprecate-then-delete precedent.

**Acceptance criteria.**
- `grep -n "def compute_readiness(" scripts/master-report/generate_report.py`
  returns 0 matches (legacy function removed).
- `grep -n "compute_readiness_calibrated\|eri_calibration" scripts/master-report/generate_report.py`
  returns ≥ 1 match (wire-in present — Split=B lifted to Split=A).
- `compute_all` calls `compute_readiness_calibrated` exactly once per report
  run; its return dict is threaded into the HTML template (REQ-HF6b-3
  surfacing).
- Legacy test file `scripts/master-report/tests/test_compute_readiness.py` is
  NOT left testing a function that no longer exists. Either: (a) deleted
  entirely, or (b) refactored to exercise `compute_readiness_calibrated`
  with equivalent coverage. Executor's call, recorded in PLAN.md.
- `gsd-integration-checker` verdict PASS on the wire-up (Law 1 extension:
  module-never-called IS a silent fallback; wire-up must be real).

---

### REQ-HF6b-5 — HF.3 invariant (no silent OLS degradation)

**Goal.** OLS with N - 1 < 3 (regression mathematically undefined — fewer
equations than unknowns for a 5-coefficient fit) MUST raise explicitly. It
must not return NaN, zeros, or a shrug. Labeled fallback (REQ-HF6b-3) is
allowed ONLY in the documented band (N - 1 ∈ [3..13] → `insufficient_history`;
N - 1 ≥ 14 AND R² < 0.3 → `poor_fit`).

**Source.** HF.3 hard rule (commit `3236022`: "no silent fallbacks") +
`~/.claude/plans/hf6-advisor-handoff.md` §4 red flag row ("OLS with n < 3 →
NaN silent path → HF.3 violation").

**Acceptance criteria.**
- Explicit test: history producing N - 1 ∈ {0, 1, 2} raises `ValueError`
  with a message naming the insufficient-data reason. Parametrize over the
  three cases.
- Explicit test: N - 1 ∈ [3..13] returns a dict with
  `fit_quality="insufficient_history"` and weights = v2 defaults (does NOT
  raise — labeled fallback is allowed, silent fallback is not).
- `grep -n "try:" scripts/master-report/eri_calibration.py`: any `try:` is
  paired with an explicit `raise` in its `except` branch; no bare `pass`,
  no `np.nan_to_num(...)` that hides a failed fit as zeros, no `return {}`
  on the error path.
- Code review at CP4 explicitly confirms the raise-vs-fallback boundaries.

---

### REQ-HF6b-6 — Consistency feature redesign

**Status: ⚠️ DRAFTED AND WITHDRAWN (never in HEAD until this commit, where
it lands as withdrawn-on-arrival for audit trail).**

**Withdrawal rationale:** CP3 HARD STOP v3 Option (a) terminal disposition.
Rolling-window consistency = 1 − stdev(accuracies[−W:])/0.5 produces structural
multicollinearity with accuracy feature — the stdev is computed FROM accuracies,
so today's accuracy appears in both X-matrix column 0 (accuracy) and X-matrix
column 3 (consistency) of the same row. No window size W ≥ 2 resolves this.
See REQ-HF6b-7 for replacement.

**Original draft body (preserved for audit):**

**Goal.** Redefine `consistency` in `build_daily_snapshots` (hf-6a code
file, hf-6b semantic change) from cumulative-history stdev to rolling
7-day window stdev. Add a vanishing-coefficient safety net in
`compute_readiness_calibrated` that downgrades `fit_quality` to
`"poor_fit"` (with V2 fallback weights) when the fitted OLS coefficient
on `consistency` has `|coef| < 0.05` — the empirical threshold below
which the feature is under-identified.

**Source.** CP3 HARD STOP v2 root-cause analysis (advisor-window,
2026-04-23). Cumulative stdev converges to an asymptote after ~10 days,
leaving `consistency` near-constant (7pp post-warmup plateau in the
weight-recovery fixture; equivalent stabilization expected on real
user histories). OLS cannot identify coefficients on near-constant
features — they collapse into a single degree of freedom with the
intercept. Option C+ ruling (user-approved 2026-04-23 after cost
analysis vs Options A/B): fix the feature definition AND add a
safety net, per user's defense-in-depth preference over buried latent
bugs. Record: `.planning/phases/hf-6b/CP-STATE.md` CP3 HARD STOP v2
disposition entry.

**Supersession.** This REQ supersedes the `consistency` formula
documented in hf-6a REQ-HF6a-1 acceptance criteria. hf-6a's
`test_build_daily_snapshots_shape_and_values` explicitly treated
`consistency` as a placeholder (lines 126-130 asserted range only,
with the inline comment `"placeholder formulas; hf-6b will swap"`),
so this is the deferred completion of the originally-anticipated
swap — not a formal hf-6a re-open. hf-6a `VERIFICATION.md` carries a
pointer note. `DailySnapshot.consistency: float ∈ [0, 1]` data
contract unchanged.

**Acceptance criteria.**
- `_CONSISTENCY_WINDOW: int = 7` exists as a module-level constant in
  `scripts/master-report/eri_calibration.py`. Tunable without API
  churn.
- `consistency` computation slices `daily_accuracies[-_CONSISTENCY_WINDOW:]`
  before applying `statistics.stdev`. Day-0 invariant
  (`consistency = 0.0` when fewer than 2 accuracies available)
  preserved.
- `test_build_daily_snapshots_shape_and_values` continues to pass
  (range-only assertion on consistency was the only pre-existing
  constraint).
- In `compute_readiness_calibrated`, after `np.linalg.lstsq` returns
  coefficients, a vanishing-coefficient check runs: if
  `abs(float(coef[3])) < 0.05`, the calibrated branch is overridden to
  `fit_quality = "poor_fit"` with `V2_FALLBACK_WEIGHTS`. Existing
  enum values only — no contract change to `fit_quality` literals.
- Explicit test `test_vanishing_consistency_coef_downgrades_to_poor_fit`
  asserts the safety-net trigger.
- `test_recovers_planted_weights_within_tolerance` (T3 test)
  tolerances revised post-redesign: primary features
  (`accuracy`, `coverage`, `retention`) `±0.05`; derived features
  (`consistency`, `intercept`) `±0.15`. Acknowledges residual
  identifiability uncertainty on rolling-window consistency while
  tightening significantly from the CP3 fallback `±0.20` on derived
  features.

**HF.3 compliance.** The safety net is HF.3-compliant: it produces a
labeled fallback (`fit_quality = "poor_fit"`) with a named, documented
trigger condition (vanishing consistency coefficient), not a silent
degradation. A `"calibrated"` flag is never returned when the
consistency coefficient is mathematically unreliable — closes the
silent-calibrated-with-noisy-coef production risk identified during
CP3 HARD STOP v2 user review.

---

### REQ-HF6b-7 — 3-feature OLS model (supersedes REQ-HF6b-6 draft)

**REQ-HF6b-7**: OLS calibration uses 3-feature model — (accuracy, coverage,
retention) + intercept. Consistency excluded from regression due to
structural multicollinearity with accuracy (rolling-window formula
1 − stdev(accuracies[−W:])/0.5 contains accuracy as input). Consistency
remains in V2_FALLBACK_WEIGHTS for non-OLS poor_fit path. Empirical
basis: CP3 HARD STOP v3 — F2 primary-feature recovery failed at 0.05
tolerance with rolling-window consistency (acc |diff|=0.199, cov
|diff|=0.206); F3 safety-net bypassed via spurious consistency coef
≈ −0.243 absorbing collinearity.

---

### Not-a-REQ — Data leakage mitigation (CP2 brainstorm deliverable)

This is intentionally NOT a REQ. It is a modeling decision for CP2
brainstorming, to be folded into PLAN.md once adjudicated by the advisor.

**The gray area.** FSRS parameters used to reconstruct retention at day t are
calibrated on a history that includes days t+1..end; the reconstructed
retention therefore carries look-ahead bias.

**Candidate mitigations (options for CP2 brainstorm):**
- (a) Use FSRS default parameters for historical retention reconstruction
  (no per-user calibration).
- (b) Time-series cross-validation with a rolling window: for each day t,
  fit FSRS only on days 1..t-1, then reconstruct retention at t.
- (c) Document the leakage, accept it as a known bias in hf-6b, revisit in
  a later phase.

**Decision owner.** Advisor at CP2, per `~/.claude/plans/hf6b-advisor-window-prompt.md`
Advisor Cadence table. Outcome recorded in `phases/hf-6b/PLAN.md` and
referenced (by name, not line) from this REQ section.

---

## HF-6c Requirements (Wave C cutover — master-report scope only)

**Phase scope.** Wave C of the stats-cleanup stack: release both hf-6a locks
(Split=B + byte-identity 421-469) by wiring `compute_readiness_calibrated` into
the master-report pipeline and deleting the legacy `compute_readiness`. Scope
is **master-report only** (`scripts/master-report/generate_report.py`); the
live app `StatsView` is out of scope for this phase (user directive: "לא נקדים
את המאוחר").

**CP0 Design Decisions (locked 2026-04-23 with user):**
- **DD-1** — HTML location: new `<div class="kpi-subtitle">` inside the ERI
  `<div class="kpi-card">`, directly under the existing
  `<div class="kpi-value">{r['readiness']}</div>`. New row, not replacing the
  number.
- **DD-2** — Hebrew wording (clinical + R² always shown):
  - `calibrated` → `"כיול מוצלח · R²={r2:.2f}"`
  - `insufficient_history` → `"היסטוריה קצרה · R²={r2:.2f}"`
  - `poor_fit` → `"כיול חלש · R²={r2:.2f}"`

  R² is always rendered. When R² is unavailable (NaN or undefined), render as
  `R²=—` rather than omitting the token.
- **DD-3** — Fallback display: same line, amber color `#FFB020` (existing
  palette — same as the "דיוק" KPI) on both `insufficient_history` and
  `poor_fit`. Default `calibrated` keeps teal `#00D4CC`. No separate banner,
  no icon, no tooltip.
- **DD-4** — Transition mode: **CUTOVER**. No shadow mode, no feature flag,
  no A/B. T5+T6+T7 land atomically and replace the legacy pipeline in one
  push window.

---

### REQ-HF6c-1 — T5 HTML surfacing of fit_quality + R²

**REQ-HF6c-1**: Master-report HTML must surface `fit_quality` and R² as
user-visible text directly below the ERI numeric value inside the ERI
`kpi-card`.

**Acceptance criteria:**
- A new element (`<div class="kpi-subtitle">` or equivalent) appears inside
  the ERI `kpi-card` block, immediately after
  `<div class="kpi-value">{r['readiness']}</div>`.
- Text content follows the DD-2 clinical-Hebrew + R² pattern verbatim.
- Color follows DD-3: teal `#00D4CC` for `calibrated`; amber `#FFB020` for
  `insufficient_history` and `poor_fit`.
- R² is always rendered (with `—` sentinel when unavailable).
- No separate banner, no icon, no tooltip — color is the only differentiator
  between calibrated and fallback states.
- **Law 1 compliance:** flag-never-displayed IS silent fallback per hf-6b CP0
  Design Decision 2. This subtitle element is the obligation-satisfying HTML
  surface.

### REQ-HF6c-2 — T6 wire-in with labeled exception handling (Option B)

**REQ-HF6c-2**: T6 wires `compute_readiness_calibrated(history, components)`
into `compute_all` (or equivalent caller path in `generate_report.py`). The
caller must catch `ValueError` raised by the calibration and map the HF.3
token prefix to a labeled fallback surfaced via REQ-HF6c-1 — not crash the
full report, and not surface a silent default.

**Exception policy (CP0-resolved as Option B — catch + label):**
- The wired call site wraps `compute_readiness_calibrated(...)` in `try /
  except ValueError as e`.
- On `ValueError`, the caller parses the HF.3 token prefix
  (`"insufficient_history:"` / `"poor_fit:"`) from `str(e)` and sets
  `fit_quality` accordingly for the downstream HTML renderer (consumed by
  REQ-HF6c-1).
- `readiness` fallback value when `ValueError` is caught: render as `"—"`
  sentinel in the HTML `kpi-value`. Do NOT substitute a numeric default that
  could be mistaken for a calibrated value.
- R² fallback when unavailable: `"—"` rendered via REQ-HF6c-1 template
  (`R²=—`).

**Acceptance criteria:**
- `grep compute_readiness_calibrated scripts/master-report/generate_report.py`
  transitions from **0 matches (current)** to **≥1 match** after T6 lands.
- `grep "from eri_calibration" scripts/master-report/generate_report.py`
  returns ≥1 match (the import wire).
- **HF.3 compliance:** the try/except is not silent — amber subtitle per
  REQ-HF6c-1 surfaces the caught state. A caught exception without HTML
  surface would violate HF.3 and is forbidden.
- Split=B lock (hf-6a invariant) officially releases at T6.

### REQ-HF6c-3 — T7 legacy `compute_readiness` deletion

**REQ-HF6c-3**: T7 deletes the legacy `compute_readiness(data, basics, mc,
bootstrap)` function (the 421-469 region byte-identity-locked against
hf-6a baseline `b1584f3`) from `generate_report.py`. All previous call
sites must already route through `compute_readiness_calibrated` via T6 when
this commit lands.

**Acceptance criteria:**
- `git diff b1584f3..HEAD -- scripts/master-report/generate_report.py` for
  the 421-469 region transitions from **0 lines (current)** to the full
  deletion diff.
- `grep -n "def compute_readiness(" scripts/master-report/generate_report.py`
  → 0 matches after T7.
- No remaining direct call to `compute_readiness(` in `generate_report.py`.
- Byte-identity 421-469 lock (hf-6a invariant) officially releases at T7.

### REQ-HF6c-4 — Atomic Wave C push window

**REQ-HF6c-4**: T5, T6, and T7 land as a single atomic push window on
`phase-1-stats-cleanup`. Between commits, the repo must be self-consistent;
partial state must not reach `origin/phase-1-stats-cleanup`.

**Acceptance criteria:**
- All three commits (T5, T6, T7) are authored on the same branch in one
  session.
- `git push` runs once at the end of Wave C, not after each commit
  individually. Intermediate commits live only in the local working copy.
- pytest `scripts/master-report/tests/test_eri_calibration.py` remains
  GREEN after all three commits land locally, before the single push.
- `python3 scripts/master-report/generate_report.py` smoke-runs without
  exception on a sample DB before push (both calibrated and caught-ValueError
  paths exercised if possible).
- Merge-gate (CP6-equivalent) remains deferred to end of hf-6c per the
  hf-6a precedent — runs once for hf-6a + hf-6b + hf-6c together.

**Forbidden partial states (any of these on `origin/phase-1-stats-cleanup`
at any time is a REQ-HF6c-4 violation):**
- T5 HTML added but T6 wire-in absent → subtitle renders with stale data
  source.
- T6 wired but T7 not executed → legacy `compute_readiness` still present
  but unreferenced; drift surface.
- T7 executed but T5 or T6 absent → report pipeline broken / runtime error.
