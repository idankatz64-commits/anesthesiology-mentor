

# Plan: Full Question Editor + Hyperlink Support

## Feature 1: Full Question Editor (Admin Only)

### SessionView.tsx changes

**New state variables** (reset on `index` change, same pattern as `chapterDraft`):
- `editingQuestion` (boolean)
- `questionDraft` (string) — for question text
- `answersDraft` (`{A: string, B: string, C: string, D: string}`)
- `savingQuestion` (boolean)

**UI**: Add a pencil icon next to the question text at line 352, guarded by `isAdmin && !editingQuestion`. When clicked:
- Replace `<p>` question text with a `<textarea>` (plain, RTL, dark-themed, ~4 rows)
- Replace the 4 answer buttons with 4 labeled `<input type="text">` fields (A/B/C/D)
- Show Cancel + Save buttons

**Save handler**: Single `.update()` call:
```typescript
supabase.from('questions').update({
  question: questionDraft,
  a: answersDraft.A, b: answersDraft.B,
  c: answersDraft.C, d: answersDraft.D,
  manually_edited: true
}).eq('id', serialNumber)
```
On success: mutate `qData` in-place, invalidate `questions_cache`, show toast. On error: show error toast.

## Feature 2: Hyperlink Support in RichTextEditor

### New dependency
- `@tiptap/extension-link`

### RichTextEditor.tsx changes
- Import `Link` from `@tiptap/extension-link` and `Link2` icon from lucide-react
- Add `Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } })` to extensions
- Add a Link toolbar button: if text selected, `window.prompt` for URL, then `editor.chain().focus().setLink({ href })`. If already on a link, `unlink()`.

### Auto-detection of URLs
Already handled by `ExplanationRenderer` and `SmartContent` — no changes needed for rendering. The `autolink: true` config handles detection inside the editor.

## Files to modify

| File | Changes |
|------|---------|
| `src/components/views/SessionView.tsx` | Add question editing state, pencil icon on question text, inline textarea + 4 inputs + save/cancel |
| `src/components/RichTextEditor.tsx` | Add `@tiptap/extension-link`, link toolbar button |

No database changes required.

