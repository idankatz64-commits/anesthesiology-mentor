

## Plan: macOS-Style Dark Squircle Icons

Looking at the macOS dock reference, many icons feature **dark/deep backgrounds** with the icon symbol providing color contrast — unlike our current approach of bright solid gradients filling the entire background.

### Changes to `src/components/SquircleIcon.tsx`

**1. Redesign the gradient system** to use dark-toned backgrounds with a subtle colored accent:
- Background: deep dark base (e.g., `#1a1a2e` → `#0d0d1a`) with a subtle colored overlay/glow
- The gradient colors become a **subtle tint** on the dark background rather than the full fill
- Add a faint inner colored glow to give depth

**2. Update the styling:**
- Background becomes a layered approach: dark base + subtle radial gradient of the accent color at ~15-20% opacity
- Stronger inner shadow and border (like macOS icons have a thin dark border)
- Icon color shifts from plain white to the gradient's "from" color (so the icon itself carries the color, not the background)
- Keep a subtle top-edge highlight for the 3D/glass feel

**3. Light mode variant:**
- Slightly lighter dark base (e.g., `#2a2a3e`) so icons still pop against the light UI
- Or keep them dark — macOS dock icons look the same regardless of system theme

### Visual result:
```text
Current:  [████ bright gradient ████]  white icon
Proposed: [████ dark bg + color tint █]  colored icon with glow
```

### Example (gold):
- Current: solid `#fbbf24 → #f97316` background, white icon
- Proposed: `#1a1a2e → #0f0f1a` background with faint amber radial glow, amber-tinted icon

### Files to edit:
- `src/components/SquircleIcon.tsx` — redesign gradients, background, icon color, and shadow system

