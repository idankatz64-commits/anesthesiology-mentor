Smart Practice Upgrade: Session Size Selector + Hybrid Scoring

### Current State

1. **Question selection logic** — `src/contexts/AppContext.tsx`, line 351: `startSession` just shuffles randomly and slices to `count`. No scoring.
2. **Setup screen** — `src/components/views/SetupView.tsx`: renders filters + a numeric "כמות שאלות" input + a start button.
3. **Available data at selection time** — `progress.history` (per-question answer counts, accuracy, `everWrong`, timestamps), `getDueQuestions()` (SRS due dates from `spaced_repetition` table), `confidenceMap`, all question metadata including `topic`.

### Plan (3 files)

#### File 1: `src/lib/smartSelection.ts` (NEW)

Pure logic module containing:

- **YIELD_TIER_MAP** constant mapping topic strings → tier scores (1.0 / 0.6 / 0.2 / 0)
- **WEIGHT_PROFILES** constant: `{ quick: [...], regular: [...], long: [...] }`
- `**computeSmartScore(question, params)**` — calculates the 6-parameter score per the spec (srsUrgency, topicWeakness, recencyGap, streakPenalty, examProximity, yieldBoost)
- `**selectSmartQuestions(pool, count, sessionSize, srsData, history, topicStats)**` — scores all candidates, sorts descending, returns top `count`. For `simulation` mode: distributes questions proportionally by topic using an `avg_q` mapping (hardcoded exam proportions)
- Exam date hardcoded as `2026-06-16`

#### File 2: `src/components/views/SetupView.tsx` (MODIFY)

- Replace the numeric "כמות שאלות" input with 4 selectable cards: Quick (15), Regular (40), Long (100), Simulation (120)
- Each card shows name, count, and description text
- Store selection as `sessionSize: 'quick' | 'regular' | 'long' | 'simulation'` in component state (default: `regular`)
- The count state derives from the selected card
- On "Start", call the new smart selection logic instead of passing the raw pool directly: fetch SRS data via `getDueQuestions`, compute topic stats from `progress.history`, call `selectSmartQuestions`, then pass the result to `startSession`

#### **File 3:** `src/contexts/AppContext.tsx` **(MINOR MODIFY)**

- No major changes needed. `startSession` already accepts a pre-built `pool` and `count`. The smart selection will happen in SetupView before calling `startSession`, so the context stays clean.
- Only change: add a new helper `fetchSrsData()` that returns `Record<questionId, { next_review_date: string }>` by reading from **existing in-memory context state only** — no new Supabase network call. The SRS data is already loaded in context; this helper simply reshapes it into a lookup map for the scoring function.Summary of Changes


| File                                 | Action | What                                                                |
| ------------------------------------ | ------ | ------------------------------------------------------------------- |
| `src/lib/smartSelection.ts`          | Create | Scoring algorithm + selection logic                                 |
| `src/components/views/SetupView.tsx` | Modify | Replace count input with 4 session-size cards, wire smart selection |
| `src/contexts/AppContext.tsx`        | Modify | Add `fetchSrsData()` helper to expose raw SRS dates                 |
