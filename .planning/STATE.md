# GSD State

**as-of:** 2026-04-23
**current_phase:** hf-6c
**status:** hf-6c **CP0 IN PROGRESS** (2026-04-23). Fresh phase opened on top of hf-6b CP5 CLOSE at HEAD `5c1e3ea`. **Scope:** Wave C cutover (T5 HTML surface + T6 wire-in + T7 legacy delete) restricted to master-report HTML only (`scripts/master-report/generate_report.py`); live-app StatsView explicitly OUT OF SCOPE per user directive 2026-04-23 ("לא נקדים את המאוחר"). **CP0 bootstrap deliverables:** REQ-HF6c-1..4 appended to REQUIREMENTS.md (T5 HTML surfacing / T6 wire-in with Option B exception policy / T7 legacy deletion / atomic push window); 4 Design Decisions locked (DD-1 subtitle location, DD-2 clinical Hebrew + R² always shown, DD-3 amber color on fallback, DD-4 CUTOVER no shadow mode); Option B exception handling policy for T6 wire-in (`try/except ValueError`, parse HF.3 token prefix, render `"—"` sentinel for caught fallback readiness); CP-STATE.md scaffolded under `.planning/phases/hf-6c/`. **Wave C execution deferred** to future window per user on-call availability. **Inherited locks held at CP0 entry:** Split=B (callable-only, not wired into `compute_all`); byte-identity 421-469 on legacy `compute_readiness` vs hf-6a baseline `b1584f3`. Both locks scheduled to release atomically at T6+T7.
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

## Active checkpoints (hf-6c)

- **CP0 — 🟡 in progress** (2026-04-23). Bootstrap: REQ-HF6c-1..4 appended to
  REQUIREMENTS.md covering Wave C cutover (T5 HTML surface / T6 wire-in with
  Option B exception policy / T7 legacy deletion / atomic push window).
  **Scope restricted** to master-report HTML (`scripts/master-report/generate_report.py`)
  per user directive 2026-04-23 ("לא נקדים את המאוחר") — live-app StatsView
  explicitly OUT OF SCOPE. CP-STATE.md scaffolded under `.planning/phases/hf-6c/`
  with YAML v2.2 header (mode: single-window; compactions_within_cp: 1;
  compactions_all_time: 1; owner: work-window). Four Design Decisions locked
  by user (encoded verbatim in REQUIREMENTS.md CP0 Design Decisions block +
  CP-STATE.md Recent events):
  - **DD-1 (HTML location):** new `<div class="kpi-subtitle">` row inside
    ERI `kpi-card` in `generate_report.py`, below existing `kpi-value`.
  - **DD-2 (Hebrew wording):** clinical Hebrew with R² always shown —
    `calibrated` → `"כיול מוצלח · R²={r2:.2f}"` (teal `#00D4CC`);
    `insufficient_history` → `"היסטוריה קצרה · R²={r2:.2f}"` (amber `#FFB020`);
    `poor_fit` → `"כיול חלש · R²={r2:.2f}"` (amber `#FFB020`);
    R²=NaN rendered as `"—"`.
  - **DD-3 (Fallback display):** amber color `#FFB020` (same as דיוק KPI)
    for non-calibrated states on same subtitle line; no separate banner,
    no icon, no tooltip.
  - **DD-4 (Transition mode):** CUTOVER — T5→T6→T7 single atomic push;
    no shadow mode, no feature flag, no A/B.

  **Exception handling policy for T6 wire-in (user-approved: Option B —
  catch + label):** caller of `compute_readiness_calibrated` wraps in
  `try: ... except ValueError as e:`, parses HF.3 token prefix
  (`"insufficient_history:"` / `"poor_fit:"`) from exception message to set
  `fit_quality`, renders amber subtitle per DD-2/DD-3. Fallback `readiness`
  value when caught: `"—"` sentinel (not numeric default) to avoid
  mistaken-for-calibrated display. Rationale: DD-3 β already surfaces
  non-calibrated states → reuse that surface for caught exceptions; avoids
  "no report at all" on short-history days (weekends, early usage);
  HF.3-compliant (labeled fallback, not silent).

  **Invariants at CP0 entry (inherited unchanged from hf-6b CP5 CLOSE):**
  - Split=B held: `grep compute_readiness_calibrated
    scripts/master-report/generate_report.py` → 0 matches (callable-only lock
    active until T6 wire-in).
  - Byte-identity 421-469 held: `git diff b1584f3..HEAD --
    scripts/master-report/generate_report.py` for lines 421-469 → 0 lines
    (lock active until T7 legacy deletion).
  - pytest 18/18 GREEN under Option 5 criterion (inherited; will re-run
    after T6 wire-in).
  - HF.3 no-silent-fallback contract on `compute_readiness_calibrated`
    intact per hf-6b CP4 audit.

  **Wave C execution deferred** to future window per user on-call
  availability. **Next CP (CP1) scope:** PLAN.md drafting via `gsd-planner` —
  expected structure 3 tasks (T5/T6/T7) in one wave; pre-flight snapshot;
  post-flight smoke-run on sample DB.

  **Commit plan:** single bootstrap commit `docs(hf-6c): CP0 bootstrap —
  REQUIREMENTS + CP-STATE + STATE transition` covering three files:
  REQUIREMENTS.md (HF-6c section append), `.planning/phases/hf-6c/CP-STATE.md`
  (new), STATE.md (this file — phase transition).

