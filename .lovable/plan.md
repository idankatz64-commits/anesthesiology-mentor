

# Dashboard Design Improvements

## Overview
Three visual changes to the statistics dashboard: gradient treemap colors, enlarged forgetting risk tile, and removal of the 90-day activity heatmap.

## Changes

### 1. Gradient Treemap Colors (S&P 500 Style)
**File: `src/components/stats/TopicTreemap.tsx`**

Replace the 4-step `getTreemapColor` function with a smooth gradient interpolation, matching the S&P 500 heatmap style (deep red -> light red -> neutral -> light green -> deep green).

- Score 0-40: Deep red (#8B0000) to red (#CC0000)
- Score 40-55: Red (#CC0000) to dark orange/neutral (#4A4A4A)
- Score 55-70: Neutral (#4A4A4A) to green (#2E7D32)
- Score 70-100: Green (#2E7D32) to deep green (#00C853)

Replace the discrete legend with a smooth gradient bar legend.

Also apply the same gradient logic to the `ForgettingRiskTile.tsx` treemap (`getRiskColor`).

### 2. Enlarge Forgetting Risk Tile + Remove ERI Satellites
**File: `src/components/stats/ERITile.tsx`**

Remove the "satellites" section (lines 93-101) — the three small pills showing accuracy, coverage, and streak below the ERI ring. These are redundant with the "main KPIs" gauges on the right column.

**File: `src/components/views/StatsView.tsx`**

The freed space allows the Forgetting Risk tile to naturally expand. No layout change needed since it already fills available space via `flex flex-col gap-4`.

### 3. Remove 90-Day Activity Heatmap
**File: `src/components/views/StatsView.tsx`**

Remove the "90 day activity" heatmap block (lines 113-117) from the left column. The current display is too sparse and doesn't add value. The left column will contain only the WeakZoneMapTile.

Remove the `HeatmapGrid` and `HeatmapLegend` imports, and `dailyData90` from the destructured stats data (if not used elsewhere).

## Summary of File Changes

| File | Change |
|------|--------|
| `src/components/stats/TopicTreemap.tsx` | Replace `getTreemapColor` with smooth gradient interpolation; update legend to gradient bar |
| `src/components/stats/ForgettingRiskTile.tsx` | Replace `getRiskColor` with smooth gradient interpolation |
| `src/components/stats/ERITile.tsx` | Remove satellite pills (accuracy/coverage/streak) below ERI ring |
| `src/components/views/StatsView.tsx` | Remove 90-day heatmap section from left column |

