
# iOS-style Animations — Full App Implementation

## Overview
Add a comprehensive framer-motion animation system across the entire app: page transitions, card stagger effects, tap feedback, question session animations, iOS-style modal sheets, sidebar/nav animations, and micro-interactions. framer-motion is already installed.

---

## Phase 1 — Animation Foundation

### New file: `src/lib/animations.ts`
- Export all spring configs (`spring`, `springGentle`, `springBouncy`)
- Export animation variants: `fadeUp`, `scaleIn`, `slideFromRight`, `staggerContainer`
- Export a `useReducedMotion` hook that checks `prefers-reduced-motion` and returns zero-duration overrides

### `src/App.tsx`
- Wrap `<Routes>` in `<AnimatePresence mode="wait">`
- No changes to route definitions

---

## Phase 2 — Page Transitions

### `src/pages/Index.tsx`
- Wrap the view-switching section in `<AnimatePresence mode="wait">`
- Each view gets a `<motion.div key={currentView}>` wrapper with `slideFromRight` variants
- Outgoing view slides left + fades; incoming slides from right

### `src/pages/Auth.tsx`, `src/pages/AdminDashboard.tsx`
- Wrap root element in `motion.div` with `fadeUp` variants

---

## Phase 3 — Home Page Cards

### `src/components/views/HomeView.tsx`
- Wrap the cards grid in `motion.div` with `staggerContainer` variants
- Each card becomes `motion.div` with `fadeUp` + stagger (70ms apart)
- Add `whileHover={{ scale: 1.02 }}` and `whileTap={{ scale: 0.97 }}` to every clickable card
- Add `style={{ willChange: 'transform' }}` for GPU acceleration

---

## Phase 4 — Question Session Animations

### `src/components/views/SessionView.tsx`
- Wrap the question card area in `<AnimatePresence mode="wait">`
- Each question gets `<motion.div key={index}>` with `slideFromRight` variant
- Answer selection feedback:
  - Correct: animate `scale(1.03)` + green border flash via a small state-driven `motion.div`
  - Wrong: shake animation using `motion.div animate={{ x: [0, -8, 8, -6, 6, 0] }}` with 400ms duration
  - Unselected: `animate={{ opacity: 0.4 }}` transition
- Explanation panel: `motion.div` with `initial={{ opacity: 0, y: 60 }}` and `springGentle`
- Progress bar: replace inner div with `motion.div` using `layout` prop for smooth width transitions

---

## Phase 5 — Modals & Overlays

### `src/components/WelcomeModal.tsx`
- Backdrop: `motion.div` fade in/out
- Panel: slide up from `y: "100%"` with `springGentle`, exit back down
- Add drag-to-dismiss: `drag="y"`, `dragConstraints={{ top: 0 }}`, close on `offset.y > 100`

### `src/components/FeedbackModal.tsx`
- Same iOS sheet pattern: backdrop fade + panel slide-up + drag-to-dismiss

### `src/components/stats/AnimatedStatsTile.tsx`
- Already uses `layoutId` and framer-motion — verify `willChange: 'transform'` is set
- Add drag-to-dismiss on the expanded overlay

---

## Phase 6 — Sidebar & Navigation

### `src/components/Sidebar.tsx`
- Nav items: on hover, animate `x: -4` (RTL, so shifts right visually) + bg fade
- Active indicator: add a `motion.div` with `layoutId="sidebar-active"` that slides between nav items as a background highlight

### `src/components/MobileBottomNav.tsx`
- Add `motion.div` with `layoutId="tab-indicator"` for the active tab background — slides horizontally between tabs

### Mobile sidebar (if applicable via MobileHeader):
- Animate open/close with `initial={{ x: "100%" }}` (RTL) / `animate={{ x: 0 }}`

---

## Phase 7 — Micro-interactions

### `src/components/ui/button.tsx`
- Wrap the rendered element in `motion.button` / `motion.div` (when not `asChild`)
- Add `whileTap={{ scale: 0.96 }}` and `whileHover={{ scale: 1.01 }}`
- Skip animation when `asChild` is true (can't wrap Slot in motion)

### Count-up animation for KPI numbers
- Create a small `AnimatedNumber` component using `useMotionValue`, `useSpring`, `useTransform`
- Duration ~1200ms with `springGentle`
- Use in `StatsView.tsx` for the status bar numbers and in `ERITile.tsx` for the ERI value

### Loading states
- Create `AnimatedSkeleton` component: `motion.div` with `animate={{ opacity: [0.4, 0.8, 0.4] }}` and `repeat: Infinity`
- Replace the main loading spinner in `Index.tsx` with a pulsing skeleton

---

## Phase 8 — Performance & Polish

### GPU acceleration
- All animated cards/modals get `style={{ willChange: 'transform' }}`

### Reduced motion
- `useReducedMotion` hook in `animations.ts` checks `prefers-reduced-motion`
- When true: all spring durations become 0, disabling physics
- Apply at the top level in `Index.tsx` and pass down or use per-component

### No layout shift
- Add explicit `min-height` to animated containers (question card area, home cards grid, stats tiles)

---

## Files Summary

| File | Action |
|------|--------|
| `src/lib/animations.ts` | **New** — central animation config + hooks |
| `src/App.tsx` | Add AnimatePresence around Routes |
| `src/pages/Index.tsx` | AnimatePresence for view switching, loading skeleton |
| `src/pages/Auth.tsx` | Page entrance animation |
| `src/pages/AdminDashboard.tsx` | Page entrance animation |
| `src/components/views/HomeView.tsx` | Stagger cards, tap/hover feedback |
| `src/components/views/SessionView.tsx` | Question slide, answer feedback, progress bar layout animation |
| `src/components/WelcomeModal.tsx` | iOS sheet slide-up + drag dismiss |
| `src/components/FeedbackModal.tsx` | iOS sheet slide-up + drag dismiss |
| `src/components/stats/AnimatedStatsTile.tsx` | Add drag dismiss + willChange |
| `src/components/Sidebar.tsx` | Active indicator layoutId, hover animations |
| `src/components/MobileBottomNav.tsx` | Tab indicator layoutId |
| `src/components/ui/button.tsx` | whileTap/whileHover micro-interaction |
| `src/components/views/StatsView.tsx` | AnimatedNumber for KPI values |
| `src/components/stats/ERITile.tsx` | AnimatedNumber for ERI ring |

## Technical Notes
- framer-motion is already installed (v12.34.3)
- `layoutId` values will be namespaced: `sidebar-active`, `tab-indicator`, `tile-{id}`, `question-card`
- All `AnimatePresence` children will have explicit `key` props
- The `Button` component animation only applies when `asChild` is false (Slot doesn't support motion props)
- RTL layout means "slide from right" is visually "slide from left" — animation directions adjusted accordingly
