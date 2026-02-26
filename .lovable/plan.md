

# Statistics Dashboard — Interactive Tiles with Framer Motion Animations

## Overview
Redesign the statistics dashboard with smooth iPhone-style animations using `framer-motion`. Key changes: animated tile expansions, inline topic row expansion with detail panels, staggered entrance animations, and the existing `StatsTile` modal system replaced with `AnimatePresence` + `layoutId` transitions.

## Dependencies
- Install `framer-motion` (new dependency)

## Files to Create

### 1. `src/components/stats/AnimatedStatsTile.tsx`
Replaces `StatsTile.tsx` with framer-motion powered expansion:
- Uses `layoutId` for each tile so expanded view animates from the card's position
- `AnimatePresence` wraps the expanded overlay
- Collapsed: `motion.div` with `whileHover={{ scale: 1.02 }}` and glow border transition
- Expanded: Full-screen overlay with `motion.div` using `layoutId` match, spring animation (duration 350ms, ease-out)
- Close on ESC, X button, or clicking backdrop
- No change to children API (`collapsed` / `expanded` ReactNode props)

## Files to Modify

### 2. `src/components/views/StatsView.tsx`
- Import `motion` and `AnimatePresence` from framer-motion
- Wrap all tiles in a stagger container using `motion.div` with `staggerChildren: 0.08`
- Each tile wrapped in `motion.div` with `variants` for fade-in entrance (opacity 0 -> 1, y 10 -> 0)
- Row 1 KPI tiles: non-expandable (remove click-to-expand), display only
- Row 2 medium tiles: use new `AnimatedStatsTile`
- Row 3 topic table: show first 5 rows collapsed with "Show All" button

### 3. `src/components/stats/TopicPerformanceTable.tsx`
Major enhancement — inline row expansion:
- Default: show first 5 rows + "Show All / Collapse" toggle button
- Clicking a row expands it inline (not modal) using `AnimatePresence` + `motion.div` with spring animation
- Expanded row reveals a detail panel with:
  - **Donut chart** (recharts PieChart): correct vs incorrect vs skipped
  - **Mini bar chart** (recharts BarChart): accuracy per last 5 sessions for this topic (computed from `progress.history`)
  - **Stat pills**: Smart Score badge, accuracy, coverage, attempts count
  - **Action button**: "Start practice on this topic" (calls `onTopicClick`)
- Clicking again or X collapses with reverse animation
- Pass `progress` and `data` as additional props for computing per-topic session history

### 4. `src/components/stats/ERITile.tsx`
- Remove `StatsTile` wrapper, render as static KPI card (no expand)
- Add `motion.div` wrapper for stagger entrance
- Keep the color ring and label

### 5. `src/components/stats/AccuracyTile.tsx`
- Remove `StatsTile` wrapper, render as static KPI card (no expand)
- Keep sparkline, trend arrow, and percentage

### 6. `src/components/stats/CoverageTile.tsx`
- Remove `StatsTile` wrapper, render as static KPI card (no expand)
- Keep progress bar and percentage

### 7. `src/components/stats/StreakTile.tsx`
- Remove `StatsTile` wrapper, render as static KPI card (no expand)
- Keep flame icon and count

### 8. `src/components/stats/LearningVelocityTile.tsx`
- Switch from `StatsTile` to `AnimatedStatsTile`
- Collapsed: 14-day chart (unchanged)
- Expanded: 30-day chart with tooltip and session markers (pass `trendData30` as additional prop)

### 9. `src/components/stats/WeakZoneMapTile.tsx`
- Switch from `StatsTile` to `AnimatedStatsTile`
- Collapsed/expanded content unchanged

### 10. `src/components/stats/ForgettingRiskTile.tsx`
- Switch from `StatsTile` to `AnimatedStatsTile`
- Collapsed/expanded content unchanged

## Animation Specifications

| Animation | Config |
|-----------|--------|
| Page entrance stagger | `staggerChildren: 0.08`, each child: `opacity: 0->1, y: 10->0, duration: 0.4` |
| Tile hover | `scale: 1.02`, CSS glow border `border-orange-500/30` |
| Tile expand | `layoutId` match, spring transition `type: "spring", stiffness: 300, damping: 30` (~350ms) |
| Tile collapse | Reverse of expand via `AnimatePresence mode="wait"` |
| Topic row expand | `initial={{ height: 0, opacity: 0 }}`, `animate={{ height: "auto", opacity: 1 }}`, spring transition |
| Topic row collapse | Reverse with `exit={{ height: 0, opacity: 0 }}` |

## Data Flow
- No database changes
- No new queries — all data from existing `useStatsData` hook
- `TopicPerformanceTable` receives additional `progress` and `data` props for computing per-topic donut/bar data
- `LearningVelocityTile` receives additional `fullData` prop for 30-day expanded view

## What Stays the Same
- `useStatsData.ts` — no changes
- All Supabase queries unchanged
- Navigation and practice session routing unchanged
- Import/Export section unchanged
- ComparativeStats component unchanged

