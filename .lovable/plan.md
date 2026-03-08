

## Bug + Redesign: Editor Report

### Bug: Missing Data

**Root cause found.** In `QuestionEditorTab.tsx` line 330, the save handler inserts into `question_audit_log` instead of `question_edit_log`. That's why almost no rows appear in the editor report -- edits go to the wrong table.

**Fix:** Change the fire-and-forget insert (lines 326-338) to write to `question_edit_log` with the correct columns: `editor_id`, `question_id`, `fields_changed` (as text array), `action: 'update'`.

### Redesign: EditorActivityTab.tsx

Replace the current multi-section layout with a simpler, more useful design:

**1. Editor Summary Table** (one row per editor):
| עורך | עריכות היום | סה"כ עריכות | נושאים שנערכו היום |
|------|------------|------------|-------------------|
| email | count | all-time count | comma-separated topic list |

- Data: `question_edit_log` (all time, no 7-day filter) joined with `admin_users` for email and `questions` for topic.
- "Today" = `edited_at >= today 00:00 UTC`.
- Topics today = distinct topics from today's edits.

**2. 7-Day Bar Chart** (keep existing, enhance tooltip):
- X: date, Y: total edits.
- Tooltip: show comma-separated list of topics edited that day.

**3. Remove** the topic breakdown table, fields changed bars, and recent edits sections (replaced by the enriched summary table and tooltip).

### Notification Improvement (AppContext.tsx)

Update the realtime toast (line 240-243) to also fetch the question's topic and show:
- שאלה מספר {question_id}
- נושא: {topic}
- נערך על ידי: {editor_email}

### Files Changed
1. `src/components/admin/QuestionEditorTab.tsx` -- fix insert target table
2. `src/components/admin/EditorActivityTab.tsx` -- full redesign
3. `src/contexts/AppContext.tsx` -- improve notification toast

