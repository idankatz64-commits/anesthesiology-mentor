

# Fix: Daily Question Count — Track Individual Answer Attempts

## Problem
`user_answers` has one row per question (upserted). The daily count query counts rows by `updated_at`, so re-answering the same question doesn't create a new row — it just updates the existing one. A day with 60 answers but only 7 new questions shows "7".

## Solution

### 1. Create `answer_history` table (migration)
```sql
CREATE TABLE public.answer_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id text NOT NULL,
  topic text,
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.answer_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own answer_history" ON public.answer_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own answer_history" ON public.answer_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_answer_history_user_date ON public.answer_history (user_id, answered_at);
```

### 2. Insert into `answer_history` on every answer (`src/contexts/AppContext.tsx`)
In both `updateHistory` (line ~364) and `syncAnswerToDb` (line ~423), add a fire-and-forget insert after the existing upsert:
```typescript
supabase.from('answer_history').insert({
  user_id: userId,
  question_id: id,
  topic: topic || null,
  is_correct: isCorrect,
});
```

For `updateHistory`, the topic isn't available directly — we'll need to look it up from the current question data or pass it through.

### 3. Update `useStatsData.ts` daily data query (line ~96-106)
Change the 90-day query from `user_answers` to `answer_history`:
```typescript
supabase
  .from('answer_history')
  .select('answered_at, is_correct, topic')
  .eq('user_id', session.user.id)
  .gte('answered_at', startStr + 'T00:00:00Z'),
```
And update the bucketing to use `answered_at` instead of `updated_at`.

### Files to modify
| File | Change |
|------|--------|
| New migration | Create `answer_history` table with RLS |
| `src/contexts/AppContext.tsx` | Insert into `answer_history` alongside existing upserts (2 locations) |
| `src/components/stats/useStatsData.ts` | Query `answer_history` instead of `user_answers` for daily buckets |

