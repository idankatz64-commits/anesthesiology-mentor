# Phase 0b — Findings (Agent Review)

**Date:** 2026-04-19
**Branch:** `phase-0-code-review`
**Inputs:**
- Static analysis baseline: `baseline.md`
- Pre-existing issue: `findings-preliminary.md`
- Supabase security snapshot: `supabase-security.md`
- Raw audit: `audit.log`, `audit.json`
- Agent reviews: code-reviewer (4 files, 3290 LOC) + security-reviewer (6 Edge Functions, 1036 LOC + RLS)

---

## Finding #1 — Master Report `generate_report.py` produces near-empty output (PRE-EXISTING)

🟡 **High.** Deferred to Phase 2b per user decision. Full context in `findings-preliminary.md`.

Summary: uncommitted edit to `generate_report.py` added silent `try/except` around `get_topic_history_stats` RPC, producing 11 KB HTML vs 34 KB baseline. Stashed under `broken: silent fallback masking failures`. Not blocking any user-facing flow (dashboard-only). Will be replaced by TS port in Phase 2b.

---

## Code Review Findings (4 files, 3290 LOC)

### 🔴 Critical

- **[AppContext.tsx:557-608] `markForReview` silently discards DB errors** — `await` on `spaced_repetition` upsert (L585) and `answer_history` insert (L598) never checks `.error`; function returns `void` regardless. Impact: DB write failure (network blip, RLS rejection) shows "שאלה תחזור מחר לחזרה 🔁" toast but no SRS reset and no history row → silent data loss on a core study action.

- **[AppContext.tsx:932-937] `saveSessionToDb` upsert error silently dropped** — No `.error` check on the upsert. Impact: if save fails (token expiry, network), `setSavedSessionInfo` still runs → user believes session is saved, resume finds nothing → session progress lost without notification.

- **[SessionView.tsx:409-420] Simulation submit fires unawaited SRS writes in a loop** — `handleSubmitSimulation` calls `updateSpacedRepetition` fire-and-forget inside `quiz.forEach`, no `await`, no `.catch`. Impact: network error on any of up to 120 SRS writes is fully swallowed → partial SRS state corruption for simulation sessions.

### 🟡 High

- **[AppContext.tsx:497-555] `updateSpacedRepetition` has read-then-write race** — Fetches existing SRS state (L502), computes new values, upserts. Double-click or two-tab case: both reads see old state, second write overwrites first with stale `reps/ease`. Impact: SRS progression lost; `reps` stays at 1 when it should be 2.

- **[AppContext.tsx:248-255] `confidenceMap` hydration from `spaced_repetition` has no pagination** — Uses plain `supabase.from('spaced_repetition').select(...)` without `fetchAllRows`, capped at Supabase's default 1000-row limit. Impact: users with >1000 answered questions → confidence filters silently broken beyond row 1000.

- **[smartSelection.ts:317-367] `recentWrongStreak` aggregates only one `lastResult` per question** — Pushes `h.lastResult` once per question (L342–343), but history rows are cumulative state, not individual attempts. 10 questions × 5 attempts → only 10 booleans, not 50. Impact: `recentWrongStreak` effectively capped near ~5 → signal near-useless for topic weighting.

- **[SessionView.tsx:248-254] Unmount auto-save fires without await** — React cleanup is synchronous; the promise is abandoned. Impact: quick-navigation unmount → best-effort save with no guarantee, no user feedback on failure.

- **[StatsView.tsx:62-73] `newUniqueToday` heuristic wrong for repeated questions** — Check `if (h.answered === 1)` only matches questions answered exactly once total. A question first seen today but also answered yesterday has `answered >= 2` and is missed. Impact: "שאלות ייחודיות" daily badge and `coverageChangeToday` systematically under-counted.

### 🟢 Medium/Low

- **[smartSelection.ts:126-127] `getExamProximityPhase` returns `'early'` after exam date** — `daysLeft <= 0 → 'early'`. Intentional ("חזרה למצב רגיל") but unlabeled. Low impact after June 2026.

