

# 3 UI Improvements Plan (Updated)

## Improvement 1: Larger Modals

Update base Dialog, AlertDialog, and Sheet components to use larger default sizes with scrollable content.

**Files to modify:**

1. **`src/components/ui/dialog.tsx`** -- Change `DialogContent` default classes:
   - Replace `max-w-lg` with `max-w-[90vw]`
   - Add `max-h-[90vh] overflow-y-auto`

2. **`src/components/ui/alert-dialog.tsx`** -- Change `AlertDialogContent` default classes:
   - Replace `max-w-lg` with `max-w-[90vw]`
   - Add `max-h-[90vh] overflow-y-auto`

3. **`src/components/ui/sheet.tsx`** -- Add `max-h-[90vh] overflow-y-auto` to SheetContent; for side sheets add `max-w-[90vw]`

4. **`src/components/stats/AnimatedStatsTile.tsx`** -- Replace `max-w-4xl` with `max-w-[90vw]` and `max-h-[85vh]` with `max-h-[90vh]`

---

## Improvement 2: Topic TreeMap Full Screen

Make the TopicTreemap expanded view fill the viewport at 95vw x 95vh.

**Files to modify:**

1. **`src/components/stats/AnimatedStatsTile.tsx`** -- Add optional `expandedClassName` prop that overrides default modal sizing. Default remains `max-w-[90vw] max-h-[90vh]`.

2. **`src/components/stats/TopicTreemap.tsx`** -- Pass `expandedClassName="max-w-[95vw] max-h-[95vh]"` to AnimatedStatsTile. Increase treemap container height to `calc(95vh - 120px)`. Increase font sizes in `CustomTreemapContent`: name font from `Math.min(11, width/8)` to `Math.min(14, width/6)`, score font from `9` to `11`. Relax text truncation threshold from `width/7` to `width/5`. Lower `showText` threshold from `width > 50 && height > 30` to `width > 40 && height > 25`.

---

## Improvement 3: Institution Badge on Question Header

No database changes needed -- the existing `source` column stores institution data.

**Files to modify:**

1. **`src/components/views/SessionView.tsx`** -- Add institution badge to the meta bar after the year badge, using the **same CSS classes** as the existing topic and year badges (same background, text color, padding, rounded corners, font size). Content: institution icon + `qData[KEYS.SOURCE]`, shown only when value exists and is not `'N/A'`.

2. **`src/components/views/StudyRoomView.tsx`** -- Add matching institution badge to the study room question meta bar, same style.

3. **`src/components/admin/QuestionEditorTab.tsx`** -- Rename the label on the source input field from "מקור" to "מוסד (Institution)".

---

## Summary of All File Changes

| File | Changes |
|------|---------|
| `src/components/ui/dialog.tsx` | max-w-[90vw], max-h-[90vh], overflow-y-auto |
| `src/components/ui/alert-dialog.tsx` | Same as dialog |
| `src/components/ui/sheet.tsx` | Add overflow and max sizing |
| `src/components/stats/AnimatedStatsTile.tsx` | Add expandedClassName prop, update defaults to 90vw/90vh |
| `src/components/stats/TopicTreemap.tsx` | Pass 95vw/95vh, increase fonts and height |
| `src/components/views/SessionView.tsx` | Add institution badge with matching topic/year badge styling |
| `src/components/views/StudyRoomView.tsx` | Add institution badge with matching styling |
| `src/components/admin/QuestionEditorTab.tsx` | Rename label from "מקור" to "מוסד (Institution)" |

No database migrations required.

