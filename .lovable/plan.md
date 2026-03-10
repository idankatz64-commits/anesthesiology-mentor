

## Plan: Unified Dark Theme, Hover Animations, Home Layout Reorganization, Algorithm Explainer Enhancement

### 5 Tasks

**1. Unify tile backgrounds with theme-awareness**
- Create a shared CSS utility class `deep-tile` in `index.css` that provides the dark aesthetic in dark mode and a clean light equivalent in light mode:
  - Dark: `background: rgba(10,10,15,0.8)`, border `rgba(26,26,42,0.8)`, backdrop-blur, inset shadow
  - Light: `background: white`, border `hsl(var(--border))`, subtle shadow
- Replace all hardcoded `tileStyle` objects in `StatsView.tsx` with this class
- Apply to `DailyReportTile`, `ERITile`, `WeakZoneMapTile`, `ForgettingRiskTile`, `AnimatedStatsTile`, `GaugeDial` containers
- Replace `liquid-glass` in `HomeView.tsx`, `HomeStatsSummary.tsx`, `ReviewView.tsx`, `NotebookView.tsx`, `SetupView.tsx`, `FlashcardView.tsx`, `FormulaSheetView.tsx`, `ResultsView.tsx` with the same `deep-tile` class for consistency

**2. Uniform hover animation on all tiles**
- Add to the `deep-tile` CSS class: `hover:translate-y-[-3px] hover:shadow-lg hover:border-[rgba(123,146,255,0.3)]` transition
- This replaces the inconsistent mix of `cardHoverTap` framer-motion props and `hover:brightness-110` used across different views
- In `HomeView.tsx`, keep `motion.div` wrappers but ensure all cards use the same `deep-tile` class with CSS hover (remove `...cardHoverTap` spread to avoid conflicts, or keep tap feedback only via `whileTap`)

**3. Reorganize Home page layout**
- Current layout: 3-column grid for action cards, then daily report button, then algorithm explainer, then DB status — all similarly sized
- New layout:
  - **Top row**: 4-column summary bar (SRS due, topics count, accuracy %, questions today) — compact horizontal strip using `deep-tile`, similar to the reference image
  - **Action cards**: Keep 3-col grid but make cards more compact (reduce padding from p-6 to p-5)
  - **Daily Report**: Move inline as a slim horizontal tile (not a centered button) — single row with key metrics
  - **Algorithm Explainer**: Keep as collapsible but make it a narrow full-width card
  - **DB Status**: Make it a slim horizontal bar (3 compact stats in a row, reduced padding)

**4. Algorithm Explainer — add parameter tooltips**
- Replace the plain `code` block with an interactive version where each parameter (`srsUrgency`, `topicWeakness`, etc.) is wrapped in a `Tooltip` component
- Each tooltip explains:
  - `srsUrgency`: "כמה דחוף לחזור על השאלה לפי אלגוריתם SRS — ערך גבוה = איחור גדול מתאריך החזרה"
  - `topicWeakness`: "חולשה בנושא — ההפרש בין אחוז הדיוק שלך בנושא לדיוק הכללי"
  - `recencyGap`: "כמה ימים עברו מאז תרגלת את הנושא הזה"
  - `streakPenalty`: "עונש על רצף טעויות — אם טעית ברציפות בשאלה, הציון עולה"
  - `examProximity`: "קרבה לתאריך הבחינה — ככל שהמבחן קרוב יותר, הדגש על נושאים חלשים עולה"
  - `yieldBoost`: "חשיבות הנושא — Tier 1 (1.0), Tier 2 (0.6), Tier 3 (0.2)"
- Also add a brief description under each mode card explaining the weight distribution

**5. Apply deep-tile theme to all remaining views**
Files to update with unified styling:
- `SessionView.tsx` — question card, answer options, navigation bar
- `ResultsView.tsx` — score summary cards, question review cards
- `ReviewView.tsx` — summary cards (replace `soft-card bg-card border border-border`)
- `NotebookView.tsx` — note cards
- `SetupView.tsx` — dropdown containers, filter cards
- `FlashcardView.tsx` — flashcard containers, topic selector
- `FormulaSheetView.tsx` — formula cards
- `AdminView.tsx` — admin panels

### Files Changed
- `src/index.css` — add `deep-tile` utility class with dark/light variants
- `src/components/views/StatsView.tsx` — replace inline `tileStyle` with `deep-tile` class
- `src/components/views/HomeView.tsx` — layout reorganization, replace `liquid-glass` with `deep-tile`, add tooltips to algorithm explainer
- `src/components/views/ReviewView.tsx` — replace `soft-card bg-card` with `deep-tile`
- `src/components/views/ResultsView.tsx` — unified tile styling
- `src/components/views/NotebookView.tsx` — unified tile styling
- `src/components/views/SetupView.tsx` — unified tile styling
- `src/components/views/FlashcardView.tsx` — unified tile styling
- `src/components/views/FormulaSheetView.tsx` — unified tile styling
- `src/components/views/SessionView.tsx` — unified tile styling
- `src/components/stats/DailyReportTile.tsx` — apply `deep-tile`
- `src/components/stats/ERITile.tsx` — apply `deep-tile`
- `src/components/stats/WeakZoneMapTile.tsx` — apply `deep-tile`
- `src/components/stats/HomeStatsSummary.tsx` — replace `liquid-glass` with `deep-tile`