- **[AppContext.tsx:904] `triggerSync` returns stale `data.length`** — Closure snapshot before `invalidateQuestions` completes. UI consuming this returns pre-sync count. Low impact (cosmetic count in toast).

- **[SessionView.tsx:202-203] Timer init reads `session` from props at mount** — Theoretical React 18 strict-mode double-invoke issue. Low risk in production.

**Code review subtotal:** 3 🔴, 5 🟡, 2 🟢 (10 total).

---

## Security Review Findings (6 Edge Functions + RLS)

### 🔴 Critical

- **[weekly-report/index.ts:339-412] No auth — unauthenticated full question dump** — Function creates Supabase client with SERVICE_ROLE_KEY, queries `question_audit_log` + `questions` without any Authorization header check. Any anon HTTP request returns full question bank (text, correct answers, explanations) in HTML or CSV.

- **[daily-csv-export/index.ts:19-59] No auth + open email relay** — Accepts `email` and `hours` from unauthenticated body, queries with service role, emails CSV to attacker-supplied address. Data exfil + email relay abuse.

- **[matot-report/index.ts:36-63] Claude prompt = raw user input, no system prompt** — Entire message payload is single `user` turn with `content = prompt` from request body. Any authenticated user can issue arbitrary instructions (jailbreak, token spend, extract internal context).

- **[RLS: chapter_content, chapter_gaps] Wildcard write policies on ALL cmd** — Both have `USING (true) WITH CHECK (true)` for `{public}` role → anonymous visitors can INSERT/UPDATE/DELETE chapter content.

- **[RLS: ideas] RLS disabled entirely** — `rowsecurity = false` on PostgREST-exposed table. Any anon key request can read/write/delete all rows.

### 🟡 High

- **[ai-summary/index.ts:108-117] Stored prompt injection via `explanation` field** — DB-sourced explanations (HTML-stripped but not semantically sanitized) appended verbatim into Claude prompt. A malicious editor-stored explanation could manipulate AI output or exfiltrate prompt context.

- **[daily-csv-export/index.ts:26] Caller-controlled email recipient, no validation** — `body.email` used directly as Resend `to:` with no format check / allowlist.

- **[daily-csv-export/index.ts:27] `hoursBack` unbounded** — Attacker sets arbitrarily large value → full historical audit log + questions in one request.

- **[weekly-report/index.ts:349] `daysBack` unbounded** — Same unbounded pattern.

- **[RLS: inconsistent admin-check patterns]** — 4 mechanisms in use:
  - A: `is_admin(auth.uid())` function (admin_users, formulas, resource_links, topic_summaries)
  - B: inline `EXISTS` on `admin_users` (categories, questions)
  - C: `profiles.is_admin` boolean (user_answers "Admins can read all", question_edit_log)
  - D: email lookup via `auth.users` (question_audit_log)
  
  Risk: divergence between `admin_users` and `profiles.is_admin` → inconsistent privileges, potential privilege escalation or denial.

- **[DB function `is_admin`] Mutable search_path** — Primary admin gate with no fixed `search_path`. Theoretical schema-injection attack could shadow `admin_users`.

- **[RLS: calculator_formulas, anki_decks, anki_cards, study_rooms, room_participants, room_answers, user_feedback] Tables in CLAUDE.md absent from pg_policies** — Either RLS-enabled-zero-policies (blocks all) or missing policies entirely. If the latter: anon read/write on multiplayer room data, flashcards, user feedback. **Verify in 0c.**

### 🟢 Medium/Low

- **[auth config] HaveIBeenPwned leaked-password check disabled** — Residents can register with known-compromised passwords.

- **[storage: question-images] Public bucket allows unauthenticated listing** — Broad SELECT on `storage.objects` → anyone can enumerate all file paths.

- **[All 6 functions] No rate limiting** — `matot-report`, `ai-summary` open to Anthropic API quota exhaustion by any authenticated user.

- **[5 DB functions] Mutable search_path** — `handle_new_user`, `get_question_ids_by_confidence`, `sync_chapter_topic_num`, `log_question_changes`, `is_admin`. Theoretical schema-hijack surface.

