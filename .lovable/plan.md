

## Plan: Step 1 — SquircleIcon Component + Sidebar & MobileBottomNav

### New File: `src/components/SquircleIcon.tsx`

Reusable component accepting:
- `icon`: Lucide icon component (e.g. `Heart`)
- `gradient`: preset name from a map
- `size`: `'sm' | 'md' | 'lg'` (default `'md'`)

**Gradient presets:**
| Name | Colors | Usage |
|------|--------|-------|
| `gold` | amber-400 → orange-500 | Home/Heart |
| `teal` | teal-400 → emerald-600 | Practice/BookOpen |
| `orange` | orange-400 → red-500 | Exam/Timer |
| `blue` | blue-500 → indigo-600 | Stats/BarChart3 |
| `cyan` | cyan-400 → blue-500 | Notebook/StickyNote |
| `violet` | violet-400 → purple-600 | Formula/FlaskConical |
| `rose` | rose-400 → pink-600 | Feedback/MessageSquareWarning |
| `slate` | slate-400 → slate-600 | Admin/ShieldAlert, Theme toggle |

**Size map:** `sm` = 28px / icon 14px, `md` = 36px / icon 18px, `lg` = 44px / icon 22px

**Styling per squircle:**
- `rounded-[22%]` for squircle shape
- CSS inline `background: linear-gradient(135deg, colorA, colorB)`
- Inner highlight: `box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 6px rgba(0,0,0,0.3)`
- Icon rendered in white with `drop-shadow(0 1px 1px rgba(0,0,0,0.2))`

### Modified: `src/components/Sidebar.tsx`

- Import `SquircleIcon` and pass Lucide icon components instead of pre-rendered JSX
- `navItems` array: change `icon` field to use `<SquircleIcon icon={Heart} gradient="gold" size="md" />` etc.
- Header Heart icon: replace the existing `bg-primary/10` container with `<SquircleIcon icon={Heart} gradient="gold" size="lg" />`
- Footer icons (expanded): `MessageSquareWarning` → `<SquircleIcon gradient="rose" size="sm" />`, `ShieldAlert` → `<SquircleIcon gradient="slate" size="sm" />`, `Sun/Moon` → `<SquircleIcon gradient="slate" size="sm" />`
- Footer icons (collapsed): same squircle treatment

### Modified: `src/components/MobileBottomNav.tsx`

- Import `SquircleIcon`
- `bottomNav` array: each icon becomes `<SquircleIcon icon={Heart} gradient="gold" size="sm" />` etc.
- Active state glow remains via the existing `motion.div` indicator — no change to that logic

### No other files touched in this step.

