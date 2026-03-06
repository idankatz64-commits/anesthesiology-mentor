

# Three Changes to Practice Setup Screen

## Summary
1. Restore the Tags (תיוג) filter dropdown
2. Remove the Difficulty (קושי) filter
3. Add Confidence (ביטחון) filter using data from the `spaced_repetition` table

No database changes needed — `spaced_repetition.confidence` already stores `confident`/`hesitant`/`guessed`.

## Changes

### 1. `src/lib/types.ts` — Update `MultiSelectState`
- Replace `difficulty` key with `confidence` in the `MultiSelectState` type.

### 2. `src/contexts/AppContext.tsx`
- Update `multiSelect` default state: replace `difficulty: new Set(['all'])` with `confidence: new Set(['all'])`.
- Update `resetFilters` similarly.
- Fetch `spaced_repetition` data (confidence per question) during hydration and store it in a new state/ref (e.g., `confidenceMap: Record<string, ConfidenceLevel>`).
- Update `getFilteredQuestions`: replace the `difficulty` filter logic with a `confidence` filter that checks the user's last confidence for each question from `spaced_repetition` data. Questions with no confidence data pass through (unfiltered).

### 3. `src/components/views/SetupView.tsx`
- **Remove** the Difficulty `MultiSelectDropdown`.
- **Add** Tags (`usertags`) `MultiSelectDropdown` — values derived from all unique tags in `progress.tags`.
- **Add** Confidence (`confidence`) `MultiSelectDropdown` with values `['confident', 'hesitant', 'guessed']` and Hebrew labels (✅ בטוח, 🤔 מתלבט, 🎲 ניחוש).
- Place Tags and Confidence in the grid row where Difficulty + Serial currently sit (move Serial elsewhere or keep it).

### 4. Display labels
The confidence `MultiSelectDropdown` will show Hebrew labels. We'll create a small label map for the dropdown items: `confident` → `✅ בטוח`, `hesitant` → `🤔 מתלבט`, `guessed` → `🎲 ניחוש`.

## Files to modify
| File | What |
|------|------|
| `src/lib/types.ts` | Replace `difficulty` with `confidence` in `MultiSelectState` |
| `src/contexts/AppContext.tsx` | Hydrate confidence data from `spaced_repetition`, update filter logic and defaults |
| `src/components/views/SetupView.tsx` | Remove Difficulty, add Tags + Confidence dropdowns |

