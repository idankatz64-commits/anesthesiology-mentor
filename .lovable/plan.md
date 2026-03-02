

# Bug Fix: Study Room Question Screen -- Missing Data

## Problem
The question screen in StudyRoomView shows empty answer options and is missing explanation rendering, topic/chapter metadata, and difficulty rating. The root cause is a timing issue: the study room can enter the question phase before the full `data` array (3000+ questions) has finished loading from the cache/database.

## Root Cause Analysis
- `currentQuestion` (line 48) does `data.find(q => q[KEYS.ID] === qId)` -- if `data` is still empty (loading), this returns `null`/`undefined`
- Even when `data` is loaded, the question screen is missing topic, chapter, Miller, and difficulty metadata that SessionView shows
- Explanation uses plain `whitespace-pre-wrap` instead of the `SmartContent` renderer that handles HTML and links

## Fix Plan

### 1. Fetch full questions from Supabase when room loads (StudyRoomView.tsx)

Add a new state `roomQuestions` (type `Question[]`) that stores the full question objects fetched directly from the database using:
```
supabase.from('questions').select('*').in('id', questionIds)
```

After fetching, sort the results to match the original `question_ids` order. Map the raw Supabase rows to the `Question` type using the same KEYS mapping as `csvService.ts`.

Replace the `currentQuestion` memo to use `roomQuestions[currentIndex]` instead of searching through `data`.

### 2. Add topic/chapter/Miller metadata to question screen

Add a metadata bar above the question text (matching SessionView style):
- Topic badge with folder icon
- Year badge
- Miller chapter display using `getChapterDisplay()`
- Question ID and serial number header

### 3. Improve explanation rendering after reveal

Replace the plain `<p>` explanation with the `SmartContent` component (imported from SessionView) that properly renders HTML content, Markdown links, and external link icons.

### 4. Add question data to results screen

The results table already uses `data.find()` -- update it to use `roomQuestions` for consistent rendering regardless of whether `data` has loaded.

## Files to Modify

**`src/components/views/StudyRoomView.tsx`**:
- Add `roomQuestions` state (`Question[]`)
- Add `useEffect` to fetch questions from Supabase when `questionIds` changes (with KEYS mapping and order preservation)
- Update `currentQuestion` memo to use `roomQuestions`
- Import `getChapterDisplay` from millerChapters
- Import or inline `SmartContent`/`ExplanationRenderer` from SessionView
- Add metadata bar (topic, year, chapter) to question card
- Use `SmartContent` for explanation rendering
- Update results table to use `roomQuestions`

