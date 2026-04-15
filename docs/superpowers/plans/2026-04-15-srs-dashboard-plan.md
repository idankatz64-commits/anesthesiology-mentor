# SRS Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a first-class SRS Dashboard view (`/srs-dashboard`) that surfaces all spaced-repetition state (stats, 30-day decay chart, top-10 critical topics, per-chapter table, pending-questions drawer) and — in Phase 2 — lets the user start filtered SRS sessions and safely mark questions as known with undo.

**Architecture:** Hook + tiles. One central hook `useSrsDashboard()` aggregates all derived data from AppContext. Seven "dumb" tile components consume slices. A light second hook `useDueCount()` feeds the HomeView badge without pulling the full dashboard payload. All date math lives in a new `src/lib/dateHelpers.ts`. Two-phase rollout: Phase 1 is read-only (actions disabled), Phase 2 enables mutations with a 5s undo toast.

**Tech Stack:** React + Vite + TypeScript + Tailwind + shadcn/ui, Vitest, Supabase JS client, sonner toasts.

**Branch:** `feat/srs-dashboard` (never push to `main` directly).

**Verification gates (run after every task that changes source):**
1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm run test`
4. `npm run build`

(Gates 5–7 — Vercel preview, code-reviewer agent, security-reviewer agent — run once per Phase, not per task.)

---

## File Structure

### New files

| Path | Responsibility |
|------|----------------|
| `src/lib/dateHelpers.ts` | `getIsraelToday()`, `addDaysIsrael()`, `daysBetween()`. Single source of truth for SRS date math. |
| `src/test/dateHelpers.test.ts` | Unit tests for the three helpers. |
| `src/components/srs/useDueCount.ts` | Light hook, returns `{ count, loading }` for the HomeView badge. |
| `src/components/srs/useSrsDashboard.ts` | Aggregation hook. Single source of truth for dashboard data + mutations. |
| `src/test/useSrsDashboard.test.ts` | Unit tests for aggregation logic. |
| `src/components/srs/SrsStatsRow.tsx` | 4 KPIs: due-today, overdue, total-pending, 7-day-forecast. |
| `src/components/srs/SrsDecayChart.tsx` | 30-day bar chart; today=red if overdue. |
| `src/components/srs/SrsTopicTable.tsx` | Top-10 topics by criticalScore. |
| `src/components/srs/SrsChapterTable.tsx` | Per-Miller-chapter row, sortable. |
| `src/components/srs/SrsActionPanel.tsx` | Presets 10 / 30 / 50 / All + topic dropdown. (Phase 1: disabled.) |
| `src/components/srs/SrsQuestionsDrawer.tsx` | Side drawer with pending questions. |
| `src/components/srs/SrsMarkKnownButton.tsx` | Confirm dialog + 5s undo toast. (Phase 1: disabled.) |
| `src/components/views/SrsDashboardView.tsx` | Composer view. |

### Modified files

| Path | Change |
|------|--------|
| `src/lib/types.ts:92` | Add `'srs-dashboard'` to `ViewId` union. |
| `src/pages/Index.tsx:~27` | Add `case 'srs-dashboard': return <SrsDashboardView />` to the switch. |
| `src/components/views/HomeView.tsx` | Add 3rd top card "חזרה מרווחת" with badge from `useDueCount()`. |
| `src/contexts/AppContext.tsx` | (Phase 2 only) Add `markQuestionAsKnown(id)` and `startSrsSessionFromIds(ids, count)`. |

---

## PHASE 1 — Read-only dashboard

### Task 1: Foundation — `dateHelpers.ts`

**Why first:** Every downstream file uses these helpers. The last production bug was a TZ off-by-one; we make it impossible to repeat.

**Files:**
- Create: `src/lib/dateHelpers.ts`
- Test: `src/test/dateHelpers.test.ts`

- [ ] **Step 1: Write the failing tests**

Write to `src/test/dateHelpers.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getIsraelToday, addDaysIsrael, daysBetween } from '@/lib/dateHelpers';

