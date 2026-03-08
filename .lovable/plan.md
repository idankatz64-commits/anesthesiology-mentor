

## Investigation Results

**The `user_answers` table is NOT empty** — it has 1,612 rows with recent writes from today. The app IS writing correctly.

**Why you see 0 rows in the Cloud SQL editor**: The SQL editor runs without an authenticated user session, so the RLS policy `auth.uid() = user_id` blocks all rows. This is expected and correct security behavior.

**However, there is a real bug**: 1,484 of 1,612 rows have `topic = NULL` because `updateHistory()` (the main write path from SessionView, ResultsView, FlashcardView) does not include the `topic` field. Only `syncAnswerToDb()` (called only from StudyRoomView) writes the topic. This means:
- DailyReportTile's "distinct topics" counter always shows 0
- Any topic-based stats from `user_answers` are broken

## Plan

### 1. Fix `updateHistory` in AppContext.tsx to include `topic`
- Add an optional `topic` parameter to `updateHistory(id, isCorrect, topic?)`
- Pass it into the `user_answers` upsert (line 409-417)

### 2. Update all callers to pass topic
- **SessionView.tsx** (line 167, 224): pass `q[KEYS.TOPIC]`
- **ResultsView.tsx** (line 82): pass `q[KEYS.TOPIC]`
- **FlashcardView.tsx** (line 103): pass `current[KEYS.TOPIC]`
- **StudyRoomView.tsx** (line 341): pass `currentQuestion[KEYS.TOPIC]` (already calls `syncAnswerToDb` with topic separately, but should also pass to `updateHistory`)

### 3. Backfill existing null topics
- Run a SQL migration that updates `user_answers` rows where `topic IS NULL` by joining on the `questions` table to fill in the correct topic

### 4. Update the `updateHistory` type in AppContext interface
- Change signature from `(id: string, isCorrect: boolean) => void` to `(id: string, isCorrect: boolean, topic?: string) => void`

No schema changes needed. No new dependencies.

