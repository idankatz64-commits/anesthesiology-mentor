

## UI/UX Improvement Plan — 8 Items

### 1. Contrast & Readability (`src/index.css`)
- Dark mode: `--card` from `260 25% 8%` → `260 25% 11%`, `--muted-foreground` from `220 15% 50%` → `220 15% 65%`, `--border` from `260 20% 14%` → `260 20% 18%`
- Light mode: `--muted-foreground` from `250 12% 45%` → `250 12% 38%`

### 2. Dashboard Visual Hierarchy (`src/components/views/StatsView.tsx`)
- All stat cards get `rounded-2xl` (already on some, standardize)
- ERI tile moves to full-width top position (out of the 3-col grid), larger ring
- Stat number fonts bumped to `text-3xl font-black`, subtitles to `text-[11px]`
- Add skeleton loading state while `useStatsData` loads

### 3. Consistent Status Colors
- Replace `#EAB308` with `#f59e0b` (amber) in `ERITile.tsx`, `WeakZoneMapTile.tsx`
- Replace `#60A5FA` accuracy gauge color with `#22c55e` (green) in `StatsView.tsx`
- Standardize: green `#22c55e`, amber `#f59e0b`, red `#ef4444`

### 4. Gauge → Circular Progress Rings (`src/components/stats/GaugeDial.tsx`)
- Replace half-circle speedometer with full-circle SVG ring (stroke-dasharray pattern from ERIRing)
- Center text: `text-2xl font-black` with value
- Title label above, subtitle below

### 5. Sidebar Navigation (`src/components/Sidebar.tsx`)
- Nav items: `space-y-1` → `space-y-2`, padding `py-3.5` → `py-4`
- Active state already has `border-r-[3px]` — ensure it's always visible (currently conditional on `isCollapsed`)

### 6. Practice Settings Form (`src/components/views/SetupView.tsx`)
- Wrap filter groups in labeled sections with `bg-muted/30 rounded-2xl p-6` containers
- Section headers: "מקור שאלות", "סינון מתקדם", "הגדרות"
- CTA button: add `hover:scale-[1.01] transition-transform duration-200`
- Spacing between sections: `space-y-8`

### 7. Treemap (`src/components/stats/TopicTreemap.tsx`)
- Already has tooltips, ellipsis, click-to-practice — no changes needed (verified)

### 8. Micro-interactions
- `AnimatedStatsTile.tsx`: `rounded-xl` → `rounded-2xl`, add `transition-all duration-200`
- Add `StatsSkeleton` component inline in `StatsView.tsx` for loading state
- Ensure all interactive cards/buttons have `transition-all duration-200`

### Files Changed
| File | Summary |
|------|---------|
| `src/index.css` | CSS variable contrast improvements |
| `src/components/stats/GaugeDial.tsx` | Full rewrite → circular progress ring |
| `src/components/stats/AnimatedStatsTile.tsx` | rounded-2xl, transition-all |
| `src/components/views/StatsView.tsx` | ERI full-width, font sizes, skeleton, rounded-2xl |
| `src/components/stats/ERITile.tsx` | Color fix: `#EAB308` → `#f59e0b` |
| `src/components/stats/WeakZoneMapTile.tsx` | Color fix: `#EAB308` → `#f59e0b` |
| `src/components/views/SetupView.tsx` | Section groupings, spacing, CTA hover |
| `src/components/Sidebar.tsx` | Nav padding, spacing |