**Security review subtotal:** 5 🔴, 7 🟡, 4 🟢 (16 total).

---

## CVE Triage (from `npm audit --production`, 11 vulns)

Reference: `.planning/phase-0/audit.log`. All fixes available via `npm audit fix`.

| Package | Severity | Issue | Used via | Triage |
|---|---|---|---|---|
| `@remix-run/router` / `react-router(-dom)` | 🟡 High | XSS via Open Redirects (GHSA-2w69-qvjg-hvjx) | App routing | Patch in 0e (minor bump) |
| `dompurify` | 🟢 Moderate | `ADD_TAGS` bypasses `FORBID_TAGS` (GHSA-39q2-94rc-95cp) | HTML sanitizer for explanations/notes | Patch in 0e |
| `lodash` | 🟡 High | Prototype pollution + `_.template` code injection (3 CVEs) | Review usage — may be removable | 0e: verify usage, patch or remove |
| `mathjs` | 🟡 High | Object property setter abuse (2 CVEs) | Formula calculator | Patch in 0e |
| `glob` | 🟡 High | Command injection in CLI (GHSA-5j98-mcp5-4vw2) | Build tooling (transitive) | Dev-only, low risk, patch in 0e |
| `minimatch` | 🟡 High | ReDoS × 3 CVEs | Glob transitive | Dev-only, patch in 0e |
| `picomatch` | 🟡 High | Method injection + ReDoS | Glob transitive | Dev-only, patch in 0e |
| `brace-expansion` | 🟢 Moderate | Infinite loop / memory exhaustion | Glob transitive | Dev-only, patch in 0e |
| `yaml` | 🟢 Moderate | Stack overflow on nested YAML | Build tooling | Dev-only, patch in 0e |

**Production-impact CVEs:** `dompurify`, `react-router(-dom)`, `mathjs`, possibly `lodash`. All have `npm audit fix` available. None require major bumps → low breakage risk.

**None of the CVEs are 🔴 Critical in the CVSS "critical" sense.** The real crit items are the Edge Function + RLS issues above.

---

## Summary

| Source | 🔴 Critical | 🟡 High | 🟢 Medium/Low | Total |
|---|---|---|---|---|
| Pre-existing (Master Report) | — | 1 | — | 1 |
| Code review | 3 | 5 | 2 | 10 |
| Security review | 5 | 7 | 4 | 16 |
| CVE triage | — | 6 | 3 | 9 |
| **Total** | **8** | **19** | **9** | **36** |

### Blockers for Phase 1

**Yes — 8 🔴 must be addressed before Phase 1 begins.** Phase 1 (Stats redesign) will touch StatsView.tsx and the data pipeline that feeds it, and Phase 1 work lands on a user-facing app that currently has unauthenticated data-exfil endpoints and silent data-loss bugs. Shipping UI polish on top of these is wrong order.

**Recommended 0d triage order (highest impact first):**

1. **RLS: `ideas` table** (1 min) — enable RLS or drop the table if unused.
2. **RLS: `chapter_content` / `chapter_gaps` wildcard policies** (5 min) — replace `USING (true)` with `is_admin(auth.uid())` for writes; keep public SELECT.
3. **Edge Functions auth** — add auth check to `weekly-report`, `daily-csv-export`; add system prompt + input bounds to `matot-report`. Highest-impact backend fix.
4. **AppContext silent error swallowing** — `markForReview`, `saveSessionToDb`: check `.error` and surface to user; the current UX lies about success.
5. **Simulation submit unawaited SRS writes** — batch via `Promise.all` with `.catch` logging.
6. **Verify the 7 "absent from pg_policies" tables** — `calculator_formulas`, `anki_decks`, `anki_cards`, `study_rooms`, `room_participants`, `room_answers`, `user_feedback`. If they have no policies and RLS is enabled → no-op behavior (safe). If RLS disabled → urgent 🔴 additions.

### Not blockers (defer to Phase 2+ or hardening backlog)

