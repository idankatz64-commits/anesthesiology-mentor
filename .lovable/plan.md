

## Root Cause: Supabase 1000-Row Default Limit

The hydration query in `fetchProgressFromSupabase` (line 109 of `AppContext.tsx`) does **not** paginate:

```typescript
supabase.from('user_answers').select('...').eq('user_id', userId)
```

Supabase silently caps results at **1000 rows**. One user already has **1126 rows**, meaning 126 question history entries are invisible to the app. This causes:

- **Mistake count on HomeView** undercounts (missing history entries)
- **"חזרה על טעויות" filter** misses questions beyond the 1000 cutoff
- **Stats dashboard** shows incomplete data
- **ever_wrong / corrected / uncorrected** metrics are wrong

**Secondary issue**: 35 rows in `user_answers` have `ever_wrong = false` AND `is_correct = false` — a data inconsistency (likely from race conditions during batch updates).

---

### Fix Plan

**1. Paginate all hydration queries** (`src/contexts/AppContext.tsx`, lines 108-113)

Create a helper function `fetchAllRows(query)` that loops with `.range(offset, offset+999)` until fewer than 1000 rows are returned. Apply to `user_answers`, `user_favorites`, `user_notes`, `user_ratings`, `user_tags`.

**2. Paginate stats queries** (`src/components/stats/useStatsData.ts`, lines 119-129)

Same pagination for the three parallel queries (answers 90-day, spaced_repetition, detailed answers).

**3. Fix inconsistent data** (one-time SQL migration)

```sql
UPDATE user_answers 
SET ever_wrong = true 
WHERE is_correct = false AND ever_wrong = false;
```

### Files Changed

| File | Change |
|------|--------|
| `src/contexts/AppContext.tsx` | Add `fetchAllRows` helper, paginate 5 hydration queries |
| `src/components/stats/useStatsData.ts` | Paginate 3 stats queries |
| SQL migration | Fix 35 inconsistent `ever_wrong` rows |

