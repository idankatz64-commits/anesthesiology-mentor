
# Statistics Dashboard — Final Layout v4

## Overview
Complete restructuring of the stats page into a 4-row layout: question bank status bar, 3-column main dashboard panel (gauges + ERI + stats), full-width accuracy chart, and topic heatmap + table. Removes the separate KPI row and ComparativeStats tile from the main flow.

---

## ROW 1 — Question Bank Status Bar
**File: `src/components/views/StatsView.tsx`**

Add a compact 3-tile status bar at the top (copied from HomeView pattern):
- Tile 1: "ללא הסבר" count (orange)
- Tile 2: "כוללות הסבר" count (green)
- Tile 3: "סה״כ שאלות" count (primary)
- Uses `data` from `useApp()` and counts `KEYS.EXPLANATION`
- Style: `grid-cols-3`, compact `p-3`, monospace numbers, dark card bg

---

## ROW 2 — 3-Column Main Dashboard Panel
**File: `src/components/views/StatsView.tsx`**

Layout: `grid grid-cols-1 md:grid-cols-3 gap-4`

### LEFT Column (1/3)
**Top section: Weak Zone Gauges (stacked vertically)**
- Reuse existing `GaugeDial` from `WeakZoneMapTile.tsx` but render 3 gauges stacked vertically instead of side-by-side
- Order: Green (Mastered) on top, Yellow (Not Learned), Red (Dead Zone) at bottom
- Each gauge shows count + "X% of bank" below

**Bottom section: GitHub Heatmap**
- Extract `HeatmapGrid` + `HeatmapLegend` from `StreakTile.tsx` and render directly
- 90-day data, compact cell size (10px)

Both sections wrapped in a single card container.

### CENTER Column (1/3) — ERI Hero
**File: `src/components/stats/ERITile.tsx` — modify**
- Increase ring to 240px
- Keep the existing click-to-expand radar chart behavior
- Satellite pills remain below: Accuracy | Coverage | Streak

### RIGHT Column (1/3)
**New component or inline in StatsView**

**Top section: 3 Gauge Dials for KPI stats**
- Accuracy gauge (blue `#60A5FA`): shows `eri.accuracy`%
- Coverage gauge (orange `#F97316`): shows `eri.coverage`%  
- Streak gauge (fire `#FB923C`): shows `streak` days
- Same `GaugeDial` SVG component, stacked vertically
- Each gauge: max = 100 for accuracy/coverage, max = 30 for streak

**Bottom section: Forgetting Risk**
- Compact: title + top 3 risk topic pills with scores
- Pulsing border if risk > 2.0
- Click expands to full Treemap view (existing behavior)

---

## ROW 3 — Accuracy Trend Chart (full width)
**File: `src/components/stats/LearningVelocityTile.tsx` — modify**
- Title: "מגמת דיוק לאורך זמן"
- Increase min height to 320px
- Already filters zero-activity days and has 7-day/14-day moving averages
- Increase all font sizes to min 13px (axis ticks, legend)
- Tooltip already shows: date, daily accuracy, 7d avg, 14d avg, question count
- Reference line at 70% already exists

---

## ROW 4 — Topic Heatmap + Table (full width)
### Treemap
**File: `src/components/stats/TopicTreemap.tsx` — modify**
- Filter out topics named "N/A#" from treemap data (add `.filter(t => t.topic !== 'N/A#')`)
- Keep all other topics including in table data
- Everything else stays the same

### Table
**File: `src/components/stats/TopicPerformanceTable.tsx` — modify**
- Add "במאגר" (totalInDb) column to the existing columns
- Already has: topic, Smart Score, accuracy, correct, wrong, answered
- Already shows 5 rows default with expand button
- Already sortable and clickable for practice

---

## ROW 5+ — Remaining tiles
- ComparativeStats (Group Position) stays as a full-width tile below the table
- Study Heatmap (StreakTile) is removed as standalone tile since the heatmap is now in the left column of ROW 2
- Import/Export stays at the bottom

---

## Files Summary

| File | Changes |
|------|---------|
| `src/components/views/StatsView.tsx` | Complete layout restructure: status bar, 3-col panel, chart, treemap+table, group position, export |
| `src/components/stats/ERITile.tsx` | Increase ring size to 240px |
| `src/components/stats/LearningVelocityTile.tsx` | Font size increase to 13px, height to 320px |
| `src/components/stats/TopicTreemap.tsx` | Filter out "N/A#" topics from treemap |
| `src/components/stats/TopicPerformanceTable.tsx` | Add "במאגר" column |
| `src/components/stats/WeakZoneMapTile.tsx` | Extract GaugeDial as named export for reuse; modify collapsed layout to vertical stack |

## Technical Notes
- `GaugeDial` component will be extracted from `WeakZoneMapTile.tsx` and exported so it can be reused in the right column for Accuracy/Coverage/Streak gauges
- The StreakTile's `HeatmapGrid` and `HeatmapLegend` will be extracted as named exports for reuse in the left column
- No new dependencies needed
- No Supabase query changes
- Dark/light mode maintained via existing Tailwind `dark:` variants
