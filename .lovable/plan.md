
## Export Questions to CSV

Adding a CSV export button to the Question Editor page that downloads all questions from the database.

### What will happen
- A new "Export CSV" button will appear next to the search/filter bar in the Question Editor
- Clicking it will fetch **all** questions from the database (using batched queries to handle the 1000-row limit)
- The data will be converted to CSV format using PapaParse (already installed) and downloaded as a file
- A loading spinner will show during the export process

### Technical Details

**File: `src/components/admin/QuestionEditorTab.tsx`**

1. Add `Download` icon import from lucide-react
2. Add `Papa` import from papaparse
3. Add an `exporting` state variable
4. Add an `handleExport` async function that:
   - Fetches all questions in batches of 1000 (same pattern as `csvService.ts`)
   - Uses `Papa.unparse()` to convert to CSV string
   - Creates a Blob and triggers a browser download with filename `questions_export_YYYY-MM-DD.csv`
   - Shows toast on success/error
5. Add an "Export CSV" button in the filters row (next to the topic dropdown)

The export will include all columns: id, ref_id, question, a, b, c, d, correct, explanation, topic, year, source, kind, miller, chapter, media_type, media_link.
