---
phase: hf-6b
plan: master
type: execute
branch: phase-1-stats-cleanup
exam_date: 2026-06-16
budget_days: 1
waves: 3
autonomous: false
feature_flag: null   # hotfix track uses deprecate-then-delete, not flags
requirements: [REQ-HF6b-1, REQ-HF6b-2, REQ-HF6b-3, REQ-HF6b-4, REQ-HF6b-5, REQ-HF6b-7]   # REQ-HF6b-6 DRAFTED AND WITHDRAWN 2026-04-23; REQ-HF6b-7 supersedes (3-feature OLS, CP3 Option 5)
predecessor_head: 639ea3b   # hf-6a GREEN — verify live via `git rev-parse HEAD` before T1
research_file: null
review_file: null
---

# Phase hf-6b — ERI Calibration: OLS Regression + Legacy Deletion (Execution Plan)

> **Scope lock:** This plan implements hf-6b from `.planning/ROADMAP.md` and the five REQ-IDs in `.planning/REQUIREMENTS.md` (REQ-HF6b-1..5 at REQUIREMENTS.md lines 118-273). Source of truth for the HF.6 design is `~/.claude/plans/wondrous-popping-sunrise.md` §HF.6 lines 122-130. Every task is executable by `gsd-executor` without further research. This phase CONSUMES the hf-6a contract (`build_daily_snapshots` + `DailySnapshot` — hf-6a PLAN §Appendix B) and RELEASES two hf-6a-era locks:
>   1. **Split=B lock** — hf-6a landed `build_daily_snapshots` as callable-only, NOT referenced from `generate_report.py`. hf-6b Wave C lifts this to Split=A (actual wire-in to `compute_all`).
>   2. **Byte-identity lock on legacy `compute_readiness`** — hf-6a VERIFICATION.md Proof 1 locked lines 421-469 of `generate_report.py` byte-identical to `b1584f3`. hf-6b Wave C releases this lock via deprecate-then-delete (HF.5b precedent, commit `b1584f3`).
> Merge-gate (CP6) is DEFERRED to end of hf-6c — not this phase.

---

## Section 1 — Goal-Backward Analysis

### The terminal state (REQ-HF6b-4)