- 🟡 High findings from code review (race condition, pagination limit, streak math, unmount save, stats heuristic) — bad UX / subtle math, not user-facing crashes. Can be batched with Phase 1/2 refactors.
- Admin-check pattern inconsistency — needs architectural consolidation (Phase 2 hardening), not a one-liner.
- 🟢 items — hardening backlog.
- CVE patches — 0e batch via `npm audit fix` + smoke test.

---

## Finding #37 — Duplicate lockfiles (Lovable-era drift risk) — RESOLVED this session

🟢 **Low.** Repo had three lockfiles side-by-side: `package-lock.json` (npm, active), `bun.lock` + `bun.lockb` (bun, Lovable-era legacy). All three were tracked in git. Two package-managers' lockfiles in the same repo invites dependency drift — a contributor on bun would update `bun.lockb` while CI/Vercel resolve from `package-lock.json`, producing divergent builds.

**Fix applied:** `git rm bun.lock bun.lockb` → commit `be1d0c7 chore: remove stale non-npm lockfile (lovable cleanup)`. Verified `npm ci` on clean `node_modules` still resolves cleanly (662 packages, 30s, no errors).

Same category as `@lovable.dev/cloud-auth-js` in deps (baseline.md): both are Lovable-era residue to clean up.

---

## Finding #38 — Local `.env` points to OLD inactive Supabase project — RESOLVED this session