describe('dateHelpers', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('getIsraelToday returns YYYY-MM-DD in Asia/Jerusalem', () => {
    // 2026-04-15 23:30 UTC === 2026-04-16 02:30 Jerusalem (UTC+3 DST)
    vi.setSystemTime(new Date('2026-04-15T23:30:00Z'));
    expect(getIsraelToday()).toBe('2026-04-16');
  });

  it('getIsraelToday handles pre-midnight UTC correctly', () => {
    // 2026-04-15 10:00 UTC === 2026-04-15 13:00 Jerusalem
    vi.setSystemTime(new Date('2026-04-15T10:00:00Z'));
    expect(getIsraelToday()).toBe('2026-04-15');
  });

  it('addDaysIsrael adds days and preserves YYYY-MM-DD', () => {
    expect(addDaysIsrael('2026-04-15', 30)).toBe('2026-05-15');
    expect(addDaysIsrael('2026-04-15', 0)).toBe('2026-04-15');
    expect(addDaysIsrael('2026-04-15', -1)).toBe('2026-04-14');
  });

  it('addDaysIsrael handles month boundaries', () => {
    expect(addDaysIsrael('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysIsrael('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('daysBetween returns signed diff in days', () => {
    expect(daysBetween('2026-04-15', '2026-04-20')).toBe(5);
    expect(daysBetween('2026-04-20', '2026-04-15')).toBe(-5);
    expect(daysBetween('2026-04-15', '2026-04-15')).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests, verify they FAIL**

Run: `npm run test -- src/test/dateHelpers.test.ts`
Expected: FAIL with "Cannot find module '@/lib/dateHelpers'".

- [ ] **Step 3: Implement the helpers**

Write to `src/lib/dateHelpers.ts`:

```ts
const TZ = 'Asia/Jerusalem';

export function getIsraelToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

export function addDaysIsrael(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}
```

- [ ] **Step 4: Run tests, verify they PASS**

Run: `npm run test -- src/test/dateHelpers.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Run type + build gates**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dateHelpers.ts src/test/dateHelpers.test.ts
git commit -m "feat(srs): add dateHelpers with Israel TZ utilities"
```

---

### Task 2: Register `srs-dashboard` view ID + route (stub view)

**Why now:** Once the ViewId exists and is routed, we can navigate there from HomeView without broken types. We stub the view with a placeholder so TypeScript stays green.

**Files:**
- Modify: `src/lib/types.ts` (the `ViewId` union)
- Create: `src/components/views/SrsDashboardView.tsx` (stub for now — will be fleshed out in Task 12)
- Modify: `src/pages/Index.tsx` (add case)

- [ ] **Step 1: Extend the `ViewId` union**

Edit `src/lib/types.ts` — append `'srs-dashboard'` to the union literal at line 92:

```ts
export type ViewId = 'home' | 'setup-practice' | 'setup-exam' | 'session' | 'review' | 'results' | 'stats' | 'notebook' | 'simulation-results' | 'flashcards' | 'admin' | 'formula-sheet' | 'summaries' | 'miller-guide' | 'srs-dashboard';
```

- [ ] **Step 2: Create the stub view**

Write to `src/components/views/SrsDashboardView.tsx`:

```tsx
export function SrsDashboardView() {
  return (
    <div className="p-6" dir="rtl">
      <h1 className="text-2xl font-bold">חזרה מרווחת</h1>
      <p className="text-muted-foreground">בטעינה…</p>
    </div>
  );
}

export default SrsDashboardView;
```

- [ ] **Step 3: Route the view in `Index.tsx`**

In `src/pages/Index.tsx`, add the import near the top with the other view imports:

```tsx
import { SrsDashboardView } from '@/components/views/SrsDashboardView';
```

Then add a new case inside `switch (currentView)` (just before the `miller-guide` case or in alphabetic order with the others):

```tsx
case 'srs-dashboard': return <SrsDashboardView />;
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/pages/Index.tsx src/components/views/SrsDashboardView.tsx
git commit -m "feat(srs): add srs-dashboard ViewId, route, and stub view"
```

---

### Task 3: `useDueCount` hook (lightweight — for HomeView badge)

**Why separate:** HomeView must not pull the full dashboard payload just to show a badge. This hook does ONE count query.

**Files:**
- Create: `src/components/srs/useDueCount.ts`
- Test: `src/test/useDueCount.test.ts`

- [ ] **Step 1: Write the failing test**

Write to `src/test/useDueCount.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDueCount } from '@/components/srs/useDueCount';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          lte: () => Promise.resolve({ count: 42, error: null, data: null }),
        }),
      }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
  },
}));

describe('useDueCount', () => {
  it('returns the count from Supabase', async () => {
    const { result } = renderHook(() => useDueCount());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(42);
  });
});
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `npm run test -- src/test/useDueCount.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Write to `src/components/srs/useDueCount.ts`:

```ts
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getIsraelToday } from '@/lib/dateHelpers';

export function useDueCount() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setCount(0); setLoading(false); return; }

    const today = getIsraelToday();
    const { count: c, error } = await supabase
      .from('spaced_repetition')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lte('next_review_date', today);

    if (error) {
      console.error('useDueCount error:', error);
      setCount(0);
    } else {
      setCount(c ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return { count, loading, refresh };
}
```

- [ ] **Step 4: Test PASS**

Run: `npm run test -- src/test/useDueCount.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/srs/useDueCount.ts src/test/useDueCount.test.ts
git commit -m "feat(srs): useDueCount hook for HomeView badge"
```

---

### Task 4: HomeView — add 3rd card "חזרה מרווחת" with badge

**Files:**
- Modify: `src/components/views/HomeView.tsx`

- [ ] **Step 1: Read current HomeView top cards**

Run: `grep -n "setCurrentView\|התחל תרגול\|סימולציה" src/components/views/HomeView.tsx | head -20`
Expected: locate the two existing top cards' JSX.

- [ ] **Step 2: Add the new card**

In `src/components/views/HomeView.tsx`:

1. Add at the top with other imports:
```tsx
import { useDueCount } from '@/components/srs/useDueCount';
```

2. Inside the component, call the hook near the top of the function body:
```tsx
const { count: dueCount } = useDueCount();
```

3. Add a new card to the top cards grid (place it next to the existing practice/exam cards — mirror their class names exactly):

```tsx
<button
  onClick={() => setCurrentView('srs-dashboard')}
  className="relative rounded-2xl border bg-card p-6 text-right hover:shadow-md transition"
  dir="rtl"
>
  <div className="text-lg font-semibold">חזרה מרווחת</div>
  <div className="text-sm text-muted-foreground mt-1">שאלות שממתינות לחזרה היום</div>
  {dueCount > 0 && (
    <span className="absolute top-3 left-3 rounded-full bg-red-500 text-white text-xs px-2 py-0.5">
      {dueCount}
    </span>
  )}
</button>
```

(If the existing grid uses `grid-cols-2`, change it to `grid-cols-3` at the same breakpoint so all three cards fit.)

- [ ] **Step 3: Manual verify**

Run: `npm run dev`
Navigate to home. Expected: a 3rd card appears, clicking it shows the stub "בטעינה…" screen.

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/HomeView.tsx
git commit -m "feat(srs): add SRS dashboard card to HomeView with due-count badge"
```

---

### Task 5: Core aggregation hook — `useSrsDashboard`

**Why critical:** This is the single source of truth. If its types and edge cases are right, every tile is trivial. If wrong, everything downstream is poisoned.

**Files:**
- Create: `src/components/srs/useSrsDashboard.ts`
- Test: `src/test/useSrsDashboard.test.ts`

- [ ] **Step 1: Define the types file contents (types live alongside the hook)**

We define types IN the hook file (exported). No separate types file.

- [ ] **Step 2: Write failing aggregation tests**

Write to `src/test/useSrsDashboard.test.ts` (this covers the pure aggregation function — we export it for testing):

```ts
import { describe, it, expect } from 'vitest';
import { aggregate } from '@/components/srs/useSrsDashboard';

const today = '2026-04-15';

describe('aggregate', () => {
  it('returns zeroed stats when no SRS rows', () => {
    const result = aggregate({ srsRows: [], questions: [], today });
    expect(result.stats.dueToday).toBe(0);
    expect(result.stats.overdue).toBe(0);
    expect(result.stats.totalPending).toBe(0);
    expect(result.stats.next7Days).toBe(0);
    expect(result.decayBins).toHaveLength(30);
    expect(result.decayBins.every(b => b.count === 0)).toBe(true);
    expect(result.topics).toEqual([]);
    expect(result.chapters).toEqual([]);
  });

  it('counts dueToday and overdue correctly', () => {
    const srsRows = [
      { question_id: 'q1', next_review_date: '2026-04-15', history: [] },  // today
      { question_id: 'q2', next_review_date: '2026-04-14', history: [] },  // overdue
      { question_id: 'q3', next_review_date: '2026-04-10', history: [] },  // overdue
      { question_id: 'q4', next_review_date: '2026-04-20', history: [] },  // future
    ];
    const questions = [
      { id: 'q1', topic: 'A', chapter: 1 },
      { id: 'q2', topic: 'A', chapter: 1 },
      { id: 'q3', topic: 'B', chapter: 2 },
      { id: 'q4', topic: 'A', chapter: 1 },
    ] as any[];
    const result = aggregate({ srsRows, questions, today });
    expect(result.stats.dueToday).toBe(1);
    expect(result.stats.overdue).toBe(2);
    expect(result.stats.totalPending).toBe(3); // dueToday + overdue
    expect(result.stats.next7Days).toBe(4); // all rows within 7 days incl overdue+today+future-within-7
  });

  it('filters out SRS rows whose question was deleted', () => {
    const srsRows = [{ question_id: 'orphan', next_review_date: today, history: [] }];
    const result = aggregate({ srsRows, questions: [], today });
    expect(result.stats.totalPending).toBe(0);
  });

  it('computes criticalScore = (1 - accuracy) * overdue and isCritical at P75', () => {
    const srsRows = [
      { question_id: 'a1', next_review_date: '2026-04-10', history: [true, false] },   // A overdue, acc=0.5
      { question_id: 'a2', next_review_date: '2026-04-10', history: [false, false] },  // A overdue, acc=0
      { question_id: 'b1', next_review_date: '2026-04-14', history: [true, true] },    // B overdue, acc=1
      { question_id: 'c1', next_review_date: '2026-04-20', history: [true] },          // C future
    ];
    const questions = [
      { id: 'a1', topic: 'A', chapter: 1 },
      { id: 'a2', topic: 'A', chapter: 1 },
      { id: 'b1', topic: 'B', chapter: 2 },
      { id: 'c1', topic: 'C', chapter: 3 },
    ] as any[];
    const result = aggregate({ srsRows, questions, today });
    const topicA = result.topics.find(t => t.topic === 'A')!;
    expect(topicA.overdue).toBe(2);
    expect(topicA.accuracy).toBeCloseTo(0.25);         // 1 correct out of 4
    expect(topicA.criticalScore).toBeCloseTo(1.5);     // (1-0.25) * 2
    expect(topicA.isCritical).toBe(true);
  });

  it('handles topic with no history: accuracy=0, criticalScore=overdue', () => {
    const srsRows = [{ question_id: 'x1', next_review_date: '2026-04-10', history: [] }];
    const questions = [{ id: 'x1', topic: 'X', chapter: 1 }] as any[];
    const result = aggregate({ srsRows, questions, today });
    const t = result.topics.find(tt => tt.topic === 'X')!;
    expect(t.accuracy).toBe(0);
    expect(t.criticalScore).toBe(1);
    expect(Number.isNaN(t.criticalScore)).toBe(false);
  });

  it('decayBins[0].isOverdue=true iff any row is overdue or due today', () => {
    const srsRows = [{ question_id: 'q', next_review_date: '2026-04-10', history: [] }];
    const questions = [{ id: 'q', topic: 'T', chapter: 1 }] as any[];
    const result = aggregate({ srsRows, questions, today });
    expect(result.decayBins[0].isOverdue).toBe(true);
    expect(result.decayBins[0].count).toBe(1);
  });

  it('chapters list only includes chapters the user has SRS rows in', () => {
    const srsRows = [{ question_id: 'q', next_review_date: today, history: [] }];
    const questions = [{ id: 'q', topic: 'T', chapter: 7 }] as any[];
    const result = aggregate({ srsRows, questions, today });
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].chapter).toBe(7);
  });
});
```

- [ ] **Step 3: Run tests — verify FAIL**

Run: `npm run test -- src/test/useSrsDashboard.test.ts`
Expected: FAIL — `aggregate` not exported.

- [ ] **Step 4: Implement the aggregation + hook**

Write to `src/components/srs/useSrsDashboard.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { addDaysIsrael, daysBetween, getIsraelToday } from '@/lib/dateHelpers';

export interface DayBin {
  date: string;
  count: number;
  isOverdue: boolean;
  topics: string[];
}

export interface TopicRow {
  topic: string;
  due: number;
  overdue: number;
  accuracy: number;
  criticalScore: number;
  isCritical: boolean;
}

export interface ChapterRow {
  chapter: number;
  totalInSrs: number;
  due: number;
  accuracy: number;
}

export interface PendingQuestion {
  id: string;
  refId: string;
  questionShort: string;
  topic: string;
  chapter: number;
  nextReviewDate: string;
  daysOverdue: number;
}

export type SessionFilter =
  | { kind: 'all' }
  | { kind: 'random' }
  | { kind: 'topic'; topic: string }
  | { kind: 'chapter'; chapter: number };

export interface SrsDashboardData {
  loading: boolean;
  error: string | null;
  stats: { dueToday: number; overdue: number; totalPending: number; next7Days: number };
  decayBins: DayBin[];
  topics: TopicRow[];
  chapters: ChapterRow[];
  pendingQuestions: PendingQuestion[];
  refresh: () => Promise<void>;
}

interface SrsRow {
  question_id: string;
  next_review_date: string;
  history?: boolean[] | null;
}

interface QLike {
  id: string;
  refId?: string;
  topic?: string | null;
  chapter?: number | null;
  question?: string | null;
}

export function aggregate(params: { srsRows: SrsRow[]; questions: QLike[]; today: string }) {
  const { srsRows, questions, today } = params;
  const qMap = new Map<string, QLike>(questions.map(q => [q.id, q]));
  const joined = srsRows
    .map(r => ({ srs: r, q: qMap.get(r.question_id) }))
    .filter((j): j is { srs: SrsRow; q: QLike } => !!j.q);

  let dueToday = 0, overdue = 0, next7Days = 0;
  const binMap = new Map<string, { count: number; topics: Set<string> }>();
  for (let i = 0; i < 30; i++) {
    binMap.set(addDaysIsrael(today, i), { count: 0, topics: new Set() });
  }

  const topicAgg = new Map<string, { due: number; overdue: number; correct: number; total: number }>();
  const chapterAgg = new Map<number, { totalInSrs: number; due: number; correct: number; total: number }>();

  for (const { srs, q } of joined) {
    const diff = daysBetween(today, srs.next_review_date);
    const topic = (q.topic ?? 'ללא נושא').trim() || 'ללא נושא';
    const chapter = q.chapter ?? 0;
    const hist = Array.isArray(srs.history) ? srs.history : [];
    const correct = hist.filter(Boolean).length;

    const t = topicAgg.get(topic) ?? { due: 0, overdue: 0, correct: 0, total: 0 };
    t.correct += correct; t.total += hist.length;
    const c = chapterAgg.get(chapter) ?? { totalInSrs: 0, due: 0, correct: 0, total: 0 };
    c.totalInSrs += 1; c.correct += correct; c.total += hist.length;

    if (diff < 0) { overdue++; t.overdue++; t.due++; c.due++; }
    else if (diff === 0) { dueToday++; t.due++; c.due++; }
    if (diff <= 7) next7Days++;

    if (diff >= 0 && diff < 30) {
      const bin = binMap.get(srs.next_review_date);
      if (bin) { bin.count++; bin.topics.add(topic); }
    }
    topicAgg.set(topic, t);
    chapterAgg.set(chapter, c);
  }

  const decayBins: DayBin[] = [];
  for (let i = 0; i < 30; i++) {
    const date = addDaysIsrael(today, i);
    const bin = binMap.get(date)!;
    decayBins.push({
      date,
      count: i === 0 ? bin.count + overdue : bin.count,
      isOverdue: i === 0 && overdue > 0,
      topics: Array.from(bin.topics),
    });
  }

  const topicsUnsorted: TopicRow[] = Array.from(topicAgg.entries()).map(([topic, a]) => {
    const accuracy = a.total > 0 ? a.correct / a.total : 0;
    const criticalScore = (1 - accuracy) * a.overdue;
    return { topic, due: a.due, overdue: a.overdue, accuracy, criticalScore, isCritical: false };
  });
  const scores = topicsUnsorted.map(t => t.criticalScore).sort((a, b) => a - b);
  const p75 = scores.length === 0 ? 0 : scores[Math.floor(scores.length * 0.75)];
  const topics = topicsUnsorted
    .map(t => ({ ...t, isCritical: t.criticalScore > 0 && t.criticalScore >= p75 }))
    .sort((a, b) => b.criticalScore - a.criticalScore)
    .slice(0, 10);

  const chapters: ChapterRow[] = Array.from(chapterAgg.entries())
    .map(([chapter, a]) => ({
      chapter,
      totalInSrs: a.totalInSrs,
      due: a.due,
      accuracy: a.total > 0 ? a.correct / a.total : 0,
    }))
    .sort((a, b) => a.chapter - b.chapter);

  const pendingQuestions: PendingQuestion[] = joined
    .filter(j => daysBetween(today, j.srs.next_review_date) <= 0)
    .map(({ srs, q }) => ({
      id: q.id,
      refId: q.refId ?? q.id,
      questionShort: (q.question ?? '').slice(0, 80),
      topic: (q.topic ?? 'ללא נושא'),
      chapter: q.chapter ?? 0,
      nextReviewDate: srs.next_review_date,
      daysOverdue: Math.max(0, -daysBetween(today, srs.next_review_date)),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    stats: { dueToday, overdue, totalPending: dueToday + overdue, next7Days },
    decayBins, topics, chapters, pendingQuestions,
  };
}

async function fetchAllSrsRows(userId: string): Promise<SrsRow[]> {
  const pageSize = 1000;
  const out: SrsRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('spaced_repetition')
      .select('question_id, next_review_date, history')
      .eq('user_id', userId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as SrsRow[]));
    if (data.length < pageSize) break;
  }
  return out;
}

export function useSrsDashboard(enabled: boolean): SrsDashboardData {
  const { questions, fetchQuestions } = useApp() as any;
  const [srsRows, setSrsRows] = useState<SrsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) { setSrsRows([]); return; }
      let qs = questions;
      if (!qs || qs.length === 0) { qs = await fetchQuestions?.(); }
      const rows = await fetchAllSrsRows(u.user.id);
      setSrsRows(rows);
    } catch (e: any) {
      console.error('useSrsDashboard refresh error:', e);
      setError(e?.message ?? 'שגיאה בטעינת הנתונים');
    } finally { setLoading(false); }
  }, [questions, fetchQuestions]);

  useEffect(() => { if (enabled) refresh(); }, [enabled, refresh]);

  const agg = useMemo(() => aggregate({
    srsRows,
    questions: (questions ?? []) as QLike[],
    today: getIsraelToday(),
  }), [srsRows, questions]);

  return { loading, error, ...agg, refresh };
}
```

- [ ] **Step 5: Run tests — verify PASS**

Run: `npm run test -- src/test/useSrsDashboard.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/srs/useSrsDashboard.ts src/test/useSrsDashboard.test.ts
git commit -m "feat(srs): useSrsDashboard aggregation hook + unit tests"
```

---

### Task 6: `SrsStatsRow` — 4 KPI tiles

**Files:**
- Create: `src/components/srs/SrsStatsRow.tsx`

- [ ] **Step 1: Implement**

Write to `src/components/srs/SrsStatsRow.tsx`:

```tsx
interface Props {
  stats: { dueToday: number; overdue: number; totalPending: number; next7Days: number };
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'amber' | 'default' }) {
  const toneClass =
    tone === 'red' ? 'text-red-600' :
    tone === 'amber' ? 'text-amber-600' : 'text-foreground';
  return (
    <div className="rounded-xl border bg-card p-4 text-right" dir="rtl">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

export function SrsStatsRow({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Tile label="ממתינות היום" value={stats.dueToday} tone={stats.dueToday > 0 ? 'amber' : 'default'} />
      <Tile label="באיחור" value={stats.overdue} tone={stats.overdue > 0 ? 'red' : 'default'} />
      <Tile label="סה״כ ממתינות" value={stats.totalPending} />
      <Tile label="ב-7 ימים הקרובים" value={stats.next7Days} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add src/components/srs/SrsStatsRow.tsx && git commit -m "feat(srs): SrsStatsRow KPI tiles"
```

---

### Task 7: `SrsDecayChart` — 30-day bar chart

**Files:**
- Create: `src/components/srs/SrsDecayChart.tsx`

- [ ] **Step 1: Implement**

Write to `src/components/srs/SrsDecayChart.tsx`:

```tsx
import type { DayBin } from './useSrsDashboard';

interface Props { bins: DayBin[] }

export function SrsDecayChart({ bins }: Props) {
  const max = Math.max(1, ...bins.map(b => b.count));
  return (
    <div className="rounded-xl border bg-card p-4" dir="rtl">
      <div className="text-sm font-semibold mb-3">תחזית חזרות ל-30 יום</div>
      <div className="flex items-end gap-1 h-40">
        {bins.map((b) => {
          const height = (b.count / max) * 100;
          const color = b.isOverdue ? 'bg-red-500' : b.count === 0 ? 'bg-muted' : 'bg-emerald-500';
          return (
            <div
              key={b.date}
              className="flex-1 min-w-0 flex flex-col justify-end"
              title={`${b.date} — ${b.count} שאלות${b.topics.length ? ` (${b.topics.slice(0, 3).join(', ')})` : ''}`}
            >
              <div className={`${color} rounded-t`} style={{ height: `${height}%` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add src/components/srs/SrsDecayChart.tsx && git commit -m "feat(srs): SrsDecayChart 30-day bar chart"
```

---

### Task 8: `SrsTopicTable` — top-10 critical topics

**Files:**
- Create: `src/components/srs/SrsTopicTable.tsx`

- [ ] **Step 1: Implement**

Write to `src/components/srs/SrsTopicTable.tsx`:

```tsx
import type { TopicRow } from './useSrsDashboard';

interface Props {
  topics: TopicRow[];
  onTopicClick?: (topic: string) => void;
}

export function SrsTopicTable({ topics, onTopicClick }: Props) {
  if (topics.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" dir="rtl">
        אין נושאים במעקב SRS עדיין.
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card p-4 overflow-x-auto" dir="rtl">
      <div className="text-sm font-semibold mb-3">Top 10 נושאים קריטיים</div>
      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-right p-2">נושא</th>
            <th className="text-right p-2">באיחור</th>
            <th className="text-right p-2">דיוק</th>
            <th className="text-right p-2">ציון קריטיות</th>
          </tr>
        </thead>
        <tbody>
          {topics.map(t => (
            <tr
              key={t.topic}
              className={`border-t ${t.isCritical ? 'bg-red-50 dark:bg-red-950/20' : ''} ${onTopicClick ? 'cursor-pointer hover:bg-muted/50' : ''}`}
              onClick={() => onTopicClick?.(t.topic)}
            >
              <td className="p-2">{t.topic}</td>
              <td className="p-2">{t.overdue}</td>
              <td className="p-2">{Math.round(t.accuracy * 100)}%</td>
              <td className="p-2 font-semibold">{t.criticalScore.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add src/components/srs/SrsTopicTable.tsx && git commit -m "feat(srs): SrsTopicTable top-10 critical topics"
```

---

### Task 9: `SrsChapterTable` — per-Miller-chapter rows

**Files:**
- Create: `src/components/srs/SrsChapterTable.tsx`

- [ ] **Step 1: Implement**

Write to `src/components/srs/SrsChapterTable.tsx`:

```tsx
import { useState } from 'react';
import type { ChapterRow } from './useSrsDashboard';

type SortKey = 'chapter' | 'totalInSrs' | 'due' | 'accuracy';

interface Props {
  chapters: ChapterRow[];
  onChapterClick?: (chapter: number) => void;
}

export function SrsChapterTable({ chapters, onChapterClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('chapter');
  const [asc, setAsc] = useState(true);

  const sorted = [...chapters].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    return asc ? (av - bv) : (bv - av);
  });

  const header = (key: SortKey, label: string) => (
    <th
      className="text-right p-2 cursor-pointer select-none"
      onClick={() => { if (sortKey === key) setAsc(!asc); else { setSortKey(key); setAsc(true); } }}
    >
      {label} {sortKey === key ? (asc ? '▲' : '▼') : ''}
    </th>
  );

  if (chapters.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" dir="rtl">
        אין פרקים במעקב SRS.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 overflow-x-auto" dir="rtl">
      <div className="text-sm font-semibold mb-3">לפי פרק Miller</div>
      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr>
            {header('chapter', 'פרק')}
            {header('totalInSrs', 'סה״כ ב-SRS')}
            {header('due', 'ממתינות')}
            {header('accuracy', 'דיוק')}
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => (
            <tr
              key={c.chapter}
              className={`border-t ${onChapterClick ? 'cursor-pointer hover:bg-muted/50' : ''}`}
              onClick={() => onChapterClick?.(c.chapter)}
            >
              <td className="p-2">{c.chapter || '—'}</td>
              <td className="p-2">{c.totalInSrs}</td>
              <td className="p-2">{c.due}</td>
              <td className="p-2">{Math.round(c.accuracy * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add src/components/srs/SrsChapterTable.tsx && git commit -m "feat(srs): SrsChapterTable sortable per-chapter view"
```

---

### Task 10: `SrsActionPanel` — presets (Phase 1: disabled stub)

**Files:**
- Create: `src/components/srs/SrsActionPanel.tsx`

- [ ] **Step 1: Implement (buttons disabled, `onStart` optional)**

Write to `src/components/srs/SrsActionPanel.tsx`:

```tsx
import { useState } from 'react';
import type { SessionFilter, TopicRow } from './useSrsDashboard';

interface Props {
  topics: TopicRow[];
  disabled?: boolean;
  onStart?: (filter: SessionFilter, count: number | 'all') => void;
}

const PRESETS: Array<number | 'all'> = [10, 30, 50, 'all'];

export function SrsActionPanel({ topics, disabled, onStart }: Props) {
  const [topic, setTopic] = useState<string>('');
  const [kind, setKind] = useState<'all' | 'topic' | 'random'>('all');

  const tooltip = disabled ? 'בשלב הבא' : undefined;

  const build = (): SessionFilter => {
    if (kind === 'random') return { kind: 'random' };
    if (kind === 'topic' && topic) return { kind: 'topic', topic };
    return { kind: 'all' };
  };

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-wrap items-center gap-3" dir="rtl">
      <span className="text-sm font-semibold">התחל סשן:</span>
      {PRESETS.map(c => (
        <button
          key={String(c)}
          disabled={disabled}
          title={tooltip}
          onClick={() => onStart?.(build(), c)}
          className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
        >
          {c === 'all' ? 'כל הממתינות' : `${c} שאלות`}
        </button>
      ))}
      <label className="flex items-center gap-2 text-sm mr-2">
        <input
          type="checkbox"
          disabled={disabled}
          checked={kind === 'random'}
          onChange={(e) => setKind(e.target.checked ? 'random' : 'all')}
        />
        אלגוריתם חכם
      </label>
      <select
        disabled={disabled}
        className="rounded-lg border px-2 py-1 text-sm"
        value={topic}
        onChange={(e) => { setTopic(e.target.value); setKind(e.target.value ? 'topic' : 'all'); }}
      >
        <option value="">כל הנושאים</option>
        {topics.map(t => <option key={t.topic} value={t.topic}>{t.topic}</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add src/components/srs/SrsActionPanel.tsx && git commit -m "feat(srs): SrsActionPanel with preset session counts (disabled in phase 1)"
```

---

### Task 11: `SrsMarkKnownButton` — disabled stub

**Files:**
- Create: `src/components/srs/SrsMarkKnownButton.tsx`

- [ ] **Step 1: Implement**

Write to `src/components/srs/SrsMarkKnownButton.tsx`:

```tsx
interface Props {
  questionId: string;
  disabled?: boolean;
  onConfirmed?: (questionId: string) => Promise<void>;
}

export function SrsMarkKnownButton({ questionId, disabled, onConfirmed }: Props) {
  const handleClick = async () => {
    if (disabled || !onConfirmed) return;
    const ok = window.confirm('לסמן כידוע? החזרה הבאה תידחה ב-30 יום. ניתן לבטל תוך 5 שניות.');
    if (!ok) return;
    await onConfirmed(questionId);
  };
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? 'בשלב הבא' : 'סמן כידוע'}
      className="rounded-md border px-2 py-0.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
    >
      ✓ ידוע
    </button>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add src/components/srs/SrsMarkKnownButton.tsx && git commit -m "feat(srs): SrsMarkKnownButton with confirm (disabled in phase 1)"
```

---

### Task 12: `SrsQuestionsDrawer` — side drawer

**Files:**
- Create: `src/components/srs/SrsQuestionsDrawer.tsx`

- [ ] **Step 1: Implement**

Write to `src/components/srs/SrsQuestionsDrawer.tsx`:

```tsx
import type { PendingQuestion } from './useSrsDashboard';
import { SrsMarkKnownButton } from './SrsMarkKnownButton';

interface Props {
  open: boolean;
  title: string;
  questions: PendingQuestion[];
  onClose: () => void;
  markKnownDisabled?: boolean;
  onMarkKnown?: (id: string) => Promise<void>;
}

export function SrsQuestionsDrawer({ open, title, questions, onClose, markKnownDisabled, onMarkKnown }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <aside className="w-full max-w-md bg-card border-l overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין שאלות להצגה.</p>
        ) : (
          <ul className="space-y-2">
            {questions.map(q => (
              <li key={q.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{q.questionShort || q.refId}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {q.topic} · פרק {q.chapter || '—'}
                      {q.daysOverdue > 0 && <span className="text-red-600"> · באיחור {q.daysOverdue} ימים</span>}
                    </div>
                  </div>
                  <SrsMarkKnownButton
                    questionId={q.id}
                    disabled={markKnownDisabled}
                    onConfirmed={onMarkKnown}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add src/components/srs/SrsQuestionsDrawer.tsx && git commit -m "feat(srs): SrsQuestionsDrawer side panel"
```

---

### Task 13: Compose `SrsDashboardView` (replace stub)

**Files:**
- Modify: `src/components/views/SrsDashboardView.tsx`

- [ ] **Step 1: Replace the stub with the full composer**

Overwrite `src/components/views/SrsDashboardView.tsx`:

```tsx
import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useSrsDashboard } from '@/components/srs/useSrsDashboard';
import { SrsStatsRow } from '@/components/srs/SrsStatsRow';
import { SrsDecayChart } from '@/components/srs/SrsDecayChart';
import { SrsTopicTable } from '@/components/srs/SrsTopicTable';
import { SrsChapterTable } from '@/components/srs/SrsChapterTable';
import { SrsActionPanel } from '@/components/srs/SrsActionPanel';
import { SrsQuestionsDrawer } from '@/components/srs/SrsQuestionsDrawer';

export function SrsDashboardView() {
  const { currentView, setCurrentView } = useApp() as any;
  const enabled = currentView === 'srs-dashboard';
  const data = useSrsDashboard(enabled);
  const [drawer, setDrawer] = useState<{ title: string; ids: Set<string> } | null>(null);

  const drawerQuestions = drawer
    ? data.pendingQuestions.filter(q => drawer.ids.has(q.id))
    : [];

  if (data.loading) return <div className="p-6 text-center" dir="rtl">בטעינה…</div>;
  if (data.error) return <div className="p-6 text-red-600" dir="rtl">שגיאה: {data.error}</div>;

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">חזרה מרווחת</h1>
        <button onClick={() => setCurrentView('home')} className="text-sm text-muted-foreground hover:text-foreground">
          חזרה לבית
        </button>
      </div>

      <SrsStatsRow stats={data.stats} />
      <SrsDecayChart bins={data.decayBins} />
      <SrsActionPanel topics={data.topics} disabled />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SrsTopicTable
          topics={data.topics}
          onTopicClick={(topic) => {
            const ids = new Set(data.pendingQuestions.filter(q => q.topic === topic).map(q => q.id));
            setDrawer({ title: `נושא: ${topic}`, ids });
          }}
        />
        <SrsChapterTable
          chapters={data.chapters}
          onChapterClick={(chapter) => {
            const ids = new Set(data.pendingQuestions.filter(q => q.chapter === chapter).map(q => q.id));
            setDrawer({ title: `פרק ${chapter}`, ids });
          }}
        />
      </div>

      <SrsQuestionsDrawer
        open={!!drawer}
        title={drawer?.title ?? ''}
        questions={drawerQuestions}
        onClose={() => setDrawer(null)}
        markKnownDisabled
      />
    </div>
  );
}

export default SrsDashboardView;
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: Manual QA**

Run `npm run dev`. Navigate home → click "חזרה מרווחת". Verify:
- Badge on home shows due count
- 4 KPI tiles render with correct numbers
- 30-bar chart renders, day 0 is red if overdue > 0
- Top-10 topic table renders
- Chapter table is sortable
- Clicking a topic row opens drawer with filtered questions
- ActionPanel buttons are disabled with tooltip "בשלב הבא"
- ✓ ידוע buttons are disabled

- [ ] **Step 4: Commit**

```bash
git add src/components/views/SrsDashboardView.tsx
git commit -m "feat(srs): compose SrsDashboardView (phase 1 read-only)"
```

---

### Task 14: Phase 1 final gates + PR

- [ ] **Step 1: Run all local gates**

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
```
All must pass.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feat/srs-dashboard
```

Then: `gh pr create --base main --head feat/srs-dashboard --title "feat: SRS Dashboard — Phase 1 (read-only)"` with a body describing the 13 tasks, screenshots from dev, and the 7-gate checklist.

- [ ] **Step 3: Verify Vercel preview**

Wait for Vercel preview URL in PR. Open on desktop AND mobile. Smoke test all the flows from Task 13 Step 3.

- [ ] **Step 4: Run agents**

Dispatch `code-reviewer` agent against the diff. Dispatch `security-reviewer` agent. Resolve any CRITICAL/HIGH before merge.

- [ ] **Step 5: Merge to main**

Only after: preview deploy green, desktop+mobile smoke OK, agents clean. Squash-merge via GitHub UI. Delete branch after merge.

**STOP HERE.** Wait 48 hours of personal use before starting Phase 2.

---

## PHASE 2 — Mutations (after 48h validation)

### Task 15: `startSrsSessionFromIds` in AppContext

**Files:**
- Modify: `src/contexts/AppContext.tsx`

- [ ] **Step 1: Add the function**

In `src/contexts/AppContext.tsx`, near the existing `startSession` (~line 401) and `getDueQuestions` (~line 842), add:

```ts
const startSrsSessionFromIds = useCallback(async (
  ids: string[],
  count: number | 'all',
) => {
  let pool = dataRef.current.filter(q => ids.includes(q.id));
  if (pool.length === 0) {
    await fetchQuestions();
    pool = dataRef.current.filter(q => ids.includes(q.id));
  }
  if (pool.length === 0) {
    toast.error('לא נמצאו שאלות תואמות');
    return;
  }
  const finalCount = count === 'all' ? pool.length : Math.min(count, pool.length);
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, finalCount);
  startSession(shuffled, shuffled.length, 'practice');
  setCurrentView('session');
}, [startSession, fetchQuestions, setCurrentView]);
```

Add to the context `value` object AND to the `AppContextType` interface:
```ts
startSrsSessionFromIds: (ids: string[], count: number | 'all') => Promise<void>;
```

- [ ] **Step 2: Typecheck + commit**

```bash
npx tsc --noEmit && git add src/contexts/AppContext.tsx && git commit -m "feat(srs): startSrsSessionFromIds in AppContext"
```

---

### Task 16: Wire `SrsActionPanel` through the view

**Files:**
- Modify: `src/components/views/SrsDashboardView.tsx`

- [ ] **Step 1: Enable the panel**

In `SrsDashboardView.tsx`:
1. Destructure `startSrsSessionFromIds` from `useApp()`.
2. Remove `disabled` from `<SrsActionPanel />` and pass `onStart`:

```tsx
<SrsActionPanel
  topics={data.topics}
  onStart={(filter, count) => {
    let ids: string[] = [];
    if (filter.kind === 'all' || filter.kind === 'random') {
      ids = data.pendingQuestions.map(q => q.id);
    } else if (filter.kind === 'topic') {
      ids = data.pendingQuestions.filter(q => q.topic === filter.topic).map(q => q.id);
    } else if (filter.kind === 'chapter') {
      ids = data.pendingQuestions.filter(q => q.chapter === filter.chapter).map(q => q.id);
    }
    startSrsSessionFromIds(ids, count);
  }}
/>
```

- [ ] **Step 2: Manual QA**

Run `npm run dev`. Click preset "10 שאלות" with no topic → verify a 10-question practice session starts. Click with a topic selected → verify only that topic's questions are used.

- [ ] **Step 3: Commit**

```bash
git add src/components/views/SrsDashboardView.tsx
git commit -m "feat(srs): enable SrsActionPanel and wire to startSrsSessionFromIds"
```

---

### Task 17: `markQuestionAsKnown` mutation + undo

**Files:**
- Modify: `src/contexts/AppContext.tsx`
- Test: `src/test/markQuestionAsKnown.test.ts` (integration with mocked Supabase)

- [ ] **Step 1: Write the failing test**

Write `src/test/markQuestionAsKnown.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { buildMarkKnownUpdate } from '@/contexts/srsMutations';

describe('buildMarkKnownUpdate', () => {
  it('sets next_review_date to today+30 and preserves SM-2 fields', () => {
    const original = { question_id: 'q', user_id: 'u', next_review_date: '2026-04-15', interval_days: 7, ease_factor: 2.5, repetitions: 3, last_correct: false };
    const result = buildMarkKnownUpdate(original, '2026-04-15');
    expect(result.next_review_date).toBe('2026-05-15');
    expect(result.interval_days).toBe(7);
    expect(result.ease_factor).toBe(2.5);
    expect(result.repetitions).toBe(3);
    expect(result.last_correct).toBe(true);
  });
});
```

- [ ] **Step 2: Extract pure helper to new file (testable without mocking Supabase)**

Write `src/contexts/srsMutations.ts`:

```ts
import { addDaysIsrael } from '@/lib/dateHelpers';

export interface SrsPersistedRow {
  question_id: string;
  user_id: string;
  next_review_date: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  last_correct: boolean;
  history?: boolean[] | null;
}

export function buildMarkKnownUpdate(original: SrsPersistedRow, today: string): SrsPersistedRow {
  return {
    ...original,
    next_review_date: addDaysIsrael(today, 30),
    last_correct: true,
  };
}
```

Run: `npm run test -- src/test/markQuestionAsKnown.test.ts`
Expected: PASS.

- [ ] **Step 3: Wire into AppContext**

In `src/contexts/AppContext.tsx`:

```ts
import { buildMarkKnownUpdate, type SrsPersistedRow } from './srsMutations';
import { getIsraelToday } from '@/lib/dateHelpers';
import { toast } from 'sonner';

const markQuestionAsKnown = useCallback(async (questionId: string): Promise<void> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user?.id) { toast.error('נדרש חיבור'); return; }

  const { data: existing, error: readErr } = await supabase
    .from('spaced_repetition')
    .select('*')
    .eq('user_id', u.user.id)
    .eq('question_id', questionId)
    .maybeSingle();

  if (readErr || !existing) { toast.error('לא נמצאה שורת SRS'); return; }

  const original = existing as SrsPersistedRow;
  const updated = buildMarkKnownUpdate(original, getIsraelToday());

  const { error: upErr } = await supabase.from('spaced_repetition').upsert(updated);
  if (upErr) { console.error('markKnown upsert:', upErr); toast.error('כשל בשמירה'); return; }

  toast.success('סומן כידוע — חזרה בעוד 30 יום', {
    duration: 5000,
    action: {
      label: 'ביטול',
      onClick: async () => {
        const { error: rbErr } = await supabase.from('spaced_repetition').upsert(original);
        if (rbErr) { toast.error('כשל בביטול'); return; }
        toast.success('בוטל');
      },
    },
  });
}, []);
```

Add `markQuestionAsKnown` to the `AppContextType` interface and to the context `value` object.

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AppContext.tsx src/contexts/srsMutations.ts src/test/markQuestionAsKnown.test.ts
git commit -m "feat(srs): markQuestionAsKnown with 5s undo toast"
```

---

### Task 18: Enable `SrsMarkKnownButton` + refresh after mutation

**Files:**
- Modify: `src/components/views/SrsDashboardView.tsx`

- [ ] **Step 1: Pass `onMarkKnown` through**

In `SrsDashboardView.tsx`, destructure `markQuestionAsKnown` from `useApp()` and remove `markKnownDisabled`:

```tsx
<SrsQuestionsDrawer
  open={!!drawer}
  title={drawer?.title ?? ''}
  questions={drawerQuestions}
  onClose={() => setDrawer(null)}
  onMarkKnown={async (id) => {
    await markQuestionAsKnown(id);
    await data.refresh();
  }}
/>
```

- [ ] **Step 2: Manual QA with undo**

Run `npm run dev`. Open drawer for any topic → click ✓ ידוע → confirm dialog → toast appears with "ביטול" button. Before 5s, click "ביטול" → verify row reverts. Do it again and let toast expire → verify row stays at +30 days.

- [ ] **Step 3: Commit**

```bash
git add src/components/views/SrsDashboardView.tsx
git commit -m "feat(srs): enable mark-known button + refresh after mutation"
```

---

### Task 19: Phase 2 gates + merge

- [ ] **Step 1: Full local gates**

```bash
npx tsc --noEmit && npm run lint && npm run test && npm run build
```

- [ ] **Step 2: Push & PR**

```bash
git push
```
Update PR description (or open a new one if Phase 1 already merged): list Phase 2 changes, attach undo screenshot/gif.

- [ ] **Step 3: Vercel preview smoke test**

Desktop + mobile: start a filtered session; mark known + cancel; mark known + let expire; verify DB row via Supabase dashboard.

- [ ] **Step 4: Run agents**

`code-reviewer` (full diff since Phase 1 merge). `security-reviewer` with explicit instruction: focus on the RLS path for `markQuestionAsKnown` — confirm `user_id` filter, confirm no service-role keys leak, confirm rollback safety.

- [ ] **Step 5: Merge**

Only after all clean. Squash-merge. Delete branch.

**Post-merge:** 48h observation, then close the feature.

---

## Self-Review

**Spec coverage:** ✅ All 13 spec sections mapped to tasks. KPIs → Task 6. Decay chart → Task 7. Topic table → Task 8. Chapter table → Task 9. Action panel → Task 10 (disabled) + Task 16 (enabled). Mark-known → Task 11 (disabled) + Task 17+18 (enabled). Drawer → Task 12. View composer → Task 13. Two-phase gating → Tasks 14 + 19. All 4 brainstorming decisions locked into code (Task 17 soft semantic, Task 5 criticalScore formula, Task 10 presets, Task 5 30-day bins).

**Placeholder scan:** No TBD, TODO, "similar to", or "handle edge cases" placeholders. All code blocks complete.

**Type consistency:** `SessionFilter`, `TopicRow`, `ChapterRow`, `PendingQuestion`, `DayBin` defined once in `useSrsDashboard.ts` and imported everywhere. `markQuestionAsKnown` signature matches between AppContext type and call sites. `startSrsSessionFromIds(ids, count)` signature consistent.
