---
phase: hf-6a
checkpoint: CP2
type: brainstorm
topic: retention-placeholder-formula
decision: KEEP_A
plan_impact: none
time_box_minutes: 30
---

# CP2 Brainstorm — hf-6a Retention Placeholder Formula

## 0. Scope & Boundaries

**Single topic under discussion**: the retention component formula in
`build_daily_snapshots` (hf-6a placeholder), currently specified in
[PLAN.md](PLAN.md) T4 action lines 342–346 and asserted by
`test_build_daily_snapshots_shape_and_values` (T1 ground_truth lines 157–173).

**Question**: Is there a placeholder-honest retention formula that reduces the
chance the hf-6a test needs rewrite when hf-6b swaps in FSRS-based retention?

**Hard boundaries (NOT up for debate in this CP2)**:
- No REQ added, removed, or changed.
- No task added, removed, or renumbered (T0–T6 stay as they are).
- The `[0,1]` component lock stays (wondrous line 128).
- byte-identity of `compute_readiness` (lines 421–469) stays.
- Split=B (no wire-in to `compute_all`) stays.
- FSRS retention / OLS fit / data-leakage mitigation stay in hf-6b scope.
  Any of those surfacing in CP2 → stop signal → report to advisor.

---

## 1. Options

### Option A — Daily repeat ratio (CURRENT PLAN)

> `retention(day d) = correct_repeats_on_d / total_repeats_on_d`,
> where a "repeat" is an answer on a `question_id` that has been seen on any
> prior day. If no repeats on day d, `retention = 0.0`.

- **Per-day signal**: yes.
- **Range**: `[0, 1]` by construction.
- **Empty-day behavior**: documented 0.0.
- **Executor effort**: ~15 lines — needs a running `seen_qids: set[str]` updated
  chronologically, and per-day tallies `n_repeats`, `n_correct_repeats`.

### Option B — Rolling-7-day accuracy

> `retention(day d) = correct_answers_in_[d-6, d] / total_answers_in_[d-6, d]`.

- **Per-day signal**: yes, but measures general performance trend, not recall.
- **Range**: `[0, 1]`.
- **Empty-day behavior**: window reaches before data → needs special case.
- **Executor effort**: ~10 lines.
- **Semantic problem**: this is rolling accuracy, **not retention**. A
  future reader seeing `retention = rolling_accuracy(7)` will infer hf-6a
  committed to that semantic.

### Option C — Cumulative monotonic

> `retention(day d) = sum(correct_repeats through d) / sum(total_repeats through d)`.

- **Per-day signal**: smoothed / cumulative.
- **Range**: `[0, 1]`.
- **Empty-day behavior**: 0/0 on day 1 if no prior repeats → needs guard.
- **Executor effort**: ~10 lines — running totals, no per-day set reset.
- **Artifact**: cumulative ratios are quasi-monotonic. Real retention is not.
  Introduces a false stability signal that will mislead hf-6b's calibration.

### Option D — Zero constant placeholder

> `retention(day d) = 0.0` for every day.

- **Per-day signal**: none.
- **Range**: `[0, 1]` trivially.
- **Empty-day behavior**: trivial.
- **Executor effort**: ~1 line.
- **Fatal flaw**: reduces the snapshot-builder's 4-component contract to 3.
  hf-6b's regression fit on an all-zero retention column has an unidentifiable
  coefficient for the retention term. The column becomes dead data until FSRS
  lands, so hf-6b cannot begin calibration on retention. Violates the
  **intent** of REQ-HF6a-1 (deliver four real components in `[0,1]`).

### Option E — First-repeat-only (emergent)

> For each question_id, consider only the FIRST repeat event after its
> introduction. `retention(day d) = correct_first_repeats_on_d /
> total_first_repeats_on_d`; 0.0 if none on day d.

