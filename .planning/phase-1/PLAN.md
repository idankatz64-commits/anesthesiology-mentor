---
phase: 1-stats-redesign
plan: master
type: execute
branch: phase-1-stats-cleanup
exam_date: 2026-06-16
budget_days: 7
waves: 3
autonomous: false        # Wave 1 + Wave 2 have human-verify checkpoints
feature_flag: statsV2Enabled
feature_flag_backend: localStorage
requirements: [R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7, R1.8, R1.9, R1.10]
research_file: .planning/phase-1/RESEARCH.md
review_file: .planning/plan-review-2026-04-21.md
---

# Phase 1 — Stats Page Redesign (Execution Plan)

> **Scope lock:** This plan implements the Phase 1 section of `binary-swimming-toucan.md` (lines 141–230), informed by `.planning/phase-1/RESEARCH.md` and `.planning/plan-review-2026-04-21.md`. Every task is executable by `gsd-executor` without further research. All findings from RESEARCH.md are treated as locked decisions.

---

## Section 1 — Goal-Backward Statement

### Hebrew (עידן)

**סוף הדרך של Phase 1:** נכנסים לדף `/stats`, רואים תוך פחות מ-5 שניות "מה לעשות עכשיו" — ציון ERI גדול + משפט אחד ("תרגל 15 שאלות מ-Cardiac Physiology") + כפתור "התחל עכשיו". לחיצה אחת → סשן למידה מתחיל עם הנושא הנכון. הטבלה של 40 הנושאים עדיין בעמוד (לא נמחקה, רק הוסתרה ב-Collapsible). אם בטלפון משהו נשבר — טוגלים את ה-feature flag ל-OFF ב-localStorage ורואים את הגרסה הישנה שוב תוך שנייה אחת, בלי deploy חדש.

**קריטריוני הצלחה קשיחים:**
1. על ה-iPhone (390px רוחב), Hero נכנס ב-above-the-fold בלי scroll.
2. LCP מדוד < 2.5 שניות על Moto G4 throttling ב-Chrome DevTools.
3. `StatsViewV2.tsx` ≤ 200 שורות (לא כולל imports).
4. עם flag=false — הגרסה הישנה (`StatsView.tsx`) רצה בלי שינוי התנהגות.
5. עם flag=true — Hero → WeakZoneCards → Why? → TopicPerformanceTable → WeeklyReportTab.
6. טסט Playwright ירוק: `/stats` → לחיצה על CTA → `SessionView` עם 15 שאלות מהנושא המומלץ.
7. Commit message של כל task בפורמט `feat(phase-1/wave-N): <תיאור>`.

### English (measurable end state)

Phase 1 succeeds iff **all** of the following are provable by automated command on `main` branch after merge:

| # | Criterion | Proof Command / Evidence |
|---|-----------|--------------------------|
| 1 | `src/lib/featureFlags.ts` exists and `useFeatureFlag('statsV2Enabled')` toggles v1↔v2 in real time | `vitest run src/lib/featureFlags.test.ts` green |
| 2 | Legacy `StatsView.tsx` unchanged in behavior (flag=false) | `vitest run src/components/views/StatsView.test.tsx` snapshot stable; DOM-node count delta = 0 vs baseline |
| 3 | `StatsViewV2.tsx` ≤ 200 LOC (excluding imports, blank lines, comments) | `awk 'NF && !/^[[:space:]]*(\/\/|import|\*|\/\*)/' src/components/views/StatsViewV2.tsx \| wc -l` ≤ 200 |
| 4 | `scoreRecommendation()` in `src/lib/recommendations.ts` has ≥ 5 unit tests covering: high-yield weak overdue topic wins; confidence damp on low-sample; empty topicData returns null hero; unknown topic falls back to 0.4; RTL Hebrew reason rendered | `vitest run src/lib/recommendations.test.ts` all green |
| 5 | Hero + WeakZoneCards render above the fold at 390×844 viewport | `npx playwright test e2e/stats-v2-mobile.spec.ts` green; assertion: `heroBoundingBox.bottom ≤ 500` |
| 6 | LCP < 2.5 s on throttled mobile profile for `/` with `statsV2Enabled=true` | `npx playwright test e2e/stats-v2-perf.spec.ts` green; assertion via `web-vitals` reporter |
| 7 | CTA click from Hero navigates to `SessionView` with ≥1 and ≤15 questions from recommended topic | `npx playwright test e2e/stats-v2-cta.spec.ts` green |
| 8 | `grep -rn "YIELD_TIER_MAP" src/ \| grep -v smartSelection.ts` returns **0 duplicate-definition** matches (imports allowed) | `rg "const YIELD_TIER_MAP" src/ \| rg -v smartSelection` returns empty |
| 9 | Flag=false: legacy StatsView renders and passes existing tests | `vitest run` full green with `process.env.STATS_V2=0` or unset |
| 10 | Playwright E2E test suite green on Vercel preview build | Vercel PR preview URL + Playwright run against it passes |

---

## Section 2 — Wave Breakdown

### Wave 0 — Foundation (1 day)

**Goal:** Install missing tooling, land feature-flag infrastructure, write the recommendation-logic tests **before** the implementation, and capture LCP baseline of the current legacy StatsView. Everything in this wave is additive — no user-visible change.

### Wave 1 — New v2 Components (2–3 days)

**Goal:** Ship every new v2 component behind the (default-off) `statsV2Enabled` flag. Legacy `StatsView.tsx` is NOT touched. TopicPerformanceTable is wrapped (not rewritten) with a thin outer `Collapsible`. WeeklyReportTab is a placeholder. All components are lazy-loaded except Hero + WeakZoneCards (above-the-fold).

### Wave 2 — Integration & Cleanup (1–2 days)

