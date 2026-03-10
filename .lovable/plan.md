

## Plan: Fix Table & Chart Styling

### 5 Changes

**1. Restore dark color scheme (TopicPerformanceTable.tsx)**
- Replace theme-aware CSS classes back to hardcoded dark colors:
  - Container: `bg-[#0a0a0a]` border `border-[#1a1a1a]`
  - Header/rows: `bg-[#0f0f0f]`, hover `hover:bg-[#111]`
  - Expanded row: `bg-[#0a0a10]`, left border `2px solid #7b92ff`
  - Text: `text-[#e0e0e0]`, muted `text-[#888]`
  - Search input, toggle pills, panel cards all back to dark hardcoded values
  - Panel C stats boxes: `bg-[#0f0f0f]` with dark borders

**2. Increase font sizes (TopicPerformanceTable.tsx)**
- Table cells: `text-[10px]` → `text-xs` (12px)
- Header cells: `text-[10px]` → `text-xs`
- Topic name: `text-xs` → `text-sm`
- Panel labels: `text-[10px]` → `text-xs`
- Panel stats values: `text-[11px]` → `text-sm`
- Badge text: `text-[10px]` → `text-xs`
- Search subtitle: `text-[10px]` → `text-xs`

**3. Narrow chart bars (AccuracyCanvasChart.tsx)**
- Reduce bar width calculation: change `(plotW / data.length) - 1` to `(plotW / data.length) * 0.5` for thinner bars
- Apply same reduction to volume panel bars

**4. Increase tile heights (StatsView.tsx + AccuracyCanvasChart.tsx)**
- AccuracyCanvasChart: collapsed `PANEL1_H` from 260 → 340, `PANEL2_H` from 70 → 90
- TopicTreemap in StatsView: add `min-h-[400px]` wrapper or pass height prop

**5. Fix expanded row highlight per reference image**
- Remove `bg-accent/20`, use `bg-[#0a0a10]`
- Border: `borderRight` → `borderLeft: '3px solid #7b92ff'` (RTL, so visual left = logical right)
- Gradient bar in Panel C: keep as-is, matches reference
- User marker: white circle with `#7b92ff` border (currently uses `border-primary`)

### Files Changed
- `src/components/stats/TopicPerformanceTable.tsx` — dark colors, bigger fonts, expanded row styling
- `src/components/stats/AccuracyCanvasChart.tsx` — thinner bars, taller canvas
- `src/components/views/StatsView.tsx` — taller treemap wrapper

