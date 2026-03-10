

## Plan: Light Mode Fix, Deep Dark Theme, Coverage Column, Sparklines

### 5 Tasks

**1. Fix light mode in TopicPerformanceTable**
The table currently uses hardcoded dark colors (`#0a0a0a`, `#0f0f0f`, `#1a1a1a`, `#e0e0e0`, `#888`). Replace all inline styles with a theme-aware approach: create a `useTableTheme()` hook that checks `document.documentElement.classList.contains('light')` and returns the appropriate color set. Dark mode keeps current colors; light mode uses white/gray equivalents (`#fff`, `#f5f5f7`, `#e5e5e5`, `#1a1a1a`, `#666`).

**2. Apply deep dark matrix theme to entire StatsView**
Transform StatsView tiles to use a consistent deep-dark aesthetic with subtle matrix accents:
- Wrap entire StatsView in a container with `bg-[#050508]` and a subtle grid pattern overlay (`bg-grid-pattern` class already exists)
- All stat tiles (question bank, personal stats, KPI gauges, import/export): replace `bg-card border-border` with `bg-[#0a0a0f]/80 border-[#1a1a2a] backdrop-blur-sm` + subtle `box-shadow: inset 0 1px 0 rgba(123,146,255,0.05), 0 4px 20px rgba(0,0,0,0.4)`
- Add thin gradient top accent (`::before` pseudo via a utility class or inline) with `#7b92ff` → transparent
- Section headers: add faint matrix-blue tint (`text-[#7b92ff]/80`)
- AnimatedNumber values: keep `Share Tech Mono` font, add faint text-shadow glow

**3. Add "כיסוי" (Coverage) column to table**
- Add `'coverage'` to `ColId` and `ALL_COLS` array with label `כיסוי`
- Calculate: `coverage = totalAnswered / totalInDb * 100` (clamped 0-100)
- Render as a colored progress bar (same 5px bar style as accuracy) with color scale:
  - `< 25%`: `#ff1744` (red)
  - `25-50%`: `#ff9800` (orange)  
  - `50-75%`: `#2196f3` (blue)
  - `≥ 75%`: `#00e676` (green)
- Add as sortable column between "שגוי" and "דיוק"

**4. Add sparkline column (7-day accuracy trend)**
- Add `'sparkline'` to `ColId` with label `מגמה`
- Fetch last 7 days of per-topic accuracy from `answer_history` on mount (single query, group client-side)
- Render as inline SVG sparkline (40×16px polyline) inside each row cell
- Color: green if trending up, red if trending down, gray if flat
- Place column after "דיוק"

**5. Keep hardcoded dark for table but detect light mode**
Since user likes the dark aesthetic but wants light mode to work: use a `useThemeMode()` hook that returns `'dark' | 'light'`. The table uses its own dark palette in dark mode and switches to a light palette in light mode. Both palettes are hardcoded (not CSS vars) for precise control.

### Files Changed
- `src/components/stats/TopicPerformanceTable.tsx` — light mode fix, coverage column, sparkline column, theme detection
- `src/components/views/StatsView.tsx` — deep dark matrix container styling for all tiles
- `src/components/stats/AccuracyCanvasChart.tsx` — minor: ensure dark matrix bg consistency

