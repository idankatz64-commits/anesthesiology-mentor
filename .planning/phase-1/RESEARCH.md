# Phase 1: Stats Page Redesign — Research

**Researched:** 2026-04-21
**Domain:** React/TypeScript UI redesign + data layer reuse + scoring logic
**Confidence:** HIGH (stack is internal, all code verified by direct file read)

---

## Summary

Phase 1 is a **UI reorganization** of an existing, well-developed stats page. The underlying data layer (`useStatsData.ts`, 401 lines) is mature and does NOT need restructuring — the redesign is almost entirely a re-composition of existing primitives into a new hierarchy: **Hero (ERI + 1 recommendation + CTA) → 3 Weak Zone cards → "Why?" accordion → existing TopicPerformanceTable → iframe placeholder**.

The single most important finding: **`YIELD_TIER_MAP` already exists** in `src/lib/smartSelection.ts` (lines 15–63) covering ~40 Miller topics with tier weights (Tier 1 = 1.0, Tier 2 = 0.6, Tier 3 = 0.2). This **fully resolves weakness #10** from `plan-review-2026-04-21.md` — there is no need for Option A (manual), Option B (proxy), or Option C (defer). Import the constant and use it directly.

Secondary important findings: (1) `/stats` is **NOT a React Router route** — it is a `ViewId` (`src/lib/types.ts:92`) switched inside `Index.tsx` via `currentView`. Drill-downs should use the existing shadcn `Sheet` pattern (as `PersonalStatsDrilldown.tsx` already does) rather than new routes. (2) `reports/latest.html` **does not exist** — the iframe "Master Weekly Report" tab must be a placeholder in Phase 1 and actual wiring deferred to a later phase. (3) Feature-flag infrastructure **does not exist** in the DB; the simplest path for single-user (Idan) testing is localStorage, with a forward-compatible `useFeatureFlag` hook signature so Phase 3+ can swap to a `user_feature_flags` table without caller changes.

**Primary recommendation:** Redesign is a **composition task, not a data task**. Reuse existing selectors and components; do not re-derive statistics. Keep `TopicPerformanceTable` untouched behind a `Collapsible`. Build the Hero/WeakZone cards as new presentational components that consume `useStatsData()` hooks. Ship behind a localStorage flag (`statsV2Enabled`).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

CONTEXT.md does not exist in `.planning/phase-1/`. Constraints below are extracted from the active plan (`/Users/idankatz15/.claude/plans/binary-swimming-toucan.md`, Phase 1 section, lines 141–230) and the plan review (`.planning/plan-review-2026-04-21.md`). Treat these as locked.

### Locked Decisions
- **Keep `TopicPerformanceTable` intact.** Existing 682-line table with search, column toggle, sortable headers, expandable BarChart/Donut/GroupPosition panels, and "התחל תרגול" button is production-quality. **Do not rewrite it.** Wrap it in a `Collapsible` in the new layout.
- **Hebrew UI.** All new copy is Hebrew (RTL). Existing components already handle `dir="rtl"`.
- **Mobile-first.** iPhone SE / iPhone 12/13 widths (320–390px) are the design baseline. Hero (ERI + recommendation + CTA) MUST fit **above the fold** (≤ ~500px vertical).
- **LCP target < 2.5s** on mid-tier mobile (documented in plan goals).
- **Exam date fixed:** 2026-06-16 (already hard-coded at `src/lib/smartSelection.ts:120` as `EXAM_DATE`).
- **No new routes.** `/stats` stays as a `ViewId` rendered in the `Index.tsx` switch. Drill-downs use `Sheet`/`Dialog`, not new pages.
- **No schema changes in Phase 1** for stats data. Redesign consumes existing tables (`answer_history`, `user_answers`, `spaced_repetition`, `questions`, `categories`) via the existing `useStatsData()` hook.
- **Feature flag gated.** Phase 1 v2 UI must be togglable so Idan can compare old vs new. Default off for other users.
- **Phase 0 is complete** — no outstanding critical findings block this phase.

### Claude's Discretion
- **Recommendation formula weighting.** Plan provides the shape (`yield * weakness * overdue * recencyGap`); final coefficients are Claude's call, tunable later.
- **Feature flag mechanism.** localStorage (simpler) vs `user_feature_flags` DB table (forward-compatible). Recommendation: localStorage with a hook interface that can swap to DB later.
- **Drill-down UI pattern.** `Sheet` (slide-in from right, matches existing `PersonalStatsDrilldown`) vs `Dialog` (modal center). Recommendation: `Sheet` for consistency.
- **"Why?" accordion content depth.** Plan says "fold ERI modal radar into Why?" — Claude chooses which sub-components migrate (radar, component scores, weak-zone gauges) and which stay in a follow-up.
- **Lazy-load boundaries.** Which heavy components (`AccuracyCanvasChart`, `ERITile` radar, `TopicTreemap`, `ForgettingRiskTile`) to `React.lazy()` for LCP budget.
- **Chart library for Hero sparkline/ring.** Reuse existing `recharts` (already bundled) or minimal SVG. Recommendation: minimal SVG for ERI ring (already in `ERITile.tsx`), reuse recharts for any bar/line.

### Deferred Ideas (OUT OF SCOPE — do not research alternatives)
- **FSRS** (ts-fsrs) replacing SM-2 — Phase 3.
- **PDF/mobile-app export** — future.
- **Multi-user leaderboards** beyond existing `get_global_*` RPCs — future.
- **Master Report generation pipeline** (HTML builder) — upstream, not in Phase 1.
- **Real-time streaming updates** (no WebSocket subscriptions in Phase 1).
- **i18n for English** — Hebrew only.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

Requirements derive from the plan narrative (no explicit REQ-IDs in source). Mapping below uses `R1.x` convention so the planner can link plans → research.

| ID | Description | Research Support |
|----|-------------|------------------|
| R1.1 | Hero row: ERI ring + single "do this now" recommendation + primary CTA | `ERITile.tsx` ring extractable; `smartSelection.YIELD_TIER_MAP` + `useStatsData.weakZones` + `forgettingRisk` supply inputs; `AppContext.startSession` is the CTA handler |
| R1.2 | 3 Weak Zone action cards (clickable → start 15-question session on that topic) | `useStatsData.weakZones` already computes deadZone/studiedNotLearned/mastered; `startSession(pool, 15, 'practice')` signature confirmed at `AppContext.tsx:365` |
| R1.3 | Expandable "Why?" accordion explaining the recommendation | shadcn `Accordion` primitive confirmed at `src/components/ui/accordion.tsx`; reuse radar/component-scores from `ERITile.tsx` modal content |
| R1.4 | Keep `TopicPerformanceTable` with row-click → start session and "Open chart" drill-down | Table at `src/components/stats/TopicPerformanceTable.tsx` (682 lines) already has expand-panel with "התחל תרגול" button; hoist click to row. Drill-down pattern: reuse `PersonalStatsDrilldown.tsx` Sheet |
| R1.5 | Optional Master Report tab (iframe) | `reports/latest.html` **missing** — Phase 1 ships placeholder tab; actual iframe wiring deferred |
| R1.6 | Remove duplicate/legacy UI: 4 KPI cards row, 3 DB inventory cards row, 6 Personal Stats row, AccuracyCanvasChart inline, dual-heatmap grid | `StatsView.tsx` lines identified (see Current State map) |
| R1.7 | Mobile-first layout; Hero fits above fold on iPhone | Tailwind breakpoints `sm:` (640px), `md:` (768px), `lg:` (1024px) already used throughout |
| R1.8 | LCP < 2.5s on 4G mid-tier mobile | Heavy imports identified (recharts + framer-motion = 11 files importing in stats/); lazy-load plan documented below |
| R1.9 | Feature-flag gated (Idan can toggle v2 ↔ legacy) | No flag infra exists; localStorage recommended (forward-compatible hook interface) |
| R1.10 | Recommendation scoring uses real `yieldTier` (not placeholder) | **Resolved** — `YIELD_TIER_MAP` exists at `src/lib/smartSelection.ts:15–63` |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

