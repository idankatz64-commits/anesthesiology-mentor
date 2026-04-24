---
phase: hf-6c
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/master-report/generate_report.py
  - scripts/master-report/eri_calibration.py  # T5 Step 0 only — 1-line additive `r2` key (Q-1 resolution c, 2026-04-23)
  - scripts/master-report/tests/test_compute_readiness.py           # T7 Step 5 — DELETED (Q-5 resolution: למחוק, 2026-04-23)
autonomous: false
requirements:
  - REQ-HF6c-1
  - REQ-HF6c-2
  - REQ-HF6c-3
  - REQ-HF6c-4
user_setup:
  - service: supabase
    why: "Master-report smoke run needs live DB read for ERI regression baseline"
    env_vars:
      - name: SUPABASE_URL
        source: "Supabase Dashboard → Project ksbblqnwcmfylpxygyrj → Settings → API"
      - name: SUPABASE_SERVICE_ROLE_KEY
        source: "Supabase Dashboard → Project ksbblqnwcmfylpxygyrj → Settings → API → service_role"

must_haves:
  truths:
    - "Master-report HTML renders ERI value AND a Hebrew kpi-subtitle describing fit_quality"
    - "ERI value in HTML equals compute_readiness_calibrated(...).readiness when fit succeeds"
    - "On ValueError from calibrated path, HTML renders '—' sentinel (amber #FFB020) with Hebrew fallback subtitle"
    - "Legacy compute_readiness function is deleted (byte-identity lock releases)"
    - "No callsite of compute_readiness remains in generate_report.py (Split=B callable-only lock releases)"
    - "Radar chart still renders with accuracy/coverage/critical/consistency sub-scores after cutover"
    - "Terminal print line still emits readiness + hist_accuracy after cutover"
    - "All four requirements land in a single atomic push (REQ-HF6c-4)"
  artifacts:
    - path: "scripts/master-report/generate_report.py"
      provides: "Wave C cutover — T5 subtitle + T6 wire-in + T7 legacy deletion"
      contains: "compute_readiness_calibrated"
      must_not_contain: "def compute_readiness("
  key_links:
    - from: "scripts/master-report/generate_report.py (compute_all)"
      to: "scripts/master-report/eri_calibration.py::compute_readiness_calibrated"
      via: "direct function call with history + components dict"
      pattern: "compute_readiness_calibrated\\("
    - from: "scripts/master-report/generate_report.py (render_html)"
      to: "r['fit_quality'] + kpi-subtitle Hebrew template"
      via: "f-string interpolation inside existing ERI kpi-card"
      pattern: "kpi-subtitle"
    - from: "scripts/master-report/generate_report.py (compute_all try/except)"
      to: "Option B exception policy — catch ValueError, label token prefix, render '—'"
      via: "except ValueError as e: ... token = str(e).split(':',1)[0]"
      pattern: "except ValueError"
---

<objective>
Wave C cutover of ERI readiness calibration in the master-report HTML generator.

Three atomic surgical edits to `scripts/master-report/generate_report.py`:
1. **T5** — Surface `fit_quality` via a new Hebrew `kpi-subtitle` inside the existing ERI kpi-card.
2. **T6** — Wire `compute_readiness_calibrated` into `compute_all` with Option B exception policy (catch `ValueError`, render `"—"` sentinel). Split=B callable-only lock releases here.
3. **T7** — Delete the legacy `compute_readiness` function (lines 421-469 vs baseline `b1584f3`). Byte-identity lock releases here.

Purpose: Ship the calibrated ERI into the only surface that currently renders it (master-report HTML) without breaking the radar chart shape, the terminal summary, or the atomic-push invariant. Scope strictly limited to master-report — live-app `StatsView` is OUT OF SCOPE per user directive "לא נקדים את המאוחר" (2026-04-23).

Output: Single modified file `scripts/master-report/generate_report.py`; all Wave C locks released; ready for CP2 code-review audit.
</objective>

<scope_anchors>
**IN SCOPE:**
- `scripts/master-report/generate_report.py` only
- ERI kpi-card HTML template + surrounding CSS (.kpi-subtitle addition)
- `compute_all` function — wire calibrated path + Option B exception handling
- Deletion of legacy `compute_readiness` (lines 421-469)
- Preservation of radar chart inputs (accuracy_score, coverage_score, critical_score, consistency_score) via extracted `_compute_*_fallback` helpers
- Preservation of terminal print shape (`r['readiness']`, `r['hist_accuracy']`)

