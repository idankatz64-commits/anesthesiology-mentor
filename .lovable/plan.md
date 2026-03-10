

## Plan: Replace Accuracy Trend with Canvas-Based TradingView Chart

**What**: Replace the existing `LearningVelocityTile` (Recharts-based) in StatsView with a new raw Canvas chart component featuring TradingView aesthetics, dual panels, EMA lines, toggle controls, interactive tooltips, and a stats bar.

**Where**: New component `src/components/stats/AccuracyCanvasChart.tsx`, minor update to `StatsView.tsx`.

### Data Fetching

- Query `answer_history` table (not `user_answers`) for the current user, last 90 days
- Group by `DATE(answered_at)` in JS after fetching
- Per day: `{ date, total, correct, accuracy }`
- Compute EMA-7, EMA-14, global average from this data
- Fetch inside the component using `supabase` client directly

### New Component: `AccuracyCanvasChart.tsx`

**Toggle bar** (above canvas):
- 4 buttons: EMA 7 / EMA 14 / ממוצע כללי / לוגריתמי
- Active = filled, inactive = outlined, using simple styled buttons

**Canvas Panel 1 (~260px tall)** — Accuracy + Volume bars:
- Each day = vertical bar, HEIGHT = volume relative to max-day volume
- Bar COLOR by accuracy: green (#00e676) ≥70%, orange (#ff9800) 50-70%, red (#ff1744) <50%
- Y-axis: 0-100% accuracy scale with grid lines at 20/40/60/80/100% (#1a1a1a)
- EMA-7 (orange), EMA-14 (blue), global avg (purple dashed) drawn as lines on accuracy scale
- Logarithmic toggle applies log scale to volume bar heights

**Canvas Panel 2 (~70px tall)** — Volume sub-panel:
- Same x-axis alignment
- Volume bars at 35% opacity, same color logic
- Y-axis label "שאלות"

**Interactive tooltip** on mousemove:
- Vertical + horizontal crosshair lines (rgba white)
- Dark tooltip card (#0f0f0f, border #3a4060) with date (dd/mm/yy Hebrew), volume, accuracy (colored), EMA values
- Flips left when near right edge

**Stats bar** below canvas:
- Row of KPIs: דיוק היום / EMA 7 / EMA 14 / ממוצע כללי / שאלות היום / שינוי מאתמול

### StatsView Changes

- Replace `LearningVelocityTile` import and usage (lines 12, 211-213) with `AccuracyCanvasChart`
- Remove `trendData14`/`trendData30` from destructuring (no longer needed here; kept in hook for other consumers)

### Style
- Background: #0a0a0a, cards: #0f0f0f with border #1a1a1a
- RTL layout, Hebrew labels
- Full TradingView dark aesthetic

No database changes required.

