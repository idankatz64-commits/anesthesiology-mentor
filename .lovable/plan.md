

# Migrate User Progress from localStorage to Supabase

## Problem
All user progress (history, favorites, notes, ratings, tags, weekly plan) is stored only in localStorage, making it device-specific. Switching devices or clearing browser data loses all progress.

## What stays in localStorage
- Theme preference (dark/light)
- Welcome modal dismissed flag

## What moves to Supabase

### New Tables Required

**1. `user_favorites`**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `question_id` (text, NOT NULL)
- `created_at` (timestamptz)
- Unique constraint on (user_id, question_id)
- RLS: users can only CRUD their own rows

**2. `user_notes`**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `question_id` (text, NOT NULL)
- `note_text` (text, NOT NULL)
- `updated_at` (timestamptz)
- Unique constraint on (user_id, question_id)
- RLS: users can only CRUD their own rows

**3. `user_ratings`**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `question_id` (text, NOT NULL)
- `rating` (text, NOT NULL) -- 'easy' | 'medium' | 'hard'
- `updated_at` (timestamptz)
- Unique constraint on (user_id, question_id)
- RLS: users can only CRUD their own rows

**4. `user_tags`**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL)
- `question_id` (text, NOT NULL)
- `tag` (text, NOT NULL)
- `created_at` (timestamptz)
- Unique constraint on (user_id, question_id, tag)
- RLS: users can only CRUD their own rows

**5. `user_weekly_plans`**
- `id` (uuid, PK)
- `user_id` (uuid, NOT NULL, UNIQUE)
- `plan_data` (jsonb, NOT NULL)
- `updated_at` (timestamptz)
- RLS: users can only CRUD their own rows

### Modify Existing Table
**`user_answers`** -- add `ever_wrong` (boolean, default false) column so we can reconstruct the full history object from Supabase.

## Implementation Plan

### Step 1: Create database tables and add column
Run a single migration creating all 5 new tables with RLS policies, plus adding `ever_wrong` to `user_answers`.

### Step 2: Rewrite AppContext.tsx hydration
- On mount, check for authenticated user
- If authenticated: fetch all progress data from Supabase (user_answers, user_favorites, user_notes, user_ratings, user_tags, user_weekly_plans) and build the `UserProgress` object from DB data
- If not authenticated: use empty `defaultProgress` (no localStorage fallback)
- Listen to `onAuthStateChange` to re-hydrate when user logs in

### Step 3: Rewrite each mutation to write to Supabase
Replace every `localStorage.setItem(LS_KEY, ...)` call with a Supabase upsert/insert/delete:

- **`updateHistory`**: Already calls `syncAnswerToDb` separately; merge them so `updateHistory` writes directly to `user_answers` (including `ever_wrong`), and also updates local state
- **`toggleFavorite`**: Insert/delete from `user_favorites`
- **`saveNote` / `deleteNote`**: Upsert/delete in `user_notes`
- **`setRating`**: Upsert in `user_ratings`
- **`addTag` / `removeTag`**: Insert/delete in `user_tags`
- **`generateWeeklyPlan`**: Upsert in `user_weekly_plans`
- **`resetAllData`**: Delete all user rows from all tables
- **`importData`**: Batch upsert into all tables
- **`saveProgress`**: Remove entirely (no longer needed)

### Step 4: Remove localStorage references for progress
- Remove `LS_KEY` usage for progress (keep for nothing -- it becomes unused)
- Remove the `saveProgress` callback and its localStorage write
- Keep theme and welcome_key in localStorage

### Step 5: Update dependent components
- `useStatsData.ts`: Already reads from `progress.history` via context -- no change needed since we hydrate the same shape from Supabase
- `NotebookView.tsx`: Already reads from `progress.notes` -- works as-is after hydration
- Any component using `progress.*` continues to work since the data shape is unchanged

## Technical Notes

- All Supabase writes are fire-and-forget with optimistic local state updates (write to state immediately, sync to DB in background)
- If user is not authenticated, mutations update local state only (in-memory, lost on refresh) -- this preserves the app working for non-logged-in users without persisting
- The `user_answers` table already has a unique constraint on (user_id, question_id), so upserts work naturally
- We fetch all user data in parallel on login for fast hydration
- The `progress` object shape (`UserProgress`) stays the same -- only the storage backend changes