Extracted from both the user-level CLAUDE.md and the repo-level CLAUDE.md. The planner MUST honor every directive below.

- **Supabase project ID:** `ksbblqnwcmfylpxygyrj` only. Never touch `agmcauhjhfwksrjllxar` (old project). RLS policies must still allow user-owned read/write.
- **Correct local path:** `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/`. Never edit `/Users/idankatz15/Desktop/3_APP_DEV/anesthesiology-mentor-main/`.
- **Questions come from Supabase `questions` table with sessionStorage cache.** Do not re-introduce Google Sheets CSV fetching anywhere.
- **Hebrew UI, explain everything in plain language.** New components must have Hebrew copy; any technical commit messages to the user must be paired with a plain-language explanation.
- **Git push reminder workflow.** After any commit produced from plan execution, remind Idan to push. (This is an orchestration constraint, not a code constraint, but the planner should include push reminders in task finalization steps.)
- **TypeScript quality bar:** no `any` (use `unknown` then narrow), explicit types on exported functions, no `console.log` in shipped code (project Stop hook audits this), Zod for any new validation at system boundaries (imports already use `zod` per `package.json`).
- **Immutability.** All new state updates must be spread-based; no in-place mutation.
- **Testing.** 80% coverage minimum. E2E via Playwright for critical flow (home → stats v2 → click weak-zone card → session starts). TDD ordering: red → green → refactor.
- **No hardcoded secrets.** Feature flag defaults and config live in code; any user-scoped overrides go to localStorage or the (future) `user_feature_flags` table — never inline.
- **File size budget:** aim 200–400 lines per file; never exceed 800. `TopicPerformanceTable.tsx` at 682 lines is already near the ceiling — do NOT add to it; new logic goes in sibling files.

---

## Current State Analysis

### `src/components/views/StatsView.tsx` (349 lines) — the file to redesign

Row-by-row inventory of the current layout:

