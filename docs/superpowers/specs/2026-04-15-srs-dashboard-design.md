# SRS Dashboard — Design Spec

**Date:** 2026-04-15
**Status:** Approved (pending implementation plan)
**Branch:** `feat/srs-dashboard`
**Author:** Idan Katz + Claude

---

## 1. Background & Motivation

The app uses an SM-2 spaced-repetition scheduler that writes per-question state to `spaced_repetition`. Today the SRS surface is a single button on the home screen ("חזרה") that opens a session with the questions due today. The user has no way to:

- See **which** questions or topics are pending review
- Plan study time around the SRS workload (today vs. this week)
- Identify topics where the SRS debt is concentrated
- Drill down to a specific chapter or topic for targeted practice
- Manually mark a question as known when it no longer needs review

A bug fixed in commit `b313d5f` (2026-04-15) revealed a deeper issue: even when 714 review items existed in the database, the user saw "no reviews today" because the in-memory join silently failed. The lack of a dashboard meant this rot accumulated invisibly.

This spec describes a **first-class SRS dashboard view** that surfaces all review state, lets the user execute targeted SRS sessions, and provides a controlled escape hatch (mark-as-known) for items the user genuinely retains.

## 2. Goals

1. **Transparency** — show the full SRS state (counts, decay curve, per-topic, per-chapter)
2. **Actionability** — let the user start a SRS session filtered by topic, chapter, or "all"
3. **Control** — let the user mark a question as known with safe, reversible semantics
4. **Reliability** — prevent the entire class of bugs that hid the previous SRS data

## 3. Non-Goals

- Editing SM-2 algorithm parameters from the UI
- Bulk import/export of SRS state
- Cross-user comparisons (deferred to existing comparative-stats view)
- Mobile-first redesign of the existing home screen

## 4. User Stories

- *As a resident*, I want to see how many questions are pending review today, this week, and overdue, so I can plan my study session.
- *As a resident*, I want to see which topics have the largest SRS debt with low accuracy, so I know where to focus.
- *As a resident*, I want to start a 30-question SRS session limited to a chapter I just studied, so I reinforce that chapter specifically.
- *As a resident*, I want to mark a question as known when I am confident I retain it, with a 5-second undo, so I do not pollute my SRS list.

## 5. Architecture Overview

### 5.1 Approach

**Approach 3 — Hook + small components** (selected from three options).

A central hook `useSrsDashboard()` is the single source of truth for all derived data. The view is composed of seven small, dumb tile components, each receiving only the slice of data it needs. No tile fetches data directly. This matches the existing `src/components/stats/` tile pattern.

Rejected alternatives:
- *Approach 1 (single useMemo)* — too much logic in one place, hard to test
- *Approach 2 (Postgres RPC)* — premature optimization, adds DB migration risk

### 5.2 Files

**New files** (under `src/components/srs/`):

| File | Responsibility |
|------|----------------|
| `useSrsDashboard.ts` | Aggregation hook. Returns all derived data. Single source of truth. |
| `SrsStatsRow.tsx` | Row of 4 KPI tiles: due-today, overdue, total-pending, 7-day-forecast |
| `SrsDecayChart.tsx` | Bar chart, 30 days forward, today=red if overdue, future=green |
| `SrsTopicTable.tsx` | Top-10 topics by `criticalScore`, critical row highlighted |
| `SrsChapterTable.tsx` | One row per Miller chapter that has at least 1 SRS row for the user (not all 76 chapters). Columns: chapter, total-in-SRS, due, accuracy, "practice chapter" button. Sortable by any column. |
| `SrsActionPanel.tsx` | Preset buttons (10 / 30 / 50 / All) + topic dropdown + "random by algorithm" toggle |
| `SrsQuestionsDrawer.tsx` | Side drawer with the pending question list, filterable, with mark-known per row |
| `SrsMarkKnownButton.tsx` | Button + confirm dialog; emits a 5-second undo toast after success |

**New view** (under `src/components/views/`):

| File | Responsibility |
|------|----------------|
| `SrsDashboardView.tsx` | Composer only. Calls `useSrsDashboard()` and lays out the seven tiles. |

**New helpers** (under `src/lib/`):

| File | Responsibility |
|------|----------------|
| `dateHelpers.ts` | `getIsraelToday()`, `addDaysIsrael()`, `daysBetween()`. The single source of truth for all SRS date math. |

