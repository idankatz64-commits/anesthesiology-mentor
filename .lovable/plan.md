

# Plan: Daily Progress Report Card

## Overview
Create a new `DailyReportTile` component that queries `user_answers` and `spaced_repetition` for today's data, and displays 4 compact stat tiles in a single row. Place it at the top of StatsView, right after the header.

## New File: `src/components/stats/DailyReportTile.tsx`

A self-contained component that:
1. On mount, runs two parallel queries:
   - `user_answers` where `user_id = current user` and `updated_at >= today 00:00 UTC` — to get today's questions count, accuracy, and distinct topics
   - `spaced_repetition` where `user_id = current user` and `next_review_date = tomorrow` — to get SRS due count
2. Computes:
   - **שאלות היום**: total row count
   - **דיוק**: `SUM(correct_count) / SUM(answered_count) * 100`, colored green/yellow/red
   - **נושאים**: `COUNT(DISTINCT topic)`
   - **SRS מחר**: row count from spaced_repetition
3. Renders a 4-column grid of compact cards using existing `bg-card border border-border rounded-xl` styling
4. Uses `AnimatedNumber` for values
5. Shows a loading skeleton briefly, then the data

## Modified File: `src/components/views/StatsView.tsx`

- Import `DailyReportTile`
- Add `<motion.div variants={itemVariants}><DailyReportTile /></motion.div>` immediately after the header block (before ROW 1 question bank status bar)

## No database changes. No new dependencies.

