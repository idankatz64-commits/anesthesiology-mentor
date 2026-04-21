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
| 1 | 7700     | Poor   |
| 2 | 7600     | Poor   |
| 3 | 7600     | Poor   |

**Median:** 7600 ms  (Rating: **Poor** — >3× Google's "poor" threshold of 2500ms)

**Captured on:** 2026-04-21
**Chrome version:** Chrome stable (macOS)
**Capture method:** Chrome DevTools → Lighthouse tab → Mode: Navigation, Device: Mobile, Categories: Performance. Lighthouse applies its default mobile throttling profile (Moto G4-class CPU at 4× slowdown, Slow 4G network 150/1638 Kbps @ 150ms RTT), which matches the target emulation profile.
**URL measured:** https://anesthesiology-mentor.vercel.app/stats (production legacy StatsView, feature flag off)
**Run in:** Chrome Incognito window (no extensions)

> Status: **✅ captured.** Wave 0 STOP artifact complete.
> `phase-1-wave-0-complete` tag unblocked — pending user approval to push + tag.
>
> **Target for W2.8 Playwright perf assertion:** LCP < 2500 ms on `/stats` with flag
> ON. This represents a **>67% reduction** from the 7600ms baseline and crossing
> from "Poor" into "Good" per Google Web Vitals thresholds.

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
