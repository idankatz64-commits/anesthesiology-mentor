

# Fix: Daily Question Count Using Wrong Timezone

## Root Cause
In `useStatsData.ts`, daily buckets are built using UTC dates (`toISOString().split('T')[0]`), but Israel is UTC+2/+3. Answers recorded after 10pm UTC (midnight Israel time) get bucketed into the next UTC day, and answers from 10pm-midnight Israel time get bucketed into the previous day. This causes today's count to be wrong.

Two locations need fixing:

1. **Lines 106-109** — Bucket key generation uses `new Date().toISOString()` (UTC)
2. **Line 112** — Answer bucketing uses `new Date(r.updated_at).toISOString()` (UTC)
3. **Lines 213-216** — Streak calculation also uses UTC dates

## Fix

Create a helper function to format a date in Israel timezone:

```typescript
function toIsraelDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); // returns YYYY-MM-DD
}
```

Then replace all three locations:
- **Bucket keys** (line 109): `toIsraelDateStr(d)` instead of `d.toISOString().split('T')[0]`
- **Answer bucketing** (line 112): `toIsraelDateStr(new Date(r.updated_at))` instead of `new Date(r.updated_at).toISOString().split('T')[0]`
- **Streak calculation** (line 216): `toIsraelDateStr(d)` instead of `d.toISOString().split('T')[0]`

## Refresh After Every Answer

The `useEffect` on line 82 has an empty dependency array `[]`, meaning it only runs once on mount. We should add `progress` as a dependency so stats refresh whenever the user answers a question.

## Files to modify
| File | Change |
|------|------|
| `src/components/stats/useStatsData.ts` | Add `toIsraelDateStr` helper, fix 3 date formatting locations, add `progress` to useEffect deps |

