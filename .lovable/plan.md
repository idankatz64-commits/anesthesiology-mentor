

# Fix: "Today's questions" count uses UTC date comparison

## Root Cause
In `LearningVelocityTile.tsx` line 76, `computeDailyReport` compares the last chart entry's date against `new Date().toISOString().slice(0, 10)` which is UTC. But the chart data dates are already in Israel timezone (via `toIsraelDateStr`). So they don't match, and `todayCount` falls to 0.

## Fix
**File: `src/components/stats/LearningVelocityTile.tsx`**

Add the same `toIsraelDateStr` helper (or import it) and use it on line 76:

```typescript
// Line 76: change from
const today = new Date().toISOString().slice(0, 10);
// to
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
```

Single line change. No other modifications needed.

