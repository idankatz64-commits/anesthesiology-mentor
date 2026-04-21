# Phase 1 — Verification Log

Living document. Populated progressively as Wave 0 → Wave 1 → Wave 2 complete.
Each section is read during merge-gate (W2.11) and by `gsd-verifier`.

---

## LCP Baseline (Legacy StatsView)

**Purpose:** Pre-change LCP number for `/stats` on the legacy view. Wave 2
must reduce this number (target < 2500 ms). This is the anchor for W2.8
Playwright perf assertion.

**How to capture (manual, ~2 min):**

1. From repo root: `npm run dev` — dev server starts on
   http://localhost:5173 (or similar; watch terminal for actual URL).
2. Open Chrome → navigate to the local URL.
3. Open DevTools → **Performance** tab → click the gear → set:
    - **Device:** Moto G4
    - **Network:** Slow 4G
    - **CPU:** 4× slowdown
4. Sign in with regular account.
5. Navigate to **/stats** (Statistics view).
6. Open DevTools **Console** — the `[LCP]` log line from `src/lib/lcp.ts`
   prints the LCP value in ms as soon as Largest Contentful Paint fires.
7. **Hard-reload the page (Cmd+Shift+R)** and capture the number again.
   Repeat for a total of **3 readings**.
8. Record the 3 readings below and compute the **median**.

**Readings:**

| # | LCP (ms) | Rating |
|---|----------|--------|
| 1 | _TBD_    | _TBD_  |
| 2 | _TBD_    | _TBD_  |
| 3 | _TBD_    | _TBD_  |

**Median:** _TBD_ ms

**Captured on:** _TBD_
**Chrome version:** _TBD_
**Device emulation:** Moto G4 + Slow 4G + 4× CPU throttle

> Status: **awaiting manual capture at Wave 0 STOP.** `phase-1-wave-0-complete`
> tag is blocked until 3 readings + median are filled in here.

---

## Merge-Gate Invariants (auto-checked in W2.11)

These will be populated by the merge-gate script before tagging the PR ready.

- [ ] `rg "const YIELD_TIER_MAP" src/ | rg -v smartSelection.ts` → 0 hits
- [ ] `git diff main -- src/components/views/StatsView.tsx` → 0 lines
- [ ] `git diff main -- src/lib/smartSelection.ts` → only the `export` keyword addition (1 keyword, additive)
- [ ] Production bundle size regression ≤ 5 kB gzip
- [ ] `npm test -- --run` → all pass
- [ ] `npm run build` → success
- [ ] Playwright E2E (`stats-v2-*.spec.ts`) → all green
- [ ] Feature flag `statsV2Enabled` defaults to **off** in code

---

## Phase 1 Scope Attestations (auto-checked)

- [ ] **Zero DB migrations** — `supabase/migrations/` unchanged vs `main`
- [ ] **Zero edge function changes** — `supabase/functions/` unchanged vs `main`
- [ ] **No new environment variables** required
- [ ] **Legacy StatsView renders identically** when flag is off (visual diff)

---