## Recently completed phases

- **hf-6b — ✅ complete** (HEAD `5c1e3ea` at CP5 CLOSE; verify live).
  CP0-CP5 all PASS. `compute_readiness_calibrated` landed as Split=B
  (3-feature OLS: accuracy, coverage, retention + intercept; `consistency`
  dropped per REQ-HF6b-7 due to structural multicollinearity in rolling-window
  formula). 18 pytest cases GREEN under Option 5 criterion (R²>0.70 OR
  max-abs<12.0 on [0,100] readiness scale; observed R²≈0.7649, max_abs≈9.60).
  Both hf-6a locks held through phase close: Split=B (callable-only, not
  wired into `compute_all`) + byte-identity 421-469 on legacy
  `compute_readiness` vs baseline `b1584f3`. Wave C (T5/T6/T7) deferred to
  hf-6c by design. Phase-level merge-gate deferred to end of hf-6c per hf-6a
  precedent. See `.planning/phases/hf-6b/CP-STATE.md` for detailed CP0-CP5
  log (audit trail preserved in full).
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

**hf-6c CP1 — PLAN.md drafting via `gsd-planner`.** CP0 bootstrap lands
with this commit (REQ-HF6c-1..4 + 4 DDs + Option B exception policy +
CP-STATE.md scaffolding + STATE.md phase transition). CP1 planning + Wave
C execution (T5/T6/T7) deferred to future window per user on-call
availability. See Cross-phase handshake block below for authoritative
lock-release expectations at T6/T7 (invariants remain load-bearing inside
hf-6c; section title retained for audit continuity).

---

## Cross-phase handshake to hf-6c

> **Note (2026-04-23):** hf-6c is now **active at CP0** — this section was
> authored at hf-6b CP5 CLOSE as a forward-looking handshake. Title and body
> retained verbatim for audit continuity; all lock-release expectations,
> invariants, and reading-order guidance below remain authoritative inside
> hf-6c (they describe T6/T7 work that will land at CP2+ in hf-6c).

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

`.planning/phases/hf-6c/` directory **exists as of CP0 bootstrap
(2026-04-23)** with `CP-STATE.md` (YAML v2.2 header, CP0 entry logged).
`PLAN.md` will be drafted at CP1 via `gsd-planner`. REQUIREMENTS.md
HF-6c section (REQ-HF6c-1..4 + CP0 Design Decisions block) appended in
the same CP0 bootstrap commit. Branch `phase-1-stats-cleanup` continues
to be the working branch.

### Auto-memory anchor

Emergency recovery state snapshots:
- `~/.claude/projects/-Users-idankatz15-Desktop-3-APP-DEV-repo-temp/memory/project_hf6b_state_sync.md`
  — hf-6b close state (branch SHAs, pytest counts, invariant status,
  lock-release expectations for hf-6c Wave C).
- `~/.claude/projects/-Users-idankatz15-Desktop-3-APP-DEV-repo-temp/memory/project_hf6c_cp0_state.md`
  — hf-6c CP0 state (4 Design Decisions DD-1..DD-4 + Option B exception
  policy + scope restriction "לא נקדים את המאוחר" — master-report only).

Read in fresh hf-6c windows to orient without re-reading full planning docs.
