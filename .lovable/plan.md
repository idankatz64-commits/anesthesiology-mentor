

## Plan: Fix & Enhance TopicPerformanceTable + AccuracyCanvasChart

### 6 Tasks

**1. Fix table functionality**
- Console shows ref warning on PanelC — fix by removing ref forwarding attempt
- Table appears to work but needs the ref warning resolved

**2. Light mode support for table + chart**
- Both components use hardcoded dark colors (`#0a0a0a`, `#0f0f0f`, `#1a1a1a`, `#e0e0e0`, etc.)
- Replace with CSS variables: `hsl(var(--background))`, `hsl(var(--card))`, `hsl(var(--border))`, `hsl(var(--foreground))`, etc.
- For AccuracyCanvasChart: read computed CSS variables at draw time for canvas colors
- For TopicPerformanceTable: replace inline `style={{ color: '#e0e0e0' }}` with tailwind classes like `text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`
- Keep the semantic accuracy colors (#00e676, #ff1744, #ff9800) as-is since they're data-driven

**3. Remove ComparativeStats from StatsView**
- In `StatsView.tsx`, remove the `<ComparativeStats />` section (lines 230-233) and its import (line 7)
- The topic performance table now includes group position data, making it redundant

**4. Wrap AccuracyCanvasChart in AnimatedStatsTile for full-page expand**
- Wrap the chart in `AnimatedStatsTile` so clicking expands it to full viewport
- Collapsed = current chart as-is
- Expanded = same chart rendered at full viewport size with re-draw on resize

**5. Compact table columns**
- Reduce `px-3` padding to `px-2` on all td/th cells
- Use `text-[10px]` instead of `text-xs` for numeric columns
- Reduce badge min-width from 56px to 48px

**6. Add animations**
- Table rows: staggered fade-in using framer-motion `motion.tr` with `variants`
- Expanded panel: already has spring animation — keep as-is
- AccuracyCanvasChart: add fade-in entrance animation via framer-motion wrapper
- Column toggle pills: add `motion.button` with scale tap feedback

### Files Changed
- `src/components/stats/TopicPerformanceTable.tsx` — theme-aware colors, compact padding, row animations, fix ref warning
- `src/components/stats/AccuracyCanvasChart.tsx` — theme-aware canvas colors, wrap in AnimatedStatsTile for expand
- `src/components/views/StatsView.tsx` — remove ComparativeStats import + usage

