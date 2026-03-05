

# Fix RichTextEditor Bullet Lists + Tab Indentation

## 1. Fix bullet rendering (CSS)

**File: `src/index.css`** — Add scoped styles for TipTap editor content so `ul`/`ol` render properly in both LTR and RTL:

```css
/* TipTap editor list fixes */
.ProseMirror ul { list-style-type: disc; padding-left: 1.5rem; }
.ProseMirror ol { list-style-type: decimal; padding-left: 1.5rem; }
.ProseMirror[dir="rtl"] ul,
.ProseMirror[dir="rtl"] ol { padding-left: 0; padding-right: 1.5rem; }
.ProseMirror li { display: list-item; }
.ProseMirror ul ul { list-style-type: circle; }
.ProseMirror ul ul ul { list-style-type: square; }
```

## 2. Add Tab/Shift+Tab for nested lists

**File: `src/components/RichTextEditor.tsx`** — Add `handleKeyDown` via `editorProps` to intercept Tab and Shift+Tab:

```typescript
editorProps: {
  handleKeyDown: (view, event) => {
    if (event.key === 'Tab') {
      if (event.shiftKey) {
        editor?.chain().focus().liftListItem('listItem').run();
      } else {
        editor?.chain().focus().sinkListItem('listItem').run();
      }
      event.preventDefault();
      return true;
    }
    return false;
  },
  // ... existing attributes
}
```

Note: `handleKeyDown` must be included in both the initial `useEditor` config and the `setOptions` call in the RTL toggle effect.

## Files

| File | Change |
|------|--------|
| `src/index.css` | Add `.ProseMirror` list styles with RTL support + nested list styles |
| `src/components/RichTextEditor.tsx` | Add `handleKeyDown` for Tab/Shift+Tab list indentation |

No new dependencies. No database changes.