**Modified files**:

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `'srs-dashboard'` to `ViewId` union |
| `src/contexts/AppContext.tsx` | Add `markQuestionAsKnown(id)`, `startSrsSessionFromIds(ids, count)` |
| `src/components/srs/useDueCount.ts` (new, light hook) | Returns only `{ count: number, loading: boolean }`. Used by HomeView's badge so it does not pull the full dashboard payload. Single SQL: `SELECT COUNT(*) FROM spaced_repetition WHERE user_id=$1 AND next_review_date <= today`. Refreshes on mount + when window regains focus. |
| `src/components/views/HomeView.tsx` | Add a third top card "חזרה מרווחת" with badge counter |
| `src/pages/Index.tsx` | Add `case 'srs-dashboard': return <SrsDashboardView />` to the existing `switch (currentView)` (line ~27) |

### 5.3 Layout (desktop)

```
┌─────────────────────────────────────────┐
│ SrsStatsRow (4 KPIs)                    │
├─────────────────────────────────────────┤
│ SrsDecayChart (30-day bar chart)        │
├─────────────────────────────────────────┤
│ SrsActionPanel (start session controls) │
├─────────────────┬───────────────────────┤
│ SrsTopicTable   │ SrsChapterTable       │
│ (Top-10)        │ (per Miller chapter)  │
└─────────────────┴───────────────────────┘
              ↓ click row / button
        SrsQuestionsDrawer (side panel)
```

On mobile the four-column StatsRow collapses to 2x2; the two tables stack vertically.

## 6. Data Contracts

### 6.1 Hook return shape

```ts
interface SrsDashboardData {
  loading: boolean;
  error: string | null;

  stats: {
    dueToday: number;
    overdue: number;
    totalPending: number;
    next7Days: number;
  };

  decayBins: DayBin[];           // 30 entries: today + 29 days
  topics: TopicRow[];            // sorted by criticalScore DESC, top 10
  chapters: ChapterRow[];        // sorted by chapter ASC
  pendingQuestions: PendingQuestion[];

  markKnown: (questionId: string) => Promise<void>;
  startSession: (filter: SessionFilter, count: number | 'all') => void;
  refresh: () => Promise<void>;
}

interface DayBin {
  date: string;        // 'YYYY-MM-DD' Israel TZ
  count: number;
  isOverdue: boolean;
  topics: string[];    // distinct topics in the bin, for tooltip
}

interface TopicRow {
  topic: string;
  due: number;
  overdue: number;
  accuracy: number;       // 0-1, derived from progress.history
  criticalScore: number;  // (1 - accuracy) * overdue
  isCritical: boolean;    // true when criticalScore >= P75 of all topics
}

interface ChapterRow {
  chapter: number;
  totalInSrs: number;
  due: number;
  accuracy: number;
}

interface PendingQuestion {
  id: string;
  refId: string;
  questionShort: string;  // first 80 chars
  topic: string;
  chapter: number;
  nextReviewDate: string;
  daysOverdue: number;    // 0 if not overdue
}

type SessionFilter =
  | { kind: 'all' }
  | { kind: 'random' }                // smart algorithm
  | { kind: 'topic'; topic: string }
  | { kind: 'chapter'; chapter: number };
```

### 6.2 Critical-score formula

```
criticalScore = (1 - accuracy) * overdue
isCritical    = criticalScore >= percentile(allScores, 75)
```

Topics with no answer history have `accuracy = 0` (no NaN). Topics with no overdue questions have `criticalScore = 0` and `isCritical = false`.

## 7. Mutations

### 7.1 markQuestionAsKnown

**Semantic** — Option A from brainstorming: soft mark.

- Set `next_review_date = today + 30 days` (Israel TZ)
- Set `last_correct = true`
- Leave `interval_days`, `ease_factor`, `repetitions` **unchanged**
- Update `updated_at`

If the user gets the question wrong on the next encounter, normal SM-2 reset takes over. No data loss.

**Audit & undo**:
- Capture the previous SRS row (in client memory) before the upsert
- Show a sonner toast with `action: { label: 'ביטול', onClick: undo }`, `duration: 5000ms`
- `undo` re-upserts the captured row

**Authorization**: relies on the existing RLS policy `(auth.uid() = user_id)`. No policy changes.

### 7.2 startSrsSessionFromIds

