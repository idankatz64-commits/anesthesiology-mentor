

## Plan: Rebuild TopicPerformanceTable with Full Spec

### Overview
Completely rewrite `TopicPerformanceTable.tsx` to match the detailed spec: new columns (נענו, נכון, שגוי), column toggle bar, new expanded row with 3 panels (session bars, donut chart, group position gradient), and TradingView dark styling.

### Data Sources (no DB changes needed)
- `topicData` prop already has: `topic`, `totalInDb`, `totalAnswered`, `correct`, `wrong`, `accuracy`, `smartScore`
- Group averages: existing `get_global_topic_stats` RPC (already fetched)
- Session history: `answer_history` table query per topic on expand (already done)
- No new tables or migrations required

### Changes to `TopicPerformanceTable.tsx` (full rewrite)

**Column Toggle Bar**
- Row of small toggle buttons above table for: במאגר, נענו, נכון, שגוי, דיוק, Smart Score, ממוצע קבוצה, מיקום
- נושא always visible. State: `visibleCols` set, default all on
- Styled as small pills: active = filled `#7b92ff`, inactive = outlined `#1a1a1a`

**Table Columns** (9 total)
1. נושא — topic_main name (always visible)
2. במאגר — `totalInDb`
3. נענו — `totalAnswered`
4. נכון — `correct` (green `#00e676`)
5. שגוי — `wrong` (red `#ff1744`)
6. דיוק — 5px colored bar + percentage, color by threshold
7. Smart Score — colored badge (מצוין/בינוני/לשפר)
8. ממוצע קבוצה — group avg %
9. מיקום — rank label: "Top 10%" / "מעל ממוצע" / "בממוצע" / "מתחת לממוצע"

Position logic: if user in top 10% of all users for that topic → "Top 10%", else compare to group avg with ±5% threshold.

**Expandable Row** — 3 side-by-side panels on click:

Panel A: "דיוק ב-5 סשנים אחרונים" — keep existing session bar chart (recharts), colored bars by accuracy.

Panel B: "התפלגות תשובות" — Canvas or SVG donut chart: correct (#00e676), wrong (#ff1744), unanswered (#555). Center text = accuracy %. Legend below.

Panel C: "מיקום בקבוצה" — Gradient bar (red→orange→green), white circle marker at user accuracy, orange vertical line at group avg. Stats row below: דיוק שלי / ממוצע קבוצה / פער / נשאר לסגירה / Smart Score.

**Styling**
- Background `#0a0a0a`, card `#0f0f0f`, borders `#1a1a1a`
- Expanded row: left border 2px solid `#7b92ff`, bg `#0a0a10`
- Row hover: `#111`
- RTL, Hebrew labels
- Search bar retained

### StatsView.tsx
- No changes needed — already imports and uses `TopicPerformanceTable` with correct props

### Files Changed
- `src/components/stats/TopicPerformanceTable.tsx` — full rewrite

