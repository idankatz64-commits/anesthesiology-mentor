

# Plan: Drill-Down Side Panel + TreeMap Toggle

## Feature 1: Side Panel Drill-Down for Personal Stats Cards

### How it works
When a user clicks on the "טעויות חוזרות", "שאלות שעדיין לא תוקנו", or "שאלות מתוקנות" cards, a right-side Sheet opens showing a topic breakdown table with a "Practice Now" button per topic.

### Data fetching
- Extend `useStatsData.ts` to fetch detailed per-question data: query `user_answers` with `question_id, topic, answered_count, correct_count, is_correct, ever_wrong` for the current user
- Store this as a `detailedAnswers` array in state, returned from the hook
- The drill-down component will group this data by topic and filter based on which card was clicked:
  - **Corrected**: `ever_wrong = true AND is_correct = true`
  - **Uncorrected**: `ever_wrong = true AND is_correct = false`
  - **Repeated errors**: `(answered_count - correct_count) > 1`

### New component: `PersonalStatsDrilldown.tsx`
- Location: `src/components/stats/PersonalStatsDrilldown.tsx`
- Props: `open`, `onOpenChange`, `metric` (which card), `detailedAnswers` array, `onPractice(topic, questionIds)`
- Uses the existing `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` components
- Renders a table with columns: Topic, Count, % of topic, Practice button
- Sorted by count descending
- Header dynamically shows which metric: "טעויות חוזרות" / "שאלות שעדיין לא תוקנו" / "שאלות מתוקנות"
- Practice button calls `startSession` with filtered questions for that topic

### StatsView.tsx changes
- Add state: `drilldownMetric` (null | 'corrected' | 'uncorrected' | 'repeatedErrors')
- Make the 3 relevant cards clickable with `cursor-pointer` and `onClick` to set the metric
- Render `PersonalStatsDrilldown` sheet at the bottom of the component
- Pass a handler that calls `startSession` with the filtered question IDs

## Feature 2: Toggle on Topic TreeMap

### How it works
A toggle button above the treemap switches between "הצג הכל" (default) and "טעויות חוזרות בלבד". When active, cells with repeated errors get a red pulsing border, the cell text changes to error count, and cells with zero errors are dimmed.

### Data flow
- `TopicTreemap` needs a new prop: `repeatedErrorsByTopic` -- a `Record<string, number>` mapping topic name to count of repeated-error questions
- This data is computed in `useStatsData.ts` from the same `detailedAnswers` array (group by topic, count where `(answered_count - correct_count) > 1`)
- Passed down from `StatsView` to `TopicTreemap`

### TopicTreemap.tsx changes
- Add local state: `showRepeatedOnly` (boolean, default false)
- Render a toggle button above the treemap (both collapsed and expanded views)
- When active: toggle button turns red (`bg-red-500 text-white`)
- Modify `treemapData` memo to include `repeatedErrors` count per topic from the prop
- Modify `CustomTreemapContent`:
  - When `showRepeatedOnly` is true, pass a flag via the data items
  - Cells with `repeatedErrors > 0`: add red pulsing border (`animate-pulse`, `border-2 border-red-500`), show "X טעויות חוזרות" instead of smartScore %
  - Cells with `repeatedErrors === 0`: render with `opacity: 0.3`
- Since `CustomTreemapContent` receives data via Recharts props, add `repeatedErrors` and `showRepeatedOnly` fields to each treemap data item so the content renderer can access them

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/stats/useStatsData.ts` | Fetch detailed answers array; compute `repeatedErrorsByTopic` map; return both |
| `src/components/stats/PersonalStatsDrilldown.tsx` | **New file** -- Sheet with topic breakdown table |
| `src/components/views/StatsView.tsx` | Add drilldown state, make 3 cards clickable, render sheet, pass `repeatedErrorsByTopic` to TreeMap |
| `src/components/stats/TopicTreemap.tsx` | Add toggle button, accept `repeatedErrorsByTopic` prop, modify cell rendering for filter mode |

## No database changes required

All data comes from the existing `user_answers` table which already has `topic`, `answered_count`, `correct_count`, `is_correct`, and `ever_wrong` columns.

