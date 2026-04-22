# GSD State

**as-of:** 2026-04-22
**current_phase:** hf-6a
**status:** CP2 complete — KEEP A confirmed post-probe (2026-04-22); CONFIDENCE_PARTIAL documented; hf-6c queued (post-hf-6b)
**branch:** phase-1-stats-cleanup
**HEAD:** a0baa20

---

## Citations policy

Function/block references in `.planning/` docs cite **name**, not line number.
Line numbers are advisory and may drift without constituting a spec error.
Verify by `grep` (e.g., `grep -n "def compute_readiness" scripts/master-report/generate_report.py`).

Rationale: as code evolves, line numbers shift. Chasing them in docs creates
churn without improving correctness. Semantic claims (range locks, byte-identity
invariants, scope boundaries) are load-bearing; line numbers are not.

---

## Active checkpoints

- **CP0 — ✅ approved** by advisor (bootstrap: ROADMAP + REQUIREMENTS + STATE).
- **CP1 — ✅ approved (after one correction).** `.planning/phases/hf-6a/PLAN.md`
  written; gsd-plan-checker returned **VERDICT: PASS** iteration 1 (zero issues);
  advisor flagged a self-inconsistency at line 331 (banned symbols in T4
  docstring template); one-line fix applied; gsd-plan-checker iteration 2
  returned **VERDICT: PASS** (zero issues); advisor approved PASS-after-fix.
- **CP2 — ✅ complete (post-probe confirmation).** Advisor requested
  schema probe after user flagged confidence gap in retention formula.
  Probe report verified HISTORY_SAFE (RLS forbids user delete; 11,335
  rows append-only; "לחזור" handler INSERT-only) and CONFIDENCE_PARTIAL
  (spaced_repetition.confidence holds per-pair snapshot only, not
  per-event; answer_history has no confidence column;
  user_answers.confidence is 100% NULL — half-wired column).
  **Decision: KEEP A confirmed.** A'.1 infeasible in hf-6a (retroactive
  proxy biased; schema change breaks CP1 lock). Path ג locked: hf-6c
  added to ROADMAP.

## Completed phases

- hf-1 through hf-5b — merged git history (commits `c875c2c..b1584f3`). Not
  tracked in ROADMAP by design.

## Next action

On **CP2 ✅**: proceed to CP3 (RED gate) — produce hf6a.T0 + hf6a.T1 + hf6a.T2
per PLAN.md Section 3. Wait for advisor CP3 prompt.