**Goal:** Introduce `StatsViewV2.tsx` and `StatsViewRouter.tsx`, wire them via `Index.tsx` switch, move heavy components (`AccuracyCanvasChart`, `TopicTreemap`, `ForgettingRiskTile`) into a drill-down `TopicsDrilldownView.tsx` (triggered via `Sheet`, not a new React Router route), hide the legacy rows from v2, run the Playwright E2E suite, and verify mobile LCP on a Vercel preview.

---

## Section 3 — Task Breakdown with Dependencies

**Legend:**
- **Effort:** S (≤1 h), M (1–3 h), L (3–6 h)
- **Agent:** sub-agent to invoke on the task
- **Commit:** every task = one commit. Format: `feat(phase-1/wave-N): <description>` (or `test(...)` / `chore(...)` / `refactor(...)`).

---

### Wave 0 — Foundation

| ID | Task | Files | Test Files | Deps | Effort | Agent | Done-When |
|----|------|-------|-----------|------|--------|-------|-----------|
| **W0.1** | Verify Vitest + RTL + jsdom installed (per RESEARCH.md — confirmed present in `package.json`); install `@testing-library/user-event` + `web-vitals` + `@playwright/test`; run `npx playwright install chromium`. Add npm scripts: `"test:e2e": "playwright test"`, `"test:all": "npm run test && npm run test:e2e"`. | `package.json`, `package-lock.json` | — | — | S | `tdd-guide` | `npm run test` green; `npx playwright --version` returns; `npm run test:e2e` runs (may fail with "no tests" — that is OK) |
| **W0.2** | Create `e2e/playwright.config.ts` pointing at `process.env.PLAYWRIGHT_BASE_URL \|\| http://localhost:5173`, Chromium only, mobile viewport `iPhone 13` project AND desktop project. Add `.gitignore` entries for `test-results/`, `playwright-report/`. | `e2e/playwright.config.ts`, `.gitignore` | — | W0.1 | S | `tdd-guide` | `npx playwright test --list` shows zero tests but no config errors |
| **W0.3** | **(TDD RED)** Write unit tests for `scoreRecommendation()` from RESEARCH.md §Recommendation Logic. Five cases: (a) high-yield × weak × overdue wins over low-yield × fresh, (b) `confidenceDamp` kicks in when `questionsSeen < 5`, (c) unknown topic defaults `yieldW = 0.4`, (d) `recency` capped at 30 days, (e) Hebrew reason string contains topic name. **Tests MUST fail** (function does not yet exist) — run `npm test`, confirm red, commit. | — | `src/lib/recommendations.test.ts` | W0.1 | M | `tdd-guide` | `npm test -- --run src/lib/recommendations` exits 1 with "module not found" or `toBeDefined()` failing |
| **W0.4** | **(TDD RED)** Write unit tests for `useFeatureFlag('statsV2Enabled')`: (a) default `enabled=false` when localStorage empty, (b) `setEnabled(true)` writes to localStorage + state updates, (c) `storage` event from another tab updates state, (d) graceful fallback when `localStorage` access throws. **Tests MUST fail.** | — | `src/lib/featureFlags.test.ts` | W0.1 | S | `tdd-guide` | `npm test -- --run src/lib/featureFlags` exits 1 (module missing) |
| **W0.5** | Implement `src/lib/featureFlags.ts` exactly per RESEARCH.md §Feature Flag Infrastructure Option 1 (localStorage with storage-event sync). Export `type FlagName = 'statsV2Enabled'`, `useFeatureFlag(name: FlagName): { enabled: boolean; setEnabled: (v: boolean) => void }`. Re-run W0.4 tests → **green**. Commit. | `src/lib/featureFlags.ts` | (W0.4 passes) | W0.4 | S | `typescript-reviewer` (post) | `npm test -- --run src/lib/featureFlags` exits 0 |
| **W0.6** | Implement `src/lib/recommendations.ts`: export `RecommendationInput`, `Recommendation`, `scoreRecommendation(i)`. Import `YIELD_TIER_MAP` from `@/lib/smartSelection` (DO NOT redefine — per plan-review #10). Re-run W0.3 tests → **green**. Commit. | `src/lib/recommendations.ts` | (W0.3 passes) | W0.3, W0.5 | M | `typescript-reviewer` (post) | `npm test -- --run src/lib/recommendations` exits 0; `rg "const YIELD_TIER_MAP" src/ \| rg -v smartSelection` returns 0 hits |
| **W0.7** | Create `src/hooks/useRecommendations.ts` per RESEARCH.md §Architecture Pattern 2. Returns `{ hero: Recommendation \| null, weakZones: Recommendation[] }`. Write RTL test with mocked `useStatsData`: null when `topicData` empty, top-1 selected correctly, weakZones are `slice(0,3)`. | `src/hooks/useRecommendations.ts` | `src/hooks/useRecommendations.test.ts` | W0.6 | M | `tdd-guide` | `npm test -- --run src/hooks/useRecommendations` exits 0 |
| **W0.8** | Create `src/lib/lcp.ts` — a thin `reportLCP()` helper using `web-vitals` `onLCP` that logs to console in dev and pushes to a Playwright test global in test mode. Wire it in `src/main.tsx` behind `if (import.meta.env.DEV \|\| import.meta.env.MODE === 'test')`. | `src/lib/lcp.ts`, `src/main.tsx` | — | W0.1 | S | `typescript-reviewer` | `npm run build` succeeds; dev console shows LCP number on `/stats` |
| **W0.9** | **Baseline measurement (human-in-the-loop ok):** Run `npm run dev`, navigate to `/stats` on a Chrome DevTools "Moto G4" + "Slow 4G" profile, capture 3 LCP readings. Record median in `.planning/phase-1/VERIFICATION.md` under `## LCP Baseline (Legacy)`. This is the number Wave 2 must beat. | `.planning/phase-1/VERIFICATION.md` (create) | — | W0.8 | S | (manual — Idan or executor) | VERIFICATION.md has 3 readings + median for legacy StatsView |
| **W0.10** | Add a minimal "Debug Flags" card to `AdminDashboard` (admin-only, already RLS-gated). Single `Switch` bound to `useFeatureFlag('statsV2Enabled')`. This is the toggle Idan will use to compare v1↔v2 end-to-end. | `src/components/views/AdminDashboard.tsx` (or appropriate admin tab file; search for existing admin switch pattern first) | `src/components/views/AdminDashboard.test.tsx` (smoke: switch toggles state) | W0.5 | M | `typescript-reviewer` | Admin page renders switch; toggling it sets `localStorage.getItem('feature:statsV2Enabled')` to `'true'` / `'false'` |

**Wave 0 commit chain (10 commits):**
```
chore(phase-1/wave-0): install playwright, user-event, web-vitals
chore(phase-1/wave-0): add playwright config + mobile viewport
test(phase-1/wave-0): RED — recommendation scoring tests
test(phase-1/wave-0): RED — useFeatureFlag tests
feat(phase-1/wave-0): useFeatureFlag hook (localStorage backend)
feat(phase-1/wave-0): scoreRecommendation (imports YIELD_TIER_MAP)
feat(phase-1/wave-0): useRecommendations selector hook + tests
feat(phase-1/wave-0): web-vitals LCP reporter (dev + test mode)
docs(phase-1/wave-0): legacy StatsView LCP baseline recorded
feat(phase-1/wave-0): admin Debug Flags switch for statsV2Enabled
```

---

### Wave 1 — New v2 Components

> All new files live under `src/components/stats/v2/`. **NOT** gated internally — the gating happens in Wave 2 at `StatsViewRouter`. These components are fully functional in isolation and covered by unit tests.

| ID | Task | Files | Test Files | Deps | Effort | Agent | Done-When |
|----|------|-------|-----------|------|--------|-------|-----------|
| **W1.1** | **(TDD)** Extract `ERIRing` as standalone SVG component from `ERITile.tsx` (per RESEARCH.md Code Example 2). Pure function: `{ score, size? }` → SVG. Write test first: renders circle with correct `strokeDashoffset` for score=0, 50, 100; color green ≥70 / amber ≥50 / red <50. | `src/components/stats/v2/ERIRing.tsx` | `src/components/stats/v2/ERIRing.test.tsx` | W0.* | S | `tdd-guide` | `npm test -- --run ERIRing` green |
| **W1.2** | **(TDD)** Build `StatsHero.tsx` per RESEARCH.md Code Example 3. Inputs: `useRecommendations()` for hero; `useStatsData()` for ERI score + exam countdown + streak. Layout: flex-col on mobile, flex-row on md+. CTA button calls `startSession(filteredPool, min(pool.length,15), 'practice')`. Test: (a) renders "עוד אין מספיק נתונים" empty-state when hero is null, (b) renders topic name when hero present, (c) CTA click calls `startSession` with correct args. **Do NOT use framer-motion** (LCP per pitfall #2). | `src/components/stats/v2/StatsHero.tsx` | `src/components/stats/v2/StatsHero.test.tsx` | W1.1, W0.7 | M | `tdd-guide` | Test green; file ≤ 150 LOC |
| **W1.3** | **(TDD)** Build `WeakZoneCard.tsx` per RESEARCH.md Code Example 4 — single card, clickable with keyboard support (Enter key). Props: `{ topic, accuracy, reason, onStart }`. Test: (a) `onClick` triggers `onStart(topic)`, (b) Enter key on focused card triggers `onStart`, (c) truncates long topic names with `title` attr, (d) `min-h-[96px]` class present for tap-target compliance. | `src/components/stats/v2/WeakZoneCard.tsx` | `src/components/stats/v2/WeakZoneCard.test.tsx` | W0.7 | S | `tdd-guide` | Test green |
| **W1.4** | **(TDD)** Build `WeakZoneCards.tsx` — parent container rendering top-3 from `useRecommendations().weakZones`. `grid-cols-1 gap-3 md:grid-cols-3`. Each card calls `startSession` via the same pattern as StatsHero. Test: (a) renders 3 cards when weakZones has 3, (b) 0 cards + graceful empty state when weakZones empty, (c) click on card N calls `startSession` with topic N's questions. | `src/components/stats/v2/WeakZoneCards.tsx` | `src/components/stats/v2/WeakZoneCards.test.tsx` | W1.3 | M | `tdd-guide` | Test green |
| **W1.5** | **(TDD)** Build `ERIWhyPanel.tsx` — migrates the ERI modal content from `ERITile.tsx` (radar + component-scores + strengths/weaknesses). Use recharts `<Radar>` — will be lazy-loaded at the accordion level (W1.6). Test: (a) renders radar, (b) shows all 4 component scores with labels, (c) does NOT render a modal wrapper. | `src/components/stats/v2/ERIWhyPanel.tsx` | `src/components/stats/v2/ERIWhyPanel.test.tsx` | W0.* | M | `typescript-reviewer` | Test green; file imports recharts directly (chunking handled in W2) |
| **W1.6** | **(TDD)** Build `WhyAccordion.tsx` — shadcn `Accordion` wrapper, **default collapsed**. Inside: lazy-imported `<ERIWhyPanel />` + mini sparkline (14-day trend from `useStatsData.trendData14`, reuse recharts `LineChart`) + mini streak calendar (14-day grid, plain divs, no library). Test: (a) collapsed by default (`aria-expanded="false"`), (b) click opens, revealing panel + sparkline + calendar, (c) Suspense fallback visible during lazy load. | `src/components/stats/v2/WhyAccordion.tsx` | `src/components/stats/v2/WhyAccordion.test.tsx` | W1.5 | M | `tdd-guide` | Test green |
| **W1.7** | **(TDD)** Build `WeeklyReportTab.tsx` — **placeholder only**, per RESEARCH.md Master Report §Option 1. Shows: Hebrew copy `"דוח שבועי מלא — בקרוב ב-Phase 2a"` + muted link button `"פתח את הדוח האחרון"` linking to the most recent existing `reports/master_report_*.html` (hard-code the latest known filename, `master_report_2026-04-18.html`, in Phase 1 — Phase 2a dynamicizes this). Test: (a) placeholder copy visible, (b) link `href` points to known file, (c) link opens in new tab (`target="_blank" rel="noopener"`). | `src/components/stats/v2/WeeklyReportTab.tsx` | `src/components/stats/v2/WeeklyReportTab.test.tsx` | — | S | `tdd-guide` | Test green |
| **W1.8** | Wrap `TopicPerformanceTable` in a thin `TopicPerformanceTableCollapsible.tsx` sibling file — does NOT touch the 682-line internals. Outer shell: shadcn `Collapsible` with `<CollapsibleTrigger>` "📊 כל הנושאים (40)" default-closed, `<CollapsibleContent>` containing `<TopicPerformanceTable />`. **Separately** hoist row-click → start session: add an `onRowClick?: (topic: string) => void` prop to `TopicPerformanceTable` (one-line addition, opt-in, legacy caller ignores it) and wire it in the new wrapper. Test the wrapper, not the table internals. | `src/components/stats/v2/TopicPerformanceTableCollapsible.tsx`, `src/components/stats/TopicPerformanceTable.tsx` (surgical — add optional prop only) | `src/components/stats/v2/TopicPerformanceTableCollapsible.test.tsx` | — | M | `typescript-reviewer` | Test green; diff on `TopicPerformanceTable.tsx` is ≤ 10 LOC and additive |
| **W1.9** | **Human-verify checkpoint.** Start `npm run dev`, manually mount each new component in a scratch page (`src/components/stats/v2/__scratch__.tsx` — gitignored or behind dev-only route). Verify on: (a) iPhone 13 viewport in DevTools, (b) desktop at 1440px, (c) dark mode toggle. Visual confirmation that Hero fits above fold. **Pause here — wait for Idan's "approved" before proceeding to Wave 2.** | (scratch file, gitignored) | — | W1.1–W1.8 | S | (human) | Idan types "approved" OR opens specific issues as new Wave-1.N sub-tasks |

**Wave 1 commit chain (9 commits):**
```
feat(phase-1/wave-1): extract ERIRing as standalone SVG component
feat(phase-1/wave-1): StatsHero (ERI + single recommendation + CTA)
feat(phase-1/wave-1): WeakZoneCard single-card primitive
feat(phase-1/wave-1): WeakZoneCards top-3 container
feat(phase-1/wave-1): ERIWhyPanel (radar + scores, lazy-ready)
feat(phase-1/wave-1): WhyAccordion (collapsed by default, Suspense)
feat(phase-1/wave-1): WeeklyReportTab Phase-1 placeholder
feat(phase-1/wave-1): TopicPerformanceTableCollapsible wrapper + onRowClick prop
chore(phase-1/wave-1): scratch route for visual QA (dev-only)
```

---

### Wave 2 — Integration & Cleanup

| ID | Task | Files | Test Files | Deps | Effort | Agent | Done-When |
|----|------|-------|-----------|------|--------|-------|-----------|
| **W2.1** | Build `TopicsDrilldownView.tsx` — a `Sheet` (side depends on RTL detection per pitfall #3; use `side="left"` under `dir="rtl"`, else `side="right"`) that hosts lazy-loaded `AccuracyCanvasChart` + `TopicTreemap` + `ForgettingRiskTile`. Exposes `<TopicsDrilldown open={...} onClose={...} initialTopic={...} />`. Reuse the `PersonalStatsDrilldown` Sheet pattern (RESEARCH.md §PersonalStatsDrilldown). Test: (a) closed by default, (b) opens when `open=true`, (c) lazy-loads children (verify `<Suspense>` fallback), (d) closes on ESC + backdrop click. | `src/components/views/TopicsDrilldownView.tsx`, `src/hooks/useStatsDrilldown.ts` | `src/components/views/TopicsDrilldownView.test.tsx` | W1 | M | `typescript-reviewer` | Test green |
| **W2.2** | Build `StatsViewV2.tsx` — the new main view. **Hard budget: ≤ 200 LOC.** Composition (top→bottom): Header (title + TopicFilterDropdown only — no date-range picker in v2) → `<StatsHero />` → `<WeakZoneCards />` → `<WhyAccordion />` → `<TopicPerformanceTableCollapsible />` → `<WeeklyReportTab />` → drill-down `<TopicsDrilldown />`. Lazy-load everything **except** `StatsHero` + `WeakZoneCards`. Use `<Suspense fallback={<div className="h-[600px]" />}>` for TopicPerformanceTable (pitfall #6 — reserve height to keep CLS ≈ 0). Snapshot test: v2 does NOT render the 4 removed rows (KPI row, DB inventory row, Personal Stats row, dual heatmap row). | `src/components/views/StatsViewV2.tsx` | `src/components/views/StatsViewV2.test.tsx` | W2.1 | L | `typescript-reviewer` | Test green; LOC check (awk command above) returns ≤ 200 |
| **W2.3** | Build `StatsViewRouter.tsx` per RESEARCH.md §Architecture Pattern 1. Reads `useFeatureFlag('statsV2Enabled')`. Flag off → `<StatsView />` (legacy, unchanged). Flag on → `<Suspense><StatsViewV2 /></Suspense>`. Update `src/Index.tsx` (or whichever file contains the `switch(currentView)`) to replace `case 'stats': return <StatsView />` with `case 'stats': return <StatsViewRouter />`. Test: (a) flag=false → v1 markup, (b) flag=true → v2 markup. | `src/components/views/StatsViewRouter.tsx`, `src/Index.tsx` (1-line change) | `src/components/views/StatsViewRouter.test.tsx` | W2.2 | S | `typescript-reviewer` | Test green; flipping the admin switch changes rendered markup without page reload |
| **W2.4** | Ensure legacy `StatsView.tsx` is **untouched** (git diff ≤ 0 lines on this file in Wave 2). Add `src/components/views/StatsView.test.tsx` regression snapshot if one doesn't exist, to lock current behavior. | `src/components/views/StatsView.test.tsx` (add if missing) | — | W2.3 | S | `tdd-guide` | `git diff main -- src/components/views/StatsView.tsx` shows 0 lines changed; snapshot test green |
| **W2.5** | Vite chunk tuning: edit `vite.config.ts` to add `manualChunks: { 'recharts-vendor': ['recharts'] }` per RESEARCH.md pitfall #7. Run `npm run build`, confirm recharts appears in exactly one chunk. | `vite.config.ts` | — | W2.2 | S | `typescript-reviewer` | `npm run build` log shows `recharts-vendor-*.js` as single chunk |
| **W2.6** | **Playwright E2E — CTA flow.** `e2e/stats-v2-cta.spec.ts`: (1) login as test user OR bypass auth via env flag, (2) set `localStorage.setItem('feature:statsV2Enabled','true')` before navigate, (3) go to `/` → open stats view, (4) assert Hero visible with a topic name, (5) click CTA, (6) assert SessionView rendered with ≤15 questions matching the Hero topic. | `e2e/stats-v2-cta.spec.ts` | (the test itself) | W2.3 | M | `tdd-guide` | `npx playwright test e2e/stats-v2-cta.spec.ts` green |
| **W2.7** | **Playwright E2E — Mobile viewport.** `e2e/stats-v2-mobile.spec.ts`: viewport 390×844, flag=true, assert `heroSection.boundingBox().bottom <= 500` (above-the-fold). Also assert Weak Zone cards render in single column (`grid-cols-1`). | `e2e/stats-v2-mobile.spec.ts` | (the test itself) | W2.3 | M | `tdd-guide` | Test green |
| **W2.8** | **Playwright E2E — LCP budget.** `e2e/stats-v2-perf.spec.ts`: use `web-vitals` reporter hook (from W0.8) wired to a `window.__LCP` global in test mode. Throttle CPU 4x + Slow 3G via CDP, navigate to stats v2, wait for `onLCP`, assert `lcp < 2500`. Record actual number in VERIFICATION.md `## LCP v2 (Measured)` section. | `e2e/stats-v2-perf.spec.ts`, `.planning/phase-1/VERIFICATION.md` (append) | (the test itself) | W2.3, W2.5 | L | `tdd-guide` | Test green with LCP < 2500; VERIFICATION.md shows v2 LCP ≤ legacy LCP |
| **W2.9** | Code review pass on the entire Wave 2 diff using `typescript-reviewer` + `code-reviewer` agents **in parallel**. Fix any HIGH/CRITICAL issues. MEDIUM issues fixed if they don't blow the week budget. | (all Wave 1 + 2 files) | — | W2.6, W2.7, W2.8 | M | `code-reviewer`, `typescript-reviewer` (parallel) | No CRITICAL/HIGH issues open; review summary appended to VERIFICATION.md |
| **W2.10** | **Vercel preview + human-verify checkpoint.** Push branch, wait for Vercel PR preview URL. Manually test on (a) real iPhone or iOS Simulator Safari, (b) desktop Chrome at 1440px, (c) dark/light toggle, (d) flag toggle on admin panel — v1 ↔ v2 swap works instantly. **Pause for Idan's approval before creating the merge PR.** | — | — | W2.9 | S | (human) | Idan types "approved" |
| **W2.11** | Open PR `phase-1-stats-cleanup` → `main` with title `feat(phase-1): stats page redesign behind statsV2Enabled flag`. Body: summary + test plan checklist + rollback strategy + link to VERIFICATION.md. Run full merge-gate checklist (Section 6). Squash-merge into main once all checks pass. | (PR only) | — | W2.10 | S | `code-reviewer` (final pass) | PR merged; main green on Vercel production (with flag default-off, no user-visible change) |

**Wave 2 commit chain (10 commits + merge):**
```
feat(phase-1/wave-2): TopicsDrilldownView Sheet with lazy children
feat(phase-1/wave-2): StatsViewV2 main composition (≤200 LOC)
feat(phase-1/wave-2): StatsViewRouter + Index.tsx wiring
test(phase-1/wave-2): regression snapshot for legacy StatsView
chore(phase-1/wave-2): vite manualChunks for recharts
test(phase-1/wave-2): Playwright E2E — Hero CTA → session
test(phase-1/wave-2): Playwright E2E — mobile above-the-fold
test(phase-1/wave-2): Playwright E2E — LCP < 2.5s budget
refactor(phase-1/wave-2): address code-reviewer HIGH items
docs(phase-1/wave-2): Vercel preview verified; ready for merge
```

---

## Section 4 — Acceptance Criteria Per Wave

### Wave 0 Done When

- [ ] `npm run test` green — all Wave 0 unit tests pass
- [ ] `npx playwright --version` returns a valid version
- [ ] `localStorage.setItem('feature:statsV2Enabled','true')` + page reload shows `useFeatureFlag('statsV2Enabled').enabled === true` (verifiable in React DevTools)
- [ ] Admin Debug Flags switch renders and toggles the localStorage value
- [ ] `.planning/phase-1/VERIFICATION.md` contains legacy LCP baseline (3 readings + median)
- [ ] `grep -rn "const YIELD_TIER_MAP" src/ | grep -v smartSelection.ts` → 0 hits (no duplicate definition)
- [ ] Commit chain (10 commits) pushed; branch passes CI

### Wave 1 Done When

- [ ] All 9 new v2 files exist and compile (`npm run build` zero TS errors)
- [ ] `npm run test` green — all unit tests for new components pass
- [ ] **Manual visual check:** scratch route shows each component renders correctly in light + dark mode, iPhone + desktop viewports
- [ ] `TopicPerformanceTable.tsx` diff ≤ 10 LOC (surgical `onRowClick` prop addition only)
- [ ] No new `any` types in new files; no `console.log` in shipped paths
- [ ] Hebrew RTL copy in every user-facing component (`dir="rtl"` or equivalent)
- [ ] Idan has typed "approved" at the W1.9 checkpoint

### Wave 2 Done When

- [ ] `StatsViewV2.tsx` ≤ 200 LOC (awk check passes)
- [ ] All 3 Playwright E2E specs green (`e2e/stats-v2-cta`, `e2e/stats-v2-mobile`, `e2e/stats-v2-perf`)
- [ ] LCP v2 measured < 2.5 s on Slow 3G + 4× CPU throttle profile; recorded in VERIFICATION.md
- [ ] Flag=false on Vercel preview renders legacy UI exactly as on main (visual diff confirmed)
- [ ] Flag=true on Vercel preview renders new v2 UI with all 5 sections
- [ ] Code review: 0 CRITICAL, 0 HIGH issues open
- [ ] Idan has typed "approved" at the W2.10 checkpoint
- [ ] PR merged to `main` with flag default `false` → no user-visible change for non-Idan users

---

## Section 5 — Rollback Strategy

| Wave | Rollback Trigger | Rollback Action | Recovery Time |
|------|-----------------|-----------------|---------------|
| **Wave 0** | Any test regression in `npm test` that didn't exist on main | `git revert <commit-sha>` (additive only — no risk to users; flag default-off means zero user impact even if code is merged broken) | < 5 minutes |
| **Wave 1** | New component has a bug; visual QA fails | `git revert <commit-sha(s)>` for the specific component. No users affected (nothing is wired into the router yet — v2 components only live in `src/components/stats/v2/`). | < 10 minutes per component |
| **Wave 2** | Post-merge: regression reported on v2 UI | **Primary:** flip `statsV2Enabled` to `false` via admin panel or by clearing localStorage — **instant rollback with zero deploy.** | < 30 seconds |
| **Wave 2** | Post-merge: regression on **legacy** UI (flag=false) — this should be impossible since `StatsView.tsx` is untouched, but if it occurs | `git revert <merge-commit-sha>` + force Vercel redeploy main | < 5 minutes |
| **Wave 2** | Catastrophic bug on Vercel preview before merge | Do NOT merge. Either revert problematic commits within the branch, or abandon the branch and restart Wave 2 from a stable tag `phase-1-wave-1-complete`. | < 1 hour |

**Safety anchor tags (create before each wave merges):**
- `phase-1-wave-0-complete` — tagged after W0.10 green
- `phase-1-wave-1-complete` — tagged after W1.9 approved
- `phase-1-wave-2-complete` — tagged after W2.11 merged

These tags make `git reset --hard <tag>` a one-liner rollback at any checkpoint.

---

## Section 6 — Merge-Gate Checklist (pre-merge to `main`)

All items must be checked before squash-merging `phase-1-stats-cleanup` → `main`:

### Build & Types
- [ ] `npm run build` green — 0 TS errors, 0 warnings promoted to errors
- [ ] `npm run lint` green — no new ESLint errors vs main baseline
- [ ] No new `any` types introduced (`rg ": any" src/ --type ts --type tsx` diff ≤ 0 vs main)

### Unit + Integration Tests
- [ ] `npm run test` green — all existing + new Vitest suites pass
- [ ] New tests cover: `featureFlags`, `recommendations`, `useRecommendations`, each v2 component, `StatsViewRouter`, `StatsViewV2` snapshot

### E2E Tests
- [ ] `npm run test:e2e` green on local
- [ ] `e2e/stats-v2-cta.spec.ts` green
- [ ] `e2e/stats-v2-mobile.spec.ts` green
- [ ] `e2e/stats-v2-perf.spec.ts` green (LCP < 2500 ms)

### Security & RLS
- [ ] **N/A for Phase 1** — no DB schema changes, no new RLS policies, no new tables. Confirmed: zero files in `supabase/migrations/` modified.
- [ ] No new environment variables required
- [ ] No new secrets committed (`rg -i "(api_key|secret|token|password)" src/` diff ≤ 0)

### Migration Dry-Run
- [ ] **N/A for Phase 1** — no migrations.

### Feature Flag Verification
- [ ] **Flag default in code** is `false` (verify: `useFeatureFlag('statsV2Enabled')` returns `{ enabled: false }` when `localStorage` empty)
- [ ] Admin panel switch writes to `localStorage` correctly (`feature:statsV2Enabled` key)
- [ ] Flag=false on Vercel preview → legacy UI pixel-match with current production
- [ ] Flag=true on Vercel preview → new v2 UI renders
- [ ] Cross-tab sync verified: toggling in one tab updates state in another tab (Storage event)

### Performance
- [ ] Lighthouse LCP on Vercel preview with flag=true ≤ 2500 ms on mobile profile
- [ ] Bundle analysis: `recharts` appears in exactly one chunk (`recharts-vendor-*.js`)
- [ ] Main chunk size delta ≤ +20 KB vs main (Hero + WeakZoneCards + Router are lightweight)

### Manual Vercel Preview Tests (checked by Idan)
- [ ] iPhone Safari: Hero fits above fold
- [ ] iPhone Safari: CTA click → session starts with correct topic
- [ ] iPhone Safari: WeakZoneCard click → session starts with that topic
- [ ] iPhone Safari: "Why?" accordion opens and renders radar without layout jump
- [ ] iPhone Safari: TopicPerformanceTable collapsible opens and table still works
- [ ] Desktop Chrome 1440px: layout looks correct
- [ ] Dark mode: all components render correctly
- [ ] Legacy mode (flag=false): no visible change from production

### Documentation
- [ ] `.planning/phase-1/VERIFICATION.md` complete with LCP baseline + v2 measurement + manual test checklist filled
- [ ] PR description includes rollback instructions

### Git Hygiene
- [ ] Branch rebased onto latest `main` (no merge commits in PR)
- [ ] Commit messages follow `feat(phase-1/wave-N):` convention
- [ ] No temporary debug code (`console.log`, scratch routes visible in prod)
- [ ] `phase-1-wave-2-complete` tag created before merge

---

## Section 7 — Known Risks & Mitigations

Cross-referenced with `.planning/plan-review-2026-04-21.md`. Phase-1-relevant risks only; Phase 2/3/4 risks noted but out of scope.

| ID | Risk | Status | Mitigation |
|----|------|--------|-----------|
| **R-01** | `yieldTier` not defined anywhere (plan-review #10) | **RESOLVED** | `YIELD_TIER_MAP` exists at `src/lib/smartSelection.ts:15–63`. Phase 1 imports it — no duplication. W0.6 enforces this. |
| **R-02** | Master Report iframe (`reports/latest.html`) missing | **DEFERRED** to Phase 2a | `WeeklyReportTab` is a placeholder in Phase 1 (W1.7). Hardcoded link to most-recent dated report as a stopgap. Dynamic resolution in Phase 2a. |
| **R-03** | Rewriting `TopicPerformanceTable` could break user workflow (682 lines of mature UX) | **MITIGATED** | Plan explicitly does NOT rewrite. Table is wrapped in `Collapsible` (W1.8). Single additive change: optional `onRowClick` prop (≤ 10 LOC diff). |
| **R-04** | Feature flag localStorage ≠ cross-device (user can't toggle on phone after toggling on laptop) | **ACCEPTED** for Phase 1 | Idan is primary v2 tester; laptop-first workflow. Hook signature forward-compatible with DB backend (Phase 3+). Documented in RESEARCH.md. |
| **R-05** | Recommendation dominated by outlier topic (pitfall #1) | **MITIGATED** | `confidenceDamp` factor in `scoreRecommendation` (0.3× when `questionsSeen < 5`). W0.3 tests enforce this. |
| **R-06** | ERI ring animation blocks LCP (pitfall #2) | **MITIGATED** | `StatsHero` does NOT use framer-motion. `ERIRing` paints final value on first render. Test: W2.8 asserts LCP < 2.5 s. |
| **R-07** | Radix Sheet breaks RTL layout (pitfall #3) | **MITIGATED** | W2.1 detects `document.documentElement.dir === 'rtl'` and sets `side="left"`. Manual verification in W1.9 + W2.10. |
| **R-08** | `useStatsData` races with questions load → empty recommendation (pitfall #4) | **MITIGATED** | `useRecommendations` returns `{ hero: null }` when `topicData` empty. StatsHero renders Hebrew empty-state. Test W0.7(a). |
| **R-09** | Recharts double-loaded across chunks (pitfall #7) | **MITIGATED** | W2.5 adds `manualChunks` to `vite.config.ts`. W2.11 merge-gate verifies single chunk. |
| **R-10** | Non-admin users see v2 by accident | **MITIGATED** | Admin-only switch. Default-off in code. Merge-gate checklist includes verification that flag=false on preview matches production. |
| **R-11** | `smartSelection.ts` has 0% test coverage (plan-review #8) — changes here could silently break session startup | **DEFERRED** to Phase 4d (per plan-review §2 recommendation); Phase 1 does NOT modify `smartSelection.ts`, only imports constants | Hard constraint: Phase 1 tasks never edit `smartSelection.ts`. Grep-enforced in code review (`git diff main -- src/lib/smartSelection.ts` must be 0 lines). |
| **R-12** | Timeline pressure (8 weeks to exam; Phase 1 budget = 1 week) | **MONITORED** | Wave 0 = 1 day, Wave 1 = 2–3 days, Wave 2 = 1–2 days = 4–6 days total. Slack = 1–3 days. If Wave 1 takes > 3 days, escalate at W1.9 checkpoint. |
| **R-13** | Legacy StatsView could get accidentally modified | **MITIGATED** | Merge-gate explicitly checks `git diff main -- src/components/views/StatsView.tsx` shows 0 lines. W2.4 adds regression snapshot test. |

---

## Section 8 — Out of Scope (explicit exclusions)

The following are **not** part of Phase 1 and MUST NOT appear in any Wave 0/1/2 task. Attempts to scope-creep should be pushed to the listed future phase.

| Exclusion | Future Phase | Why Out of Scope for Phase 1 |
|----------|-------------|------------------------------|
| DB schema changes (new tables, columns, RLS policies) | Phase 2a/2b/3 | Phase 1 is pure UI composition; existing data layer is sufficient. No migration risk. |
| Actual Master Report iframe wiring (dynamic `latest.html`) | Phase 2a | File doesn't exist yet; building pipeline is a separate concern. Placeholder ships in W1.7. |
| FSRS migration (ts-fsrs replacing SM-2) | Phase 3 | Highest-risk change; needs its own phase with confidence column (plan-review #1) and dual-write protection (plan-review #2). |
| Admin `yieldTier` editing UI | Phase 4 (optional) | `YIELD_TIER_MAP` is static code; editing it = code change, not UI. |
| `user_feature_flags` DB table + cross-device sync | Phase 3+ | localStorage is adequate for single-user Phase 1. Hook interface is forward-compatible. |
| Multi-user A/B testing with telemetry | Phase 3+ | Plan-review §S3 — deferred. |
| Strict TypeScript mode rollout (`strict: true` across all files) | Phase 4a | Scoped to Phase 4. New Phase 1 files follow strict conventions anyway. |
| SessionView split (1447 LOC → smaller files) | Phase 4b | Unrelated to stats page. |
| Removing `framer-motion` dependency entirely | Phase 4 (optional) | Other views still use it. Phase 1 only avoids it in Hero. |
| Removing `TopicTreemap` / `ForgettingRiskTile` / `AccuracyCanvasChart` files | Never (keep for drill-down) | Files remain; they just aren't in the main flow anymore. |
| English i18n | Never (Hebrew-only) | User is Hebrew-native; confirmed in RESEARCH.md constraints. |

---

## Appendix A — Sub-Agent Dispatch Summary

| Task IDs | Primary Agent | Rationale |
|---------|---------------|-----------|
| W0.1, W0.2, W0.9 | `tdd-guide` (setup); human-in-loop for W0.9 | Tooling install + manual baseline |
| W0.3, W0.4, W0.7, W1.1–W1.7, W2.6, W2.7, W2.8 | `tdd-guide` | All test-first tasks; RED → GREEN → REFACTOR cycle |
| W0.5, W0.6, W0.8, W0.10, W1.5, W1.8, W2.1, W2.2, W2.3, W2.4, W2.5 | `typescript-reviewer` (post-implementation) | TypeScript-heavy implementation; reviewer catches type drift, unused imports, `any`, console.log |
| W2.9 | `code-reviewer` + `typescript-reviewer` (parallel) | Comprehensive review of entire diff |
| W1.9, W2.10 | **Human (Idan)** | Visual + UX verification; only Idan can sign off |
| W2.11 | `code-reviewer` (final pass on PR) | Final merge gatekeeper |

**Database-reviewer agent NOT needed in Phase 1** — zero DB changes.

---

## Appendix B — File Inventory (created / modified in Phase 1)

### Created (new files)
```
e2e/playwright.config.ts
e2e/stats-v2-cta.spec.ts
e2e/stats-v2-mobile.spec.ts
e2e/stats-v2-perf.spec.ts
src/lib/featureFlags.ts
src/lib/featureFlags.test.ts
src/lib/recommendations.ts
src/lib/recommendations.test.ts
src/lib/lcp.ts
src/hooks/useRecommendations.ts
src/hooks/useRecommendations.test.ts
src/hooks/useStatsDrilldown.ts
src/components/stats/v2/ERIRing.tsx
src/components/stats/v2/ERIRing.test.tsx
src/components/stats/v2/StatsHero.tsx
src/components/stats/v2/StatsHero.test.tsx
src/components/stats/v2/WeakZoneCard.tsx
src/components/stats/v2/WeakZoneCard.test.tsx
src/components/stats/v2/WeakZoneCards.tsx
src/components/stats/v2/WeakZoneCards.test.tsx
src/components/stats/v2/ERIWhyPanel.tsx
src/components/stats/v2/ERIWhyPanel.test.tsx
src/components/stats/v2/WhyAccordion.tsx
src/components/stats/v2/WhyAccordion.test.tsx
src/components/stats/v2/WeeklyReportTab.tsx
src/components/stats/v2/WeeklyReportTab.test.tsx
src/components/stats/v2/TopicPerformanceTableCollapsible.tsx
src/components/stats/v2/TopicPerformanceTableCollapsible.test.tsx
src/components/views/TopicsDrilldownView.tsx
src/components/views/TopicsDrilldownView.test.tsx
src/components/views/StatsViewV2.tsx
src/components/views/StatsViewV2.test.tsx
src/components/views/StatsViewRouter.tsx
src/components/views/StatsViewRouter.test.tsx
.planning/phase-1/VERIFICATION.md
```

### Modified (surgical)
```
package.json                              — add deps + scripts
package-lock.json                         — install result
.gitignore                                — playwright artifacts
src/main.tsx                              — wire LCP reporter (dev/test only)
src/Index.tsx                             — 1-line: <StatsView /> → <StatsViewRouter />
src/components/stats/TopicPerformanceTable.tsx  — add optional onRowClick prop (≤10 LOC additive)
src/components/views/AdminDashboard.tsx   — add Debug Flags switch
src/components/views/StatsView.test.tsx   — (create if absent) regression snapshot
vite.config.ts                            — manualChunks for recharts
```

### Untouched (explicitly preserved)
```
src/components/views/StatsView.tsx                    — legacy; 0-line diff enforced
src/components/stats/useStatsData.ts                  — stable API surface
src/lib/smartSelection.ts                             — imports only; 0-line diff enforced
src/components/stats/ERITile.tsx                      — still imported by legacy StatsView
src/components/stats/TopicTreemap.tsx                 — still available via drill-down
src/components/stats/ForgettingRiskTile.tsx           — still available via drill-down
src/components/stats/AccuracyCanvasChart.tsx          — still available via drill-down
src/components/stats/PersonalStatsDrilldown.tsx       — pattern reused, not modified
src/contexts/AppContext.tsx                           — startSession called, not modified
supabase/migrations/*                                 — 0 changes
```

---

## Appendix C — Quick-Reference Commands

```bash
# Install missing tooling (W0.1)
npm i -D @playwright/test @testing-library/user-event
npm i web-vitals
npx playwright install chromium

# Run all unit tests (per task)
npm run test

# Run specific test file (fast feedback)
npm test -- --run src/lib/recommendations.test.ts

# Run E2E (after W0.2 + W2.6-W2.8)
npm run test:e2e

# Build + measure bundle (W2.5, W2.11)
npm run build
ls -lah dist/assets/ | grep -i recharts

# LOC check for StatsViewV2 (W2.2, merge gate)
awk 'NF && !/^[[:space:]]*(\/\/|import|\*|\/\*)/' src/components/views/StatsViewV2.tsx | wc -l

# Verify no YIELD_TIER_MAP duplication (W0.6, merge gate)
rg "const YIELD_TIER_MAP" src/ | rg -v smartSelection.ts

# Verify legacy StatsView untouched (merge gate)
git diff main -- src/components/views/StatsView.tsx src/lib/smartSelection.ts

# Manual LCP capture (W0.9)
# Chrome DevTools → Lighthouse → Mobile + Slow 3G → Analyze
```

---

**End of PLAN.md.** Ready for `gsd-executor`.
