

# Fix Chapter Save to Also Update Miller and Topic Fields

## Problem
When an admin sets a chapter number (e.g., 14), only the `chapter` column is updated. The `miller` field stays "N/A" and the `topic` field stays "#N/A". This breaks topic-based statistics since 1,929 questions currently have "#N/A" as their topic.

## Solution
When saving a chapter number, also update two additional fields:
- **`miller`** -- set to the chapter number as a string (e.g., `"14"`)
- **`topic`** -- set to the chapter name from the MILLER_CHAPTERS mapping (e.g., `"Anesthesia for Cardiac Surgery"`)

This preserves the existing topic-based statistics structure while giving previously uncategorized questions a proper topic name.

## Changes

### File: `src/components/views/SessionView.tsx`
In the `saveChapter` logic (onBlur handler, ~line 668-672):
- Look up the chapter name from `MILLER_CHAPTERS` 
- Update the Supabase query to also set `miller` and `topic` alongside `chapter`
- Update the local `qData` mutation to reflect all three fields

```text
Before:  update({ chapter: chapterVal })
After:   update({ chapter: chapterVal, miller: String(chapterVal), topic: chapterName })
```

### Import Addition
- Import `MILLER_CHAPTERS` from `@/data/millerChapters` (already importing `getChapterDisplay` and `resolveChapterName` from there)

### No Database Changes
All three columns (`chapter`, `miller`, `topic`) already exist in the `questions` table.
