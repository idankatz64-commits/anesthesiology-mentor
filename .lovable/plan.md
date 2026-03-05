

# Plan: RichTextEditor for Question + Rich HTML Rendering

## Change 1: Replace `<textarea>` with `RichTextEditor`

**File:** `src/components/views/SessionView.tsx`  
**Lines 362-369** — Replace the `<textarea>` with:
```tsx
<RichTextEditor
  content={questionDraft}
  onChange={setQuestionDraft}
  placeholder="טקסט השאלה..."
  minHeight="80px"
/>
```

No other changes to the editing flow — save logic, answer inputs, cancel/save buttons all stay the same.

## Change 2: Render question text as rich HTML

**Line 429** — Replace the plain `<p>` tag:
```tsx
<p className="text-foreground text-lg leading-relaxed font-medium bidi-text flex-grow">{qData[KEYS.QUESTION]}</p>
```
With the existing `SmartContent` component (already defined in the same file):
```tsx
<div className="text-foreground text-lg leading-relaxed font-medium flex-grow">
  <SmartContent text={qData[KEYS.QUESTION]} />
</div>
```

This reuses the same HTML/Markdown-aware renderer used for explanations, so bold, lists, and links will render correctly.

## Files to modify

| File | Changes |
|------|---------|
| `src/components/views/SessionView.tsx` | Lines 362-369: textarea → RichTextEditor; Line 429: `<p>` → `<SmartContent>` |

No new dependencies. No database changes.