- Resolves question IDs against the in-memory cache (with the same `fetchQuestions` fallback used by the recently-fixed `getDueQuestions`)
- Trims to the requested count using `shuffleAndPick` if count < total
- Delegates to existing `startSession(...)` and navigates to `'session'`

No new session machinery — reuses everything.

## 8. Edge Cases (handled in the hook)

| Case | Handling |
|------|----------|
| User has 0 SRS rows | All counts = 0; tiles render empty states; no division errors |
| SRS row references deleted question | Filtered out before aggregation |
| Topic has no answer history | `accuracy = 0`, `criticalScore = overdue` (not NaN) |
| All `next_review_date` are in the future | `decayBins[0].count = 0`; bin `isOverdue = false` |
| Cache miss on questions | Falls back to `fetchQuestions()` (paginated, sessionStorage cached) |
| Mutation network error | Toast error, no UI state change, console.error for diagnostics |

## 9. Testing Strategy

| Unit | Type | Coverage target |
|------|------|-----------------|
| `dateHelpers` (3 functions) | Vitest unit | 100% |
| `useSrsDashboard` aggregation | Vitest unit, with mocked AppContext | 90% |
| `criticalScore` formula edge cases | Vitest unit | 100% |
| `markQuestionAsKnown` + undo | Integration with mocked Supabase client | 80% |
| `SrsDashboardView` empty state | React Testing Library smoke test | n/a |

Visual regression of charts and drawer animations is **not** automated; verified manually on Vercel preview deploy (desktop + mobile).

## 10. Rollout Plan

Two phases. Phase 1 ships read-only value. Phase 2 adds the data-mutating actions.

### Phase 1 — Read-only dashboard

- All seven tiles
- `useSrsDashboard` hook
- All charts and tables
- `SrsQuestionsDrawer` displays questions
- `SrsActionPanel` is **disabled** with a "Coming next" tooltip
- `SrsMarkKnownButton` is **disabled**

Ship target: end of day 1. Validate for 48 hours.

### Phase 2 — Mutations

- Enable `SrsActionPanel` (start filtered sessions)
- Enable `SrsMarkKnownButton` with undo toast
- Audit log entry per mark-known (table `question_audit_log` if it exists, otherwise console)
- Re-run all verification gates

Ship target: day 4-5, after Phase 1 validation.

## 11. Verification Gates

Both phases must pass all of:

1. `npm run typecheck` (`tsc --noEmit`)
2. `npm run lint`
3. `npm run test` — Vitest, ≥ 80% coverage on new files
4. `npm run build` — Vite production build clean
5. Vercel preview deploy — manual smoke test on desktop + mobile
6. `code-reviewer` agent — no CRITICAL or HIGH issues
7. `security-reviewer` agent — focus on `markQuestionAsKnown` RLS path

`main` deploy is gated by Vercel's auto-build. PR is the natural choke point.

## 12. Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| TypeScript error breaks production | Critical | Feature branch + Vercel preview, never push direct to main |
| `markQuestionAsKnown` silent corruption | Critical | Confirm dialog for bulk, undo toast, capture original row |
| Heavy useMemo recompute | Medium | Stable refs (mirror `dataRef` pattern), compute only when view active |
| Race between mutation and stale list | Medium | Explicit `refresh()` after every mutation |
| TZ off-by-one in decay bins | Medium | All date math through `dateHelpers`, never inline |
| Empty state crash for new users | Low | Defensive defaults built into the hook |
| Mobile layout breakage | Low | Responsive grid; manual mobile QA on preview |

## 13. Open Questions

None remaining at design time. All four brainstorming decisions are recorded:

1. **Mark-known semantic**: A — soft (+30 days, history preserved)
2. **Critical-topic formula**: C — `(1 - accuracy) * overdue`
3. **Session count UX**: B — preset buttons 10 / 30 / 50 / All
4. **Decay graph horizon**: A — 30 days forward, overdue surfaced on day 0

## 14. Definition of Done

### Phase 1
- [ ] Branch `feat/srs-dashboard` created
- [ ] All Phase 1 files created and tested
- [ ] All seven verification gates pass
- [ ] PR description with screenshots
- [ ] Merged to main, deployed via Vercel
- [ ] 48 hours of personal use without regressions

### Phase 2
- [ ] Mutations implemented with undo and confirm flows
- [ ] All seven verification gates pass again
- [ ] 48 hours of personal use post-deploy

---

*Spec written 2026-04-15. Implementation plan to follow in a fresh session via the `superpowers:writing-plans` skill.*
