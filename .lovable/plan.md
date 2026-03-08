

## Stability Audit Results

### 1. CONFIDENCE FILTER BUG — Severity: MEDIUM

**File:** `src/contexts/AppContext.tsx`, lines 727-730

**Root cause:** When filtering by confidence (e.g. "guessed"), the filter checks `confidenceMap[questionId]`. Questions with **no entry** in `spaced_repetition` have no key in `confidenceMap`, so `c` is `undefined` and they return `false` — meaning they are **excluded** from all confidence filters, not incorrectly included.

However, there's a **different bug**: the `confidenceMap` is only populated during `hydrateUser` (initial load). It is **never updated** after `updateSpacedRepetition` writes a new confidence value. So after answering a question, the confidence filter uses stale data until the next full page reload.

**Fix:** After `updateSpacedRepetition` completes the upsert, also update `confidenceMap` locally:
```typescript
setConfidenceMap(prev => ({ ...prev, [questionId]: confidence }));
```

---

### 2. RACE CONDITIONS / STALE STATE — Severity: LOW (mostly fixed)

**File:** `src/components/stats/useStatsData.ts`, line 157

The `useEffect` that fetches 90-day daily data, spaced rep, and detailedAnswers has `[progress]` as its dependency. Every time `progress` changes (i.e. after every answer), it re-fetches from the DB. This is wasteful but not a race condition since these values are supplementary (the main stats are derived locally now).

**Minor concern:** The `dailyData90` fetch reads from `user_answers` using `updated_at`. But `user_answers` stores only the **last** `updated_at` per question (upsert overwrites it). So the 90-day heatmap counts questions by their *most recent* answer date, not every individual answer. This means re-answering an old question moves it to "today" and removes it from its original date. This is a data model limitation, not a code bug.

**No immediate fix needed** — the TOKEN_REFRESHED fix covers the main race condition.

---

### 3. SM-2 ALGORITHM EDGE CASES — Severity: LOW (already handled)

**File:** `src/contexts/AppContext.tsx`, lines 446-448

The code uses nullish coalescing with sensible defaults:
```typescript
let interval = existing?.interval_days ?? 1;
let ease = existing?.ease_factor ?? 2.5;
let reps = existing?.repetitions ?? 0;
```

If `existing` is `null` (no row) or any column is `null`, defaults are applied correctly. The DB schema also has `NOT NULL` defaults (`interval_days=1`, `ease_factor=2.5`, `repetitions=0`), so NULLs should never appear in practice.

**No fix needed.**

---

### 4. UPSERT CONFLICTS — Severity: LOW (all covered)

All upsert operations have proper `onConflict` clauses matching existing UNIQUE constraints:
- `user_answers`: `onConflict: 'user_id,question_id'` ✓
- `spaced_repetition`: `onConflict: 'user_id,question_id'` ✓
- `user_notes`: `onConflict: 'user_id,question_id'` ✓
- `user_ratings`: `onConflict: 'user_id,question_id'` ✓
- `user_tags`: `onConflict: 'user_id,question_id,tag'` ✓
- `user_weekly_plans`: `onConflict: 'user_id'` ✓
- `saved_sessions`: `onConflict: 'user_id'` ✓

**No fix needed.**

---

### 5. ERROR HANDLING — Severity: MEDIUM

**File:** `src/contexts/AppContext.tsx`

Critical writes are fire-and-forget with no error handling:

| Operation | Line | Awaited? | Error handled? |
|---|---|---|---|
| `updateHistory` DB write | 399-423 | No (async IIFE) | No |
| `updateSpacedRepetition` | 434-483 | Yes (awaited by caller) | No `.catch()` |
| `toggleFavorite` | 526-528 | No | No |
| `saveNote` | 548 | No | No |
| `setRating` | 568 | No | No |
| `addTag` / `removeTag` | 579, 592 | No | No |

The most critical are `updateHistory` and `updateSpacedRepetition` — if these silently fail, the user's progress is lost on next reload.

**Proposed fix:** Add `.catch()` with a toast notification to `updateHistory` and `updateSpacedRepetition`:
```typescript
await supabase.from('user_answers').upsert(...)
  .then(({ error }) => { if (error) toast.error('שגיאה בשמירת התקדמות'); });
```

---

### Summary — Priority Order

| # | Bug | Severity | Fix complexity |
|---|---|---|---|
| 1 | `confidenceMap` not updated after answering | Medium | 1 line |
| 2 | No error handling on critical DB writes | Medium | ~10 lines |
| 3 | Race conditions | Low | Already fixed |
| 4 | SM-2 NULL handling | Low | Already handled |
| 5 | Upsert conflicts | Low | Already correct |

**Recommended action:** Fix #1 and #2 — both are simple, low-risk changes.