| Row | Lines (approx) | Component | Phase 1 action |
|-----|----------------|-----------|----------------|
| Header | 1–60 | `<h1>📊 סטטיסטיקות מתקדמות</h1>` + `TopicFilterDropdown` + date-range selector | Keep header; move/trim date-range UI (Hero doesn't need it) |
| Row 1 | ~62–110 | 4 KPI cards: שאלות היום, דיוק, טעויות פתוחות, כיסוי מאגר (`grid-cols-2 sm:grid-cols-4`) | **Remove** — metrics fold into Hero + "Why?" |
| Row 2 | ~112–145 | 3 DB inventory cards | **Remove** — not decision-driving |
| Row 3 | ~147–185 | 6 Personal Stats cards (`grid-cols-3 sm:grid-cols-6`) | **Remove** — drill into "Why?" accordion if needed |
| Row 4 | ~187–215 | Dual heatmaps: `TopicTreemap` + `ForgettingRiskTile` (`grid-cols-1 md:grid-cols-2`) | **Remove from main flow** — offer inside "Why?" or via drill-down; lazy-load |
| Row 5 | ~217–240 | `AccuracyCanvasChart` (inline, 5 overlays) | **Remove from main flow** — move to drill-down Sheet, lazy-load |
| Row 6 | ~242–265 | `ERITile` (collapsed ring + 6 tiles; modal for radar + scores) | **Fold into Hero** (ring) + **"Why?" accordion** (radar/scores) |
| Row 7 | ~267–290 | `TopicPerformanceTable` | **Keep** — wrap in `Collapsible`, add row-click→session |
| Row 8 | ~292–349 | `DailyReportTile` + `AISummaryButton` + Export/Import + `FeedbackModal` | **Keep secondary actions**; move below the iframe placeholder or into an overflow menu |

**Phase 0 fix already shipped:** the `newUniqueToday` heuristic bug previously at StatsView:62–73 is corrected (per Phase 0 completion note in memory). Redesign starts from a clean, validated state.

### `src/components/stats/useStatsData.ts` (401 lines) — DO NOT rewrite

Returns (shape is stable, phase 1 consumes it as-is):

```ts
{
  stats,              // legacy aggregate + topicData
  eri,                // { score, accuracy, coverage, streak, mastered, studied, dead, critical }
  streak,
  accuracyTrend,      // { current7, previous7, delta }
  weakZones,          // { deadZone, studiedNotLearned, mastered } arrays of topic objects
  forgettingRisk,     // [{ topic, daysSinceLastReview, accuracy, risk }] sorted desc
  chapterCoverage,
  dailyData14/30/90,
  trendData14/30,
  personalStats,
  detailedAnswers,
  repeatedErrorsByTopic,
}
```

- **ERI formula** (lines 249–271, verified): `accuracy*0.25 + coverage*0.25 + criticalAvg*0.30 + consistency*0.20` (coefficients sum to 1.0).
- **WeakZone computation** (lines 287–300): `deadZone` = topics with ≥3 wrong; `studiedNotLearned` = <50% accuracy; `mastered` = ≥50%.
- **forgettingRisk formula**: `risk = (daysSince / 7) * (1 - accuracy)` — sorted descending. Already a proxy for "overdue × weakness".

**Insight for recommendation logic:** `forgettingRisk` already supplies two of the four factors in the plan's recommendation formula (overdue proxy + weakness). Combined with `YIELD_TIER_MAP` from `smartSelection.ts`, we get the full formula with zero new data plumbing.

### `src/lib/smartSelection.ts` (488 lines) — critical discovery

- **`YIELD_TIER_MAP` (lines 15–63):** complete tier data for all Miller topics. Tier 1 = 1.0 weight, Tier 2 = 0.6, Tier 3 = 0.2.
- **`EXAM_DATE = new Date('2026-06-16T08:00:00')`** (line 120) — single source of truth.
- **`getExamProximityPhase()`** returns `'early' | 'approaching' | 'imminent'` based on days-to-exam.
- **`computeTopicScores()`** and **`selectSmartQuestions()`** implement the two-stage Hamilton method — already used by session setup; the Hero CTA can (optionally) delegate to this.

**Planner action:** In Phase 1, import `YIELD_TIER_MAP` and `EXAM_DATE` directly from `@/lib/smartSelection`. Do NOT duplicate these constants. This resolves plan-review weakness #10 with zero net new data.

### `src/components/stats/TopicPerformanceTable.tsx` (682 lines) — KEEP

Already implements everything the plan asks for:

- Search + column toggle + sortable headers.
- Expandable panel per row with `BarChart` (daily accuracy), `Donut` (right/wrong/unanswered), `GroupPosition` widget.
- "התחל תרגול" button inside the expanded panel → calls `startSession`.
- Uses `get_global_topic_stats` and `get_global_daily_accuracy` RPCs (server-side, no client heavy aggregation).
- Has `topicStats.lastAnsweredTs` (usable as `recencyGap` input for the recommendation formula).

**Two small Phase 1 enhancements only:**
1. Wrap in `<Collapsible>` so it can be hidden by default on mobile (Hero-first).
2. Hoist the "התחל תרגול" click from the expanded panel to the row itself (single-click flow). Keep the old button as secondary.

### `src/components/stats/AccuracyCanvasChart.tsx` (633 lines) — remove from main flow

- 5 overlays confirmed: accuracy area (green), EMA7 (orange dashed), EMA14 (blue dashed), global daily avg (purple), volume bars colored by accuracy.
- Implemented with Canvas API (not recharts) — heavy paint, worst LCP offender in stats/.
- Has built-in topic filter dropdown.

**Action:** move out of Phase 1 main flow. Lazy-load inside a drill-down Sheet triggered from the TopicPerformanceTable row ("Open chart") or from the "Why?" accordion.

### `src/components/stats/ERITile.tsx` (285 lines) — split into two consumers

- **Collapsed view:** ERI ring + 6 metric tiles (accuracy, coverage, streak, mastered, studied, dead).
- **Expanded modal:** Radar chart + component scores + weak-zone gauges + strengths/weaknesses + forgetting-risk list.

**Action:** extract the ring as a standalone `<ERIRing score={eri.score} size={120} />` for the Hero. Extract the radar + component-scores into `<ERIWhyPanel />` for the "Why?" accordion. Retire the modal (replaced by accordion).

### `src/components/stats/PersonalStatsDrilldown.tsx` (111 lines) — reusable pattern

- Uses shadcn `Sheet` from the right side, 400–480px width.
- Prop: `DrilldownMetric = 'corrected' | 'uncorrected' | 'repeatedErrors'`.
- **This is the pattern all Phase 1 drill-downs should follow** (table chart, WeakZone "see all", ERI radar deep dive).

### Components to remove from the main flow

| Component | File | Action |
|-----------|------|--------|
| KPI row (4 cards) | inline in `StatsView.tsx` | Delete JSX + any local selectors they used |
| DB inventory row (3 cards) | inline | Delete |
| Personal Stats row (6 cards) | inline, may use `PersonalStatsDrilldown` trigger | Delete main row; drill-down Sheet still reachable from "Why?" if needed |
| Dual heatmap row | `TopicTreemap` + `ForgettingRiskTile` | Keep files; remove from main flow; optionally invoke from drill-down |
| Inline `AccuracyCanvasChart` | `stats/AccuracyCanvasChart.tsx` | Keep file; invoke only from drill-down, lazy-loaded |
| `ERITile` modal | inside `ERITile.tsx` | Remove modal; logic migrates to `ERIWhyPanel` |

**Files NOT deleted** (may be reused later / in drill-downs): `TopicTreemap`, `ForgettingRiskTile`, `AccuracyCanvasChart`, `DailyReportTile`, `AISummaryButton`, `FeedbackModal`, `ExportImportButtons`.

---

## Route & Navigation Analysis

### How `/stats` actually renders

**`src/App.tsx` routes** (verified):

```tsx
<Route path="/" element={<Index />} />
<Route path="/auth" element={<Auth />} />
<Route path="/admin" element={<AdminDashboard />} />
<Route path="/reset-password" element={<ResetPassword />} />
<Route path="*" element={<NotFound />} />
```

**No `/stats` route.** `Stats` is a `ViewId` (`src/lib/types.ts:92`):

```ts
export type ViewId = 'home' | 'setup-practice' | 'setup-exam' | 'session'
  | 'review' | 'results' | 'stats' | 'notebook' | 'simulation-results'
  | 'flashcards' | 'admin' | 'formula-sheet' | 'summaries'
  | 'miller-guide' | 'srs-dashboard';
```

`Index.tsx` contains a `switch(currentView)` that renders `<StatsView />` when `currentView === 'stats'`. Navigation to stats = `setCurrentView('stats')`.

**Implication for drill-downs:** Do NOT add a React Router route like `/stats/topics`. Two options:

- **Option A (recommended): Sheet/Dialog over `stats` view.** Matches existing `PersonalStatsDrilldown.tsx` pattern. Zero router changes. State local to `StatsView` or via a tiny `useStatsDrilldown()` hook. Closing the sheet returns to stats cleanly.
- **Option B: New ViewId** (e.g., `'stats-topic-drilldown'`) + breadcrumb back. More code, worse mobile UX (full screen transition vs slide-over).

Go with **A**.

### Session startup with a topic filter

`src/contexts/AppContext.tsx:365`:

```ts
const startSession = useCallback(
  (pool: Question[], count: number, mode: SessionState['mode']) => {
    // shuffles, slices first `count`, sets session state,
    // then setCurrentView('session')
  }, []
);
```

**All Hero/Weak-Zone "Start session" CTAs follow this pattern:**

```ts
const topicQuestions = questions.filter(q => q.topic === topicName);
startSession(topicQuestions, Math.min(topicQuestions.length, 15), 'practice');
```

This already happens inside `StatsView` (`handleTopicClick`) and `TopicPerformanceTable` (expanded panel button). Phase 1 adds the same call to:
- Hero "התחל עכשיו" button (uses the top-recommendation topic).
- 3 Weak Zone cards (each uses its own topic).
- TopicPerformanceTable row click (existing logic, hoisted from button to row).

**Confidence:** HIGH. No new routing, no new context, no hook changes.

---

## Feature Flag Infrastructure

### Search results

- **Supabase migrations** (`supabase/migrations/` — 24 files): no `user_preferences`, no `feature_flags`, no `user_feature_flags` table exists. Most recent migration: `20260418000001_add_sm2_columns.sql`.
- **Code search:** No `useFeatureFlag` hook or `FLAGS` constant found in `src/`.
- **Environment flags:** `import.meta.env.VITE_*` style flags are present (Supabase URL, etc.) but none for UI variants.

### Two options

**Option 1: localStorage-only (RECOMMENDED for Phase 1)**

```ts
// src/lib/featureFlags.ts
import { useState, useEffect, useCallback } from 'react';

type FlagName = 'statsV2Enabled'; // string literal union, extend later

interface UseFeatureFlagResult {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

export function useFeatureFlag(name: FlagName): UseFeatureFlagResult {
  const storageKey = `feature:${name}`;
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false; // default off (SSR safety / privacy mode)
    }
  });

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === storageKey) setEnabledState(e.newValue === 'true');
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [storageKey]);

  const setEnabled = useCallback((v: boolean) => {
    try { localStorage.setItem(storageKey, String(v)); } catch {}
    setEnabledState(v);
  }, [storageKey]);

  return { enabled, setEnabled };
}
```

- Pros: zero schema change, zero RLS work, instant toggle, cross-tab sync via storage event.
- Cons: not user-scoped server-side (per-device). Acceptable: Idan is the primary v2 tester.
- **Admin UI:** add a toggle in `AdminDashboard` or a hidden debug panel for Idan.

**Option 2: `user_feature_flags` table (forward-compatible)**

```sql
create table public.user_feature_flags (
  user_id uuid primary key references auth.users(id) on delete cascade,
  flags jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_feature_flags enable row level security;
create policy "user reads own flags" on public.user_feature_flags
  for select using (auth.uid() = user_id);
create policy "user writes own flags" on public.user_feature_flags
  for insert with check (auth.uid() = user_id);
create policy "user updates own flags" on public.user_feature_flags
  for update using (auth.uid() = user_id);
-- admin read-all policy via admin_users join
```

- Pros: user-scoped, cross-device, admin-manageable.
- Cons: schema migration, new RLS policies, needs rollout testing; adds a blocking read to app init (or async hydration with default-off).

**Recommendation:** Ship Option 1 in Phase 1. Design the `useFeatureFlag` interface so that a Phase 3+ swap to Option 2 changes only the implementation — every caller (`if (enabled) <StatsV2 /> else <StatsLegacy />`) stays identical.

### Rollout plan

1. Phase 1 ships both `StatsView` (legacy, unchanged) and `StatsViewV2` (new) in `src/components/views/`.
2. `StatsViewRouter.tsx` checks `useFeatureFlag('statsV2Enabled')` → renders one or the other.
3. Default off; Idan toggles via admin debug panel.
4. Phase 2: once v2 is stable, flip default; Phase 2+N: delete legacy file.

---

## Recommendation Logic Research

### Plan formula (from `binary-swimming-toucan.md` Phase 1)

```
recommendationScore(topic) = yieldTier * weakness * overdueFactor * recencyGap
```

### Inputs — **all available today, no new data**

| Factor | Source | Formula |
|--------|--------|---------|
| `yieldTier` | `src/lib/smartSelection.ts:15–63` | `YIELD_TIER_MAP[topicName]` (0.2 / 0.6 / 1.0) |
| `weakness` | `useStatsData.stats.topicData[i].accuracy` | `1 - accuracy` (bounded [0, 1]) |
| `overdueFactor` | `useStatsData.forgettingRisk[i].daysSinceLastReview` or `spaced_repetition.next_review_at` | `min(daysOverdue / 7, 3)` clamped |
| `recencyGap` | `topicStats.lastAnsweredTs` (from `get_global_topic_stats`) or `answer_history.max(answered_at)` | `days(now − lastAnsweredTs)` bucketed to [0, 30] then normalized |

**Fourth-factor note:** `forgettingRisk` in `useStatsData` already combines weakness × overdueFactor as `(daysSince/7) * (1 - accuracy)` — we can use it directly OR compute the four factors independently for explainability in the "Why?" accordion. Recommend independent computation for transparency.

### Suggested Phase 1 weighting (Claude's discretion; tunable)

```ts
// src/lib/recommendations.ts (new)
import { YIELD_TIER_MAP } from '@/lib/smartSelection';

interface RecommendationInput {
  topic: string;
  accuracy: number;        // 0..1
  daysSinceLastReview: number;
  daysOverdue: number;     // negative if not due yet; >0 if overdue
  questionsSeen: number;   // guard: require minimum sample
}

interface Recommendation {
  topic: string;
  score: number;
  factors: { yield: number; weakness: number; overdue: number; recency: number };
  reason: string; // Hebrew, for "Why?" accordion
}

const MIN_QUESTIONS = 5;
const RECENCY_CAP_DAYS = 30;
const OVERDUE_CAP = 3;

export function scoreRecommendation(i: RecommendationInput): Recommendation {
  const yieldW = YIELD_TIER_MAP[i.topic] ?? 0.4; // unknown topic falls between T2/T3
  const weakness = Math.max(0, Math.min(1, 1 - i.accuracy));
  const overdue = Math.max(0, Math.min(OVERDUE_CAP, i.daysOverdue / 7));
  const recency = Math.min(RECENCY_CAP_DAYS, i.daysSinceLastReview) / RECENCY_CAP_DAYS;

  // Sample guard: if we haven't seen enough, down-weight (avoid over-confident reco)
  const confidenceDamp = i.questionsSeen >= MIN_QUESTIONS ? 1 : 0.3;

  const score = yieldW * weakness * (1 + overdue) * (0.5 + recency) * confidenceDamp;

  const reason = buildHebrewReason({ yieldW, weakness, overdue, recency, topic: i.topic });
  return {
    topic: i.topic,
    score,
    factors: { yield: yieldW, weakness, overdue, recency },
    reason,
  };
}
```

- **`(1 + overdue)`** so an on-time topic isn't zeroed out (just not boosted).
- **`(0.5 + recency)`** so a fresh topic isn't zeroed out but a stale one is prioritized.
- **`confidenceDamp`** prevents "you should study peripheral-nerve-blocks" from a single wrong answer.

### Top-1 selection for Hero

```ts
const recommendations = topics
  .map(t => scoreRecommendation(t))
  .sort((a, b) => b.score - a.score);
const heroReco = recommendations[0];
const weakZoneCards = recommendations.slice(0, 3); // or skip index 0 if you want distinct cards
```

**Verdict:** plan-review weakness #10 is fully resolved — **Option A/B/C from the review are all obsolete**. Use Option A's data shape but skip the manual work because `YIELD_TIER_MAP` already exists.

---

## Mobile/Responsive Baseline

### Tailwind breakpoints in use (verified across stats/)

- `sm:` — 640px
- `md:` — 768px
- `lg:` — 1024px
- `xl:` — 1280px

### Observed patterns in `StatsView.tsx`

- `grid-cols-2 sm:grid-cols-4` — 2-up on mobile, 4-up on tablet+
- `grid-cols-3 sm:grid-cols-6` — 3-up mobile, 6-up tablet+
- `grid-cols-1 md:grid-cols-2` — stacked mobile, side-by-side tablet+

### Phase 1 mobile budget (iPhone 12/13 logical viewport: 390×844)

- **TopNav:** ~56px.
- **Safe area top:** ~47px (notched).
- **Above-the-fold budget for Hero:** `844 − 56 − 47 − 24 (padding) ≈ 717px`. **Real target ~500px** to leave peek of row 2 (Weak Zone cards) which drives scroll discovery.

### Hero layout recommendation

- Mobile: single column, `flex-col`. ERI ring (120×120) + recommendation text (`text-sm leading-tight`, max 2 lines) + full-width primary CTA (`w-full h-11`).
- Desktop (`md:` and up): `flex-row`, ring left, text center, CTA right.

Measure: ring 120px + 16px gap + 2 lines text (~48px) + 16px gap + CTA button (44px) + padding = ~**260px** — well under 500px.

### Weak Zone cards row

- Mobile: `grid-cols-1 gap-3` (stacked; 3 cards → ~3×96 = 288px + gaps = ~320px).
- Tablet+: `md:grid-cols-3`.

### Critical mobile rules

- **Tap targets** ≥ 44×44 px (Apple HIG) — use shadcn `Button` default size (h-10/h-11).
- **No horizontal scroll** — wrap long topic names with `truncate` + `title` attr.
- **Avoid hover-only affordances** — mobile has no hover; all actions must be tappable.
- **Skeleton on first paint** — do not show empty space while `useStatsData` loads; render `<StatsV2Skeleton />` (Hero + 3 card placeholders).

---

## Master Report iframe Integration

### Current reports directory (`/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/reports/`)

Files confirmed:
- `master_report_2026-04-11.html`
- `master_report_2026-04-15.html`
- `master_report_2026-04-18.html`
- `master_report_legacy_v2.html`
- `master_stats_2026-04-18.json`

**No `latest.html` symlink or file.** Each report is dated; there is no current-pointer.

### Three options for Phase 1

**Option 1 (RECOMMENDED): Placeholder tab in Phase 1, defer real wiring**

- Add a `<WeeklyReportTab />` component below the TopicPerformanceTable (or in a sidebar on desktop).
- Shows copy: `"דוח שבועי מלא — בקרוב"` + a muted button `"פתח את הדוח האחרון"` linking to `reports/master_report_2026-04-18.html` (most recent), opens in new tab.
- No iframe, no CORS concerns, no build pipeline.

**Option 2: Static iframe with build-time resolution**

- Add a Vite plugin or pre-build script that resolves the newest `master_report_*.html` and copies it to `public/reports/latest.html` on each build.
- Iframe: `<iframe src="/reports/latest.html" sandbox="allow-same-origin" className="w-full h-[600px]" />`.
- Pros: self-contained; no CORS.
- Cons: build-pipeline work; reports aren't regenerated per-user.

**Option 3: Runtime fetch + parse**

- Fetch directory listing from Supabase Storage or Vercel Edge; pick newest; embed via `<iframe srcDoc={html}>`.
- Too much Phase 1 scope; defer.

**Recommendation: Option 1.** Defer the actual iframe integration to Phase 2a/4a and ship a visible placeholder that (a) signals intent, (b) gives Idan a direct-open link to the most recent snapshot, (c) keeps LCP clean.

### Security note for any future iframe

- `sandbox="allow-same-origin"` minimum. Do **not** grant `allow-scripts` unless reports are trusted and you need them interactive.
- CSP header: if Vercel adds a restrictive CSP (`frame-src`), whitelist self.
- Reports contain no PHI but contain user-scoped stats — ensure they are only served to the owning user (host on authenticated Supabase Storage with signed URLs, not `public/`).

---

## LCP / Performance Baseline

### Current bundle signals

- `dist/` build size: **7.5 MB total** (measured).
- Heavy imports in `src/components/stats/`: **11 imports across 10 files** use `recharts` or `framer-motion` (grep count). Both libraries are known LCP offenders.
- `AccuracyCanvasChart.tsx` (633 lines) is the single heaviest component — Canvas drawing + multiple overlays.
- `ERITile.tsx` modal contains a `recharts` `Radar` — not needed above the fold.
- `TopicPerformanceTable.tsx` (682 lines) renders up to 40 rows with expandable panels containing multiple recharts components — large but only visible below fold.

### Phase 1 performance strategy

**1. Lazy-load everything below the fold.**

```ts
const TopicPerformanceTable = React.lazy(() =>
  import('@/components/stats/TopicPerformanceTable').then(m => ({
    default: m.TopicPerformanceTable,
  }))
);
const AccuracyCanvasChart = React.lazy(() =>
  import('@/components/stats/AccuracyCanvasChart').then(m => ({
    default: m.AccuracyCanvasChart,
  }))
);
const ERIWhyPanel = React.lazy(() => import('@/components/stats/ERIWhyPanel'));
```

Wrap with `<Suspense fallback={<Skeleton />}>`.

**2. Hero uses no heavy libs.**

- `ERIRing` as a plain SVG (already doable — `ERITile` draws the ring with an SVG circle + CSS animation).
- Recommendation text is static.
- CTA is a plain `Button`.

**3. Above-the-fold critical path = `useStatsData` + Hero + 3 Weak Zone cards.**

- Do NOT `await` any below-fold data in the Hero component; let `useStatsData` stream.
- `<WeakZoneCards />` can accept `weakZones` synchronously; degrade to skeletons while loading.

**4. Code-split the stats route.**

```ts
// Index.tsx
const StatsViewV2 = React.lazy(() => import('@/components/views/StatsViewV2'));
```

**5. Do not eagerly fetch `get_global_topic_stats`.**

- Move that RPC inside `<TopicPerformanceTable />` (lazy-loaded). It's already structured this way — verify no parent prefetch.

**6. Measurement.**

- Add `web-vitals` reporting (already common pattern; verify if present — if not, add for Phase 1 exit criterion).
- Target LCP < 2.5s on Moto G4 throttle profile in Chrome DevTools.

### Bundle size after Phase 1 — rough expectation

- Main chunk: Hero + WeakZoneCards + StatsV2 shell (~30–50 KB).
- Lazy chunks: TopicPerformanceTable (~80–120 KB incl. recharts subset), AccuracyCanvasChart (~40 KB, no recharts — Canvas only), ERIWhyPanel (~40 KB incl. radar).
- Expect LCP improvement of ~40–50% vs current StatsView (which eagerly renders all of the above).

---

## Runtime State Inventory

> **Not applicable — this is not a rename/refactor/migration phase.** It is a UI redesign that adds new files and retires rows in an existing file. No stored data, live service config, OS-registered state, secrets, or build artifacts reference strings that need migration.

- **Stored data:** None — Phase 1 reads existing tables as-is, writes nothing new.
- **Live service config:** None — no external service has the string `StatsView` or `StatsV2` embedded; the one config touchpoint is `reports/master_report_*.html` filenames (not renamed).
- **OS-registered state:** None.
- **Secrets / env vars:** None — feature flag reads from localStorage; no new env vars introduced.
- **Build artifacts / installed packages:** None — no `.egg-info`, no global installs, no Docker image tags to rebuild. `npm run build` produces a fresh dist.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Dev/build | ✓ | project `package.json` declares it; Vercel builds with matching version | — |
| npm | Install | ✓ | — | — |
| shadcn Accordion | "Why?" accordion | ✓ | `src/components/ui/accordion.tsx` exists | — |
| shadcn Sheet | Drill-downs | ✓ | `src/components/ui/sheet.tsx` exists | — |
| shadcn Collapsible | TopicPerformanceTable wrap | ✓ | `src/components/ui/collapsible.tsx` exists | — |
| shadcn Progress | ERI ring / weak-zone gauges | ✓ | `src/components/ui/progress.tsx` exists | — |
| shadcn Dialog | (Fallback for drill-downs) | ✓ | `src/components/ui/dialog.tsx` exists | — |
| recharts | Charts | ✓ | already in deps | keep, lazy-load |
| framer-motion | Animations | ✓ | already in deps | optional; can omit for LCP |
| Supabase client | Data | ✓ | in use | — |
| `web-vitals` (for LCP measurement) | Phase 1 exit criterion | **?** | unverified — check `package.json` | Add `npm i web-vitals` if missing |
| Playwright (E2E) | Testing per rules | **?** | unverified — check `package.json` | Install if missing |
| `reports/latest.html` | iframe embed | ✗ | — | **Phase 1 placeholder; defer actual iframe** |

**Missing with no fallback:** none blocking Phase 1.

**Missing with fallback:**
- `reports/latest.html` → placeholder tab (see Master Report section).
- `web-vitals` / Playwright → planner's Wave 0 should install if not present.

---

## Standard Stack

### Core (already in project — reuse)

| Library | Version (as of repo) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| React | 18 | UI framework | Existing stack |
| TypeScript | 5.8 | Types | Existing stack |
| Vite | 5 | Build/dev | Existing stack |
| Tailwind | — | Styling | Existing stack |
| shadcn/ui | — | Primitives (Accordion, Sheet, Collapsible, Progress, Dialog, Button, Card) | Already used, matches existing visuals |
| Supabase JS client | — | Data layer | Existing stack |
| React Router | 6 | Routing (NOT used for stats drill-down) | Existing; Phase 1 does not touch it |

### Supporting

| Library | Purpose | When to Use |
|---------|---------|-------------|
| recharts | Bar/Line/Radar in "Why?" and table panels | Keep behind `React.lazy` |
| framer-motion | Subtle animations for Hero reveal / card expand | Optional; skip if LCP regresses |
| Canvas API | `AccuracyCanvasChart` | Drill-down only, lazy |
| `clsx` / `tailwind-merge` | Class composition | Already in use |

### New, recommended for Phase 1

| Library | Purpose | Why |
|---------|---------|-----|
| `web-vitals` | Measure LCP/CLS for Phase 1 exit | Verifies the <2.5s target; ~2 KB |

### Alternatives considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| localStorage feature flag | `user_feature_flags` DB table | Cross-device + admin-managed; but schema work + RLS + blocking read. **Use localStorage in Phase 1, swap later.** |
| shadcn `Sheet` for drill-down | React Router nested route | Route = URL shareable + back button; Sheet = mobile-friendly slide-over. **Sheet wins for mobile UX.** |
| `recharts` Radar in "Why?" | Hand-rolled SVG radar | Recharts is already in the bundle; writing custom SVG for a single use is not worth it. **Lazy-load recharts.** |

### Installation (if `web-vitals` missing)

```bash
npm install web-vitals
```

**Version verification command** the planner should run as a Wave 0 task:

```bash
npm view web-vitals version
# cross-check: cat package.json | jq '.dependencies, .devDependencies'
```

---

## Architecture Patterns

### Recommended new file structure

```
src/
├── components/
│   ├── views/
│   │   ├── StatsView.tsx           # LEGACY — unchanged
│   │   ├── StatsViewV2.tsx         # NEW — Hero + WeakZones + Why + Table + ReportTab
│   │   └── StatsViewRouter.tsx     # NEW — feature-flag switch (v1 vs v2)
│   └── stats/
│       ├── v2/
│       │   ├── StatsHero.tsx       # ERI ring + recommendation + CTA
│       │   ├── ERIRing.tsx         # extracted from ERITile
│       │   ├── WeakZoneCards.tsx   # 3 cards
│       │   ├── WeakZoneCard.tsx    # single card (reusable)
│       │   ├── WhyAccordion.tsx    # shadcn Accordion wrapper
│       │   ├── ERIWhyPanel.tsx     # radar + component scores (lazy)
│       │   └── WeeklyReportTab.tsx # Phase 1 placeholder
│       └── (existing files untouched)
├── lib/
│   ├── recommendations.ts          # NEW — scoreRecommendation()
│   ├── featureFlags.ts             # NEW — useFeatureFlag()
│   └── smartSelection.ts           # EXISTING — import YIELD_TIER_MAP, EXAM_DATE
└── hooks/
    └── useStatsDrilldown.ts        # NEW — drill-down Sheet open/close state
```

### Pattern 1: Feature-flagged view swap

```tsx
// StatsViewRouter.tsx
import { useFeatureFlag } from '@/lib/featureFlags';
import StatsView from './StatsView';
const StatsViewV2 = React.lazy(() => import('./StatsViewV2'));

export default function StatsViewRouter() {
  const { enabled } = useFeatureFlag('statsV2Enabled');
  if (!enabled) return <StatsView />;
  return (
    <React.Suspense fallback={<StatsViewSkeleton />}>
      <StatsViewV2 />
    </React.Suspense>
  );
}
```

**Where to wire:** `Index.tsx` switch changes from `case 'stats': return <StatsView />;` to `case 'stats': return <StatsViewRouter />;`. Single line change.

### Pattern 2: Recommendation as a selector hook

```tsx
// hooks/useRecommendations.ts (NEW)
import { useMemo } from 'react';
import { useStatsData } from '@/components/stats/useStatsData';
import { scoreRecommendation } from '@/lib/recommendations';

export function useRecommendations() {
  const data = useStatsData();

  return useMemo(() => {
    if (!data.stats?.topicData) return { hero: null, weakZones: [] };

    const scored = data.stats.topicData
      .map(t => {
        const risk = data.forgettingRisk.find(r => r.topic === t.topic);
        return scoreRecommendation({
          topic: t.topic,
          accuracy: t.accuracy,
          daysSinceLastReview: risk?.daysSinceLastReview ?? 30,
          daysOverdue: risk?.daysSinceLastReview ?? 0, // refine with spaced_repetition.next_review_at
          questionsSeen: t.total,
        });
      })
      .sort((a, b) => b.score - a.score);

    return { hero: scored[0] ?? null, weakZones: scored.slice(0, 3) };
  }, [data.stats, data.forgettingRisk]);
}
```

### Pattern 3: Drill-down Sheet (reuse `PersonalStatsDrilldown`)

```tsx
// hooks/useStatsDrilldown.ts
type DrilldownKind =
  | { kind: 'topic-chart'; topic: string }
  | { kind: 'eri-deep-dive' }
  | null;

export function useStatsDrilldown() {
  const [open, setOpen] = useState<DrilldownKind>(null);
  return { open, openDrilldown: setOpen, close: () => setOpen(null) };
}

// StatsViewV2.tsx
const dd = useStatsDrilldown();
<Sheet open={dd.open?.kind === 'topic-chart'} onOpenChange={o => !o && dd.close()}>
  <SheetContent side="right" className="w-[min(480px,100vw)]">
    {dd.open?.kind === 'topic-chart' && (
      <Suspense fallback={<Skeleton />}>
        <AccuracyCanvasChart initialTopic={dd.open.topic} />
      </Suspense>
    )}
  </SheetContent>
</Sheet>
```

### Anti-patterns to avoid

- **Deriving `yieldTier` in a new file.** The constant exists; duplication = drift. Always import from `@/lib/smartSelection`.
- **Adding a `/stats/topics` route.** Not the navigation model this app uses. Use Sheet.
- **Fetching stats data in multiple components.** `useStatsData` is the single source; pass down or use a context selector. Multiple calls hammer the DB.
- **Inline-rendering `AccuracyCanvasChart` in the Hero.** Guaranteed LCP failure.
- **Modifying `TopicPerformanceTable` internals.** 682 lines at risk of regression; keep the change to a wrapper.
- **Making v2 the default before Idan signs off.** Flag stays default-off until he confirms parity/improvement.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accordion open/close | Custom JS + CSS | shadcn `Accordion` (already in `ui/accordion.tsx`) | Handles keyboard, aria-expanded, animation, multi-open state |
| Slide-over drawer | Custom `position:fixed` drawer | shadcn `Sheet` (Radix-based) | Focus trap, ESC-to-close, backdrop click, RTL support free |
| Yield tier weights | Manually typed weight object | Import `YIELD_TIER_MAP` from `@/lib/smartSelection` | Already complete; single source of truth |
| Exam countdown | Compute locally | Import `EXAM_DATE` from `@/lib/smartSelection` | Single source |
| Spaced-repetition overdue calc | Re-implement SM-2 | Use `spaced_repetition.next_review_at` column | Already computed server-side; Phase 3 migrates to FSRS |
| Topic stats (accuracy/count/group position) | Query `answer_history` client-side | Use `get_global_topic_stats` RPC | Server aggregation; already paginated-friendly |
| Israel timezone | Manual `Date` math | Use existing `toIsraelDateStr` / `getIsraelToday` helpers | Already in `src/lib/` |
| Feature flag storage | Custom `Map` + event bus | `localStorage` + `storage` event | Cross-tab sync free; no new code |
| Web vitals measurement | Custom `PerformanceObserver` wrapper | `web-vitals` npm package | Tiny, standard, well-tested |
| Session startup | New context or reducer | Existing `startSession` from `AppContext` | Already handles shuffle/slice/view switch |
| Feedback modal | New dialog | Existing `FeedbackModal.tsx` | Already built |

**Key insight:** Phase 1 is 70% composition of existing building blocks and 30% new thin presentational components (Hero, WeakZoneCard, WhyAccordion). Any new data-layer code is a red flag to double-check against `useStatsData` and `smartSelection`.

---

## Common Pitfalls

### Pitfall 1: Recommendation dominated by a single outlier topic

**What goes wrong:** A topic Idan answered once and got wrong scores `weakness = 1` and can dominate the ranking.

**Why it happens:** Sample size not weighted.

**How to avoid:** `confidenceDamp` factor in `scoreRecommendation` (apply 0.3x multiplier when `questionsSeen < 5`).

**Warning sign:** Hero always suggesting an unusual topic after a single bad answer.

### Pitfall 2: ERI ring animation blocks LCP

**What goes wrong:** If ERI ring animates from 0 to N on mount using `framer-motion`, the DOM measures the "final" frame only after animation completes — LCP regressed.

**Why it happens:** LCP measures the largest painted element; animated value = "still painting".

**How to avoid:** Paint the ring at final value on first render, fade opacity 0→1 (cheap), or skip motion entirely on first visit. `prefers-reduced-motion` media query should also short-circuit.

**Warning sign:** DevTools LCP marker lands on the Hero text instead of the ring.

### Pitfall 3: Sheet breaks RTL layout

**What goes wrong:** Radix Sheet defaults to `side="right"`. In RTL, "right" is visually the start of the content — sheet slides from the wrong side.

**Why it happens:** RTL mirroring isn't automatic for positional semantics in Radix.

**How to avoid:** Test with `dir="rtl"` on the `<html>` tag. If sheet looks wrong, use `side="left"` in RTL mode (or conditional based on `document.documentElement.dir`). Verify keyboard focus trap still works.

**Warning sign:** Sheet slides in from a direction that crosses the visual flow.

### Pitfall 4: `useStatsData` fires before questions are loaded

**What goes wrong:** Hero renders "you should study X" based on an empty `topicData` array → shows a silly or empty recommendation.

**Why it happens:** Race between `AppContext` questions load and `useStatsData` first query.

**How to avoid:** Guard in `useRecommendations`: `if (!data.stats?.topicData?.length) return { hero: null, weakZones: [] }`. Hero shows "מצב ריק — התחל בתרגול כללי" CTA.

**Warning sign:** Hero flashes an obviously wrong recommendation for ~200ms.

### Pitfall 5: Feature flag stuck "on" for all users after prod deploy

**What goes wrong:** If flag defaults differ between dev and prod, or if localStorage bleeds across test/prod, non-Idan users see v2 before parity is confirmed.

**Why it happens:** `localStorage` is per-origin and per-user-device, but dev builds on the same domain as prod (unlikely here; Vercel previews have unique subdomains) could set the flag.

**How to avoid:** Default MUST be explicit `false` in code. Admin toggle in `AdminDashboard` is guarded by `admin_users`. Clear `localStorage` flag on logout or on user switch.

**Warning sign:** Non-admin users report seeing v2.

### Pitfall 6: Lazy-loaded chunks create CLS (layout shift)

**What goes wrong:** Below-fold `TopicPerformanceTable` lazy-loads → when it resolves, it pushes content down, triggering layout shift beyond the fold.

**Why it happens:** No reserved space for the lazy component.

**How to avoid:** `<Suspense fallback={<div className="h-[600px]" />}>` — reserve the approximate height of the loaded component to keep CLS ~0.

**Warning sign:** Scrolling feels jumpy on first load.

### Pitfall 7: Recharts bundle doubled by duplicate imports

**What goes wrong:** `ERIWhyPanel` imports `Radar` from recharts; `TopicPerformanceTable` imports `BarChart`; both lazy-loaded chunks pull their own recharts tree if not deduplicated.

**Why it happens:** Vite's chunking may split recharts across chunks.

**How to avoid:** Verify with `vite build --mode production` + `rollup-plugin-visualizer`. If duplicated, add a manual chunk in `vite.config.ts`: `manualChunks: { 'recharts-vendor': ['recharts'] }`.

**Warning sign:** Bundle analyzer shows recharts present in multiple chunk files.

---

## Code Examples

### Example 1: Import yieldTier (don't redefine)

```ts
// src/lib/recommendations.ts
import { YIELD_TIER_MAP, EXAM_DATE, getExamProximityPhase }
  from '@/lib/smartSelection';
```

**Source:** direct read of `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/lib/smartSelection.ts` lines 15–63, 120.

### Example 2: ERI ring extraction (copy pattern from ERITile)

```tsx
// src/components/stats/v2/ERIRing.tsx
interface ERIRingProps { score: number; size?: number }
export function ERIRing({ score, size = 120 }: ERIRingProps) {
  const pct = Math.max(0, Math.min(100, score));
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const color = pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset}
        transform={`rotate(-90 ${size/2} ${size/2})`}
      />
      <text x={size/2} y={size/2+6} textAnchor="middle" className="text-2xl font-bold fill-foreground">
        {Math.round(pct)}
      </text>
    </svg>
  );
}
```

**Source:** pattern extracted from `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/components/stats/ERITile.tsx` ring render logic.

### Example 3: Hero composition

```tsx
// src/components/stats/v2/StatsHero.tsx
import { ERIRing } from './ERIRing';
import { Button } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { useRecommendations } from '@/hooks/useRecommendations';

export function StatsHero() {
  const { questions, startSession } = useApp();
  const { hero } = useRecommendations();

  if (!hero) {
    return (
      <div className="rounded-xl border p-4 flex flex-col md:flex-row gap-4 items-center">
        <p className="text-muted-foreground">עוד אין מספיק נתונים להמלצה. התחל בתרגול.</p>
      </div>
    );
  }

  const pool = questions.filter(q => q.topic === hero.topic);
  const handleStart = () =>
    startSession(pool, Math.min(pool.length, 15), 'practice');

  return (
    <section className="rounded-xl border p-4 md:p-6 flex flex-col md:flex-row items-center gap-4" dir="rtl">
      <ERIRing score={computeERIScore(/* from useStatsData */)} size={120} />
      <div className="flex-1 text-center md:text-right">
        <p className="text-sm text-muted-foreground">הפעולה הכי חשובה עכשיו:</p>
        <h2 className="text-lg md:text-xl font-semibold mt-1 leading-tight">
          לתרגל {hero.topic}
        </h2>
      </div>
      <Button size="lg" className="w-full md:w-auto h-11" onClick={handleStart}>
        התחל עכשיו
      </Button>
    </section>
  );
}
```

### Example 4: WeakZoneCard (mobile-first)

```tsx
// src/components/stats/v2/WeakZoneCard.tsx
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useApp } from '@/contexts/AppContext';

interface WeakZoneCardProps {
  topic: string;
  accuracy: number;
  reason: string;
}

export function WeakZoneCard({ topic, accuracy, reason }: WeakZoneCardProps) {
  const { questions, startSession } = useApp();
  const handleClick = () => {
    const pool = questions.filter(q => q.topic === topic);
    startSession(pool, Math.min(pool.length, 15), 'practice');
  };
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
      className="p-4 cursor-pointer hover:shadow-md transition min-h-[96px]"
      dir="rtl"
    >
      <div className="flex justify-between items-start gap-2">
        <h3 className="font-semibold truncate" title={topic}>{topic}</h3>
        <span className="text-xs text-muted-foreground shrink-0">
          {Math.round(accuracy * 100)}%
        </span>
      </div>
      <Progress value={accuracy * 100} className="mt-2 h-1.5" />
      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{reason}</p>
    </Card>
  );
}
```

### Example 5: Feature-flag toggle in admin panel

```tsx
// inside AdminDashboard or a hidden debug panel
import { useFeatureFlag } from '@/lib/featureFlags';
import { Switch } from '@/components/ui/switch';

function DebugFlags() {
  const { enabled, setEnabled } = useFeatureFlag('statsV2Enabled');
  return (
    <div className="flex items-center gap-3 p-3 rounded border">
      <Switch checked={enabled} onCheckedChange={setEnabled} />
      <span>Stats v2</span>
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single massive `StatsView.tsx` rendering 8 rows eagerly | Feature-flagged v1 ↔ v2 with lazy-loaded below-fold | Phase 1 | LCP drop ~40%; gradual rollout |
| Recommendation = "topics with `<50%` accuracy shown as list" | Multi-factor `yieldTier × weakness × overdue × recency` with confidence damping | Phase 1 | Single clear CTA; decisions not lists |
| `ERITile` modal with radar + scores | "Why?" accordion inline | Phase 1 | One fewer layer; keyboard-friendly; no modal stack |
| SM-2 spaced repetition with `spaced_repetition.next_review_at` | Same (unchanged in Phase 1) | Phase 3 will migrate to FSRS | Out of scope |
| Google Sheets CSV question fetch | Supabase `questions` table + sessionStorage cache | Pre-Phase-0 | Already in place |
| Inline `AccuracyCanvasChart` | Behind lazy-loaded drill-down Sheet | Phase 1 | LCP safe |

**Deprecated / outdated (to remove in Phase 1):**
- Inline 4-KPI row, 3-DB-inventory row, 6-PersonalStats row in main flow.
- ERI modal dialog (content migrates to Why? accordion).
- Dual heatmap row as a default-visible row.

**Preserved deliberately:**
- `TopicPerformanceTable` — mature, feature-complete; wrap don't rewrite.
- `useStatsData` hook — stable API surface; no breaking changes allowed.
- `smartSelection.ts` — single source of truth for tiering + exam date.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (verify `package.json`) for unit/integration; Playwright for E2E (per rules) |
| Config file | `vitest.config.ts` / `vite.config.ts` `test:` block — **verify in Wave 0** |
| Quick run command | `npm run test -- --run src/lib/recommendations.test.ts` (or `npm test` if no per-file filter) |
| Full suite command | `npm run test -- --run && npm run test:e2e` (adjust to actual scripts) |

**Wave 0 must verify:** test framework present in `package.json`. If Vitest/Jest absent, install Vitest (aligns with Vite).

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R1.1 | `scoreRecommendation` returns highest score for high-yield × weak × overdue topic | unit | `vitest run src/lib/recommendations.test.ts` | ❌ Wave 0 |
| R1.1 | `useRecommendations` returns null `hero` when topicData empty | unit | `vitest run src/hooks/useRecommendations.test.ts` | ❌ Wave 0 |
| R1.2 | Weak Zone card click → `startSession` called with filtered pool + `'practice'` | unit (React Testing Library) | `vitest run src/components/stats/v2/WeakZoneCard.test.tsx` | ❌ Wave 0 |
| R1.3 | "Why?" accordion expands on click, reveals ERI radar + factors | unit (RTL) | `vitest run src/components/stats/v2/WhyAccordion.test.tsx` | ❌ Wave 0 |
| R1.4 | TopicPerformanceTable row click opens session (non-regression) | unit (RTL) | `vitest run src/components/stats/TopicPerformanceTable.test.tsx` | ❌ Wave 0 |
| R1.5 | WeeklyReportTab placeholder visible when `reports/latest.html` missing | unit (RTL) | `vitest run src/components/stats/v2/WeeklyReportTab.test.tsx` | ❌ Wave 0 |
| R1.6 | Removed rows no longer render under v2 flag | snapshot | `vitest run src/components/views/StatsViewV2.test.tsx` | ❌ Wave 0 |
| R1.7 | Hero height ≤ 500px @ 390px viewport | E2E (Playwright viewport) | `npx playwright test e2e/stats-v2-mobile.spec.ts` | ❌ Wave 0 |
| R1.8 | LCP < 2.5s on throttled 4G for `/` with v2 flag on | E2E (`web-vitals` reporter) | `npx playwright test e2e/stats-v2-perf.spec.ts` | ❌ Wave 0 |
| R1.9 | Flag off → v1 renders; flag on → v2 renders | unit (RTL) | `vitest run src/components/views/StatsViewRouter.test.tsx` | ❌ Wave 0 |
| R1.10 | `YIELD_TIER_MAP` import does not duplicate or drift | lint/static | ESLint rule or grep: `grep -rn "YIELD_TIER_MAP" src/ \| grep -v smartSelection` should return 0 imports that redefine | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test -- --run <affected file>` (< 30s).
- **Per wave merge:** `npm test -- --run` (all unit).
- **Phase gate:** full unit + Playwright E2E green; manual Idan sign-off on mobile flow.

### Wave 0 Gaps

- [ ] `vitest.config.ts` / test runner wiring — if absent: `npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom`.
- [ ] `@testing-library/user-event` for click simulation.
- [ ] `src/test-setup.ts` with `@testing-library/jest-dom/vitest` import.
- [ ] Playwright install: `npm i -D @playwright/test && npx playwright install chromium`.
- [ ] `e2e/playwright.config.ts`.
- [ ] `src/lib/recommendations.test.ts` — covers R1.1.
- [ ] `src/hooks/useRecommendations.test.ts` — covers R1.1.
- [ ] `src/components/stats/v2/*.test.tsx` — covers R1.2, R1.3, R1.5, R1.6.
- [ ] `src/components/views/StatsViewRouter.test.tsx` — covers R1.9.
- [ ] `e2e/stats-v2-mobile.spec.ts` — covers R1.7.
- [ ] `e2e/stats-v2-perf.spec.ts` — covers R1.8.
- [ ] `web-vitals` install + reporter wiring — covers R1.8.
- [ ] Lint rule or contributing note: do NOT redefine `YIELD_TIER_MAP` — covers R1.10.

*(If test infra already present: adjust install list accordingly; keep the test-file creation tasks.)*

---

## Open Questions

1. **Does `spaced_repetition` expose a cleaner overdue signal than `forgettingRisk.daysSinceLastReview`?**
   - What we know: `spaced_repetition.next_review_at` exists (Phase 0 added SM-2 columns); `useStatsData` uses `daysSinceLastReview`.
   - What's unclear: whether `next_review_at` is populated for all users consistently.
   - Recommendation: in Phase 1 use the existing `useStatsData.forgettingRisk` as-is; if data quality is uneven, refine in a Phase 1 sub-task or Phase 2.

2. **Does `framer-motion` stay or go for LCP?**
   - What we know: 11 stats files import framer-motion; it's ~25 KB gzipped.
   - What's unclear: which animations are necessary for Hero UX vs just decorative.
   - Recommendation: baseline v2 without framer-motion in Hero; add only if missing feels flat and LCP stays < 2.5s.

3. **Should the feature flag also control other experimental UI (vs Stats v2 alone)?**
   - What we know: plan only specifies Stats v2 flag.
   - What's unclear: future phases may add flags (FSRS UI, new flashcard view).
   - Recommendation: design `useFeatureFlag(name: FlagName)` with a string-literal-union `FlagName` type; extend as needed. Start with one.

4. **Admin UI location for the flag toggle.**
   - What we know: `AdminDashboard` exists; no debug panel explicitly built.
   - What's unclear: whether to add a "Debug" tab or reuse an existing admin tab.
   - Recommendation: add a compact "Debug Flags" card at the top of `AdminDashboard`, visible only to admins.

5. **`get_global_topic_stats` RPC: does it include the current user's row?**
   - What we know: it's used for "group position" (community percentile).
   - What's unclear: whether including self biases the position.
   - Recommendation: verify in Wave 0; if needed, exclude `user_id = auth.uid()` in the RPC.

6. **Does `AppContext.startSession` reshuffle on every call?**
   - What we know: docs the summary said "shuffles, slices, sets session state".
   - What's unclear: if same topic clicked twice, do we get different questions?
   - Recommendation: verify by reading `AppContext.tsx:365` more closely; if yes, that's ideal for repeat visits.

7. **LCP baseline number (current `StatsView` legacy).**
   - What we know: plan target is <2.5s; no current measurement cited.
   - What's unclear: actual legacy LCP on mid-tier mobile.
   - Recommendation: Wave 0 task — measure legacy LCP using `web-vitals` on a Vercel preview to set a baseline.

8. **Toggle strategy: one global flag vs per-screen?**
   - What we know: plan says v2 vs legacy for stats.
   - What's unclear: could Hero ship without WeakZone cards (incremental)?
   - Recommendation: ship all v2 components together behind one flag; incremental ships add complexity and test matrix.

9. **Does the existing `PersonalStatsDrilldown` Sheet work in RTL correctly today?**
   - What we know: it's already in production use.
   - What's unclear: whether side="right" visually lands in the RTL-correct position.
   - Recommendation: manual check on an iPhone; if wrong, pattern for new drilldown adjusts accordingly.

---

## Sources

### Primary (HIGH confidence) — direct file read

- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/components/views/StatsView.tsx` — 349-line row-by-row inventory
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/components/stats/useStatsData.ts` — 401 lines; ERI formula, weakZones, forgettingRisk verified
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/lib/smartSelection.ts` — 488 lines; `YIELD_TIER_MAP` lines 15–63, `EXAM_DATE` line 120
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/components/stats/TopicPerformanceTable.tsx` — 682 lines; features verified
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/components/stats/AccuracyCanvasChart.tsx` — 633 lines; 5 overlays verified
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/components/stats/ERITile.tsx` — 285 lines; ring + modal structure
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/components/stats/PersonalStatsDrilldown.tsx` — 111 lines; Sheet pattern
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/App.tsx` — route table verified
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/lib/types.ts` line 92 — `ViewId` enum
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/contexts/AppContext.tsx` line 365 — `startSession` signature
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/src/components/ui/{accordion,sheet,collapsible,progress,dialog,alert-dialog}.tsx` — shadcn primitives confirmed
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/reports/` directory listing — `latest.html` confirmed MISSING
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/supabase/migrations/` — 24 files; no feature_flags / user_preferences table
- `/Users/idankatz15/.claude/plans/binary-swimming-toucan.md` lines 141–230 — Phase 1 narrative
- `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/.planning/plan-review-2026-04-21.md` — 10 weaknesses + 7 upgrades + 9 open questions

### Secondary (MEDIUM confidence) — cross-referenced

- shadcn/ui component names + APIs (Radix primitives documentation pattern matches files in `src/components/ui/`)
- `web-vitals` package (npm registry — not yet verified present in `package.json`, flagged as Wave 0 check)

### Tertiary (LOW confidence)

- None explicit — all recommendations grounded in either code-read or plan documents.

---

## Metadata

**Confidence breakdown:**
- Current state analysis: **HIGH** — direct file reads of all referenced files.
- Standard stack: **HIGH** — shadcn/ui, React, Vite, Supabase all verified in repo.
- Route/navigation: **HIGH** — `App.tsx` and `types.ts` directly inspected.
- Feature flags: **HIGH** — confirmed absence in migrations and code; recommendation straightforward.
- Recommendation logic: **HIGH** — `YIELD_TIER_MAP` existence is the critical unlock; all other inputs verified in `useStatsData`.
- Mobile baseline: **MEDIUM** — Tailwind breakpoints observed; exact iPhone LCP not measured.
- Master Report: **HIGH** — directory listing confirms `latest.html` absent.
- LCP/performance: **MEDIUM** — bundle size measured; exact LCP needs baseline measurement in Wave 0.
- Pitfalls: **MEDIUM** — generalized from web-development best practice + framework-specific knowledge.
- Architecture: **HIGH** — composed from verified existing patterns.

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (30 days — stack is stable internal codebase; only changes would come from deliberate refactors)

**Planner handoff:** this RESEARCH.md is sufficient to generate Wave 0 (test infra + measurement) + Wave 1 (new v2 components + hooks) + Wave 2 (router/flag + removals). No additional research required before planning.
