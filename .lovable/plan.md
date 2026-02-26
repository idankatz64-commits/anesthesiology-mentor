

# Admin Feature: Chapter Number Auto-Complete with Miller's 10th Edition Lookup

## Overview
Add a Miller's 10th Edition chapter lookup system that auto-resolves chapter numbers to full chapter names. This includes an inline chapter editor during practice sessions (for admins), enhanced chapter display across the app, and a batch update tool in the Admin Dashboard.

---

## 1. Create Miller Chapters Data File

**New file: `src/data/millerChapters.ts`**

- Export `MILLER_CHAPTERS: Record<number, string>` with all 87 chapters from Miller's Anesthesia 10th Edition
- Export `MILLER_CHAPTER_NAMES: Record<string, string>` for special text-based entries (e.g., "ACLS")
- Export a helper function `getChapterDisplay(chapter: number | string | null): string` that returns:
  - `"N/A"` for null/undefined/0
  - `"Ch. {N} -- {Name}"` for valid numbers 1-87
  - The text value for special entries like "ACLS"
  - `"Chapter not found"` for invalid numbers

---

## 2. Inline Chapter Editor in Practice/Exam Sessions (Admin Only)

**Modified file: `src/components/views/SessionView.tsx`**

In the feedback section (line ~610), next to the existing "Miller Page" link, add an admin-only inline chapter editor:

- Small input field (~60px wide) pre-filled with the current chapter number
- As the admin types a valid number (1-87): instantly show the resolved chapter name in muted text beside the input
- If number is invalid: show "chapter not found" in red
- Accept "ACLS" as text input, resolving to "ACLS"
- On blur or Enter: save the chapter number to the `questions` table via Supabase
- Show a brief checkmark indicator on successful save
- Update `qData[KEYS.CHAPTER]` locally so the change is visible immediately

New state variables: `editingChapter`, `chapterDraft`, `savingChapter`

---

## 3. Enhanced Chapter Display Across the App

**Helper usage via `getChapterDisplay()`:**

Replace raw chapter number display in these locations:

- **SessionView.tsx** (meta bar, ~line 291): Add chapter display next to topic/year
- **QuestionEditorTab.tsx** (edit dialog): Add chapter name preview next to chapter input field
- **HeatmapGrid / useStatsData.ts** (chapter coverage): Show chapter names in tooltips
- **ResultsView / ReviewView**: Show chapter name if chapter data is displayed

The pattern is: wherever `chapter` is shown, use `getChapterDisplay(q.chapter)` to render the full name.

---

## 4. Admin Dashboard: Batch Chapter Update Tab

**Modified file: `src/components/admin/QuestionEditorTab.tsx`**

Add a "Update Chapters" section (collapsible) at the top of the Question Editor tab:

- Filter to show only questions where `chapter IS NULL OR chapter = 0`
- Table columns: Question ID | Question preview (truncated) | Chapter input | Auto-resolved name | Save button
- Each row has a small number input that auto-resolves the chapter name as the admin types
- Individual save button per row that updates the `questions` table
- "Save All" button at the bottom to batch-update all modified rows in a single pass
- Success/error toast notifications for each operation

---

## Technical Details

### Files to Create
| File | Purpose |
|------|---------|
| `src/data/millerChapters.ts` | Chapter lookup data + helper function |

### Files to Modify
| File | Change |
|------|--------|
| `src/components/views/SessionView.tsx` | Add inline chapter editor in feedback section + chapter display in meta bar |
| `src/components/admin/QuestionEditorTab.tsx` | Add chapter name preview in edit dialog + batch update section |
| `src/components/stats/useStatsData.ts` | Use chapter names in coverage data |

### No Database Changes Required
The `questions` table already has a `chapter` column (integer, nullable, default 0). All updates use the existing admin RLS policies.

