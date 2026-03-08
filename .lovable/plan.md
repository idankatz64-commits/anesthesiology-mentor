

# Plan: Accuracy Trend Chart Upgrade -- Volume Bars + Daily Report

## Overview
Enhance the `LearningVelocityTile` component with two additions: a synchronized volume bar chart below the accuracy line chart, and a daily performance summary section.

## Part A -- Daily Volume Bars

### Approach
Modify `LearningVelocityTile.tsx` to add a `BarChart` below the existing `LineChart`, sharing the same data and X-axis alignment.

### Implementation in `VelocityChart` component
1. The existing `computeMovingAverages` function already returns `count` per day -- extend it to also compute a 14-day moving average of `count` (call it `volumeMA14`)
2. Replace the single `LineChart` with a vertical stack:
   - Top: existing accuracy `LineChart` (keep current height minus ~100px to make room)
   - Bottom: new `BarChart` (~100px height) with:
     - `Bar` dataKey="count" with a custom `Cell` renderer: green (`#22C55E`) if `count >= volumeMA14`, red (`#EF4444`) if below
     - `ReferenceLine` at the `volumeMA14` value, dashed horizontal line
     - Same `XAxis` with `dataKey="date"` and `tickFormatter={formatDate}`, but hide tick labels on the top chart's X-axis (set `tick={false}` on top chart) so only the bottom chart shows date labels
     - `YAxis` showing question count
3. Wrap both charts in a flex column container so they align vertically

### Data shape (extended)
Each point in `chartData` will gain:
```text
{ date, count, rate, ma7, ma14, volumeMA14 }
```

`volumeMA14` = average of `count` over the previous 14 active days.

## Part B -- Daily Performance Report

### Approach
Add a "דוח יומי" section below the charts inside the same `LearningVelocityTile` component (both collapsed and expanded views).

### Implementation
1. From the `chartData` array, extract:
   - `todayRate`: accuracy of the last data point (today or most recent day)
   - `todayCount`: question count of today
   - `avg7Rate`: average accuracy of last 7 active days
   - `avg14Rate`: average accuracy of last 14 active days
   - `avg14Volume`: average count of last 14 active days
2. Render a styled section:
   - Three inline stats: "היום: X% | ממוצע 7 ימים: Y% | ממוצע 14 ימים: Z%"
   - Volume comparison: "שאלות היום: N | ממוצע 14 יום: M"
   - Auto-generated summary text with conditional logic:
     - `todayRate > avg14Rate` -> green text: "ביצועים מעל הממוצע היום"
     - `todayRate < avg14Rate` -> orange text: "ביצועים מתחת לממוצע -- המשך לתרגל"
     - `todayCount === 0` -> muted text: "עדיין לא תרגלת היום"
3. Show a condensed version in collapsed view, full version in expanded view

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/stats/LearningVelocityTile.tsx` | Extend `computeMovingAverages` to include `volumeMA14`; split chart into stacked accuracy line + volume bars; add daily report section below; import `BarChart, Bar, Cell` from recharts |

No changes needed to `useStatsData.ts` -- all required data (`count`, `rate`) is already present in the `DayPoint` interface passed to the component.

No database changes required.

