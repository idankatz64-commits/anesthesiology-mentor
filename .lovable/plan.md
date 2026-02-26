

# Full Statistics Dashboard Redesign -- Expandable Tile System

## Overview
Complete rewrite of `StatsView.tsx` as a modern dark dashboard with interactive expandable tiles. All data comes from existing `user_answers`, `spaced_repetition`, and local `progress` state -- no new database tables needed.

## Architecture

The redesign splits into one main file and several sub-components for clarity:

### New Files
1. **`src/components/stats/StatsTile.tsx`** -- Reusable expandable tile wrapper (handles click-to-expand, modal overlay with backdrop-blur, close on ESC/X)
2. **`src/components/stats/ERITile.tsx`** -- Exam Readiness Index with color ring + expanded radar chart
3. **`src/components/stats/AccuracyTile.tsx`** -- Accuracy KPI + expanded 30-day chart
4. **`src/components/stats/CoverageTile.tsx`** -- Coverage KPI + expanded chapter heatmap grid
5. **`src/components/stats/StreakTile.tsx`** -- Study streak with flame icon
6. **`src/components/stats/LearningVelocityTile.tsx`** -- 14-day line chart with trend line
7. **`src/components/stats/WeakZoneMapTile.tsx`** -- 3 colored zones with counts + expanded full question list
8. **`src/components/stats/ForgettingRiskTile.tsx`** -- Top 5 at-risk topics + expanded full list with practice buttons
9. **`src/components/stats/TopicPerformanceTable.tsx`** -- Full-width sortable table (mostly extracted from current code)
10. **`src/components/stats/useStatsData.ts`** -- Custom hook extracting all computed metrics (ERI, streak, forgetting risk, weak zones, daily data)

### Modified Files
1. **`src/components/views/StatsView.tsx`** -- Complete rewrite to compose the new tile components in the specified grid layout

## Detailed Component Design

### `useStatsData.ts` -- Central data hook
Fetches and computes all metrics from existing data:
- **ERI** = `(accuracy * 0.25) + (coverage * 0.25) + (critical_topic_avg * 0.30) + (consistency_14d * 0.20)`
  - `critical_topic_avg` = average Smart Score of bottom 10 topics
  - `consistency_14d` = active days in last 14 / 14
- **Study Streak** = consecutive days with activity (from `user_answers.updated_at`)
- **Forgetting Risk** per topic = `(days_since_last_attempt / 7) * (1 - topic_accuracy)`, sorted descending
- **Weak Zones**: Dead Zone (wrong 3+ times), Studied Not Learned (<50% accuracy), Mastered (>=50%)
- **Daily data** (30 days for expanded, 14 for default) from `user_answers`
- Reuses existing `calcSmartScore` and `linearRegression` functions

### `StatsTile.tsx` -- Expandable wrapper
```text
+---------------------------+
|  [Collapsed Content]      |  <-- onClick opens modal
+---------------------------+

Expanded (modal):
+===============================+
| backdrop-blur overlay         |
|  +-------------------------+  |
|  | X close button          |  |
|  | [Expanded Content]      |  |
|  +-------------------------+  |
+===============================+
```
- Props: `collapsed: ReactNode`, `expanded: ReactNode`, `className?: string`
- ESC key and X button close the modal
- Modal: `fixed inset-0 z-50 bg-black/60 backdrop-blur-sm`, content card with `max-w-4xl`

### Row 1 -- 4 KPI Cards (grid-cols-2 lg:grid-cols-4)
| Tile | Collapsed | Expanded |
|------|-----------|----------|
| ERI | % number + color ring (red<50/yellow 50-70/green>70) + label (Hebrew readiness level) | Radar chart showing 4 components (accuracy, coverage, critical topics, consistency) using Recharts RadarChart |
| Accuracy | % + trend arrow + 7-day sparkline | 30-day daily accuracy line chart with session markers |
| Coverage | % + mini progress bar | Chapter heatmap: 50 grid squares colored by completion % per chapter |
| Streak | Number + flame icon | Calendar-style view of last 30 days active/inactive |

### Row 2 -- 3 Medium Tiles (grid-cols-1 md:grid-cols-3)
| Tile | Collapsed | Expanded |
|------|-----------|----------|
| Learning Velocity | 14-day line chart + trend line | Same chart, larger, with stats overlay |
| Weak Zone Map | 3 colored zones with counts | Full question list per zone, clickable to start session |
| Forgetting Risk | Top 5 topics at risk | Full sorted list with risk score + "Start Practice" button per topic |

### Row 3 -- Full-width Topic Table
- Extracted from current code with additions: trend column (arrow based on 7-day vs prior 7-day accuracy)
- Row backgrounds: `bg-destructive/5` for <50, `bg-warning/5` for 50-70, `bg-success/5` for >70
- Click row starts filtered practice session (existing behavior preserved)

## Visual Style
- Background: Uses existing CSS vars (`--background: 260 30% 4%`)
- Cards: `bg-[#141720] border border-white/[0.07]` with `hover:border-orange-500/30 hover:shadow-[0_0_20px_rgba(249,115,22,0.1)]`
- Charts: Orange gradient for bars (`#F97316` to `#FB923C`), teal/blue line for trends (`#60A5FA`)
- KPI numbers: `text-2xl font-black text-white`
- Labels: `text-xs text-muted-foreground`
- Expanded modal: `backdrop-blur-md bg-black/70`

## Data Flow
No new database queries needed. All data sourced from:
- `user_answers` table (already queried in current StatsView)
- `spaced_repetition` table (for forgetting risk -- `next_review_date` and `last_correct`)
- Local `progress.history` (for weak zones, accuracy breakdowns)
- `data` array from AppContext (question bank for coverage/chapter mapping)

## Existing Features Preserved
- Import/Export buttons (moved to bottom of page)
- ComparativeStats component (kept as-is below topic table)
- Topic click-to-practice functionality
- Search and sort on topic table

