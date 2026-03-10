

## Exam Proximity Phase: Auto-Adjusting Weights + Home Badge

### What This Does
As exam day (June 16, 2026) approaches, the scoring algorithm automatically shifts emphasis toward weak topics and exam proximity. A dismissible badge on the home screen informs the user when this kicks in.

### Changes (2 files)

#### File 1: `src/lib/smartSelection.ts`

**Add phase function and weight override logic:**

1. Export `EXAM_DATE` (already exists on line 120, just needs `export`)
2. Add exported `getExamProximityPhase()` function returning `'early' | 'approaching' | 'imminent'`
3. In `selectSmartQuestions` (line 275), after getting `WEIGHT_PROFILES[sessionSize]`, apply phase-based overrides to W2 (topicWeakness) and W5 (examProximity) slots only:
   - `early` (>90 days): no override, use session-size weights as-is
   - `approaching` (30-90 days): W2 = 0.30, W5 = 0.10
   - `imminent` (<30 days): W2 = 0.35, W5 = 0.20

The other 4 weight slots (W1, W3, W4, W6) remain from the session-size profile.

#### File 2: `src/components/views/HomeView.tsx`

**Add a passive exam phase badge** near the Smart Practice card:

1. Import `getExamProximityPhase` from smartSelection
2. Compute phase on render; if `'early'`, show nothing
3. If `'approaching'`: amber badge with text "מצב התקרבות לבחינה — דגש על נושאים חלשים"
4. If `'imminent'`: red badge with text "מצב בחינה — עדיפות מקסימלית לנושאים חלשים"
5. Dismissible via X button, stored in `localStorage` key `exam_phase_banner_dismissed_v1` with the phase value; re-appears when phase changes (dismissed value no longer matches current phase)

### No Other Changes
- No DB changes, no Supabase calls, no SRS logic changes
- Badge is purely informational — the weight adjustment happens silently in the scoring math

