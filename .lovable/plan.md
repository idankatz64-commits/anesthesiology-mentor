

# Execution Plan: Wire Auth + Permissions

## 1. Auth hydration in AppContext.tsx
- Add `isAdmin` and `isEditor` state
- Query `admin_users` in `hydrateUser` after setting `userIdRef`
- Reset on logout
- Add to `AppContextType` interface and context value

## 2. Remove answer_history inserts (lines 374-381, 443-449)
- Delete both `answer_history` insert blocks

## 3. Question edit log in QuestionEditorTab.tsx (after line 323)
- Fire-and-forget insert to `question_edit_log`

## 4. useStatsData.ts — switch from answer_history to user_answers
- Query `user_answers` with `updated_at` and `topic`
- Update bucketing to use `updated_at`

## 5. SM-2 rewrite in AppContext.tsx (lines 394-414)
- Fetch existing row, compute SM-2, upsert with `interval_days`, `ease_factor`, `repetitions`

No migrations needed.

