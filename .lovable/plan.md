

# Design Overhaul: Dark Futuristic Theme

## Overview
Transform the app's visual identity into a premium dark-first design inspired by the reference image, blending Matrix-style futuristic aesthetics with iOS polish. The palette centers on deep blacks, vibrant orange accents, with semantic greens, reds, yellows, and light blues.

## Design Language

### Color Palette
- **Background**: Deep black/charcoal (#0a0a0f to #12121a)
- **Cards**: Dark gray with subtle borders (#1a1a2e, borders at #2a2a3e)
- **Primary accent**: Vibrant orange (#f97316 range)
- **Success/correct**: Emerald green (#10b981)
- **Error/wrong**: Soft red (#ef4444)
- **Warning**: Dark amber/yellow (#eab308)
- **Info**: Light blue/cyan (#38bdf8)
- **Text**: Light gray (#e2e8f0) with muted (#94a3b8)

### Futuristic Effects
- Subtle glow effects on active/hover elements (orange glow, green glow)
- Glassmorphism on the sidebar, top nav, and modals (backdrop-blur + semi-transparent backgrounds)
- Thin gradient accent lines (orange-to-transparent) on card tops
- Subtle grid/dot pattern on the main background
- Smooth micro-animations on card hover (scale + glow)
- Monospace font accents for numeric data (stats, percentages)

---

## Technical Plan

### 1. CSS Variables Overhaul (`src/index.css`)
- Redesign the dark theme as the primary/default theme
- Update `:root` to use the new dark palette as default
- Create a `.light` theme as a secondary option (refined version of current light)
- Add new CSS custom properties:
  - `--glow-primary` for orange glow shadows
  - `--glow-success` for green glow
  - `--card-gradient` for top-border gradient accents
- Add a subtle animated grid/dot background pattern using CSS
- Add utility classes: `.glass-card`, `.glow-border`, `.matrix-text` (monospace green tint for data)

### 2. Tailwind Config (`tailwind.config.ts`)
- No structural changes needed -- colors flow through CSS variables
- Add new keyframes: `glow-pulse`, `border-shimmer` for futuristic effects
- Add corresponding animation utilities

### 3. Sidebar (`src/components/Sidebar.tsx`)
- Apply glassmorphism: `bg-card/80 backdrop-blur-xl`
- Active nav item: orange left border (RTL = right border) + orange text + subtle orange glow
- Inactive items: muted gray text, hover reveals subtle background
- Progress bar: orange fill with glow effect
- Footer section: darker recessed styling

### 4. Top Nav (`src/components/TopNav.tsx`)
- Glassmorphism header: `bg-black/60 backdrop-blur-xl`
- Subtle bottom border gradient (orange to transparent)
- User avatar: orange ring on hover

### 5. Home View (`src/components/views/HomeView.tsx`)
- Cards: dark backgrounds with thin border, gradient accent line at top
- Icon containers: colored with subtle glow matching their semantic color
- Hover effect: slight scale + colored glow shadow
- Stats section at bottom: use monospace font for numbers
- "DB Status" cards: colored subtle backgrounds matching their semantic meaning

### 6. Auth Page (`src/pages/Auth.tsx`)
- Dark background with subtle radial gradient
- Card: glassmorphism with orange accent
- Inputs: dark backgrounds with subtle borders
- Primary button: solid orange with hover glow

### 7. Session View (`src/components/views/SessionView.tsx`)
- Answer options: dark cards with colored borders on selection (green = correct, red = wrong)
- Explanation panel: slightly lighter dark card with left accent border
- Confidence buttons: colored with glow on active state

### 8. Stats View (`src/components/views/StatsView.tsx`)
- Table rows: alternating dark shades
- Progress bars: orange fills with glow
- Headers: monospace accent font for numbers

### 9. Mobile Header (`src/components/MobileHeader.tsx`)
- Match glassmorphism from TopNav
- Slide-out menu: dark glassmorphism panel

### 10. Global Component Touch-ups
- All modals (FeedbackModal, WelcomeModal): glassmorphism backgrounds
- Buttons: orange primary with subtle hover glow
- Inputs: dark backgrounds, subtle borders, focus ring in orange
- Toasts: dark themed with colored left accent borders
- Scrollbar: darker track, orange-tinted thumb

### 11. Flash Card View, AI Coach, Notebook, etc.
- Apply the same card styling patterns consistently
- Use semantic colors for status indicators
- Monospace font for numeric data points

---

## Files to Modify

| File | Changes |
|---|---|
| `src/index.css` | Complete dark palette overhaul, new utility classes, background pattern, glow effects |
| `tailwind.config.ts` | New keyframes and animation utilities |
| `src/components/Sidebar.tsx` | Glassmorphism, glow active states, refined styling |
| `src/components/TopNav.tsx` | Glassmorphism, gradient border |
| `src/components/MobileHeader.tsx` | Dark glass panel |
| `src/components/views/HomeView.tsx` | Card redesign with gradients and glows |
| `src/pages/Auth.tsx` | Dark themed auth page |
| `src/components/views/SessionView.tsx` | Dark answer cards, colored states |
| `src/components/views/StatsView.tsx` | Dark table, glow progress bars |
| `src/components/views/AICoachView.tsx` | Dark card styling |
| `src/components/views/FlashcardView.tsx` | Dark flip cards |
| `src/components/views/NotebookView.tsx` | Dark notes |
| `src/components/views/WeeklyPlanView.tsx` | Dark calendar cards |
| `src/components/views/ResultsView.tsx` | Dark results with colored metrics |
| `src/components/views/ReviewView.tsx` | Dark review cards |
| `src/components/views/SetupView.tsx` | Dark selection UI |
| `src/components/views/AdminView.tsx` | Dark admin table |
| `src/components/views/ComparativeStats.tsx` | Dark comparison table |
| `src/components/views/SessionCommunity.tsx` | Dark community notes |
| `src/components/FeedbackModal.tsx` | Dark glassmorphism modal |
| `src/components/WelcomeModal.tsx` | Dark glassmorphism modal |
| `src/pages/Index.tsx` | Background pattern class on main |

No database changes required. This is a purely frontend design transformation.

