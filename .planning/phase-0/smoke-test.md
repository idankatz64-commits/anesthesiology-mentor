# Phase 0c — Manual Smoke Test

**Date:** 2026-04-19 (restarted 2026-04-20 after Finding #38 env fix)
**Branch:** `phase-0-code-review`
**Dev server:** http://localhost:8080/ (Vite 5.4.19, bg task `bkgl3zrfz` — restarted with correct Supabase project `ksbblqnwcmfylpxygyrj`)
**Tester:** Dr. Idan Katz (manual)
**Logger:** Claude (this session)

> **Purpose:** Verify core flows still work on the `phase-0-code-review` branch before Phase 0d/0e fixes. Catch any regression introduced by Phase 0 cleanup commits (baseline, findings, lockfile removal).

> **Protocol:** User tests each flow → reports pass/fail + notes → Claude logs here. Any failure → append to `findings.md` as new Finding #N with severity.

> **🔴 Restart note (2026-04-20):** First pass was invalidated by Finding #38 — local `.env` pointed to the deprecated Supabase project (`agmcauhjhfwksrjllxar`). All prior flow results discarded; table reset to ⏳. After fix, user hard-reloads browser (Cmd+Shift+R) to clear cached requests, then re-runs all 8 flows.

---

## Flow checklist

| # | Flow | Status | Notes | Logged |
|---|---|---|---|---|
| 1 | Login — email + password | ⏳ Pending | | |
| 2 | Login — Google OAuth | ⏳ Pending | | |
| 3 | Smart Session — answer 5 questions | ⏳ Pending | | |
| 4 | Simulation mode — start + stop | ⏳ Pending | | |
| 5 | Stats page — all sections load | ⏳ Pending | Expect ~8 tiles: ERI, forgetting risk, heatmap, treemap, coverage, streak, confidence, daily | |
| 6 | SRS Dashboard | ⏳ Pending | | |
| 7 | Formulas + Calculator | ⏳ Pending | | |
| 8 | Admin panel (if permissioned) | ⏳ Pending | User is admin; confirm all tabs load | |

Legend: ✅ Pass · ❌ Fail · ⚠️ Partial/Degraded · ⏳ Pending · ⏭ Skipped

---

## Flow-by-flow results

### Flow 1 — Login (email + password)
_awaiting test_

### Flow 2 — Login (Google OAuth)
_awaiting test_

### Flow 3 — Smart Session (answer 5 questions)
_awaiting test — please report: question loading speed, confidence button responsiveness, any console errors, whether answers persist on refresh_

### Flow 4 — Simulation mode
_awaiting test — please report: start → question 1 loads, timer counts, stop mid-session saves progress (important — this flow triggers the unawaited SRS writes flagged as 🔴 in findings.md)_

### Flow 5 — Stats page (all sections)
_awaiting test — please list any section that fails to render or shows NaN/empty state_

### Flow 6 — SRS Dashboard
_awaiting test — this is new (commit 0efcccf added SRS dashboard to sidebar nav); verify it loads and shows due cards_

### Flow 7 — Formulas + Calculator
_awaiting test — expect 98 Miller formulas with chapter filter; calculator should compute with Hebrew clinical descriptions_

### Flow 8 — Admin panel
_awaiting test — tabs: QuestionEditor, FormulaManagement, SummariesManagement, ResourceLinks, UserManagement, ImportQuestions, EditorActivity_

---

## New Findings (if any)

_None logged yet. Any failure will be appended here AND added to `findings.md`._

---

## Summary

_Will be filled after all flows tested._
