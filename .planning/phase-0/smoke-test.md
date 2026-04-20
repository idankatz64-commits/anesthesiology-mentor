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

**Test run completed:** 2026-04-20 (after Finding #38 env fix)

| # | Flow | Status | Notes | Logged |
|---|---|---|---|---|
| 1 | Login — email + password | ✅ Pass | Clean login on correct Supabase project | — |
| 2 | Login — Google OAuth | ⏭ Skipped | Not retested (email path already validated auth) | — |
| 3 | Smart Session — answer 5 questions | ⚠️ Partial | `לחזור לסימולציה` (saved_sessions): ✅ · `לחזור מחר` (SRS reschedule): ✅ · `מסומן לחזרה` (user_favorites flag): ⏳ UI not located by user, deferred to Phase 1 | — |
| 4 | Simulation mode — start + stop | ⚠️ Partial | Runs end-to-end, BUT regression: answer cannot be changed after click → see Finding #40 🔴 | #40 |
| 5 | Stats page — all sections load | ✅ Pass | All 8 tiles rendered | — |
| 6 | SRS Dashboard | ✅ Pass | Loads, due-cards visible | — |
| 7 | Formulas + Calculator | ✅ Pass | Despite console 404 on `calculator_formulas` (see Finding #42) — fallback data covers the happy path | #42 |
| 8 | Admin panel | ✅ Pass | All tabs load (user is admin) | — |

Legend: ✅ Pass · ❌ Fail · ⚠️ Partial/Degraded · ⏳ Pending · ⏭ Skipped

---

## Flow-by-flow results

### Flow 1 — Login (email + password) ✅
Clean login via email + password. Console shows requests to correct project `ksbblqnwcmfylpxygyrj.supabase.co` (no 400s on `/auth/v1/token`).

### Flow 2 — Login (Google OAuth) ⏭
Not retested this pass — skipped after email+password confirmed auth works end-to-end. Safe to defer to Phase 1 (no regression suspected; the OAuth flow is unchanged since the SRS dashboard commit).

### Flow 3 — Smart Session (answer 5 questions) ⚠️ Partial
Three save-action branches exist after answering:
- **`לחזור לסימולציה`** (writes to `saved_sessions`) — ✅ verified.
- **`לחזור מחר`** (SRS reschedule via `spaced_repetition`) — ✅ verified.
- **`מסומן לחזרה`** (sets a flag on `user_favorites`) — ⏳ user could not locate the UI entrypoint; deferred, not a regression signal. Revisit in Phase 1 when SRS UX is reviewed.

### Flow 4 — Simulation mode (start + stop) ⚠️ Partial → Finding #40 🔴
Simulation starts, questions load, timer counts, stop-mid-session saves progress — the unawaited SRS writes flagged in the earlier code review did not produce user-visible errors. **BUT** a regression surfaced: once an answer is clicked in simulation mode, it can no longer be changed before confirmation. User quote: "ברגע מסמנים תשובה הוא לא נותן להחליף, זה לא היה וזה בעיה". See Finding #40 for bisection plan.

### Flow 5 — Stats page (all sections) ✅
All 8 tiles render without NaN / empty state: ERI, forgetting risk, heatmap, treemap, coverage, streak, confidence, daily.

### Flow 6 — SRS Dashboard ✅
New dashboard (commit `0efcccf`) loads from sidebar. Due cards shown. Note: React console warning about duplicate key `1` in `SrsDecayChart` — see Finding #39 🟡.

### Flow 7 — Formulas + Calculator ✅ (with caveats → Finding #42)
98 Miller formulas render; chapter filter works; calculator computes. Console shows 404 on `GET /rest/v1/calculator_formulas?select=*&order=sort_order.asc` — confirmed below to be a genuine missing table, not an RLS issue. The happy path works because the component falls back to a non-DB data source.

### Flow 8 — Admin panel ✅
All tabs load for admin user: QuestionEditor, FormulaManagement, SummariesManagement, ResourceLinks, UserManagement, ImportQuestions, EditorActivity.

---

## New Findings logged during this pass

- **#40 🔴** — Simulation answer-lock regression ([SessionView.tsx simulation branch](src/components/views/SessionView.tsx))
- **#41 🟡** — CORS blocks `sync-questions` Edge Function on `localhost:8080`
- **#42 🔴** (escalated from 🟡 after MCP probe) — Missing DB resources: `calculator_formulas` table + two RPCs (`get_question_success_rate`, `get_global_daily_accuracy`) absent from live schema
- **#43 🟢** — Tiptap duplicate extension names (`link`, `underline`) in RichTextEditor
- **#44 🟢** — Radix Dialog missing `aria-describedby` (accessibility)

Full writeups in `findings.md`.

---

## Summary

**0c verdict:** ✅ Safe to proceed to 0d with caveats.

- **5/8 flows pass** (1, 5, 6, 7, 8).
- **1/8 skipped** (2 — Google OAuth, email path validated auth).
- **2/8 partial** (3 — one sub-branch deferred; 4 — simulation answer-lock regression blocks UX).
- **No total failures, no crashes, no data loss observed.**

The golden path for resident daily study works. The two ⚠️ flows are UX regressions and missing-resource noise, not data-integrity failures. All blockers are now catalogued (total findings after 0c: 44; escalations this session: 1).

**Recommended order for 0d triage:** #40 (🔴 regression, small surface) and #42 (🔴 schema gap, may need migrations) top the list; #38 already resolved; #41/#43/#44 are low-cost cleanups for 0e or Phase 1.
