# Hotfix Track — as-of 2026-04-22

**Source of truth:** `~/.claude/plans/wondrous-popping-sunrise.md`
**Branch:** `phase-1-stats-cleanup`
**HEAD:** `b1584f3`

## Scope

This ROADMAP tracks ONLY active / near-term hotfix work for the Master Report
Generator (`scripts/master-report/generate_report.py`).

Merged hotfixes (HF.1–HF.5b, commits `c875c2c..b1584f3`) are git history and are
deliberately NOT listed here. Future hotfixes (HF.7+) are deferred until their
prerequisite phases land.

## Phases

| Phase  | Title                              | Status   | Source                           |
|--------|------------------------------------|----------|----------------------------------|
| hf-6a  | ERI calibration — snapshot builder | active   | wondrous §HF.6 line 124          |
| hf-6b  | ERI calibration — OLS regression   | TBD      | wondrous §HF.6 lines 123,125-130 |
| hf-6c  | Per-event confidence persistence   | deferred | probe 2026-04-22                 |

---

### Phase hf-6a: ERI calibration — snapshot builder

**Goal:** Deliver `build_daily_snapshots(history) → list[DailySnapshot]` in a new file `scripts/master-report/eri_calibration.py`. The function computes the four ERI components — (accuracy, coverage, retention, consistency) — per day across the user's full history.

**Requirements**: REQ-HF6a-1, REQ-HF6a-2, REQ-HF6a-3, REQ-HF6a-4, REQ-HF6a-5

**Status:** active (current)

**Scope boundaries (locked).**
- Q1 — file location: `scripts/master-report/eri_calibration.py` (new file).
- Q2 — no HTML plumbing in hf-6a.
- Q4 — deprecate-then-delete (precedent HF.5b). `compute_readiness` is NOT
  modified and NOT deleted in this phase.
- Split = B — callable function only; NOT yet wired into `compute_all`.
- No calibrator, no weight swap, no `compute_readiness_calibrated` in hf-6a.

**Requirements.** See `REQUIREMENTS.md` — `REQ-HF6a-1..5`.

**HF.3 invariant.** No silent fallbacks. `build_daily_snapshots` must raise on
insufficient data, not return defaults.

---

### Phase hf-6b: ERI calibration — OLS regression

**Goal:** `compute_readiness_calibrated(history, components) → {readiness, weights, fit_quality}` with OLS fit and R² / n-days fallback to v2 weights `{0.25, 0.25, 0.30, 0.20}`. Wire into `compute_all`, deprecate + delete old `compute_readiness`, plumb `fit_quality` flag to HTML.

**Requirements**: TBD

**Status:** deferred (planned after hf-6a merges)

**Brainstorming input (CP2, NOT hf-6a).**
- **Data leakage risk** in retention reconstruction: if FSRS parameters used to
  compute retention at day *t* are calibrated on a history that includes days
  *t+1…end*, the reconstructed retention carries look-ahead bias.
- Candidate mitigations: (a) FSRS default params for historical reconstruction,
  (b) time-series cross-validation with rolling window.
- This is a modeling decision; do NOT resolve in hf-6a.

**Requirements.** To be extracted into `REQUIREMENTS.md` (as `REQ-HF6b-N`) once
hf-6a merges and the snapshot data contract is frozen.

---

### Phase hf-6c: Per-event confidence persistence

**Goal:** Enable per-event confidence tracking so retention-style metrics can
distinguish true recall from lucky guesses. Fix the half-wired
`user_answers.confidence` column (100% NULL — writes do not carry the value),
add a `confidence` column to `answer_history`, and propagate it through the
sync trigger. Decide a backfill policy for existing rows (likely NULL /
`'unknown'` sentinel; no retroactive proxy).

**Status:** deferred (planned after hf-6b merges)

**Brainstorming input (for hf-6c's own CP2).**
- `user_answers.confidence` already exists as column but `increment_user_answer`
  stored proc does not receive/pass the value — fix scope must include the
  proc signature.
- `answer_history` has no confidence column — schema migration required.
- `trg_sync_answer_history` trigger currently does not copy confidence — must
  be updated in the same migration.
- Backfill: do NOT proxy past events with `spaced_repetition.confidence`
  (current-only snapshot; retroactive application is biased). Leave historical
  rows NULL / `'unknown'`.
- hf-6c does NOT heal hf-6a's retention gap for historical data — it only
  enables future data. A later phase (hf-6d?) may recalibrate hf-6b weights
  once enough post-hf-6c data has accumulated.

**Requirements.** To be extracted into `REQUIREMENTS.md` once hf-6b merges.
