

# Fix N/A# Display — Add Unclassified Questions Banner

## Overview
The treemap already excludes `N/A#` from rendering (line 76 in TopicTreemap.tsx). The remaining work is to add a dedicated "unclassified questions" banner below the treemap that shows stats for these questions, with an admin-only "classify" button.

## Changes

### 1. Modify `TopicTreemap.tsx` — Accept and display unclassified banner

Add new props to `TopicTreemap`:
- `unclassifiedData`: `TopicStat | undefined` — the N/A# entry extracted from topicData
- `isAdmin`: `boolean` — controls whether the "classify" button appears

Below the treemap (inside both collapsed and expanded views), render a slim banner:
- **Style**: `bg-white/5 border border-dashed border-white/10 rounded-lg px-4 py-2.5 h-12 flex items-center justify-between`
- **Left side text** (RTL): `⚠️ שאלות ללא סיווג פרק: {count} שאלות | כיסוי: {coverage}% | דיוק: {accuracy}%`
- **Right side** (admin only): Small button "סווג שאלות" that navigates to `/admin`
- Only shown when unclassifiedData exists and has questions

### 2. Modify `StatsView.tsx` — Extract N/A# data and pass it down

- Import `useIsAdmin` hook
- Import `useNavigate` from react-router-dom
- Compute unclassified stats from `stats.topicData` by finding the entry where `topic` includes `N/A` or equals `#N/A`
- Pass `unclassifiedData` and `isAdmin` to `TopicTreemap`

### Technical Details

**Files to modify:**
| File | Change |
|------|--------|
| `src/components/stats/TopicTreemap.tsx` | Add unclassified banner below treemap in both collapsed/expanded views |
| `src/components/views/StatsView.tsx` | Extract N/A# data, pass isAdmin and unclassified stats to TopicTreemap |

**No new files or database changes needed.**

The `useIsAdmin` hook already exists at `src/hooks/useIsAdmin.ts` and returns a boolean. The navigate button will use `useNavigate()` from react-router-dom to go to `/admin`.