**Walk-back anchor:** "`grep -n "def compute_readiness(" scripts/master-report/generate_report.py` returns 0 matches AND `grep -n "compute_readiness_calibrated\|eri_calibration" scripts/master-report/generate_report.py` returns ≥ 1 match AND the rendered HTML contains user-visible `fit_quality` text when `fit_quality ≠ "calibrated"` AND `gsd-integration-checker` verdict PASS on wire-up."

That is the observable end state of hf-6b. Everything else is scaffolding that makes this state reachable without violating REQ-HF6b-5 (no silent fallbacks), REQ-HF6b-3 (Law 1 extension: flag-never-displayed IS silent fallback), and the HF.5b deprecate-then-delete precedent.

### Minimum task set (walking backwards)

1. **Can we delete `compute_readiness` without first wiring `compute_readiness_calibrated`?** No. HF.5b precedent (commit `b1584f3`: `compute_ebbinghaus` → `compute_decay_from_srs`) deprecates-then-deletes: new function exists AND is called AND is verified BEFORE old is deleted. Deletion and wire-in must happen in the same wave (atomically — same commit or immediately adjacent commits) so `compute_all` is never briefly broken.
   → **T6 (Wave C): wire + delete** is forced.

2. **Can we wire `compute_readiness_calibrated` before it exists?** No.
   → **T4 (Wave B): implement `compute_readiness_calibrated`** is forced.

3. **Can we implement without failing tests for every branch first?** Not per `~/.claude/rules/common/testing.md` (TDD mandatory) and REQ-HF6b-5 ("code review at CP4 explicitly confirms the raise-vs-fallback boundaries").
   → **T1, T2, T3 (Wave A): RED tests** are forced, covering all three `fit_quality` branches + HF.3 boundaries + synthetic weight recovery.

4. **Can we wire without HTML surfacing of `fit_quality`?** No. REQ-HF6b-3 Law 1 extension: "a flag that sits in the payload dict but is never rendered does not satisfy this REQ." Silent fallback would violate REQ-HF6b-5 as well.
   → **T5 (Wave C): HTML surfacing patch** is forced, and it must ship in the same wave as wire-in to avoid a silent-fallback window.

5. **Can we leave `test_compute_readiness.py` alone?** No. REQ-HF6b-4 acceptance: "Legacy test file `scripts/master-report/tests/test_compute_readiness.py` is NOT left testing a function that no longer exists. Either: (a) deleted entirely, or (b) refactored to exercise `compute_readiness_calibrated` with equivalent coverage."
   → **T7 (Wave C): legacy test update/delete** is forced.

6. **Data-leakage mitigation (Not-a-REQ, REQUIREMENTS.md lines 275-294):** Must be adjudicated for hf-6b, but the adjudication output is an advisor decision, not an executor task. Plan assumes the decision is made at CP2 brainstorm BEFORE T4 starts, recorded in CP-STATE.md + surfaced here as §9 open question O-1.

**What CAN'T be removed without breaking REQ coverage:**
- T1/T2/T3 (RED): remove any one → some `fit_quality` branch or HF.3 boundary or weight-recovery guarantee is untested → REQ-HF6b-2 or REQ-HF6b-5 fails.
- T4 (GREEN): obviously unremovable.
- T5 (HTML surfacing): remove → REQ-HF6b-3 Law 1 extension fails.
- T6 (wire + delete): remove either half → REQ-HF6b-4 fails.
- T7 (legacy tests): remove → REQ-HF6b-4 acceptance clause (a)-or-(b) fails.

**What IS optional / deferred:**
- Merge-gate grep assertions (CP6) — deferred to hf-6c.
- FSRS data-leakage mitigation implementation — deferred pending CP2 adjudication (see §7 R-B1 and §9 O-1).

---

## Section 2 — Wave Breakdown (three waves, honoring both locks)

### Wave A — RED tests (TDD-first, honors both hf-6a locks)

**Goal:** Land failing pytest items in `scripts/master-report/tests/test_eri_calibration.py` (append to the file hf-6a created) that exhaustively cover REQ-HF6b-1..5 behavior before any implementation exists. Both locks still hold: lines 421-469 untouched, `build_daily_snapshots\|eri_calibration` grep on generate_report.py still returns 0 matches.

**Tasks:** T1, T2, T3.

### Wave B — GREEN implementation in `eri_calibration.py` only

**Goal:** Extend `scripts/master-report/eri_calibration.py` with `compute_readiness_calibrated(history, components) → {readiness, weights, fit_quality}`. All Wave A tests go GREEN. Does NOT touch `generate_report.py`. Both locks still hold at wave end.

**Tasks:** T4.

### Wave C — HTML surface + wire-in + delete legacy (releases BOTH locks atomically)

**Goal:** In a tight commit chain, (a) patch `generate_html` to render `fit_quality` as user-visible text, (b) modify `compute_all` to call `compute_readiness_calibrated` instead of `compute_readiness`, (c) delete legacy `compute_readiness` (lines 421-469), (d) update/delete `test_compute_readiness.py`. This wave releases the Split=B lock (hf-6a VERIFICATION Proof 4) and the byte-identity lock (hf-6a VERIFICATION Proof 1) — by design. CP6 merge-gate for hf-6c will re-prove the new invariants (calibrated wired, legacy gone, no silent fallback).

**Tasks:** T5, T6, T7.

**Lock status at wave end:** Split=B RELEASED → Split=A active. Byte-identity RELEASED → legacy function deleted. HF.3 invariant STILL held (REQ-HF6b-5 tests remain GREEN). HTML visibly surfaces `fit_quality` when not calibrated.

---

## Section 3 — Tasks T1..T7

> **⚠️ REQ-mapping note (post-CP3, 2026-04-23).** The "REQ mapping" column in the
> table below cites `REQ-HF6b-1..5` per the original plan. Post-CP3, T3+T4 are
> also governed by **REQ-HF6b-7** (3-feature OLS supersedes the 5-feature model;
> acceptance criterion is prediction accuracy per Option 5 disposition). Treat
> every occurrence of `REQ-HF6b-2` on rows T3 and T4 below as implicitly
> harmonized with REQ-HF6b-7. REQ-HF6b-6 was DRAFTED AND WITHDRAWN — see
> REQUIREMENTS.md for the withdrawn-on-arrival audit block.

**Legend:**
- **Effort:** S (≤1 h), M (1–3 h), L (3–6 h)
- **Commit convention:** `feat(hf-6b):` / `test(hf-6b):` / `refactor(hf-6b):` / `docs(hf-6b):`. One task = one commit (T6 may be split into two tightly-adjacent commits — wire-in then delete — but both must ship before any push).

| ID | Task | Files (absolute) | Wave | Deps | REQ mapping | Effort | Done-When |
|----|------|------------------|------|------|-------------|--------|-----------|
| **T1** | RED: dict-shape + 3 `fit_quality` branch tests | `scripts/master-report/tests/test_eri_calibration.py` (append) | A | — | REQ-HF6b-1, REQ-HF6b-2, REQ-HF6b-3 | M | pytest fails with ImportError / AttributeError on `compute_readiness_calibrated` |
| **T2** | RED: HF.3 boundary tests (N-1 ∈ {0,1,2} raise; N-1 ∈ {3,13} labeled fallback; N-1=14 may calibrate; no-silent-fallback-tokens guard) | `scripts/master-report/tests/test_eri_calibration.py` (append) | A | T1 | REQ-HF6b-5 | M | pytest fails on same missing-symbol error |
| **T3** | RED: synthetic weight-recovery test (±0.05) | `scripts/master-report/tests/test_eri_calibration.py` (append) | A | T2 | REQ-HF6b-2 | M | pytest fails on same missing-symbol error |
| **T4** | GREEN: implement `compute_readiness_calibrated` in `eri_calibration.py` (APPEND — does NOT modify hf-6a `build_daily_snapshots`/`DailySnapshot`) | `scripts/master-report/eri_calibration.py` (append) | B | T3 | REQ-HF6b-1, REQ-HF6b-2, REQ-HF6b-3 (payload), REQ-HF6b-5 | L | `pytest scripts/master-report/tests/test_eri_calibration.py -q` exits 0; `grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py` STILL returns 0 matches |
| **T5** | HTML surface: render `fit_quality` as user-visible text in `generate_html` | `scripts/master-report/generate_report.py` (HTML template region only; NO change to lines 421-469) | C | T4 | REQ-HF6b-3 (Law 1 extension) | M | Rendered HTML on `fit_quality="insufficient_history"` fixture contains executor-chosen visible substring; byte-identity of lines 421-469 STILL holds until T6 |
| **T6** | Wire `compute_readiness_calibrated` into `compute_all` + DELETE legacy `compute_readiness` body (lines 421-469) | `scripts/master-report/generate_report.py` (import addition + call-site swap at ~line 570 + deletion of lines 421-469) | C | T5 | REQ-HF6b-4 | M | `grep -n "def compute_readiness(" scripts/master-report/generate_report.py` returns 0; `grep -n "compute_readiness_calibrated\|eri_calibration" scripts/master-report/generate_report.py` returns ≥ 1; `ast.parse` OK |
| **T7** | Update/delete `test_compute_readiness.py` (default: delete — ghosts of deleted function) | `scripts/master-report/tests/test_compute_readiness.py` | C | T6 | REQ-HF6b-4 | S | Either file absent OR file present but no `from generate_report import compute_readiness`; `pytest scripts/master-report/tests/ -q` exits 0 |

---

### T1 — RED: dict-shape + three `fit_quality` branch tests

```xml
<read_first>
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/REQUIREMENTS.md lines 125-216 (REQ-HF6b-1..3 acceptance criteria).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/tests/test_eri_calibration.py (hf-6a-created — reuse sys.path insert pattern + synthetic-history fixture shape).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/eri_calibration.py lines 48-66 (docstring of `history` shape — reuse exactly for the new tests).
  - ~/.claude/plans/wondrous-popping-sunrise.md lines 122-130 (HF.6 master spec).
</read_first>

<action>
  Append to /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/tests/test_eri_calibration.py
  a new test block importing:

      from eri_calibration import compute_readiness_calibrated, build_daily_snapshots

  Build helper fixtures (module-level; reused by T2 and T3):

      def _build_n_day_history(n_days: int, total_db: int = 100) -> dict:
          """Synthetic history with exactly n_days distinct ISO-8601 dates,
          ~10 answers/day, ~70% correct, schema matches hf-6a fixture."""
          # implementation — docstring the math inline

      def _build_linear_history(n_days, total_db, weights, intercept, noise_sd, seed=42) -> dict:
          """Synthetic history where next-day accuracy = w·components + intercept + ε.
          Used by T1 calibrated branch + T3 weight-recovery test."""
          # implementation — uses numpy.random.default_rng(seed) for determinism

  Tests to add (5):

    1. test_returns_exact_dict_shape — REQ-HF6b-1
       - N = 16 days (N-1 = 15 ≥ 14 → calibrated branch reachable).
       - Assert: result is dict; keys exactly {"readiness","weights","fit_quality"}.
       - Assert: isinstance(result["readiness"], float); 0.0 <= result["readiness"] <= 100.0.
       - Assert: set(result["weights"].keys()) == {"accuracy","coverage","retention","consistency","intercept"};
                 every weight is float.
       - Assert: result["fit_quality"] in {"calibrated","insufficient_history","poor_fit"}.

    2. test_branch_insufficient_history — REQ-HF6b-3
       - Exactly 5 distinct days (N-1 = 4, inside [3..13] labeled-fallback band).
       - Assert: does NOT raise (labeled fallback, not HF.3 hard raise).
       - Assert: fit_quality == "insufficient_history".
       - Assert: weights == {"accuracy":0.25,"coverage":0.25,"retention":0.30,"consistency":0.20,"intercept":0.0}.

    3. test_branch_poor_fit — REQ-HF6b-3
       - N = 20 (N-1 = 19 ≥ 14 → first gate passes).
       - Target y independent of features (uniform noise via fixed seed) → in-sample R² < 0.3.
       - Assert: fit_quality == "poor_fit"; weights == v2 fallback above.

    4. test_branch_calibrated — REQ-HF6b-2
       - N = 20 with planted linear target y = 0.3·acc + 0.2·cov + 0.4·ret + 0.1·cons + 0.05 + ε(sd=0.01).
       - Assert: fit_quality == "calibrated"; weights["accuracy"] != 0.25 (sanity — fit actually ran).

    5. test_html_flag_is_english_literal — REQ-HF6b-1 + REQ-HF6b-3 (internal vs visible distinction)
       - Reuse insufficient_history fixture.
       - Assert: result["fit_quality"] is EXACTLY "insufficient_history" (English machine contract).
       - The Hebrew/English visible-HTML text is T5's concern; NOT tested here.

  Run `pytest scripts/master-report/tests/test_eri_calibration.py -q`. Expected:
  FAILS with ImportError (cannot import name 'compute_readiness_calibrated'). No implementation exists yet.

  Commit: `test(hf-6b): RED — fit_quality branches + dict-shape contract`
</action>

<acceptance_criteria>
  - `grep -c "def test_returns_exact_dict_shape\|def test_branch_insufficient_history\|def test_branch_poor_fit\|def test_branch_calibrated\|def test_html_flag_is_english_literal" scripts/master-report/tests/test_eri_calibration.py` returns 5.
  - `pytest scripts/master-report/tests/test_eri_calibration.py -q 2>&1 | grep -cE "ImportError|AttributeError|NameError|cannot import name 'compute_readiness_calibrated'"` returns ≥ 1.
  - `diff <(git show 639ea3b:scripts/master-report/generate_report.py | sed -n '421,469p') <(sed -n '421,469p' scripts/master-report/generate_report.py)` produces ZERO output (byte-identity lock still held).
  - `grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py` STILL returns 0 matches (Split=B still held).
</acceptance_criteria>

<done_when>
  pytest exits non-zero on `compute_readiness_calibrated` symbol lookup AND both lock-status assertions above still pass.
</done_when>
```

---

### T2 — RED: HF.3 boundary tests (raise vs labeled fallback)

```xml
<read_first>
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/REQUIREMENTS.md lines 248-273 (REQ-HF6b-5 acceptance — explicit raise / labeled-fallback boundary).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/eri_calibration.py lines 67-105 (hf-6a HF.3-style ValueError patterns in build_daily_snapshots — MIRROR STYLE).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/generate_report.py lines 425-454 (legacy compute_readiness HF.3 ValueError patterns — historical precedent).
</read_first>

<action>
  Append to test_eri_calibration.py:

    @pytest.mark.unit
    @pytest.mark.parametrize("n_days", [1, 2, 3])  # produces N-1 ∈ {0, 1, 2}
    def test_raises_when_n_minus_1_below_3(n_days):
        """REQ-HF6b-5: OLS with N-1 < 3 is mathematically undefined → explicit ValueError."""
        # Note: build_daily_snapshots itself raises for n_days < 2 (hf-6a invariant).
        # For n_days=1 this test exercises that upstream raise (still a ValueError — acceptable).
        # For n_days=2,3 → len(snapshots)=2 or 3 → N-1 = 1 or 2 → compute_readiness_calibrated
        # must raise ValueError naming the insufficient-data reason.
        history = _build_n_day_history(n_days, total_db=100)
        with pytest.raises(ValueError) as exc:
            compute_readiness_calibrated(history, components={})
        msg = str(exc.value).lower()
        assert any(kw in msg for kw in ("insufficient","undefined","regression","fewer","n-1","n - 1"))

    @pytest.mark.unit
    @pytest.mark.parametrize("n_days", [4, 14])  # produces N-1 ∈ {3, 13} — labeled-fallback band
    def test_labeled_fallback_for_n_minus_1_in_3_to_13(n_days):
        """REQ-HF6b-5: labeled fallback is allowed for N-1 ∈ [3..13]; MUST NOT raise."""
        history = _build_n_day_history(n_days, total_db=100)
        result = compute_readiness_calibrated(history, components={})
        assert result["fit_quality"] == "insufficient_history"
        assert result["weights"] == {
            "accuracy": 0.25, "coverage": 0.25,
            "retention": 0.30, "consistency": 0.20, "intercept": 0.0,
        }

    @pytest.mark.unit
    def test_boundary_n_minus_1_equals_14_may_calibrate():
        """REQ-HF6b-2: N-1 = 14 with strong planted linear relationship → calibrated."""
        history = _build_linear_history(
            n_days=15, total_db=100,
            weights={"accuracy":0.3,"coverage":0.2,"retention":0.4,"consistency":0.1},
            intercept=0.05, noise_sd=0.01, seed=42,
        )
        result = compute_readiness_calibrated(history, components={})
        assert result["fit_quality"] == "calibrated"

    @pytest.mark.unit
    def test_no_silent_fallback_tokens_in_module():
        """REQ-HF6b-5: module-level source scan for silent-fallback anti-patterns."""
        from pathlib import Path
        src = Path("scripts/master-report/eri_calibration.py").read_text()
        assert "np.nan_to_num" not in src, "silent fallback via nan_to_num forbidden (HF.3)"
        assert "return {}" not in src, "silent empty-dict return forbidden (HF.3)"
        # If `try:` present, `raise` MUST also be present (pairing rule from REQ-HF6b-5):
        if "try:" in src:
            assert "raise" in src, "try: present without explicit raise (HF.3 violation)"

  Run pytest → all 4 new tests FAIL on ImportError (module still missing compute_readiness_calibrated).
  test_no_silent_fallback_tokens_in_module will additionally fail once the symbol exists but before
  T4 compliance — transient RED state acceptable.

  Commit: `test(hf-6b): RED — HF.3 boundary + silent-fallback-token check`
</action>

<acceptance_criteria>
  - `grep -cE "def test_raises_when_n_minus_1_below_3|def test_labeled_fallback_for_n_minus_1_in_3_to_13|def test_boundary_n_minus_1_equals_14_may_calibrate|def test_no_silent_fallback_tokens_in_module" scripts/master-report/tests/test_eri_calibration.py` returns 4.
  - `grep -c "def _build_n_day_history\|def _build_linear_history" scripts/master-report/tests/test_eri_calibration.py` returns 2 (helpers defined — once by T1, unchanged here).
  - pytest still exits non-zero.
  - Byte-identity of lines 421-469 of generate_report.py still holds.
</acceptance_criteria>

<done_when>
  4 new test-function grep returns 4 AND both lock-status assertions still pass.
</done_when>
```

---

### T3 — RED: synthetic weight-recovery precision test (±0.05)

```xml
<read_first>
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/REQUIREMENTS.md lines 161-174 (REQ-HF6b-2 acceptance — synthetic history + recovered weights within ±0.05).
  - ~/.claude/plans/wondrous-popping-sunrise.md line 130 (the ±0.05 source).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/tests/test_eri_calibration.py (T1 + T2 — `_build_linear_history` helper reused here).
</read_first>

<action>
  Append to test_eri_calibration.py:

    @pytest.mark.unit
    def test_recovers_planted_weights_within_tolerance():
        """REQ-HF6b-2 + wondrous line 130: fit must recover planted linear weights within ±0.05."""
        planted = {"accuracy": 0.30, "coverage": 0.20, "retention": 0.40, "consistency": 0.10}
        planted_intercept = 0.05
        # N = 30 days → training rows = 29. Comfortably above the 14-row gate AND above
        # the noisy-conditioning risk documented in §7 R-B2. Tight noise (sd=0.01) → strong recovery.
        history = _build_linear_history(
            n_days=30, total_db=100,
            weights=planted, intercept=planted_intercept,
            noise_sd=0.01, seed=42,
        )
        components = build_daily_snapshots(history)[-1].__dict__
        result = compute_readiness_calibrated(history, components=components)
        assert result["fit_quality"] == "calibrated", f"expected calibrated, got {result['fit_quality']}"
        fitted = result["weights"]
        for k, planted_w in planted.items():
            assert abs(fitted[k] - planted_w) <= 0.05, (
                f"{k}: planted={planted_w}, fitted={fitted[k]}, "
                f"|diff|={abs(fitted[k]-planted_w)} > 0.05 (REQ-HF6b-2)"
            )
        assert abs(fitted["intercept"] - planted_intercept) <= 0.05

  The per-day row construction in `_build_linear_history` must produce ERI components (accuracy,
  coverage, retention, consistency) such that next-day accuracy satisfies the planted linear model
  within the specified noise budget. Document the construction math inline — the helper IS the
  test fixture's contract.

  Run pytest → FAILS with ImportError.

  Commit: `test(hf-6b): RED — synthetic weight recovery ±0.05`
</action>

<acceptance_criteria>
  - `grep -c "def test_recovers_planted_weights_within_tolerance" scripts/master-report/tests/test_eri_calibration.py` returns 1.
  - `grep -c "0.05" scripts/master-report/tests/test_eri_calibration.py` returns ≥ 1 (tolerance literal present).
  - `grep -c "compute_readiness_calibrated" scripts/master-report/tests/test_eri_calibration.py` returns ≥ 6 (imports + 5+ call sites across T1+T2+T3).
  - pytest exits non-zero on compute_readiness_calibrated-specific tests.
  - Byte-identity lock still held; Split=B still held.
</acceptance_criteria>

<done_when>
  T1+T2+T3 together land ≥ 10 new pytest items in test_eri_calibration.py (5 T1 + 4 T2 parametrized + 1 T3 — parametrize case counts depend on pytest expansion) AND both locks still held.
</done_when>
```

---

### T4 — GREEN: implement `compute_readiness_calibrated` in `eri_calibration.py`

> **⚠️ SUPERSEDED in CP3 (2026-04-23) by REQ-HF6b-7.** The pseudocode below
> describes the original **5-feature** OLS (`[accuracy, coverage, retention,
> consistency, 1.0]` → 5 coefficients). The **actual production implementation
> is 3-feature** OLS: `[accuracy, coverage, retention, 1.0]` → 4 coefficients,
> with `weights["consistency"] = 0.0` hardcoded for ABI stability. The
> `MIN_TRAINING_ROWS: int = 3` rationale comment (below) still correctly
> guards against under-determined fits, but the "5-coeff fit undefined"
> wording is stale — the current 4-coeff fit is also undefined for N-1 < 3.
> See REQ-HF6b-7 and `scripts/master-report/eri_calibration.py` at HEAD for
> authoritative shape. This section retained verbatim as pre-CP3 audit trail.

```xml
<read_first>
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/eri_calibration.py (entire 155-line file — T4 APPENDS; does NOT modify existing symbols).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/REQUIREMENTS.md lines 125-273 (REQ-HF6b-1..5 acceptance).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/tests/test_eri_calibration.py (tests that must go GREEN).
  - ~/.claude/plans/wondrous-popping-sunrise.md lines 122-130 (spec).
  - ~/.claude/rules/python/coding-style.md (PEP 8; type annotations on all signatures; @dataclass(frozen=True) already in file — do not duplicate).
  - ~/.claude/rules/python/hooks.md (use `logging`, not `print`).
  - §9 O-1 advisor verdict on FSRS data-leakage (MUST be closed before T4 starts).
</read_first>

<action>
  APPEND to scripts/master-report/eri_calibration.py (do NOT edit existing `DailySnapshot` or
  `build_daily_snapshots` — hf-6a lift; see §8 out-of-scope R-B4):

    import numpy as np   # add at top alongside existing imports

    # ---------- REQ-HF6b fallback constants ----------
    V2_FALLBACK_WEIGHTS: dict[str, float] = {
        "accuracy": 0.25,
        "coverage": 0.25,
        "retention": 0.30,
        "consistency": 0.20,
        "intercept": 0.0,
    }
    # Source: ~/.claude/plans/wondrous-popping-sunrise.md line 127.
    # REQ-HF6b-1: fit_quality literals are ENGLISH strings — internal machine contract.

    R2_GATE: float = 0.3   # wondrous line 127
    N_GATE: int = 14       # wondrous line 127: "n < 14 days" → fallback
    MIN_TRAINING_ROWS: int = 3   # REQ-HF6b-5: N-1 < 3 → explicit ValueError (5-coeff fit undefined)


    def _score_readiness(weights: dict[str, float], components: dict[str, float]) -> float:
        """Readiness = w·components · 100, clipped [0,100].

        Source: ~/.claude/plans/wondrous-popping-sunrise.md line 128.
        """
        linear = (
            weights["accuracy"]    * components.get("accuracy", 0.0)
          + weights["coverage"]    * components.get("coverage", 0.0)
          + weights["retention"]   * components.get("retention", 0.0)
          + weights["consistency"] * components.get("consistency", 0.0)
          + weights["intercept"]
        )
        return float(max(0.0, min(100.0, linear * 100.0)))


    def compute_readiness_calibrated(
        history: dict[str, Any],
        components: dict[str, float],
    ) -> dict[str, Any]:
        """Calibrated ERI readiness with OLS regression on daily snapshots.

        Contract (REQ-HF6b-1):
          {"readiness": float in [0,100], "weights": dict, "fit_quality": str}.

        Gates (REQ-HF6b-2, -3, -5):
          - N-1 < 3         → raise ValueError (HF.3 hard raise — regression undefined).
          - 3 <= N-1 < 14   → labeled fallback: fit_quality="insufficient_history", weights=V2.
          - N-1 >= 14 AND R² < 0.3  → labeled fallback: fit_quality="poor_fit", weights=V2.
          - N-1 >= 14 AND R² >= 0.3 → fit_quality="calibrated", weights=OLS coefficients.
        """
        snapshots = build_daily_snapshots(history)   # reuses hf-6a contract; may raise — propagated
        n_train = len(snapshots) - 1   # last day has no next-day target → excluded

        if n_train < MIN_TRAINING_ROWS:
            raise ValueError(
                f"compute_readiness_calibrated: N-1={n_train} < {MIN_TRAINING_ROWS}; "
                f"OLS regression with 5 coefficients is mathematically undefined with fewer "
                f"equations than unknowns. HF.3: refusing to return NaN/zeros/silent shrug."
            )

        if n_train < N_GATE:
            return {
                "readiness": _score_readiness(V2_FALLBACK_WEIGHTS, components),
                "weights": dict(V2_FALLBACK_WEIGHTS),   # copy — immutability
                "fit_quality": "insufficient_history",
            }

        # OLS via numpy.linalg.lstsq (REQ-HF6b-2; documented choice).
        # Rationale: numpy already in environment; lstsq handles ill-conditioning via SVD (rcond=None);
        # no scipy/statsmodels needed. If numpy is NOT in env (executor confirms at T4 start),
        # fall back to hand-rolled normal equations using stdlib `statistics` — see §8 numpy note.
        X_rows, y_rows = [], []
        for i in range(n_train):
            s = snapshots[i]
            X_rows.append([s.accuracy, s.coverage, s.retention, s.consistency, 1.0])  # intercept col
            y_rows.append(snapshots[i + 1].accuracy)   # wondrous 125-126: next-day accuracy target
        X = np.asarray(X_rows, dtype=float)
        y = np.asarray(y_rows, dtype=float)

        coeffs, _residuals, _rank, _sv = np.linalg.lstsq(X, y, rcond=None)
        w_acc, w_cov, w_ret, w_cons, intercept = (float(c) for c in coeffs)

        # In-sample R² (honest reading given no held-out set; see §7 R-B1 for the data-leakage note).
        y_pred = X @ coeffs
        ss_res = float(np.sum((y - y_pred) ** 2))
        ss_tot = float(np.sum((y - y.mean()) ** 2))
        r_squared = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

        fitted_weights = {
            "accuracy": w_acc, "coverage": w_cov, "retention": w_ret,
            "consistency": w_cons, "intercept": intercept,
        }

        if r_squared < R2_GATE:
            return {
                "readiness": _score_readiness(V2_FALLBACK_WEIGHTS, components),
                "weights": dict(V2_FALLBACK_WEIGHTS),
                "fit_quality": "poor_fit",
            }

        return {
            "readiness": _score_readiness(fitted_weights, components),
            "weights": fitted_weights,
            "fit_quality": "calibrated",
        }

  No `try:` / `except:` anywhere. REQ-HF6b-5 compliance: simplest way is no try. If numpy.lstsq
  raises `np.linalg.LinAlgError` on a degenerate matrix, let it propagate — HF.3 loud failure.

  No `np.nan_to_num`. No `print(...)`. Use `import logging; log = logging.getLogger(__name__);
  log.debug(...)` if runtime instrumentation needed (per ~/.claude/rules/python/hooks.md).

  Run `pytest scripts/master-report/tests/test_eri_calibration.py -q` → all tests PASS
  (hf-6a's 5 + T1+T2+T3 tests).

  Verify Split=B STILL held:
    grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py
  Must return 0 matches — T4 does NOT touch generate_report.py.

  Commit: `feat(hf-6b): compute_readiness_calibrated — OLS fit + v2 fallback + HF.3 raise`
</action>

<acceptance_criteria>
  - `pytest scripts/master-report/tests/test_eri_calibration.py -q` exits 0 (all T1+T2+T3 + hf-6a tests GREEN).
  - `grep -n "def compute_readiness_calibrated" scripts/master-report/eri_calibration.py` returns 1 match.
  - `grep -n "import numpy" scripts/master-report/eri_calibration.py` returns 1 match (OR hand-rolled fallback if numpy unavailable — document choice in commit body).
  - `grep -n "np.nan_to_num" scripts/master-report/eri_calibration.py` returns 0 matches (REQ-HF6b-5).
  - `grep -n "return {}" scripts/master-report/eri_calibration.py` returns 0 matches (REQ-HF6b-5).
  - `grep -n "try:" scripts/master-report/eri_calibration.py` returns 0 matches.
  - `grep -n "print(" scripts/master-report/eri_calibration.py` returns 0 matches.
  - `python -c "import ast; ast.parse(open('scripts/master-report/eri_calibration.py').read())"` OK.
  - `grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py` STILL returns 0 matches (Split=B still held).
  - `diff <(git show 639ea3b:scripts/master-report/generate_report.py | sed -n '421,469p') <(sed -n '421,469p' scripts/master-report/generate_report.py)` STILL produces zero output (byte-identity still held).
  - `grep -n "@dataclass(frozen=True)" scripts/master-report/eri_calibration.py` returns 1 match (hf-6a `DailySnapshot` unchanged).
  - No edits to any file other than `scripts/master-report/eri_calibration.py`.
</acceptance_criteria>

<done_when>
  pytest GREEN on test_eri_calibration.py AND both lock-status assertions still pass.
</done_when>
```

---

### T5 — HTML surface: render `fit_quality` as user-visible text in `generate_html`

```xml
<read_first>
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/generate_report.py (locate `def generate_html`; read the readiness-rendering region of the template).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/REQUIREMENTS.md lines 177-216 (REQ-HF6b-3 Law 1 extension).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/phases/hf-6b/CP-STATE.md lines 49-50 (Design Decision 2: Hebrew preferred; visible-HTML language at executor's discretion).
</read_first>

<action>
  In generate_html (or whichever function emits the readiness block of the HTML report), add a
  CONDITIONAL VISIBLE element when `fit_quality != "calibrated"`. Ship this BEFORE T6 so there is
  no window where fit_quality sits in the payload but is never rendered (silent-fallback
  avoidance; §7 R-B3).

  Mode: ship template change first (harmless pre-T6 because legacy compute_readiness doesn't
  populate fit_quality → lookup is None → badge doesn't render). After T6, the key is populated
  and the badge activates.

  Minimum visible shape (executor may adjust copy; Hebrew preferred per Design Decision 2):

    <!-- inserted inside generate_html's readiness block -->
    {% if readiness.get("fit_quality") and readiness["fit_quality"] != "calibrated" %}
      <div class="readiness-fit-quality-banner"
           style="padding:8px; margin:8px 0; border:1px solid #ccc; background:#fffbe6;">
        {% if readiness["fit_quality"] == "insufficient_history" %}
          ⚠ ציון הכשירות כרגע מחושב עם משקלים ברירת-מחדל (היסטוריה של פחות מ-14 ימים).
        {% elif readiness["fit_quality"] == "poor_fit" %}
          ⚠ ציון הכשירות כרגע מחושב עם משקלים ברירת-מחדל (דיוק המודל נמוך).
        {% endif %}
      </div>
    {% endif %}

  (Generate_report.py may use f-strings / string concatenation rather than Jinja; executor
  translates the conditional into the existing template style. The KEY REQUIREMENT is the text is
  visibly rendered when fit_quality ≠ "calibrated".)

  FORBIDDEN patterns (each violates REQ-HF6b-3 Law 1 extension):
    - `<!-- ... fit_quality ... -->`             (HTML comment — not rendered)
    - `style="display:none"` on the banner        (not user-visible)
    - `data-fit-quality="..."` attribute only     (not rendered as text)
    - `title=` tooltip only                       (not always visible)

  Post-patch verification (in-task, not deferred): add a small inline test (append to
  test_eri_calibration.py OR create test_generate_html_fit_quality.py) that:
    - Builds a synthetic readiness dict with fit_quality="insufficient_history".
    - Calls generate_html (or the specific readiness-block renderer if available).
    - Asserts the executor-chosen Hebrew/English visible substring appears in the output string.
  REQ-HF6b-3 formal integration test is at CP6; this inline test is a pre-check.

  Byte-identity lock on lines 421-469 is STILL held at T5 end (T5 touches ONLY the generate_html
  template region, NOT the compute_readiness body).

  Commit: `feat(hf-6b): surface fit_quality as user-visible HTML text (Law 1 extension)`
</action>

<acceptance_criteria>
  - `git diff 639ea3b -- scripts/master-report/generate_report.py` shows edits in the generate_html
    region ONLY; lines 421-469 untouched.
  - `grep -nE "fit_quality" scripts/master-report/generate_report.py` returns ≥ 1 match inside the
    generate_html region.
  - Post-patch inline-test substring grep on rendered HTML (with fit_quality="insufficient_history"
    fixture) returns ≥ 1 match.
  - `grep -nE "<!--.*fit_quality.*-->|display:\s*none.*fit_quality" scripts/master-report/generate_report.py`
    returns 0 matches (no comment-only / hidden-only surfacing).
  - `diff <(git show 639ea3b:scripts/master-report/generate_report.py | sed -n '421,469p') <(sed -n '421,469p' scripts/master-report/generate_report.py)`
    produces zero output (byte-identity STILL held at T5 end).
  - `grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py`
    STILL returns 0 matches (Split=B STILL held at T5 end — wire-in is T6).
</acceptance_criteria>

<done_when>
  Rendered HTML contains user-visible fit_quality text when flag ≠ "calibrated", AND both locks still held.
</done_when>
```

---

### T6 — Wire-in `compute_readiness_calibrated` + DELETE legacy `compute_readiness`

```xml
<read_first>
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/generate_report.py lines 421-469 (compute_readiness body — to be DELETED).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/generate_report.py line 570 (call site: `readiness = compute_readiness(data, basics, mc, bootstrap)` — to be REPLACED; line number may have shifted ±2 due to hf-6a additive block).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/generate_report.py imports region (top of file — add `from eri_calibration import compute_readiness_calibrated, build_daily_snapshots`).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/REQUIREMENTS.md lines 219-245 (REQ-HF6b-4 acceptance).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/eri_calibration.py (T4 artifact).
  - Commit b1584f3 history — HF.5b deprecate-then-delete precedent (`compute_ebbinghaus` → `compute_decay_from_srs`).
</read_first>

<action>
  Two sub-steps — SHIPPED IN ONE COMMIT (or two tightly-adjacent commits that MUST be pushed
  together) so generate_report.py is never briefly broken between them.

  Sub-step 6a: WIRE-IN.
    - Add to imports block (alphabetically / matching existing style):
        from eri_calibration import build_daily_snapshots, compute_readiness_calibrated
      Note on import path: scripts/master-report/ hyphen means both files live in the same dir
      and `from eri_calibration import ...` works when generate_report.py runs from that dir
      (consistent with the existing intra-module imports; §7 R-B6).

    - At the call site (currently ~line 570):
        BEFORE: readiness = compute_readiness(data, basics, mc, bootstrap)
        AFTER:  # ERI readiness — calibrated OLS fit with v2 fallback (REQ-HF6b-4).
                # Replaces legacy compute_readiness (HF.5b deprecate-then-delete precedent, b1584f3).
                last_snapshot = build_daily_snapshots(data)[-1]
                components = {
                    "accuracy":    last_snapshot.accuracy,
                    "coverage":    last_snapshot.coverage,
                    "retention":   last_snapshot.retention,
                    "consistency": last_snapshot.consistency,
                }
                readiness = compute_readiness_calibrated(data, components)

      `data` here is the dict returned by fetch_data — hf-6a extended it with `answer_history`
      and `total_db`, which are the two keys build_daily_snapshots requires.

    Split=B lock is LIFTED at this point (hf-6a VERIFICATION Proof 4 now intentionally returns ≥ 1 match).

  Sub-step 6b: DELETE legacy compute_readiness.
    - Remove lines 421-469 of generate_report.py verbatim — the entire
      `def compute_readiness(data, basics, mc, bootstrap): ... return {...}` body.
    - Verify no orphan callers:
        grep -nE "compute_readiness\(" scripts/master-report/generate_report.py
      Must return 0 matches after deletion. Note: the trailing `(` is INTENTIONAL — it matches the
      function CALL `compute_readiness(` but NOT `compute_readiness_calibrated(` (which contains
      additional chars before the `(`).

    Byte-identity lock is LIFTED at this point (hf-6a VERIFICATION Proof 1 now intentionally
    returns non-empty diff).

  Final in-task verification (REQ-HF6b-4 terminal-state checks):
    grep -n "def compute_readiness(" scripts/master-report/generate_report.py          # expect 0
    grep -n "compute_readiness_calibrated\|eri_calibration" scripts/master-report/generate_report.py  # expect ≥ 1
    grep -nE "compute_readiness\(" scripts/master-report/generate_report.py            # expect 0 (no orphan callers)
    python -c "import ast; ast.parse(open('scripts/master-report/generate_report.py').read())"  # exit 0
    python -c "import sys; sys.path.insert(0,'scripts/master-report'); import generate_report"  # exit 0

  Commit: `refactor(hf-6b): wire compute_readiness_calibrated + delete legacy compute_readiness`
</action>

<acceptance_criteria>
  - `grep -n "def compute_readiness(" scripts/master-report/generate_report.py` returns 0 matches (REQ-HF6b-4).
  - `grep -n "compute_readiness_calibrated\|eri_calibration" scripts/master-report/generate_report.py` returns ≥ 1 match (Split=B released).
  - `grep -nE "compute_readiness\(" scripts/master-report/generate_report.py` returns 0 matches (no orphan callers — trailing `(` is INTENTIONAL and does NOT match `compute_readiness_calibrated(`).
  - `python -c "import ast; ast.parse(open('scripts/master-report/generate_report.py').read())"` exits 0.
  - `python -c "import sys; sys.path.insert(0,'scripts/master-report'); import generate_report"` exits 0.
  - `diff <(git show 639ea3b:scripts/master-report/generate_report.py | sed -n '421,469p') <(sed -n '421,469p' scripts/master-report/generate_report.py)` produces NON-empty output (byte-identity intentionally released).
  - No new feature flag added (deprecate-then-delete, not flags).
</acceptance_criteria>

<done_when>
  All 5 grep/ast/import checks pass. `pytest scripts/master-report/tests/ -q` either GREEN
  completely OR the only failures are in test_compute_readiness.py — acceptable transient state
  until T7 lands (both T6 and T7 must ship before any push).
</done_when>
```

---

### T7 — Update/delete `test_compute_readiness.py`

```xml
<read_first>
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/tests/test_compute_readiness.py (114 lines; 4 tests; line 33 imports `compute_readiness`).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/REQUIREMENTS.md lines 231-245 (REQ-HF6b-4 option (a) delete vs option (b) refactor).
  - /Users/idankatz15/Desktop/3_APP_DEV/repo-temp/scripts/master-report/tests/test_eri_calibration.py (confirm T1/T2 together cover equivalent HF.3-guard behavior for compute_readiness_calibrated).
</read_first>

<action>
  Option (a) — DELETE (RECOMMENDED):
    rm scripts/master-report/tests/test_compute_readiness.py

  Safe because the 4 legacy tests were guarding the LEGACY compute_readiness formula (accuracy /
  critical / consistency components with specific 50-fallback history) — that formula no longer
  exists. The tests test ghosts. Meanwhile T1/T2 together cover the equivalent HF.3 loud-failure
  guarantee for compute_readiness_calibrated (test_raises_when_n_minus_1_below_3,
  test_labeled_fallback_for_n_minus_1_in_3_to_13, test_no_silent_fallback_tokens_in_module).

  Option (b) — REFACTOR:
    Rewrite each of the 4 tests to exercise compute_readiness_calibrated. Likely duplicates T1/T2
    coverage. Not recommended.

  Default: (a) DELETE. If (b) is chosen, document why in the commit body.

  After the decision:
    pytest scripts/master-report/tests/ -q
  Must exit 0 — full suite GREEN (hf-6a tests + T1+T2+T3+T4 GREEN; legacy file gone or refactored).

  Commit (option a): `refactor(hf-6b): delete legacy test_compute_readiness.py (ghosts of deleted function)`
  Commit (option b): `refactor(hf-6b): port test_compute_readiness.py guards to compute_readiness_calibrated`
</action>

<acceptance_criteria>
  - `pytest scripts/master-report/tests/ -q` exits 0 with ≥ 10 tests passing.
  - Option (a): `test -e scripts/master-report/tests/test_compute_readiness.py` returns exit 1 (file absent). OR
    Option (b): `grep -n "from generate_report import compute_readiness" scripts/master-report/tests/test_compute_readiness.py` returns 0 matches.
  - `pytest scripts/master-report/tests/ --collect-only -q` exits 0 (no import errors at collection).
</acceptance_criteria>

<done_when>
  Full test suite GREEN; no orphan test file importing a deleted symbol.
</done_when>
```

---

## Section 4 — Acceptance (verifiable shell commands)

Each REQ-HF6b-* translated to concrete commands. Executor runs these at end of Wave C and records
results for CP4 handoff.

### REQ-HF6b-1 — function signature + return-dict contract
```bash
python -c "
import sys; sys.path.insert(0, 'scripts/master-report')
from eri_calibration import compute_readiness_calibrated
import inspect
sig = inspect.signature(compute_readiness_calibrated)
assert list(sig.parameters.keys()) == ['history', 'components'], f'params: {list(sig.parameters.keys())}'
print('ok')
"
# (must print exactly: ok)

# fit_quality values are English literals present in the module source:
grep -nE "'calibrated'|\"calibrated\"|'insufficient_history'|\"insufficient_history'|'poor_fit'|\"poor_fit\"" \
     scripts/master-report/eri_calibration.py
# (must return ≥ 3 matches)
```

### REQ-HF6b-2 — OLS fit + synthetic weight recovery
```bash
pytest scripts/master-report/tests/test_eri_calibration.py::test_recovers_planted_weights_within_tolerance -q
# (must exit 0)

grep -n "np.linalg.lstsq" scripts/master-report/eri_calibration.py
# (must return ≥ 1 match — documented OLS backend per REQ-HF6b-2)

grep -n "intercept" scripts/master-report/eri_calibration.py
# (must return ≥ 1 match — intercept column / term included)
```

### REQ-HF6b-3 — fallback + HTML surfacing (Law 1 extension)
```bash
pytest scripts/master-report/tests/test_eri_calibration.py::test_branch_insufficient_history \
       scripts/master-report/tests/test_eri_calibration.py::test_branch_poor_fit \
       scripts/master-report/tests/test_eri_calibration.py::test_branch_calibrated -q
# (must exit 0)

# HTML surfacing (T5 inline test or equivalent):
python -c "
import sys; sys.path.insert(0, 'scripts/master-report')
from generate_report import generate_html   # actual import name varies — executor adapts
# Build minimal fixture with readiness={'fit_quality':'insufficient_history', ...}
# html = generate_html(fixture)
# assert '<executor-chosen-visible-substring>' in html
print('ok')
"
# (must succeed — substring present in rendered HTML)
```

### REQ-HF6b-4 — wire-in + deletion
```bash
grep -n "def compute_readiness(" scripts/master-report/generate_report.py
# (must return 0 matches)

grep -n "compute_readiness_calibrated\|eri_calibration" scripts/master-report/generate_report.py
# (must return ≥ 1 match)

grep -nE "compute_readiness\(" scripts/master-report/generate_report.py
# (must return 0 matches — trailing `(` intentional; does NOT match `compute_readiness_calibrated(`)

# Legacy test file gone or refactored:
test ! -e scripts/master-report/tests/test_compute_readiness.py \
  || ! grep -q "from generate_report import compute_readiness" scripts/master-report/tests/test_compute_readiness.py
# (must exit 0)

pytest scripts/master-report/tests/ -q
# (must exit 0 — full suite green)
```

### REQ-HF6b-5 — HF.3 invariant (no silent OLS degradation)
```bash
pytest scripts/master-report/tests/test_eri_calibration.py::test_raises_when_n_minus_1_below_3 \
       scripts/master-report/tests/test_eri_calibration.py::test_labeled_fallback_for_n_minus_1_in_3_to_13 \
       scripts/master-report/tests/test_eri_calibration.py::test_boundary_n_minus_1_equals_14_may_calibrate \
       scripts/master-report/tests/test_eri_calibration.py::test_no_silent_fallback_tokens_in_module -q
# (must exit 0)

grep -n "np.nan_to_num" scripts/master-report/eri_calibration.py   # (must return 0)
grep -n "return {}" scripts/master-report/eri_calibration.py        # (must return 0)

# If any try: present, at least one raise must also be present:
if grep -q "try:" scripts/master-report/eri_calibration.py; then
  grep -cn "raise " scripts/master-report/eri_calibration.py        # (must be ≥ 1)
fi
```

---

## Section 5 — Rollback

**Single revert target.** The Wave C commit(s) (T5 + T6 + T7) are where hf-6b becomes user-visible
and where both hf-6a locks release. Rolling back hf-6b = reverting those commits in reverse
chronological order.

```bash
# Identify the Wave C commits:
git log --oneline --grep "hf-6b" | head -10

# Revert in reverse chronological order (last commit first):
git revert <T7_SHA>   # legacy tests restore
git revert <T6_SHA>   # unwire + restore compute_readiness
git revert <T5_SHA>   # remove HTML fit_quality banner
```

**Post-rollback guarantees:**
- `diff <(git show 639ea3b:scripts/master-report/generate_report.py | sed -n '421,469p') <(sed -n '421,469p' scripts/master-report/generate_report.py)` → zero output (byte-identity RESTORED).
- `grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py` → 0 matches (Split=B RESTORED).
- `pytest scripts/master-report/tests/test_compute_readiness.py -q` → 4 passed (legacy tests restored if T7 reverted).
- `eri_calibration.py::compute_readiness_calibrated` remains in place (Wave B is callable-only, additive, safe to keep even under Wave C revert).

**Recovery time:** < 5 minutes per `git revert` (no hard reset, history preserved).

**Safety anchor tag:** `hf-6b-wave-b-complete` — create after T4 GREEN, before T5/T6/T7. Allows
`git reset --hard hf-6b-wave-b-complete` as alternative to revert if squash-merge policy requires clean history.

---

## Section 6 — Merge-Gate Checklist (DEFERRED)

**Status: DEFERRED to end of hf-6c.**

Per CP-STATE.md lines 28-30: *"CP6 deferred (merge-gate runs at end of hf-6c, all three phases
together)."* This phase contributes the following invariants to the future hf-6c merge-gate:

- REQ-HF6b-4: `def compute_readiness(` count = 0 AND `compute_readiness_calibrated|eri_calibration` count ≥ 1 in generate_report.py.
- REQ-HF6b-3 Law 1 extension: rendered HTML on `insufficient_history`/`poor_fit` fixture contains user-visible text.
- REQ-HF6b-5 HF.3: no silent-fallback tokens in eri_calibration.py (grep assertions from §4).
- Full `pytest scripts/master-report/tests/ -q` GREEN.

hf-6c planner is responsible for composing the full three-phase merge-gate. hf-6b does NOT ship a CP6.

---

## Section 7 — Risks & Mitigations

| ID | Risk | Status | Mitigation |
|----|------|--------|-----------|
| **R-B1** | **FSRS data-leakage (Not-a-REQ, REQUIREMENTS.md 275-294).** Retention in `build_daily_snapshots` (hf-6a placeholder + future FSRS integration) carries look-ahead bias when FSRS params are calibrated on full history. OLS in T4 fits on a biased feature. | **DEFERRED to CP2 brainstorm** | Advisor picks among 3 candidates BEFORE T4: (a) FSRS defaults (no per-user calibration); (b) rolling-window time-series CV; (c) document-and-accept. Outcome recorded in CP-STATE.md + referenced by §9 O-1. Does NOT block CP1 — plan is valid under any outcome. If (c): T4 ships as specified. If (a) or (b): T4 adds an FSRS-recalibration step. |
| **R-B2** | **Numerical conditioning of OLS with 14-20 rows.** 5 coefficients on 14-20 rows may produce near-singular X if components are highly correlated. SVD via `np.linalg.lstsq(rcond=None)` handles it, but weights may be unstable. | **MITIGATED** | T3 weight-recovery test uses N=30 + noise_sd=0.01 for strong signal. If flaky in CI, raise N to 50 or tighten noise. `rcond=None` intentional and documented in T4. Ridge/Lasso → out-of-scope (§8). |
| **R-B3** | **HTML-surfacing silent-fallback regression.** If T6 (wire-in) ships before T5 (HTML surface), OR if T5 uses HTML comment / display:none / data-attribute, REQ-HF6b-3 Law 1 extension fails — fit_quality in payload but never rendered → silent fallback. | **MITIGATED** | Ordering: **T5 before T6** (per task table dependency chain). T5 acceptance explicitly rejects comment-only / hidden-only patterns (grep assertions). CP4 code review explicitly inspects T5 diff. |
| **R-B4** | **hf-6a symbols locked.** T4 must NOT modify `DailySnapshot` or `build_daily_snapshots` — 5 hf-6a tests depend on byte-identity. | **HARD-LOCKED** | T4 action explicitly APPENDS; §8 bans edits; T4 acceptance includes `grep -n "@dataclass(frozen=True)"` must return 1 (unchanged from hf-6a). |
| **R-B5** | **T6→T7 transient failure window.** Between T6 (deletes compute_readiness) and T7 (removes test file), test_compute_readiness.py::test_* fail on ImportError. | **ACCEPTED (transient)** | Expected between T6 and T7 commits. Both MUST ship before any push. Compaction-gate mid-window: MUST finish T7 before wrap-up per project compaction protocol. |
| **R-B6** | **Import path hyphen issue** (hf-6a R-11 carryover): `scripts/master-report/` hyphen is not a valid Python package name. T6 adds `from eri_calibration import ...` to generate_report.py. | **MITIGATED** | Both files in same dir. When generate_report.py runs via `python scripts/master-report/generate_report.py`, Python auto-inserts that dir at sys.path[0] → bare `from eri_calibration import ...` resolves. Matches existing intra-module imports in generate_report.py. |
| **R-B7** | **CP2 brainstorm not yet run** — R-B1 depends on it, plan written at CP1. | **ACKNOWLEDGED** | §9 O-1 surfaces this to advisor. Does NOT block — T1/T2/T3 RED tests can begin immediately after CP1 approval; CP2 brainstorm runs in parallel in advisor window. Advisor verdict on R-B1 MUST land before T4 starts. |

---

## Section 8 — Out of Scope (explicit exclusions)

| Exclusion | Phase | Why Out of Scope for hf-6b |
|-----------|-------|----------------------------|
| Any edit to `DailySnapshot` or `build_daily_snapshots` in eri_calibration.py | Locked hf-6a lift | 5 hf-6a tests + hf-6a VERIFICATION Proof 3 depend on byte-identity. T4 APPENDS only. |
| HF.3-unrelated HTML rework (restyling, other banners, new tiles) | hf-6c or later | hf-6b HTML edit is ONLY the fit_quality badge. Any other HTML diff is scope creep. |
| FSRS retention formula overhaul (replace placeholder in build_daily_snapshots) | hf-6c or later | Explicitly Not-a-REQ (REQUIREMENTS.md 275-294). R-B1 mitigation may add FSRS-step for OLS feature extraction only — NOT a formula change in build_daily_snapshots. |
| Ridge / Lasso / any regularization on OLS | hf-6c or later | REQ-HF6b-2 specifies plain OLS. Regularization = separate modeling decision. |
| Time-series cross-validation for R² (vs in-sample R²) | hf-6c or later | REQ-HF6b-2 + wondrous 127 just say "R² < 0.3"; in-sample R² honest given no held-out set. |
| Feature flag for v3 readiness toggle | Never (hotfix track) | HF.5b precedent: deprecate-then-delete, no flag. T6 is atomic. |
| CP6 merge-gate with all grep assertions | hf-6c | Per CP-STATE.md: runs end of hf-6c for all three phases. |
| Any `src/` TypeScript/React change | Never in hf-6b | Python-only scope. |
| Supabase schema changes | Never in hf-6b (read-only) | `answer_history` raw access already provided by hf-6a's additive query extension. |
| New Python dependencies beyond numpy | hf-6c or later | T4 uses numpy.linalg.lstsq. If numpy NOT already in env (executor confirms at T4 start via `grep numpy scripts/master-report/requirements.txt` or equivalent), fall back to hand-rolled normal-equations solver using stdlib `statistics` — same math, same interface. Primary plan assumes numpy present; fallback documented. |

---

## Section 9 — Open Questions for Advisor

| ID | Question | Blocks which task? | Recommended resolution path |
|----|----------|--------------------|-----------------------------|
| **O-1** | **FSRS data-leakage (Not-a-REQ, REQUIREMENTS.md 275-294).** Which mitigation does the advisor adopt: (a) FSRS defaults, (b) time-series CV rolling window, (c) document-and-accept? | T4 GREEN only — specifically whether T4 prepends an FSRS-recalibration step before building X. Does NOT block T1/T2/T3 RED. | Advisor CP2 brainstorm. Outcome recorded in CP-STATE.md + referenced by name (not line) from REQUIREMENTS.md Not-a-REQ section and this §9 row. Silent default: (c) document-and-accept. |
| **O-2** | **Shape of `components` argument in `compute_readiness_calibrated(history, components)`.** REQ-HF6b-1 says `components: dict[str, float]` with keys {accuracy, coverage, retention, consistency}. Plan assumes the function accepts an EXPLICIT components dict (caller chooses which day's components). Alternative: derive internally from `build_daily_snapshots(history)[-1]` (1-arg signature). Wondrous spec says `compute_readiness_calibrated(history, components) → {...}` — 2-arg confirmed unless advisor overrides. | T4 signature final. Does NOT block T1/T2/T3 (tests written against 2-arg; trivial update if changed to 1-arg). | Advisor one-line confirmation at CP2 or CP3 start. Silent default: 2-arg signature as planned. |

---

**End of PLAN.md — ready for `gsd-plan-checker`.**