- **Per-day signal**: sharpest retention semantics ("did you remember it the
  next time you saw it?").
- **Range**: `[0, 1]`.
- **Empty-day behavior**: very sparse — most days have 0 first-repeats for a
  small question pool. Many days return 0.0 even when recall activity
  happened.
- **Executor effort**: ~20 lines — needs a set of `seen_qids` and a set of
  `already_first_repeated_qids`.
- **Trade-off**: best semantics, worst data density.

---

## 2. Criteria Comparison

| Criterion | A (current) | B (rolling 7d) | C (cumulative) | D (zero) | E (first-repeat) |
|-----------|:-----------:|:--------------:|:--------------:|:--------:|:----------------:|
| **(1) Output in `[0,1]` without clipping** | PASS | PASS | PASS | PASS | PASS |
| **(2) Well-defined for N<5 days / sparse repeats** | PASS (0.0 documented) | WEAK (window edge case) | WEAK (day-1 0/0 guard) | PASS (trivial) | FAIL (often 0.0 even on active days) |
| **(3) hf-6b rewrite risk for `test_build_daily_snapshots_shape_and_values`** | EQUAL: 3 cells | EQUAL: 3 cells | EQUAL: 3 cells | EQUAL: 3 cells | EQUAL: 3 cells |
| **(4) Semantic clarity (is it honestly "retention"?)** | PASS — recall on seen items | FAIL — mislabels accuracy as retention | WEAK — spurious monotonicity | FAIL — null, non-informative | STRONG — sharpest but sparse |

**Key observation on Criterion 3**: hf-6b will swap the retention formula
regardless of which option hf-6a picks. The `ground_truth` table in the test
has 3 cells for the `retention` column. All 3 must be updated when hf-6b
changes the formula. This cost is **invariant** across A/B/C/D/E. Structural
invariants (3 days, ascending dates, `[0,1]` lock, 4 components) survive all
options. So Criterion 3 **cannot discriminate** — it's a constant, not a
variable.

---

## 3. Multi-Perspective Review

### Perspective 1 — Executor (`build_daily_snapshots` implementer, T4)

| Option | Implementation cost | Pitfalls |
|--------|---------------------|----------|
| A | ~15 lines: chronological sort, `seen_qids: set[str]`, per-day tally | Must iterate sorted-by-`answered_at`; off-by-one on day boundary |
| B | ~10 lines: slice window `[d-6, d]` from sorted list | Window extending before data → either shrink window or skip day |
| C | ~10 lines: running totals `cum_correct_reps`, `cum_total_reps` | Day 1 has 0 repeats → guard against `0/0` |
| D | ~1 line: `retention = 0.0` | Trivial |
| E | ~20 lines: two sets (`seen_qids`, `first_repeat_done_qids`) | Double bookkeeping; ordering-sensitive bugs |

**Executor verdict**: A is well-specified. B's window edge case introduces
policy questions hf-6a should not resolve. C needs a guard. D is trivial but
useless. E is risk-heavy for a placeholder.

### Perspective 2 — Tester (`ground_truth` hand-computer, T1)

The fixture is 3 days / ~44 answer rows (Day 1: 15 rows, Day 2: 20 rows,
Day 3 implicit from PLAN T1 synthetic). Hand-computable?

| Option | Hand-compute burden |
|--------|---------------------|
| A | Medium: for each day, count repeats (answers on q_ids seen before), count correct-among-repeats, divide. |
| B | Easy: rolling sum of `is_correct` over last 7 days; window shrinks on days 1–2. |
| C | Medium: cumulative version of A. |
| D | Trivial: all cells 0.0. |
| E | Hard: track which q_id's FIRST repeat falls on which day; error-prone. |

**Tester verdict**: A/B/C/D are all tractable within 1e-6. E is not — a
hand-computation bug is plausible, and bug-in-the-test is worse than
bug-in-the-implementation.

### Perspective 3 — Future hf-6b implementor (FSRS retention swap)

hf-6b will replace the retention formula with FSRS-based retention (or
whatever the hf-6b discussion settles). What does each hf-6a option leave on
the table?

| Option | hf-6b impact |
|--------|--------------|
| A | Clean swap: recompute 3 ground_truth cells; test structure unchanged. Placeholder is clearly named in docstring. No legacy semantics to undo. |
| B | **Worst**: hf-6b reader asks "why was retention ever rolling accuracy?" — semantic confusion. Must re-explain the lineage. |
| C | Clean swap, but hf-6b calibration during any data-review window would have seen smoothed monotonic values, nowhere near FSRS output shape. |
| D | hf-6b faces an all-zero retention column. Regression fit's coefficient for retention is unidentifiable; any non-zero coefficient is pure noise. hf-6b cannot begin retention calibration until FSRS replacement lands. Effectively, retention column is dead data. |
| E | Clean semantic — FSRS retention is closer to E than to A. But E's sparsity means test fixtures need beefing up in hf-6b, which is out-of-scope complexity for a placeholder. |

**Future-hf-6b verdict**: D is the **worst** — dead column blocks hf-6b from
using the snapshot builder's 4-component contract. B is second-worst —
semantic confusion. A/C/E are all OK transitions; A has the least legacy
baggage.

---

## 4. Decision

**KEEP A.**

### Rationale

1. **Criterion 3 (rewrite risk) is invariant.** The very criterion that
   motivated this CP2 brainstorm does not discriminate between options — all
   require the same 3-cell `ground_truth` update in hf-6b. No option reduces
   rewrite cost; therefore no option wins on the original motivation.

2. **A is the only option that encodes faithful retention semantics.**
   D is null-valued, B mislabels rolling accuracy, C introduces a spurious
   monotonicity artifact, E is sparse. A's "recall success on previously-seen
   items" is the simplest honest placeholder for what FSRS retention will
   eventually model.

3. **A preserves the snapshot builder's 4-component contract.** REQ-HF6a-1
   delivers four real components in `[0,1]`. D reduces this to three real
   plus one dead column — violates intent. A delivers four.

4. **Switching cost > switching benefit.** The PLAN is locked at CP1 (PASS,
   two iterations). Switching requires: (i) PLAN.md diff on T1 ground_truth
   and T4 formula, (ii) R-03/R-04 text update, (iii) re-run
   `gsd-plan-checker`, (iv) advisor re-review. For zero measurable benefit
   (Criterion 3 is flat; Criterion 4 is degraded for all non-A options), the
   switch is pure cost.

### Non-blocking acknowledgments (already in PLAN)

- **R-04 stays ACCEPTED**: placeholder retention ground_truth in hf6a.T1
  drifts from actual SRS retention semantics. Documented. hf-6b will add a
  second test against FSRS-reconstructed retention (separate test, not a
  rewrite of the existing one).
- **Docstring of `eri_calibration.py` stays placeholder-honest**: "hf-6b will
  refine this" — no mention of FSRS or OLS (phase-agnostic rule per
  [PLAN.md](PLAN.md) T4 action docstring, post-CP1-correction state).

---

## 5. PLAN.md Impact — NONE

No diff. PLAN.md stays at CP1-after-fix state (section bodies unchanged).
`gsd-plan-checker` does not need a re-run; its iteration-2 verdict (PASS,
zero issues) stands.

---

## 6. Fail-Fast Signals — not triggered

None of the explicitly banned topics surfaced during this CP2:
- No FSRS retention introduced into hf-6a.
- No change to `[0,1]` lock.
- No third test proposed.
- No new REQ.

All five options stay inside hf-6a scope.

---

## 7. Next Step

Advance to **CP3 — RED gate** after advisor approval of this BRAINSTORM.md.
CP3 produces the two failing tests (hf6a.T1 + hf6a.T2) per PLAN.md Section 3.
