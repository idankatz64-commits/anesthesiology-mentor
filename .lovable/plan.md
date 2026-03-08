

## Enhanced Editor Activity Report

### Problem
The current report only shows raw edit counts per editor and a 7-day bar chart. It lacks meaningful breakdown -- no visibility into **what topics** were edited, **which fields** changed, or **unique questions** vs repeated edits on the same question.

### Plan

Enhance `EditorActivityTab.tsx` with three additional sections:

**1. Fix the editor summary table** -- add "unique questions edited" column (currently counts every log row, even multiple edits to the same question). Fetch `question_id` alongside `editor_id, edited_at` from `question_edit_log`.

**2. Add "Edits by Topic" breakdown table**
- Join `question_edit_log.question_id` with `questions.topic` client-side (fetch questions' id+topic)
- Show a sorted table: Topic | Edits Count | Unique Questions
- Helps identify which content areas are getting attention

**3. Add "Fields Changed" breakdown**
- Use `fields_changed` array from `question_edit_log` to tally which fields are edited most (question text, explanation, options, correct answer)
- Show as a small horizontal bar chart or simple list

**4. Add "Recent Edits" log**
- Show last 20 edits with: editor email, question ID, fields changed, timestamp
- Quick audit trail

### Technical Changes

**Single file**: `src/components/admin/EditorActivityTab.tsx`

- Expand the Supabase query to include `question_id, fields_changed` from `question_edit_log`
- Fetch `questions` table (id, topic) to build a topic lookup map
- Add 3 new sections below the existing chart:
  1. Topic breakdown table (sorted by edit count desc)
  2. Fields changed summary
  3. Recent edits log
- Keep existing editor summary table and 7-day chart intact but fix unique question count

No database changes needed -- all data already exists in `question_edit_log`.