**IN SCOPE (carve-outs added post Q-1..Q-5 2026-04-23):**
- `scripts/master-report/eri_calibration.py` — 1-line additive edit ONLY (add `"r2": float(r_squared)` to return dict, lines 313-317). No other changes permitted. Algorithm, fit logic, and error contract remain FROZEN. (Q-1 resolution c)
- `scripts/master-report/tests/test_compute_readiness.py` — DELETED in T7 commit window (Q-5 resolution: למחוק)

**OUT OF SCOPE (explicit):**
- `src/` live-app `StatsView` — deferred to a later phase per user directive
- `scripts/master-report/eri_calibration.py` — all other edits beyond the 1-line `r2` additive (algorithm, fit, error-contract remain FROZEN)
- `_legacy_v2/` archival callsites — excluded per hf-6a Proof 6
- Any shadow-mode or dual-render logic — killed by DD-4 CUTOVER ruling
</scope_anchors>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/hf-6c/CP-STATE.md
@.planning/phases/hf-6b/CP-STATE.md
@.planning/phases/hf-6a/VERIFICATION.md
@scripts/master-report/eri_calibration.py
@scripts/master-report/generate_report.py

<interfaces>
<!-- CRITICAL: Shape mismatch between new and old readiness return dicts. -->
<!-- Executor MUST handle this — do NOT explore codebase to re-derive. -->

From `scripts/master-report/eri_calibration.py` (FROZEN):
```python
def compute_readiness_calibrated(
    history: dict[str, Any],     # {"total_db": int, "answer_history": list[dict]}
    components: dict[str, float],  # accuracy, coverage, retention, consistency ∈ [0,1]
) -> dict[str, Any]:
    """
    Returns: {
        "readiness": float,          # ∈ [0, 100]
        "weights": dict[str, float], # per-component calibrated weights
        "fit_quality": str,          # ∈ {"calibrated", "insufficient_history", "poor_fit"}
    }
    Raises: ValueError with HF.3-token-prefixed message on:
        - insufficient_history:N-1<3 (fewer than 3 snapshots after leave-one-out)
        - bad_history:... (malformed history dict)
    Does NOT raise on poor_fit — returns fit_quality='poor_fit' with fallback weights.
    """
```

From legacy `compute_readiness` (lines 421-469, to be DELETED in T7):
```python
# Returns 7-key dict consumed downstream:
# {
#     'readiness': float,           # ← new path also provides this
#     'accuracy_score': float,      # ← consumed by radar chart line 790
#     'coverage_score': float,      # ← consumed by radar chart line 790
#     'critical_score': float,      # ← consumed by radar chart line 790
#     'critical_avg': float,        # ← legacy-internal only
#     'consistency_score': float,   # ← consumed by radar chart line 790
#     'hist_accuracy': float,       # ← consumed by terminal print line 866
# }
```

**Shape mismatch resolution (T6 strategy):**
Before T7 deletes `compute_readiness`, T6 extracts six helper functions from its body:
- `_compute_accuracy_score(basics) -> float`
- `_compute_coverage_score(basics) -> float`
- `_compute_critical_score(basics) -> float`
- `_compute_critical_avg(basics) -> float`
- `_compute_consistency_score(mc, bootstrap) -> float`
- `_compute_hist_accuracy(data, basics) -> float`

These helpers preserve the legacy per-component math verbatim. `compute_all` then:
1. Computes components via helpers.
2. Builds `components = {'accuracy': ..., 'coverage': ..., 'retention': ..., 'consistency': ...}` for the calibrated call.
3. Calls `compute_readiness_calibrated(history, components)` inside a try/except.
4. Merges return dict with helper outputs into the legacy 7-key shape for downstream consumers.

Downstream callsites inside `generate_report.py` that depend on the 7-key shape (verified live):
- **Line 746** — ERI kpi-card: `r['readiness']` (T5 target; T5 also adds `r['fit_quality']` read).
- **Line 790-791** — Radar chart: `r['accuracy_score']`, `r['coverage_score']`, `r['critical_score']`, `r['consistency_score']`.
- **Line 866-870** — Terminal print: `r['readiness']`, `r['hist_accuracy']`.

**Q5 fetch_data gap (verified line 127-131):**
Current SELECT returns only `answered_at, is_correct`. `build_daily_snapshots` (invoked inside the new calibrated path via `history`) needs `question_id` and `topic` per hf-6a REQ-HF6a-2. T6 Step 3 extends the SELECT additively — no shape break for existing consumers.
</interfaces>
</context>

