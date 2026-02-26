

# Statistics Dashboard — Visual & Data Improvements

## Overview
Five targeted improvements to the statistics dashboard: enhanced Learning Velocity chart with moving averages, GitHub-style streak heatmap (90 days), visual Weak Zone matrix, gap metrics in the Comparative Stats tile, and a bento grid layout with varied tile sizes.

## 1. Learning Velocity Chart — Complete Overhaul
**File: `src/components/stats/LearningVelocityTile.tsx`**

- Filter out zero-activity days from chart data (don't plot points where `count === 0`)
- Compute 7-day and 14-day moving averages from the daily data in the component
- Add three `<Line>` elements: daily accuracy (thin orange dots), 7-day MA (smooth solid orange), 14-day MA (dashed blue)
- Add a `<ReferenceLine y={70}` dashed gray with label "target exam"
- Add `<Legend>` with Hebrew labels: "daily accuracy | 7-day avg | 14-day avg"
- Update title to: "trend accuracy over time — moving averages"
- Set chart container min height to 280px
- In expanded view: same chart but taller (400px) with `trendData30` and full legend

**File: `src/components/stats/useStatsData.ts`**
- No changes needed — moving averages computed locally in the tile component from existing daily data

## 2. Study Streak — GitHub-style Heatmap (90 days)
**File: `src/components/stats/StreakTile.tsx`**

- Replace current calendar grid with a GitHub contribution heatmap
- Extend data requirement to 90 days (will need `dailyData90`)
- Grid: 13 columns (weeks) x 7 rows (days), small squares ~12px
- Color scale based on question count:
  - 0: `bg-gray-100 dark:bg-gray-800`
  - 1-5: light orange (`bg-orange-200 dark:bg-orange-900/50`)
  - 6-15: medium orange (`bg-orange-400 dark:bg-orange-600`)
  - 16+: deep orange (`bg-orange-600 dark:bg-orange-500`)
- Tooltip on hover showing date, question count, and accuracy
- Below grid: legend strip "less to more" with color squares
- Collapsed view: compact 90-day heatmap
- Expanded view: larger squares with more detail

**File: `src/components/stats/useStatsData.ts`**
- Extend the daily data fetch from 30 days to 90 days
- Add `dailyData90` to the return value
- Keep `dailyData30` and `dailyData14` as slices of the 90-day data

**File: `src/components/views/StatsView.tsx`**
- Pass `dailyData90` to `StreakTile`

## 3. Weak Zone Map — Visual Matrix
**File: `src/components/stats/WeakZoneMapTile.tsx`**

**Collapsed view** — 3-column visual layout:
- Dead Zone (red): count badge + top 3 topic names as pill tags (group questions by topic, show top 3 topics)
- Studied Not Learned (yellow): count badge + horizontal mini bar showing topic distribution (proportional segments per topic)
- Mastered (green): count badge + small progress ring showing % of total question bank

**Expanded view** — questions grouped by topic:
- Each zone section contains collapsible topic rows (using simple state toggle with framer-motion)
- Click topic header to reveal its questions
- "Start practice on this zone" button for red and yellow zones only
- Uses `@radix-ui/react-collapsible` (already installed) for topic accordion

**Data additions**: Group weak zone question IDs by topic using the `data` array from AppContext

## 4. Position in Group — Gap Metrics
**File: `src/components/views/ComparativeStats.tsx`**

Add two summary KPI cards above the existing table:
- **"Gap from average"**: Compute overall user accuracy vs overall group average. Display as `+X%` (green) or `-X%` (red)
- **"Questions to close gap"**: Formula: `gap_questions = (group_avg - user_accuracy) / 100 * avg_total_attempts`. Display as "approximately N more correct answers to reach group average". Show 0 or a checkmark if user is above average.

These appear as two small cards in a flex row above the table, inside the existing ComparativeStats component.

## 5. Bento Grid Layout
**File: `src/components/views/StatsView.tsx`**

Reorganize the grid layout:
- **Row 1**: 4 equal KPI cards — unchanged (`grid-cols-2 lg:grid-cols-4`)
- **Row 2**: Learning Velocity 2/3 width + Weak Zone 1/3 width tall
  - Use `grid-cols-1 md:grid-cols-3`, Velocity spans `md:col-span-2`, Weak Zone `md:col-span-1`
  - Move Forgetting Risk tile elsewhere or merge into Row 4
- **Row 3**: Study Heatmap full width (`col-span-full`, shorter height)
- **Row 4**: Topic table 2/3 + Group Position 1/3
  - Use `grid-cols-1 md:grid-cols-3`, Table spans `md:col-span-2`, ComparativeStats `md:col-span-1`
- All tiles: `rounded-2xl`, consistent padding, subtle border

Forgetting Risk tile moves to Row 2 as a third element below (or alternatively placed in Row 4 alongside Group Position). Given the bento spec mentions only 3 tiles in Row 2, Forgetting Risk can sit between Row 2 and Row 3 as a standalone medium tile, or be merged into the Weak Zone expanded view.

## Technical Details

### Moving Average Computation (in LearningVelocityTile)
```text
For each day with data:
  ma7 = average of last 7 non-zero days' rates
  ma14 = average of last 14 non-zero days' rates
Filter: only include data points where count > 0
```

### Heatmap Data Structure
```text
90 days -> array of { date, count, correct, rate }
Render as CSS grid: grid-template-columns: repeat(13, 1fr)
Fill column-first (each column = 1 week, 7 rows = Sun-Sat)
```

### Gap Metrics Formula
```text
user_overall_accuracy = sum(correct) / sum(answered) across all topics
group_overall_accuracy = weighted avg of global topic accuracies
gap = group_overall_accuracy - user_overall_accuracy
gap_questions = max(0, gap / 100 * user_total_attempts)
```

## Files Summary

| File | Action |
|------|--------|
| `src/components/stats/LearningVelocityTile.tsx` | Rewrite chart with MAs, legend, reference line |
| `src/components/stats/StreakTile.tsx` | Replace calendar with GitHub heatmap |
| `src/components/stats/WeakZoneMapTile.tsx` | Visual matrix collapsed + grouped expanded |
| `src/components/stats/useStatsData.ts` | Extend to 90-day daily data |
| `src/components/views/ComparativeStats.tsx` | Add gap metric KPI cards |
| `src/components/views/StatsView.tsx` | Bento grid layout reorganization |

