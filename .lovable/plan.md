

# Plan: Sidebar Collapse Toggle + Wider Content Area

## 1. Sidebar Collapse Toggle

**File: `src/components/Sidebar.tsx`**

- Add `collapsed` state, initialized from `localStorage.getItem('sidebar-collapsed')`, synced back on change
- Toggle button: a `ChevronRight`/`ChevronLeft` icon button positioned at the left edge of the sidebar (absolute, vertically centered)
- When collapsed:
  - Sidebar width shrinks from `w-72` to `w-16`
  - Header hides text, shows only the Heart icon
  - Nav items hide labels, show only icons (centered)
  - Footer hides all text labels and progress bar, shows only icons
  - Active indicator still works via `layoutId`
- Animate width transition with `transition-all duration-300`
- Keep `hidden md:flex` — mobile unchanged

**File: `src/pages/Index.tsx`**

- No changes needed — `flex-grow` on `<main>` already fills remaining space automatically

## 2. Wider Content Area

**File: `src/pages/Index.tsx`**

- Wrap the `renderView()` content in a `max-w-5xl mx-auto` container inside `<main>` so content can spread wider on large screens while staying centered
- Only applies to the inner content div, not the main element itself (which should remain full-width for background)

## Files to modify

| File | Changes |
|------|---------|
| `src/components/Sidebar.tsx` | Add collapsed state + localStorage, toggle button, conditional icon-only mode |
| `src/pages/Index.tsx` | Add `max-w-5xl mx-auto` wrapper around view content |

No database changes. No new dependencies.