<task_graph>
Wave 1 (sequential within plan — each task edits same file):
  T5 → T6 → T7 → CP1-verify

All three tasks touch `scripts/master-report/generate_report.py` → strictly sequential.
No parallelism possible within this plan.
</task_graph>

<tasks>

<task type="auto" tdd="false">
  <name>T5: Surface fit_quality via kpi-subtitle in ERI kpi-card (+ expose R² from calibrator)</name>
  <files>scripts/master-report/generate_report.py, scripts/master-report/eri_calibration.py</files>
  <action>
    Per DD-1 (location: existing ERI kpi-card) + DD-2 (clinical Hebrew templates) + DD-3 (amber #FFB020 on fallback) + Q-1 resolution (c) 2026-04-23.

    **Step 0 (NEW, Q-1 resolution c) — Expose `r2` from calibrator.**
    File: `scripts/master-report/eri_calibration.py`, function `compute_readiness_calibrated`, return dict at lines 313-317.
    `r_squared` is already computed on line 283 and discarded. One-line additive change — NO algorithm, fit logic, or error contract change:
    ```python
    # Before (lines 313-317):
    return {
        "readiness": float(readiness),
        "weights": weights,
        "fit_quality": fit_quality,
    }
    # After:
    return {
        "readiness": float(readiness),
        "weights": weights,
        "fit_quality": fit_quality,
        "r2": float(r_squared),  # Q-1 resolution c, 2026-04-23
    }
    ```
    Byte-identity lock on `eri_calibration.py` is NOT affected (no such lock exists — only `generate_report.py` lines 421-469 are under byte-identity lock).

    **Step 1 — Add `.kpi-subtitle` CSS rule** (near line 724-725, alongside existing `.kpi-card`, `.kpi-value`, `.kpi-label` rules):
    ```css
    .kpi-subtitle { font-size: 11px; color: #9FB3C8; margin-top: 4px; line-height: 1.3; }
    .kpi-subtitle.fallback { color: #FFB020; }
    ```

    **Step 2 — Replace the ERI kpi-card (line 746) with:**
    Hebrew templates match CP-STATE DD-2 VERBATIM (Approach D1: clinical Hebrew + R² always shown):
    ```python
    # Derive subtitle template based on fit_quality (DD-2 verbatim templates)
    fq = r.get('fit_quality', 'unknown')
    r2_val = r.get('r2')
    r2_fmt = f"{r2_val:.2f}" if isinstance(r2_val, (int, float)) else "—"
    if fq == 'calibrated':
        subtitle_html = f'<div class="kpi-subtitle">כיול מוצלח · R²={r2_fmt}</div>'
    elif fq == 'insufficient_history':
        subtitle_html = f'<div class="kpi-subtitle fallback">היסטוריה קצרה · R²={r2_fmt}</div>'
    elif fq == 'poor_fit':
        subtitle_html = f'<div class="kpi-subtitle fallback">כיול חלש · R²={r2_fmt}</div>'
    else:  # unknown / exception path (Option B catch with token label)
        subtitle_html = f'<div class="kpi-subtitle fallback">כיול לא זמין · R²=—</div>'

    # Render kpi-card with subtitle
    eri_card = (
        f'<div class="kpi-card">'
        f'<div class="kpi-label">ERI</div>'
        f'<div class="kpi-value" style="color:#00D4CC">{r["readiness"]}</div>'
        f'{subtitle_html}'
        f'</div>'
    )
    ```
    Then substitute `{eri_card}` in place of the existing inline ERI kpi-card f-string.

    **Q-1 RESOLVED 2026-04-23 = (c):** `r2` is now exposed via Step 0 above. DD-2 template renders real R² value (e.g., `R²=0.76`) on calibrated path; falls back to `"—"` only if `r2` key somehow missing.
  </action>
  <verify>
    <automated>python3 scripts/master-report/generate_report.py --dry-run --output /tmp/hf6c-t5-smoke.html 2>&amp;1 | grep -q "kpi-subtitle" &amp;&amp; grep -q "kpi-subtitle" /tmp/hf6c-t5-smoke.html &amp;&amp; grep -q '"r2":' scripts/master-report/eri_calibration.py</automated>
  </verify>
  <done>
    - Step 0 applied: `"r2": float(r_squared)` present in `eri_calibration.py::compute_readiness_calibrated` return dict.
    - `.kpi-subtitle` CSS present in generated HTML.
    - ERI kpi-card contains a Hebrew subtitle with one of 4 templates based on `fit_quality`.
    - `fallback` class applied (amber `#FFB020`) on `poor_fit`, `insufficient_history`, `unknown`.
    - No behavioral change yet to `r['readiness']` value (still from legacy path until T6).
    - Q-1 resolution (c) documented in CP-STATE (2026-04-23).
  </done>
</task>

<task type="auto" tdd="false">
  <name>T6: Wire compute_readiness_calibrated into compute_all (Option B exception policy)</name>
  <files>scripts/master-report/generate_report.py</files>
  <action>
    Per REQ-HF6c-2 + DD-4 (CUTOVER, no shadow mode) + Option B exception policy.

    **Step 1 — Add import** (near existing imports at top of file):
    ```python
    from scripts.master_report.eri_calibration import compute_readiness_calibrated
    from scripts.master_report.daily_snapshots import build_daily_snapshots  # from hf-6a
    ```

    **Step 2 — Extract six helper functions** from legacy `compute_readiness` body (lines 421-469). Place them ABOVE `compute_all`. These preserve the per-component math so the radar chart and terminal print still have inputs after T7 deletes the legacy function:

    ```python
    def _compute_accuracy_score(basics: dict) -> float:
        # verbatim extraction from legacy compute_readiness lines ~425-432
        ...

    def _compute_coverage_score(basics: dict) -> float:
        # verbatim extraction from legacy compute_readiness lines ~433-440
        ...

    def _compute_critical_score(basics: dict) -> float: ...
    def _compute_critical_avg(basics: dict) -> float: ...
    def _compute_consistency_score(mc: dict, bootstrap: dict) -> float: ...
    def _compute_hist_accuracy(data: dict, basics: dict) -> float: ...
    ```

    **Step 3 — Extend Q5 SELECT** (line 127-131) additively per hf-6a REQ-HF6a-2:
    ```python
    # Current:
    .select('answered_at, is_correct')
    # Replace with:
    .select('answered_at, is_correct, question_id, topic')
    ```
    This is additive — existing `answered_at, is_correct` consumers unaffected.

    **Step 4 — Replace line 570** `readiness = compute_readiness(data, basics, mc, bootstrap)` with the new wire-in block:

    ```python
    # Build components dict for calibrated path
    acc = _compute_accuracy_score(basics)
    cov = _compute_coverage_score(basics)
    ret = _compute_hist_accuracy(data, basics)  # 'retention' proxy per REQ-HF6b-7
    cons = _compute_consistency_score(mc, bootstrap)
    crit = _compute_critical_score(basics)
    crit_avg = _compute_critical_avg(basics)

    components = {
        'accuracy': acc / 100.0 if acc &gt; 1 else acc,   # normalize to [0,1]
        'coverage': cov / 100.0 if cov &gt; 1 else cov,
        'retention': ret / 100.0 if ret &gt; 1 else ret,
        'consistency': cons / 100.0 if cons &gt; 1 else cons,
    }

    # Build history dict
    history = {
        'total_db': basics.get('total_db', 0),
        'answer_history': data.get('answer_history', []),
    }

    # Option B: catch ValueError, label token prefix, render sentinel
    try:
        calibrated = compute_readiness_calibrated(history, components)
        readiness = {
            'readiness': calibrated['readiness'],
            'fit_quality': calibrated['fit_quality'],
            'weights': calibrated['weights'],
            'accuracy_score': acc,
            'coverage_score': cov,
            'critical_score': crit,
            'critical_avg': crit_avg,
            'consistency_score': cons,
            'hist_accuracy': ret,
        }
    except ValueError as e:
        # Option B: HF.3 no-silent-fallback — log + label + sentinel
        token = str(e).split(':', 1)[0]  # e.g., 'insufficient_history' or 'bad_history'
        print(f'[hf-6c] ERI calibration caught ValueError token={token}: {e}', file=sys.stderr)
        readiness = {
            'readiness': '—',              # DD-3: sentinel instead of computed value
            'fit_quality': 'unknown',      # triggers amber subtitle in T5 template
            'weights': {},
            'accuracy_score': acc,         # keep for radar chart
            'coverage_score': cov,
            'critical_score': crit,
            'critical_avg': crit_avg,
            'consistency_score': cons,
            'hist_accuracy': ret,
            '_exception_token': token,     # for CP2 audit trail
        }
    ```

    **Step 5 — Guard radar chart against sentinel readiness** (line 790-791, if radar chart rendering uses readiness anywhere): verify it only consumes sub-scores, not `readiness` itself. Based on live inspection (line 790-791), radar uses sub-scores only → no guard needed.

    **Step 6 — Guard terminal print against sentinel** (line 866-870):
    ```python
    if r['readiness'] == '—':
        print(f"ERI: — (calibration fallback: {r.get('_exception_token', 'unknown')})")
    else:
        print(f"ERI: {r['readiness']:.1f} (hist_acc: {r['hist_accuracy']:.1f})")
    ```

    **Split=B callable-only lock releases at end of this task** (after first successful call to `compute_readiness_calibrated` on live data).
  </action>
  <verify>
    <automated>cd /Users/idankatz15/Desktop/3_APP_DEV/repo-temp &amp;&amp; python3 -c "from scripts.master_report.generate_report import compute_all; print('import OK')" &amp;&amp; python3 scripts/master-report/generate_report.py --dry-run --output /tmp/hf6c-t6-smoke.html &amp;&amp; grep -q "compute_readiness_calibrated" scripts/master-report/generate_report.py &amp;&amp; grep -q "except ValueError" scripts/master-report/generate_report.py</automated>
  </verify>
  <done>
    - `compute_readiness_calibrated` imported and called in `compute_all`.
    - Six `_compute_*` helpers extracted and callable.
    - Q5 SELECT extended to include `question_id, topic`.
    - Option B try/except present with HF.3 token prefix parsing.
    - On success: readiness dict has all 9 keys (legacy 7 + `fit_quality` + `weights`).
    - On ValueError: readiness dict has `readiness='—'` + `fit_quality='unknown'` + `_exception_token`.
    - Smoke run produces HTML without traceback.
    - Split=B callable-only lock documented as RELEASED in CP-STATE.
  </done>
</task>

<task type="auto" tdd="false">
  <name>T7: Delete legacy compute_readiness function</name>
  <files>scripts/master-report/generate_report.py</files>
  <action>
    Per REQ-HF6c-3 + byte-identity lock baseline `b1584f3`.

    **Step 1 — Confirm no remaining callsites** of `compute_readiness` (not `_calibrated`) in `scripts/master-report/generate_report.py`:
    ```bash
    grep -n "compute_readiness(" scripts/master-report/generate_report.py
    # Expected: zero matches (T6 replaced line 570; this is the only callsite).
    ```
    If any match remains → STOP, do not delete.

    **Step 2 — Delete lines 421-469** (the full `def compute_readiness(data, basics, mc, bootstrap):` body, verbatim from baseline `b1584f3`).

    **Step 3 — Verify byte-identity lock release**:
    ```bash
    git diff b1584f3 -- scripts/master-report/generate_report.py | grep -E "^-def compute_readiness\(" | wc -l
    # Expected: 1 (the deletion is recorded in diff).
    ```

    **Step 4 — Verify no orphaned references** (imports, docstrings, test files within scope):
    ```bash
    grep -rn "compute_readiness(" scripts/master-report/ | grep -v "_calibrated"
    # Expected: zero matches.
    ```

    **Step 5 — DELETE legacy test file** (Q-5 RESOLVED 2026-04-23 = למחוק):
    ```bash
    git rm scripts/master-report/tests/test_compute_readiness.py
    ```
    This stages the deletion into the T7 commit. No port to `compute_readiness_calibrated`; no skip-marker. Rationale: the tests target a function that no longer exists; coverage of the calibrated path is tracked separately (hf-6b SPOKE test suite, 18/18 GREEN).

    **Byte-identity lock releases at end of this task.**
  </action>
  <verify>
    <automated>cd /Users/idankatz15/Desktop/3_APP_DEV/repo-temp &amp;&amp; ! grep -qE "^def compute_readiness\(" scripts/master-report/generate_report.py &amp;&amp; python3 scripts/master-report/generate_report.py --dry-run --output /tmp/hf6c-t7-smoke.html</automated>
  </verify>
  <done>
    - `def compute_readiness(` no longer exists in `scripts/master-report/generate_report.py`.
    - `git diff b1584f3 -- scripts/master-report/generate_report.py` shows 421-469 deletion recorded.
    - Smoke run (T6 + T7 combined) produces HTML without traceback or NameError.
    - `scripts/master-report/tests/test_compute_readiness.py` deleted via `git rm` (Q-5 = למחוק, 2026-04-23).
    - Byte-identity lock documented as RELEASED in CP-STATE.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>CP1-verify: Manual master-report smoke + locks-released visual check</name>
  <what-built>
    Wave C cutover applied to `scripts/master-report/generate_report.py`:
    - T5 kpi-subtitle (Hebrew, amber-on-fallback) inside ERI kpi-card.
    - T6 calibrated wire-in with Option B exception handling.
    - T7 legacy `compute_readiness` deleted.
  </what-built>
  <how-to-verify>
    **Step 1** — Run a live master-report build against live Supabase:
    ```bash
    cd /Users/idankatz15/Desktop/3_APP_DEV/repo-temp
    python3 scripts/master-report/generate_report.py --output /tmp/hf6c-cp1-live.html
    open /tmp/hf6c-cp1-live.html
    ```
    **Step 2** — In the rendered HTML, visually confirm:
    - ERI kpi-card shows a numeric value (e.g., `73.4`) OR the `—` sentinel.
    - Below the value, a Hebrew kpi-subtitle is visible.
    - If subtitle color is amber (`#FFB020`) → calibration fell back (check stderr for HF.3 token).
    - Radar chart still renders 4 sub-scores (accuracy, coverage, critical, consistency).
    **Step 3** — Confirm terminal output during build includes either:
    - `ERI: 73.4 (hist_acc: 68.1)` (success path), OR
    - `ERI: — (calibration fallback: insufficient_history)` (fallback path).
    **Step 4** — Visually diff the ERI kpi-card placement vs the pre-cutover master-report (git-stash the changes, rebuild, compare). Confirm layout is unchanged except the new subtitle.
    **Step 5** — Confirm Wave C locks released in CP-STATE:
    - `grep -n "Split=B lock" .planning/phases/hf-6c/CP-STATE.md` → shows RELEASED.
    - `grep -n "Byte-identity lock" .planning/phases/hf-6c/CP-STATE.md` → shows RELEASED.
  </how-to-verify>
  <resume-signal>Type "approved" to proceed to CP2 code-review audit, or describe any visual/functional regression.</resume-signal>
</task>

</tasks>

<atomic_push_window>
Per REQ-HF6c-4: all three task commits must land on `origin/phase-1-stats-cleanup` in a single push window. No partial state.

**Commit strategy inside the window:**
1. `refactor(hf-6c): T5 surface ERI fit_quality via kpi-subtitle (+ r2 from calibrator)` — eri_calibration.py 1-line additive (Q-1 c) + CSS + HTML template.
2. `feat(hf-6c): T6 wire compute_readiness_calibrated with Option B exception policy` — helpers + import + try/except + Q5 SELECT extension (question_id, topic minimum per Q-4) + terminal-print guard.
3. `chore(hf-6c): T7 delete legacy compute_readiness (lines 421-469 vs b1584f3) + rm scripts/master-report/tests/test_compute_readiness.py` — pure deletion + test file removal per Q-5.

**Push command:**
```bash
git push origin phase-1-stats-cleanup
```

**Atomicity guarantee:** All three commits are prepared LOCALLY first; a single `git push` lands them atomically on the remote branch. If CP1-verify fails between T6 and T7, the branch gets reset locally — nothing pushed until all three pass.
</atomic_push_window>

<pre_flight_checklist>
All 5 open questions RESOLVED 2026-04-23 — user ruling verbatim: "2. חי 3. FORCE 4. מינימום 5. למחוק קדימה"

Before starting T5:
- [x] Q-1 = (c) expose `r2` via 1-line additive in `eri_calibration.py::compute_readiness_calibrated` return dict. (Captured in CP-STATE.)
- [x] Q-2 = live Supabase for smoke runs (not fixture/mock).
- [x] Q-3 = **FORCE-push ALLOWED** for post-push rollback (user override — default was revert-only; see `<rollback_plan>` for updated procedure).
- [x] Q-4 = minimum additive Q5 SELECT = `question_id, topic` only. No speculative columns (YAGNI).
- [x] Q-5 = DELETE `scripts/master-report/tests/test_compute_readiness.py` in T7 commit (no port, no skip).
- [ ] `git status` clean on `phase-1-stats-cleanup`.
- [ ] HEAD matches STATE.md (`1246531` or newer confirmed).
- [ ] pytest baseline GREEN (`pytest scripts/master-report/tests/ -x --ignore=scripts/master-report/tests/test_compute_readiness.py`).
- [ ] Supabase env vars set (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
</pre_flight_checklist>

<post_flight_checklist>
After CP1-verify PASS:
- [ ] All three commits present in `git log origin/phase-1-stats-cleanup..HEAD`.
- [ ] `git push origin phase-1-stats-cleanup` completed (atomic window).
- [ ] CP-STATE updated: Split=B callable-only lock RELEASED, Byte-identity lock RELEASED.
- [ ] STATE.md updated: CP1 CLOSED, phase moves to CP2.
- [ ] `grep -n "def compute_readiness(" scripts/master-report/generate_report.py` returns zero (no legacy function).
- [ ] `grep -n "compute_readiness_calibrated" scripts/master-report/generate_report.py` returns ≥2 matches (import + callsite).
- [ ] Live master-report HTML renders in browser with subtitle visible.
- [ ] Retrospective note drafted for RETROSPECTIVE.md (Wave C pattern: extract-then-delete).
</post_flight_checklist>

<rollback_plan>
If CP1-verify FAILS and rollback is required (user rules rollback over forward-fix):

**Fast path (pre-push):**
```bash
git reset --hard origin/phase-1-stats-cleanup
```
All three local commits discarded. Branch state matches remote. No data loss — only the 1-line additive in `eri_calibration.py` is reverted alongside; original algorithm remains intact.

**Post-push rollback (Q-3 RESOLVED 2026-04-23 = FORCE ALLOWED per user override):**

Primary path — **force-push hard reset to pre-cutover SHA**:
```bash
# Identify last good SHA before T5 (CP0 entry = 1246531).
git reset --hard 1246531
git push --force-with-lease origin phase-1-stats-cleanup
```
Net-zero diff vs pre-cutover state. Legacy `compute_readiness` restored. `eri_calibration.py` restored to pre-r2 shape.

**⚠ Force-push caveats (still apply even with user approval):**
- Use `--force-with-lease` (not bare `--force`) — aborts if someone else pushed first.
- Co-worker local clones will need `git fetch + git reset --hard origin/phase-1-stats-cleanup` after rollback; warn the team (or solo dev) before executing.
- Never force-push `main` — this policy covers `phase-1-stats-cleanup` only.

Fallback path — if force-push is blocked (e.g., branch protection activates later):
```bash
git revert --no-commit <T7-sha> <T6-sha> <T5-sha>
git commit -m "revert(hf-6c): Wave C cutover — CP1-verify failed, rolling back T5/T6/T7"
git push origin phase-1-stats-cleanup
```
Non-destructive — adds history instead of rewriting.
</rollback_plan>

<risks>
| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|-----------|--------|-----------|
| R-1 | R² surfacing gap (Q-1) blocks T5 completion | ~~HIGH~~ RESOLVED | ~~HIGH~~ | **Q-1 RESOLVED 2026-04-23 = (c)** — 1-line additive in `eri_calibration.py` exposes `r2`. T5 Step 0 covers it. No longer blocking. |
| R-2 | Shape mismatch: new 3-key dict vs 7-key consumers (radar, terminal) | HIGH | HIGH | T6 Step 2 extracts 6 `_compute_*` helpers preserving legacy math; T6 Step 4 merges new + legacy keys into unified 9-key shape. |
| R-3 | Q5 fetch_data gap breaks `build_daily_snapshots` inside calibrated path | MEDIUM | HIGH | T6 Step 3 extends SELECT additively (`question_id, topic`); hf-6a REQ-HF6a-2 precedent. |
| R-4 | Supabase env missing at smoke time → dry-run fails | LOW | MEDIUM | Pre-flight checklist enforces env vars; user_setup frontmatter lists sources. |
| R-5 | pytest breaks after T7 deletes `compute_readiness` (4 tests target it) | ~~HIGH~~ RESOLVED | ~~MEDIUM~~ | **Q-5 RESOLVED 2026-04-23 = DELETE** — `git rm scripts/master-report/tests/test_compute_readiness.py` in T7 commit. Coverage of calibrated path tracked via hf-6b SPOKE suite (18/18 GREEN). |
| R-6 | Atomic push window violated by mid-window CP1-verify failure | MEDIUM | HIGH | All commits prepared locally before push; rollback_plan covers pre-push reset cleanly. |
| R-7 | Sentinel `—` string in `readiness` breaks downstream JSON serialization or format strings | MEDIUM | MEDIUM | T6 Step 6 guards terminal print; T5 kpi-card inspects `fit_quality` not value; no other JSON consumers in scope. |
| R-8 | Force-push regression if post-push rollback needed | MEDIUM | HIGH | **Q-3 RESOLVED 2026-04-23 = FORCE ALLOWED** (user override). Mitigations: `--force-with-lease` (not bare `--force`), single-dev branch, `main` protected separately, co-worker warnings documented in rollback_plan. |
</risks>

<open_questions>
**ALL 5 OPEN QUESTIONS RESOLVED 2026-04-23** — User ruling verbatim: "2. חי 3. FORCE 4. מינימום 5. למחוק קדימה"

**Q-1 [RESOLVED = (c)] (was BLOCKING):** Expose `r2` from `compute_readiness_calibrated` via a 1-line additive change to its return dict (`eri_calibration.py` lines 313-317). `r_squared` is already computed on line 283 and was being discarded. No algorithm/fit/error-contract change. Folded into T5 as Step 0. CP-STATE DD-2 template remains as written.

**Q-2 [RESOLVED = live]:** Smoke environment for T5/T6/T7 automated verify = **live Supabase** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` required in env). No fixture/mock path. Rationale: master-report is always run live; fixtures would be brittle.

**Q-3 [RESOLVED = FORCE] (user override of default revert-only):** If CP1-verify fails POST-push, `git push --force-with-lease` is ALLOWED for rollback on `phase-1-stats-cleanup` branch. `git revert` remains as a fallback if force-push is blocked by branch protection. **`main` branch is NOT covered by this ruling** — main remains force-push-prohibited per `<git_workflow>` global rule.

**Q-4 [RESOLVED = minimum]:** Q5 SELECT extension = `question_id, topic` ONLY. No speculative columns (`user_id`, `time_spent_ms`, etc.). YAGNI — add them in a future phase if/when `build_daily_snapshots` actually needs them.

**Q-5 [RESOLVED = delete]:** `scripts/master-report/tests/test_compute_readiness.py` is DELETED in the T7 commit window via `git rm`. No port to `compute_readiness_calibrated`; no skip-marker. Coverage of the calibrated path is tracked via hf-6b SPOKE suite (18/18 GREEN).
</open_questions>

<verification>
**Plan-level verification (post-CP1-verify):**
- [ ] All 4 requirements (REQ-HF6c-1..4) satisfied — cross-check REQUIREMENTS.md.
- [ ] All 4 DDs honored — DD-1 location, DD-2 templates (Q-1 resolved, R² rendered live), DD-3 amber, DD-4 cutover (no shadow).
- [ ] Option B exception policy applied verbatim (catch ValueError, parse token, render `—`).
- [ ] Master-report HTML renders end-to-end with new kpi-subtitle visible.
- [ ] Radar chart + terminal print unchanged from user's perspective.
- [ ] Both Wave C locks (Split=B callable-only, Byte-identity 421-469) released.
- [ ] Single atomic push completed (REQ-HF6c-4).
- [ ] pytest suite green (ignoring or updating `test_compute_readiness.py` per Q-5).
</verification>

<success_criteria>
Plan is complete when:
1. `scripts/master-report/generate_report.py` contains `from scripts.master_report.eri_calibration import compute_readiness_calibrated` and at least one callsite.
2. `scripts/master-report/generate_report.py` does NOT contain `def compute_readiness(` (legacy function deleted).
3. `scripts/master-report/generate_report.py` contains `except ValueError` with HF.3 token parsing.
4. `scripts/master-report/eri_calibration.py::compute_readiness_calibrated` return dict includes `"r2"` key (Q-1 resolution c).
5. `scripts/master-report/tests/test_compute_readiness.py` no longer exists in the working tree (Q-5 resolution: למחוק).
6. Generated HTML contains `class="kpi-subtitle"` in the ERI kpi-card area.
7. Generated HTML contains one of the 4 Hebrew subtitle templates (calibrated / poor_fit / insufficient_history / unknown).
8. Three commits landed atomically on `origin/phase-1-stats-cleanup` in a single push.
9. CP-STATE.md logs CP1 CLOSED with Split=B callable-only lock RELEASED + Byte-identity lock RELEASED.
10. User has approved the manual CP1-verify checkpoint.
</success_criteria>

<output>
After CP1-verify PASS, create `.planning/phases/hf-6c/hf-6c-01-SUMMARY.md` capturing:
- What was changed (T5/T6/T7 diffs summarized).
- Which Q-1..Q-5 resolutions were applied.
- Lock-release timestamps.
- Any regressions surfaced and how they were handled.
- Baseline metrics for CP2 audit (byte-count delta, line-count delta vs `b1584f3`).
- Handshake note for CP2 (code-review audit entry).
</output>
