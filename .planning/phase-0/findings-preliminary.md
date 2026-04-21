# Phase 0 — Preliminary Findings

**Date:** 2026-04-19
**Status:** Pre-branch (on `main`). Captured during repo cleanup before Phase 0a static analysis.

---

## Issue #1 — `scripts/master-report/generate_report.py` produces near-empty output

### Severity: 🟡 High (not 🔴 Critical)

**Reason for classification:**
- Not blocking any end-user flow (app at `anesthesiology-mentor.vercel.app` works)
- Dashboard-only tool; users never see the HTML directly
- Silent degradation, not a crash — app users unaffected

### Evidence

| Artifact | Size | Date | Note |
|---|---|---|---|
| `reports/master_report_2026-04-11.html` | 29 KB | 2026-04-11 | healthy baseline |
| `reports/master_report_2026-04-15.html` | 34 KB | 2026-04-15 | healthy baseline |
| `reports/master_report_2026-04-18.html` | **11 KB** | 2026-04-18 | **~1/3 size** |
| `reports/master_stats_2026-04-18.json` | 3 KB | 2026-04-18 | co-generated |

Latest run (2026-04-18) produced HTML but at ~1/3 the expected size vs prior runs.

### Root Cause (suspected)

The uncommitted working-tree version of `generate_report.py` (now stashed under `broken: silent fallback masking failures`) added a `try/except` block around the RPC call to `get_topic_history_stats`:

```python
try:
    res = supabase.rpc("get_topic_history_stats", {"p_user_id": user_id}).execute()
    _rpc_data = res.data
except Exception:
    _rpc_data = None
if not _rpc_data:
    # fallback: query answer_history directly
```

**Hypothesis:** the RPC function does not exist in current Supabase schema → exception → fallback runs → but fallback itself may be partially broken by other schema changes (e.g., the `answer_history.topic` column change, `interval` → `interval_days` rename). The bare `except Exception: pass` swallows the real error. The result: partial/empty data shows up in the HTML rather than a crash telling us something is wrong.

### Additional schema alignment changes in the stashed diff

1. `user_answers.wrong_count` removed — replaced with computed `answered_count - correct_count`
2. `answer_history.topic` added as a direct column (was JOIN before)
3. `spaced_repetition.interval` renamed → `interval_days`

These changes are *real* (DB migrated) but the surrounding fallback path and exception handling need review to confirm they actually produce correct output.

### Fix plan

**Do NOT fix in Phase 0.** Scheduled for Phase 2b (Master Report DB integration) because:
- Phase 2b will migrate Master Report from Python HTML → Supabase tables + TS port anyway
- Fixing Python script now = throwaway work
- Stashed diff preserved under stash ref for reference when porting

### Action items logged

- [ ] **Phase 2b:** When porting to TS (ERI, P(fail)), verify against a known-good dataset; do not port the silent-fallback pattern — always raise on DB errors or log them loudly
- [ ] **Phase 2b:** Write a golden test comparing Python output vs TS output for the same fixture
- [ ] **Phase 0 backlog:** Note absence of `.github/workflows/master-report.yml` (Phase 2a will add it)

### Stash reference

```
git stash list
# stash@{0}: On main: broken: silent fallback masking failures
```

Contains: `scripts/master-report/generate_report.py` with schema-alignment attempt that produces near-empty output.

---

## Issue #2 — `.env` with secrets was not gitignored

### Severity: 🔴 Critical (already fixed pre-branch)

### Evidence
- `scripts/master-report/.env` contained VITE_SUPABASE_* credentials
- `git check-ignore` returned exit code 1 (not ignored)
- File was showing as untracked in `git status` — one `git add .` away from being staged

### Fix applied
Commit `f7dfd42`: added to `.gitignore`:
```
.env
.env.local
.env.*.local
**/.env
```

Verified post-fix: `git check-ignore scripts/master-report/.env` returns exit 0.

### Defense-in-depth recommendations for Phase 0

- [ ] Add `pre-commit` hook or `git-secrets` scanning for `SUPABASE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY` patterns
- [ ] Audit `git log -p | grep -iE "(SUPABASE_KEY|ANTHROPIC_API_KEY|eyJ)"` to confirm no leaked secrets in history
- [ ] Add `.env.example` with placeholder values to signal required keys

---

## Next steps

Pending user approval to create `phase-0-code-review` branch and begin:
- **0a:** Static analysis baseline (build, tsc, eslint, audit, depcheck)
- **0b:** Agent review (code-reviewer on top 4 files; security-reviewer on Edge Functions + RLS)
- **0d/e:** Triage + fix Critical only
