

## Plan: Update Explanation Section Header Colors

### Changes in `src/components/views/SessionView.tsx`

**1. SECTION_COLORS palette update:**
- **First item (index 0)**: Change from red to amber/orange — border, header bg, glow, accent, iconBg all shift to amber/orange tones
- **Last item (index 5, rose)**: Change to red — keep as-is or adjust to match the existing red style (it's already rose/red, but we'll make it clearly red to match the "last section = red" request)
- Swap: Move the current amber entry (index 3) to index 0, and put red at index 5 (last position)

**2. Header text color — theme-aware:**
- Currently headers use colored text like `text-red-400`, `text-sky-400` etc.
- Change header text to: `text-black font-bold dark:text-white` (or detect via the existing theme approach)
- Since the app doesn't use Tailwind `dark:` prefix (it uses a `.light` class), we'll apply conditional classes. The `header` field in SECTION_COLORS will keep the background gradient but remove the colored text class. Instead, in the JSX where the `<h4>` is rendered (line 1046), we'll add `text-black dark:text-white` or use the existing `useIsDark` pattern to set text color.

**3. Specific JSX change (line 1046):**
- The `<h4>` already has `font-black`. We'll add a theme-aware text color class. Since the project uses a `light` class on `<html>`, we can do: remove text color from `color.header` and set the h4 to use `text-white` by default (dark mode) and `.light &` → `text-black`. Simplest approach: use inline or a utility class that respects the theme.

### Summary of reordered SECTION_COLORS:
| Index | Color | Usage |
|-------|-------|-------|
| 0 | Amber/Orange (was index 3) | First section |
| 1 | Sky | — |
| 2 | Violet | — |
| 3 | Cyan (was index 4) | — |
| 4 | Rose (was index 5) | — |
| 5 | Red (was index 0) | Last section |

### Files to edit:
- `src/components/views/SessionView.tsx` — reorder SECTION_COLORS array + update h4 text color logic

