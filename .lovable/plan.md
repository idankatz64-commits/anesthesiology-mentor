

# Statistics Dashboard — Complete Redesign v3

## Overview
A 7-phase overhaul transforming the stats dashboard into a TradingView/Bloomberg-inspired terminal with an ERI hero centerpiece, S&P-style treemap heatmaps, gauge dials, and refined charts. All existing data queries remain unchanged.

---

## Phase 1 — ERI Hero + Layout Restructure

### 1.1 ERI Centerpiece (`ERITile.tsx` -- full rewrite)
- Remove the current small KPI card format
- Create a large hero section at the top of the dashboard (not inside `AnimatedStatsTile`)
- 200px SVG ring centered, showing `value%` inside + Hebrew label ("ready / good / partially ready")
- Three satellite stat pills arranged in a row below the ring: Accuracy | Coverage | Streak
- Each pill: monospace number, small label, color-coded
- On click: still expands to the radar chart detail view via `AnimatedStatsTile`

### 1.2 Layout (`StatsView.tsx` -- restructure)
- Background: `bg-[#0D0F14]` applied to the container
- Borders: `border-white/[0.06]`
- Remove Row 1 (4 KPI cards) -- ERI becomes hero, Accuracy/Coverage/Streak become satellite pills
- New layout:
  - **Hero**: ERI ring with satellites (full width)
  - **Row 1**: Learning Velocity (2/3) + Weak Zones gauges (1/3)
  - **Row 2**: Topic Treemap Heatmap (full width)
  - **Row 3**: Compact topic table (2/3) + Forgetting Risk (1/3)
  - **Row 4**: Group Position table (full width)
  - **Row 5**: Study Heatmap (full width)
  - **Row 6**: Import/Export

---

## Phase 2 — Topic Performance Treemap

### 2.1 New Treemap Component (`TopicTreemap.tsx` -- new file)
- Import `Treemap` from `recharts`
- Data: `topicData` array mapped to `{ name: topic, size: totalInDb, smartScore, accuracy, coverage, totalAnswered }`
- Custom content renderer for each rectangle:
  - Background color based on Smart Score: <50% deep red `#8B0000`, 50-65% orange `#B8520A`, 65-75% yellow `#A89000`, >75% green `#1A6B3C`
  - Show topic name + Smart Score % inside (hide if rect area is small)
- Custom tooltip: topic | Smart Score | accuracy | coverage | attempts
- Wrapped in `AnimatedStatsTile` for expand behavior
- Click on a rectangle starts practice for that topic

### 2.2 Compact Table Below (`TopicPerformanceTable.tsx` -- modify)
- Default sort: lowest Smart Score first (ascending)
- Show 5 rows by default
- Columns: topic | Smart Score (color badge) | accuracy | coverage | attempts
- Remove inline expansion (donut/bar charts) -- simplify to just the table
- "Expand to full table (N topics)" button with animation
- Keep search functionality

---

## Phase 3 — Group Position Table

### `ComparativeStats.tsx` -- modify
- Add 5-row default view showing topics with largest deviation from group average
- Add columns: topic | your accuracy | group avg | gap (+/-%) | questions to close gap
- Gap badge at top: "Gap from overall average: -X% | ~N more correct answers needed"
- "Expand to full table" button
- Remove heatmap -- clean table only
- Questions-to-close-gap per row: `ceil(abs(diff) / 100 * myAnswered)`

---

## Phase 4 — Forgetting Risk with Treemap Expansion

### `ForgettingRiskTile.tsx` -- rewrite
**Collapsed:**
- Title with warning icon + top 3 at-risk topics as colored pills (risk score next to each)
- Pulsing border animation (`animate-pulse` on border) if any topic has risk > 2.0

**Expanded (via AnimatedStatsTile):**
- Full-screen overlay with recharts `Treemap`:
  - Size = `daysSince` (days since last attempt)
  - Color = risk score: <0.5 green `#1A6B3C`, 0.5-1.5 yellow `#A89000`, 1.5-2.5 orange `#B8520A`, >2.5 red `#8B0000`
  - Custom renderer showing topic name + risk score
- Below treemap: sorted list with "Start practice" button per topic

---

## Phase 5 — Accuracy Trend Chart Fix

### `LearningVelocityTile.tsx` -- modify
- Already filters zero-activity days and has moving averages -- verify and fix:
  - Ensure X-axis only shows dates with activity (filter `chartData` to exclude `count === 0` days entirely from the array, not just null the values)
  - Moving averages: already implemented (7-day solid orange, 14-day dashed blue)
  - Reference line at 70%: already implemented
  - Legend: already present
- Increase font sizes: axis labels to 12px min, legend to 13px
- Chart height: already 280px collapsed, 400px expanded -- good
- Enhance tooltip: show date, daily accuracy, 7-day MA, 14-day MA, question count

---

## Phase 6 — Weak Zones Gauge Dials

### `WeakZoneMapTile.tsx` -- rewrite
**Collapsed: 3 gauge dials side by side**
- Each gauge is a semicircular SVG arc (speedometer style):
  - Red gauge: "Dead Zone" -- needle position = count, arc in red
  - Yellow gauge: "Studied Not Learned" -- needle in yellow
  - Green gauge: "Mastered" -- needle in green
- Below each gauge: large count number + % of total bank
- Use SVG paths for the semicircle arcs and needle

**Expanded:**
- Three sections with collapsible topic groups (keep existing expanded logic)
- "Start practice on this zone" button for red and yellow

---

## Phase 7 — Study Activity Heatmap

### `StreakTile.tsx` -- minor adjustments
- Already implemented as GitHub-style 90-day heatmap -- keep as is
- Verify color scheme matches spec (0=gray, 1-5=light orange, 6-15=medium, 16+=deep)
- Already has tooltip and legend -- verified correct
- Move to its own full-width row in the layout

---

## Files Summary

| File | Action | Phase |
|------|--------|-------|
| `src/components/views/StatsView.tsx` | Restructure layout, ERI hero | 1 |
| `src/components/stats/ERITile.tsx` | Rewrite as hero centerpiece | 1 |
| `src/components/stats/TopicTreemap.tsx` | **New** -- Treemap heatmap | 2 |
| `src/components/stats/TopicPerformanceTable.tsx` | Simplify to compact table | 2 |
| `src/components/views/ComparativeStats.tsx` | Add per-row gap, 5-row default | 3 |
| `src/components/stats/ForgettingRiskTile.tsx` | Treemap expansion + pulse | 4 |
| `src/components/stats/LearningVelocityTile.tsx` | Font size fixes, tooltip | 5 |
| `src/components/stats/WeakZoneMapTile.tsx` | Gauge dials | 6 |
| `src/components/stats/StreakTile.tsx` | No changes (already done) | 7 |
| `src/components/stats/AccuracyTile.tsx` | Remove (merged into ERI hero) | 1 |
| `src/components/stats/CoverageTile.tsx` | Remove (merged into ERI hero) | 1 |

---

## Technical Notes

- `recharts` Treemap is already available (verified in node_modules)
- No new dependencies needed
- All data flows from existing `useStatsData` hook
- Gauge dials use raw SVG (semicircle arc + rotating needle line)
- Treemap custom content: use `contentStyle` prop or custom `<rect>` + `<text>` elements via the `content` prop
- The AccuracyTile and CoverageTile components become unused (their data feeds into ERI hero satellites)
- Pulsing border on ForgettingRisk: conditional class `animate-pulse` on the tile's outer border when max risk > 2.0

