

# Fix Bullet List Rendering in Display Mode

The rendered HTML content uses `markdown-content` class (in SessionView, StudyRoomView) and bare `bidi-text` (in NotebookView, ResultsView). The `.ProseMirror` CSS only applies inside the editor, not these display containers.

## Approach

Add a shared `.rich-content` class with list styles in `src/index.css`, then apply it to all `dangerouslySetInnerHTML` containers.

### 1. `src/index.css` — Add `.rich-content` list styles (after existing `.ProseMirror` rules)

```css
/* Rendered rich-text content (display mode) */
.rich-content ul { list-style-type: disc; padding-right: 1.5rem; }
.rich-content ol { list-style-type: decimal; padding-right: 1.5rem; }
.rich-content li { display: list-item; }
.rich-content ul ul { list-style-type: circle; }
.rich-content ul ul ul { list-style-type: square; }
```

### 2. Add `rich-content` class to all 4 render containers

| File | Line | Current class | Add |
|------|------|--------------|-----|
| `src/components/views/SessionView.tsx` | ~29 | `markdown-content bidi-text ...` | `rich-content` |
| `src/components/views/ResultsView.tsx` | ~42 | `text-sm text-foreground bidi-text ...` | `rich-content` |
| `src/components/views/StudyRoomView.tsx` | ~24 | `markdown-content bidi-text ...` | `rich-content` |
| `src/components/views/NotebookView.tsx` | ~71 | `bg-muted/50 ... bidi-text` | `rich-content` |

5 files modified total. No new dependencies. No database changes.

