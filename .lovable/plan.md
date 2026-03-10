

## Plan: Add Algorithm Explainer Tile to Home Dashboard

**What**: A new collapsible/expandable tile on the home page that explains the smart question selection algorithm for each session size (Quick, Regular, Long, Simulation).

**Where**: Below the daily report button and above the "סטטוס מאגר שאלות" section in `HomeView.tsx`.

### Implementation

**Single file change: `src/components/views/HomeView.tsx`**

1. Add a new state `algoOpen` (boolean, default false)
2. Add import for `Info` icon from lucide-react
3. Insert a new tile between the daily report section (line ~328) and the DB status section (line ~331):
   - Collapsed state: A `liquid-glass` card with an info icon, title "איך נבחרות השאלות?" and a chevron
   - Expanded state (toggle on click): Shows a concise RTL explanation of the 4 modes:
     - **מהיר (15)**: Focus on SRS urgency + weak topics, fast review
     - **רגיל (40)**: Balanced hybrid scoring across 6 parameters
     - **מעמיק (100)**: Deep coverage, broader topic spread
     - **סימולציה (120)**: Proportional distribution by historical exam weights, no scoring
   - Include brief mention of the formula: `smartScore = W1×srsUrgency + W2×topicWeakness + W3×recencyGap + W4×streakPenalty + W5×examProximity + W6×yieldBoost`
   - Animate open/close with framer-motion (`AnimatePresence` + height animation)

No new files, no new components, no database changes.

