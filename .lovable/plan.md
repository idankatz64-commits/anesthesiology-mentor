

# Plan: Personal Statistics Cards Section

## Overview
Add a new "הסטטיסטיקה שלי" (My Statistics) section below the existing global question bank stats, showing 6 personal metric cards computed from the `user_answers` table.

## Data Source
All metrics come from the `user_answers` table which already has the needed columns:
- `answered_count` -- total attempts per question
- `is_correct` -- current correctness state
- `correct_count` -- how many times answered correctly
- `ever_wrong` -- whether the question was ever answered wrong

## Metric Definitions

| Card | Computation | Style |
|------|------------|-------|
| שאלות שבוצעו | SUM of all `answered_count` | Default |
| שאלות ייחודיות | COUNT of rows (each row = 1 unique question) | Default |
| טעויות | SUM(`answered_count`) - SUM(`correct_count`) | Default |
| שאלות מתוקנות | COUNT WHERE `ever_wrong = true` AND `is_correct = true` | Green text |
| שאלות שעדיין לא תוקנו | COUNT WHERE `ever_wrong = true` AND `is_correct = false` | Orange text |
| טעויות חוזרות | COUNT WHERE `(answered_count - correct_count) > 1` | Red, bold, warning icon |

## Files to Modify

### 1. `src/components/stats/useStatsData.ts`
- Add a new `useEffect` (or extend the existing one) to query `user_answers` for the logged-in user
- Compute and return all 6 metrics as a `personalStats` object
- No new Supabase tables or migrations needed

### 2. `src/components/views/StatsView.tsx`
- Destructure `personalStats` from `useStatsData()`
- After the existing ROW 1 (global question bank status bar), add:
  - A section header: "הסטטיסטיקה שלי" with a user icon
  - A responsive grid of 6 metric cards: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3`
- Each card uses the same styling as the existing status bar cards (bg-card, border, rounded-xl, Share Tech Mono font)
- Apply color overrides per spec: green for corrected, orange for uncorrected, red+bold+warning icon for repeated errors

## No database changes required.