🔴 **Critical (local dev only — production unaffected).** Discovered during 0c smoke test: console + network requests on `http://localhost:8080/` were hitting `agmcauhjhfwksrjllxar.supabase.co` (the deprecated Supabase project flagged in CLAUDE.md as "DO NOT touch — old inactive") instead of the live `ksbblqnwcmfylpxygyrj`. Symptoms: `/auth/v1/token` → 400, `/rest/v1/resource_links` → 404 (that table doesn't exist in the old project). Login + all data reads broken locally.

**Root cause:** Stale `.env` file in repo root (filesystem mtime Mar 29, gitignored). Three keys all pointed to old project: `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Likely a leftover from a pre-migration clone or Lovable-era handoff — never updated when the app moved to the new project.

**Scope:** Local dev only. Vercel production uses its own project-level env vars (not this file), so anesthesiology-mentor.vercel.app is unaffected. The `.env` is in `.gitignore` (line 34 `.env`), so no risk of wrong creds leaking in source.

**Fix applied:** Overwrote `.env` with correct values from Supabase MCP `get_publishable_keys` for project `ksbblqnwcmfylpxygyrj`. Killed old dev server (bg task `bk8y0x5cj`, serving stale env), restarted (`bkgl3zrfz`) — Vite reports fresh boot in 1057ms, HTTP 200 on `/`. User will hard-reload browser to clear cached requests.

**Invalidates:** All smoke-test flows logged before this fix are invalid (they tested the wrong backend). 0c resumes from scratch after restart.

**Related:** Same "Lovable-era residue" category as Finding #37 (duplicate lockfiles) and unused `@lovable.dev/cloud-auth-js` dep (baseline.md). Suggests a broader audit pass for other stale pre-migration artifacts.

---

## Finding #39 — React duplicate-key warning in `SrsDecayChart`

🟡 **Medium.** Console warning seen during 0c smoke test:
```
Warning: Encountered two children with the same key, `1`.
  at SrsDecayChart
```
Likely a `.map(item => <... key={item.someField}>)` where `someField` is not unique across the rendered list (e.g., a bucket or day index that repeats).

**File:** `src/components/srs/SrsDecayChart.tsx` (around line 46 per user observation).

**Impact:** React's reconciler can't distinguish sibling nodes with identical keys → possible incorrect DOM diff on re-render (wrong tooltip state, animation glitches), plus console noise. Not blocking, but should be fixed.

**Fix (later, Phase 0e or 1):** Use a genuinely unique key — composite of fields that uniquely identify a row, or array index as a last resort. Full fix requires reading the component to see which field is duplicating.

---

## Finding #40 — Simulation mode: answer-lock regression ✅ RESOLVED (2026-04-20)

🔴 **High.** In simulation mode, once an answer is clicked it cannot be changed before confirmation. User quote during 0c test (2026-04-20): _"ברגע מסמנים תשובה הוא לא נותן להחליף, זה לא היה וזה בעיה."_

**Location:** `src/components/views/SessionView.tsx` — simulation branch (logic that handles `onAnswerSelect` / `selectedAnswer` state when `mode === 'simulation'`).

**Scope:** REGRESSION. Previous behaviour allowed re-selecting an answer until the user confirmed. The exam-style UX explicitly requires the ability to change mind before committing — this is how the real שלב א' exam works and how the app worked historically. Current behaviour is both a functional regression and a pedagogy regression (blocks the "think twice before locking in" pattern).

**Introducing commit:** `7d8bd6a` ("Changes", 2026-02-21 — bot commit that first added full simulation mode with countdown timer + separate UX). The lock was present from day one of simulation mode; user noticed the mismatch vs exam-mode behaviour during 0c manual test.

**Resolution (Phase 0e, 2026-04-20):** Removed two symmetric guards that blocked re-selection —
1. `src/components/views/SessionView.tsx:340` — `if (isSimulation && savedAns !== null) return;` inside `handleAnswer`
2. `src/components/views/SessionView.tsx:815` — `(isSimulation && savedAns !== null)` inside button `disabled` prop

Simulation now behaves identically to exam mode: user can change answer freely; moving to the next question via `handleNext` is the implicit "commit". `getOptionClasses` already handles the selected-state highlight correctly for re-selection. TypeScript check passed (`tsc --noEmit`).

---

## Finding #41 — CORS blocks `sync-questions` Edge Function from `localhost`

🟡 **Medium (dev-only).** Every dev session-init produces a browser console error:
```
Access to fetch at 'https://ksbblqnwcmfylpxygyrj.supabase.co/functions/v1/sync-questions'
from origin 'http://localhost:8080' has been blocked by CORS policy:
The 'Access-Control-Allow-Origin' header has a value
'https://anesthesiology-mentor.vercel.app' that is not equal to the supplied origin.
```

**Location:** `supabase/functions/sync-questions/index.ts` — hardcoded `Access-Control-Allow-Origin: 'https://anesthesiology-mentor.vercel.app'` in the CORS headers block.

**Called from:** `src/lib/csvService.ts:82` (`syncQuestionsFromGoogleSheets`) invoked by `src/contexts/AppContext.tsx:376` on app initialisation.

**Impact:** "Auto-sync failed" toast / console error on every local dev boot. App still works — questions are served from cache and Supabase direct reads — but the dev noise obscures real errors and new contributors will think something is broken.

**Fix (Phase 0e):** Allow-list `http://localhost:8080` alongside the Vercel origin. Pattern:
```ts
const ALLOWED_ORIGINS = new Set([
  'https://anesthesiology-mentor.vercel.app',
  'http://localhost:8080',
]);
const origin = req.headers.get('origin') ?? '';
const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : '';
```
Do NOT use `*` — the function is admin-only and expects a user JWT, so origin reflection is safer than wildcard.

---

## Finding #42 — Missing DB resources (404s) — schema gap vs CLAUDE.md — 🔴 Escalated

🔴 **Critical.** Three Supabase resources that the frontend actively calls **do not exist** in the live schema of project `ksbblqnwcmfylpxygyrj`. Probed via Supabase MCP on 2026-04-20:

| Resource | Kind | Called from | Status in live DB |
|---|---|---|---|
| `calculator_formulas` | table | calculator view (see GET `/rest/v1/calculator_formulas?select=*&order=sort_order.asc`) | **MISSING** (not in `list_tables` output) |
| `get_question_success_rate` | RPC function | `src/components/SessionCommunity.tsx:14` — fires per question | **MISSING** (not in `pg_proc` for public schema) |
| `get_global_daily_accuracy` | RPC function | stats daily accuracy tile | **MISSING** (not in `pg_proc` for public schema) |

**`pg_proc` public-schema result for queried names (full):** `increment_user_answer`, `is_admin`, `is_editor`. The two RPCs above were not returned — the functions genuinely don't exist.

**Schema gap vs CLAUDE.md:** `CLAUDE.md` documents `calculator_formulas` as a live table (line reference: "Supabase Tables" section). The live schema contradicts that — same goes for `anki_decks`, `anki_cards`, `study_rooms`, `room_participants`, `room_answers`, `user_feedback` (all listed in CLAUDE.md, none present in `list_tables`). That's seven documented tables missing from live DB.

**Edge Function delta:** Baseline.md listed 6 edge functions; live now has 10 — new: `claude-ai`, `telegram-bot`, `idea-weekly-report`, `idea-reminders`. Out of current Phase 0 scope, but suggests `CLAUDE.md` and the earlier inventory are both drifting from reality.

**Impact:**
- **User-visible:** calculator view works only because of a fallback data path; community success-rate widget is silently degraded (404 every question load — `SessionCommunity.tsx` fires it on every render); stats daily-accuracy tile similarly degraded.
- **Documentation:** `CLAUDE.md` + baseline inventory are stale and misleading for future agents / reviewers.

**Severity upgrade rationale:** Initial triage had this at 🟡 pending MCP verification. Verification confirms the resources are missing (not RLS-blocked). A frontend that fires 404s on every session page load is a real regression and must be decided on before Phase 1 begins.

**Action for 0d/0e:** three options —
1. **Restore:** find the original migration (was it ever applied? check git history of `supabase/migrations/`) and re-apply.
2. **Remove caller:** delete the frontend call sites if the feature was abandoned.
3. **Stub RPCs:** add lightweight RPC definitions that return empty/zero so 404s stop without restoring full functionality.
Decision requires product input from the user.

**Sync CLAUDE.md in 0e or Phase 1** after the direction above is chosen — the doc's "Supabase Tables" section currently misrepresents reality.

---

## Finding #43 — Tiptap duplicate extension names in `RichTextEditor`

🟢 **Low.** Console warning during any RichTextEditor mount:
```
Duplicate extension names found: ['link', 'underline'].
```

**Location:** `src/components/RichTextEditor.tsx:31` — the `extensions: [...]` array passed to `useEditor()`.

**Root cause (likely):** `StarterKit` (used by Tiptap out of the box) already bundles `Link` and `Underline` (or similar). Adding them again as individual extensions registers the name twice, which Tiptap dedups with a warning.

**Fix (0e or Phase 1):** either (a) remove the explicit `Link` / `Underline` imports from the extensions array, or (b) if configuration differs from the StarterKit defaults, configure via `StarterKit.configure({ link: {...}, underline: {...} })` or pass `StarterKit.configure({ link: false, underline: false })` and keep the explicit custom extensions.

---

## Finding #44 — Radix Dialog missing `aria-describedby` (accessibility)

🟢 **Low (a11y).** Console warning when any dialog opens:
```
Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
```

**Location:** unknown exact file without grepping — affects any `<DialogContent>` used without a `<DialogDescription>` child. Likely multiple call sites across modals (share question, feedback, flashcard settings, etc.).

**Impact:** Screen readers cannot announce a description for the dialog, degrading accessibility. Not blocking, not user-visible in normal usage, but a standards violation Radix intentionally nudges about.

**Fix (0e or Phase 1):** audit all `<DialogContent>` usages; either
- add a `<DialogDescription>` child with a short purpose line (preferred), or
- pass `aria-describedby={undefined}` explicitly when no description is meaningful (silences the warning while keeping the default).

Grep target: `<DialogContent` in `src/components/**`.

---

## Next steps

Pending user approval to proceed to:
- **0d** — triage decision: which 🔴 to fix now vs. defer. Blocker set as of 2026-04-20: `#3, #5, #7, #10, #11, #13, #15, #38 (resolved), #40, #42`. New escalations in 0c: #40 and #42 (latter from 🟡 → 🔴). Suggested 0d order: **#40 (regression, small)** → **#42 (schema; needs product decision)** → remaining pre-existing 🔴s.
- **0e** — execute approved fixes on `phase-0-code-review` branch, PR with preview URL. Cleanup candidates for same sweep: #41, #43, #44.
