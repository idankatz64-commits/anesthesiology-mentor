## Plan: Anesthesia-Themed Icons, Metallic Look & Bold Headers for Explanation Panels

### What Changes

**1. Anesthesia instrument icons per section**

Create an array of SVG-based anesthesia icons mapped to each section index, cycling through:

- **Laryngoscope** (section 0) — custom inline SVG path
- **Syringe / Propofol** (section 1) — use `Syringe` from lucide-react
- **Pill / Ketamine** (section 2) — use `Pill` from lucide-react  
- **Monitor** (section 3) — use `Activity` (waveform) from lucide-react
- **Blood bag** (section 4) — use `Droplets` from lucide-react
- **Endotrachal tube** (section 5) — use **Endotrachal tube** from lucide-react

These replace the generic `Lightbulb` icon (single section) and the numeric index (multi-section headers).

**2. Metallic appearance for panels and icon containers**

Update `SECTION_COLORS` to include metallic gradient styling:

- Panel backgrounds: `bg-gradient-to-b from-card/80 via-card/60 to-card/40` with a subtle silver/chrome inner border highlight (`shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]`)
- Icon containers: metallic gradient (`bg-gradient-to-br from-white/15 via-transparent to-black/10`) with a reflective top highlight border
- Borders get a slightly brighter metallic sheen (`border-white/10` overlay)

**3. Bolder explanation headers**

- Single-section header "הסבר": increase to `text-xl font-black`, add `tracking-wide` and a subtle text shadow
- Multi-section titles: increase to `text-lg font-extrabold`, add `tracking-wide` and `uppercase` styling via CSS
- Add a thin metallic accent line under each header (`h-px bg-gradient-to-r from-current/30 via-current/10 to-transparent`)

### Files Modified

- `**src/components/views/SessionView.tsx**` — all changes in this single file:
  - Import additional lucide icons (`Syringe`, `Pill`, `Activity`, `Droplets`, `Stethoscope`, `HeartPulse`)
  - Add `ANESTHESIA_ICONS` array mapping index to icon component
  - Update `SECTION_COLORS` with metallic style classes
  - Update single-section header (lines ~974-996)
  - Update multi-section headers (lines ~1015-1021)