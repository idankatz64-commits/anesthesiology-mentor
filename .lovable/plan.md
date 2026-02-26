

# Rich Text Editor for Explanations and Personal Notes

## Overview
Replace plain `<textarea>` elements with a Tiptap-based rich text editor in two locations: the admin explanation editor and the personal notes field. Add a compact toolbar with Bold, Underline, Bullet List, Numbered List, and RTL/LTR toggle.

---

## 1. Install Tiptap Dependencies

Add packages:
- `@tiptap/react`
- `@tiptap/starter-kit` (includes bold, italic, lists, headings, etc.)
- `@tiptap/extension-underline`

Note: Text direction will be handled via a custom toolbar button that sets `dir` attribute, rather than `@tiptap/extension-text-direction` which doesn't exist as a standalone package. We'll use a simple `toggleAttribute` approach.

---

## 2. Create Reusable RichTextEditor Component

**New file: `src/components/RichTextEditor.tsx`**

A reusable component that wraps Tiptap's `useEditor` and `EditorContent`:

- **Props**: `content: string`, `onChange: (html: string) => void`, `placeholder?: string`, `minHeight?: string`, `editable?: boolean`
- **Toolbar** (shown only when `editable`): 5 buttons styled to match dark theme
  - **B** -- Toggle bold (`Ctrl+B`)
  - **U** -- Toggle underline (`Ctrl+U`)
  - Bullet list icon
  - Numbered list icon
  - RTL/LTR toggle button (sets `dir` attribute on the editor root)
- Active buttons get a highlighted state (e.g., `bg-primary/20 text-primary`)
- Editor content area styled with `bg-muted border border-border rounded-xl` to match existing textarea styles
- On content change, calls `onChange` with the HTML string

---

## 3. Integrate into Admin Explanation Editor

**Modified file: `src/components/views/SessionView.tsx`**

Replace the `<textarea>` at lines 576-581 with the `RichTextEditor` component:
- Pass `explanationDraft` as initial content
- On change, update `explanationDraft` state
- Save button sends HTML string to Supabase `explanation` column (same as before)
- In read-only mode, render explanation HTML using `dangerouslySetInnerHTML` instead of the current `ExplanationRenderer` (which handles markdown). We'll keep `ExplanationRenderer` as a fallback for legacy plain-text explanations by detecting if content contains HTML tags.

---

## 4. Integrate into Personal Notes Field

**Modified file: `src/components/views/SessionView.tsx`**

Replace the notes `<textarea>` at lines 447-452 with `RichTextEditor`:
- Pass `noteText` as initial content
- On change, call `saveNote(serialNumber, html)`
- Notes are saved as HTML strings to the existing progress store

**Modified file: `src/components/views/NotebookView.tsx`**

Update the note display at line 70-72 to render HTML:
- Replace `{progress.notes[id]}` with `dangerouslySetInnerHTML={{ __html: progress.notes[id] }}`
- Keep the existing styling classes

---

## 5. Smart Rendering for Mixed Content

Since existing explanations are plain text (some with markdown), the read-only renderer will:
- Check if content contains HTML tags (`<p>`, `<strong>`, `<ul>`, etc.)
- If HTML: render with `dangerouslySetInnerHTML`
- If plain text: use existing `ExplanationRenderer` (markdown-based)

This ensures backward compatibility with all existing content.

---

## Technical Details

### Files to Create
| File | Purpose |
|------|---------|
| `src/components/RichTextEditor.tsx` | Reusable Tiptap editor with toolbar |

### Files to Modify
| File | Change |
|------|--------|
| `src/components/views/SessionView.tsx` | Replace textareas with RichTextEditor for explanation and notes |
| `src/components/views/NotebookView.tsx` | Render notes as HTML |
| `src/components/views/ResultsView.tsx` | Render explanation HTML in results |

### No Database Changes Required
Explanation and notes fields already store strings. HTML strings are fully compatible.

