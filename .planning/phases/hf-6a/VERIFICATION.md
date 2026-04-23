---
phase: hf-6a
checkpoint: CP4
type: verification
branch: phase-1-stats-cleanup
baseline_sha: b1584f3
---

# hf-6a — VERIFICATION

## CP4 Evidence — REQ-HF6a-5 Byte-Identity + No-Scope-Creep

Six proof commands run verbatim from PLAN.md §3 T5 action block. Each proof
records the command, full output (verbatim), and exit code.

---

### Proof 1 — `compute_readiness` body byte-identical to `b1584f3` (lines 421-469)

**Command:**

```bash
diff <(git show b1584f3:scripts/master-report/generate_report.py | sed -n '421,469p') \
     <(sed -n '421,469p' scripts/master-report/generate_report.py)
```

**Output:** *(empty)*

**Exit code:** `0`

**Result:** **PASS** — lines 421-469 are byte-identical pre/post hf-6a.
REQ-HF6a-5 byte-identity invariant holds.

---

### Proof 2 — `test_compute_readiness.py` unchanged since `b1584f3`

**Command:**

```bash
git diff b1584f3 -- scripts/master-report/tests/test_compute_readiness.py
```

**Output:** *(empty)*

**Exit code:** `0`

**Result:** **PASS** — legacy test file preserved verbatim. REQ-HF6a-5
test-preservation invariant holds.

---

### Proof 3 — 4 legacy `compute_readiness` tests green

**Command:**

```bash
pytest scripts/master-report/tests/test_compute_readiness.py -q
```

**Output:**

```
....                                                                     [100%]
4 passed in 2.74s
```

**Exit code:** `0`

**Result:** **PASS** — all 4 legacy tests green.

---

### Proof 4 — `build_daily_snapshots` NOT wired into `compute_all` (Split=B lock)

**Command:**

```bash
grep -n "build_daily_snapshots\|eri_calibration" scripts/master-report/generate_report.py
```

**Output:** *(empty)*

**Exit code:** `1` (grep semantics: no match → exit 1 = success condition for "absence" check)

**Result:** **PASS** — 0 matches. Split=B lock enforced: `eri_calibration.py`
is callable-only, not referenced from `generate_report.py`.

---

### Proof 5 — No HTML change

**Command:**

```bash
git diff b1584f3 -- scripts/master-report/generate_report.py | grep -E "generate_html|html_template|<td|<tr"
```

**Output:** *(empty)*

**Exit code:** `1` (grep semantics: no match → exit 1 = success condition)

**Result:** **PASS** — 0 matches. No HTML template / generator changes.
Scope-lock holds.

---

### Proof 6 — No hf-6b scope creep (tightened, CP4-revised)

**Tightening note (applied CP4 Step 1):** Original grep included `OLS` which
matched pre-existing `compute_ols_trend` (HF.3, commit 3236022) — that
function computes daily-accuracy trend for the HTML chart; unrelated to
hf-6b's planned `compute_readiness_calibrated` regression over ERI
components. `_legacy_v2/` and cache dirs excluded as archival /
auto-generated. Scoped to hf-6b-unique tokens only.

**Command:**

```bash
grep -rn --exclude-dir=_legacy_v2 --exclude-dir=__pycache__ --exclude-dir=.pytest_cache \
     "compute_readiness_calibrated\|fit_quality\|weight_swap" scripts/master-report/
```

**Output:** *(empty)*

**Exit code:** `1` (grep semantics: no match → exit 1 = success condition)

**Result:** **PASS** — 0 matches on hf-6b-unique tokens. No scope creep
into hf-6b from hf-6a.

---

## Byte-Identity Proof — Summary

| # | Proof | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 1 | `compute_readiness` byte-identity (421-469) | empty diff, exit 0 | empty diff, exit 0 | PASS |
| 2 | `test_compute_readiness.py` unchanged | empty diff, exit 0 | empty diff, exit 0 | PASS |
| 3 | 4 legacy tests green | `4 passed`, exit 0 | `4 passed in 2.74s`, exit 0 | PASS |
| 4 | Split=B lock (no wire-in) | 0 matches | 0 matches (grep exit 1) | PASS |
| 5 | No HTML change | 0 matches | 0 matches (grep exit 1) | PASS |
| 6 | No hf-6b scope creep (tightened) | 0 matches | 0 matches (grep exit 1) | PASS |

**All 6 proofs PASS.**

REQ-HF6a-5 byte-identity lock, Split=B callable-only enforcement, no HTML
change, and no hf-6b scope creep all verified. CP4 GREEN gate complete.

New tests (T0 + T1 + T2 × 3 parametrize = 5 pytest items / 3 test functions):
`pytest scripts/master-report/tests/test_eri_calibration.py -q` → `5 passed`,
exit 0.

---

## Supersession note — `consistency` formula (added 2026-04-23, hf-6b CP3)

The `consistency` formula in `build_daily_snapshots`
(originally: `1.0 - statistics.stdev(daily_accuracies) / 0.5` —
cumulative over full history) is **superseded** in hf-6b by
REQ-HF6b-7 (3-feature OLS model: accuracy, coverage, retention +
intercept). Note: REQ-HF6b-6 was drafted (rolling-window consistency)
but withdrawn on arrival per CP3 HARD STOP v3 Option (a) — see
REQUIREMENTS.md REQ-HF6b-6 block (retained for audit) and CP3
diagnostic in git log.

REQ-HF6a-1 acceptance criteria (`DailySnapshot.consistency: float ∈ [0, 1]`,
component presence) **still hold** under the new formula. This is
**not** a formal hf-6a re-open — hf-6a's
`test_build_daily_snapshots_shape_and_values` explicitly documented
the consistency formula as a placeholder
(`"placeholder formulas; hf-6b will swap"` — inline comment at
`tests/test_eri_calibration.py:126`), so this is the deferred
completion of the originally-anticipated swap.

Byte-identity lock on `compute_readiness` (`generate_report.py:421-469`)
and Split=B (callable-only, no wire-in) both remain in force.
