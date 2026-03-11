

## Plan: Home Layout, Countdown Light Mode, Header & Quotes

### 5 Changes

**1. Reorganize home grid layout**
Current: 3×3 grid (8 cards) → Daily Report → Algorithm Explainer → DB Status

New layout:
- Row 1 (3 cols): Smart Practice, Simulation, Spaced Repetition
- Row 2 (3 cols): Flashcards, Custom Practice, Mistakes
- Row 3 (3 cols): Favorites, Notebook, **Algorithm Explainer** (same size as other cards, collapsible content opens below grid)
- Below grid: Daily Report (slim bar) → DB Status (slim bar)

The Algorithm Explainer card moves into the grid at bottom-left (RTL = left visually). When clicked, the expanded content renders below the entire grid as a full-width panel.

**2. Fix countdown light mode — blue futuristic theme**
In `MatrixCountdown.tsx`, detect light mode via `document.documentElement.classList`. In light mode:
- Matrix rain: change `hsl(120 100% 50%)` (green) to `hsl(220 80% 60%)` (futuristic blue `#4477ff`)
- Canvas fade: `rgba(245,245,250,0.06)` instead of dark
- Digit color: `#2563eb` with blue glow instead of green
- Colon separator: blue tint
- Bottom glow line: blue gradient
- LED dots: blue instead of green

**3. Fix countdown canvas filling entire tile**
The canvas currently uses `absolute inset-0` but the container may have padding causing visual mismatch. Set `overflow-hidden rounded-2xl` on the container and ensure the canvas covers the full area. Also set the initial canvas fill color to match the container background (transparent/themed instead of hardcoded dark).

**4. Replace header text**
- Remove "שלום, ד"ר מתמחה 👋" and "מוכן להמשיך בהכנות למבחן שלב א'?"
- Replace with: `Let's Play A Game...` with a `Puzzle` (jigsaw/saw) icon from lucide-react
- Style: matrix-title font, slightly eerie/playful vibe

**5. Replace countdown subtitle with rotating motivational quotes**
- Remove static "Simulator for Stage 1 Anesthesia..." text
- Import `motivationalQuotes` and pick a random quote (rotating every ~15 seconds with fade animation)
- Display as: `"quote" — character` in smaller text below the digits
- Keep it concise (single line, truncated if needed)

### Files Changed
- `src/components/views/HomeView.tsx` — grid reorganization, header text change
- `src/components/MatrixCountdown.tsx` — light mode blue theme, canvas fix, rotating quotes subtitle

