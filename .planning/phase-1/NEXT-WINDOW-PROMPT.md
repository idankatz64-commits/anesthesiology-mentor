# Phase 1 — Next Window Prompt

> **הוראה לחלון הבא של Claude:** קרא את הקובץ הזה עד הסוף לפני שאתה עושה שום דבר. זה חוזה הביצוע שלך לפייז 1.

---

## 1. הקשר פרויקט (חובה לקרוא לפני שמתחילים)

- **משתמש:** ד"ר עידן כץ — מתמחה שנה 3, הרדמה/טיפול נמרץ/כאב, איכילוב.
- **ידע בתכנות:** אפס. תסביר הכול בעברית, בשפה פשוטה, בלי ז'רגון.
- **בחינה:** שלב א' ב-16 ביוני 2026 (קבוע). כל הלו"ז נמדד לעומת התאריך הזה.
- **אפליקציה:** YouShellNotPass — React + Vite + TS + Tailwind + shadcn/ui.
- **URL production:** https://anesthesiology-mentor.vercel.app
- **Supabase פעיל:** `ksbblqnwcmfylpxygyrj` — **אסור** לגעת ב-`agmcauhjhfwksrjllxar` (פרויקט ישן).
- **Vercel:** team `team_9nc4gBGF5aLVsHGGf7vJiWld`, project `prj_TVptaSlthQVDRSlxyN5gjslw5Y0s`.
- **קוד מקומי (נכון):** `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/` — **אסור** להשתמש ב-`anesthesiology-mentor-main/` (ישן).
- **Git source:** https://github.com/idankatz64-commits/anesthesiology-mentor.git

## 2. מצב התחלתי בחלון החדש

- **Branch נוכחי:** `phase-1-stats-cleanup` (יוצר מ-main אחרי merge של Phase 0).
- **main:** מכיל את כל 15 התיקונים של Phase 0 (merge commit `3553592`).
- **Phase 0 VERIFICATION:** מופיע בקומיטים `c270a3e`, `e2dc8d1` — אין carryover פתוח.
- **תוכניות מאושרות על-ידי המשתמש ב-2026-04-21:**
  - `.planning/phase-1/RESEARCH.md` (1,205 שורות) — מיפוי הקוד הקיים.
  - `.planning/phase-1/PLAN.md` (454 שורות) — 29 קומיטים ב-3 גלים.

## 3. מטרת Phase 1

Stats V2 — החלפת מסך הסטטיסטיקה הקיים (StatsView) בגרסה חדשה (StatsViewV2) שמדגישה:
1. **Hero עם ERI + קריאה לפעולה** (התחל סשן תרגול מיידי על הפער הכי גדול).
2. **3 כרטיסי Weak Zones** — נושאים דחופים (מתוך `useRecommendations()` חדש).
3. **"למה?" Accordion** שמסתיר radar + sparkline + streak calendar כברירת מחדל.
4. **TopicPerformanceTable בקיפול** (wrap ולא rewrite — רכיב קיים איכותי).
5. **Placeholder לדוח שבועי** עם קישור ל-master_report_2026-04-18.html (iframe אמיתי ב-Phase 2a).
6. **Drilldown ב-Sheet** — גרפים כבדים (AccuracyCanvas, TopicTreemap) נטענים רק כשצריך.
7. **Feature flag** — כל זה נפתח רק למשתמש הזה דרך localStorage (`statsV2Enabled=true`), כל שאר המשתמשים רואים את הגרסה הישנה.

**אין שינויי DB. אין מיגרציות. אין שינויים ב-edge functions. רק frontend + feature flag.**

## 4. איך מתחילים — שתי אפשרויות

### אפשרות A (מומלצת) — phase-orchestrator agent

```
Agent(
  subagent_type: "phase-orchestrator",
  description: "Execute Phase 1 Stats V2",
  prompt: "Execute Phase 1 (stats-v2) end-to-end per .planning/phase-1/PLAN.md on branch phase-1-stats-cleanup. RESEARCH.md and PLAN.md are already approved. Start with Wave 0 W0.1. Stop after each Wave for user verification. Hebrew reports."
)
```

### אפשרות B — ידנית מ-PLAN.md
1. פתח `.planning/phase-1/PLAN.md` — 29 קומיטים ב-3 גלים.
2. התחל מ-Wave 0 W0.1 (tooling sanity check).
3. כל קומיט אטומי, message תיאורי.
4. אחרי כל Wave — STOP והצג למשתמש מה נעשה + מה הבא.

## 5. חלוקת הגלים (סיכום — הפירוט ב-PLAN.md)

### Wave 0 — Foundation (יום 1, 10 קומיטים)
- W0.1–W0.2: Dependencies (`@playwright/test`, `@testing-library/user-event`, `web-vitals`), `e2e/playwright.config.ts`.
- W0.3–W0.4: TDD RED — בדיקות כושלות ל-`scoreRecommendation()` + `useFeatureFlag`.
- W0.5–W0.7: TDD GREEN — `src/lib/featureFlags.ts`, `src/lib/recommendations.ts` (מייבא `YIELD_TIER_MAP` מ-`smartSelection.ts` — אסור לשכפל), `src/hooks/useRecommendations.ts`.
- W0.8–W0.9: LCP baseline — `src/lib/lcp.ts` + measurement על המסך הישן.
- W0.10: Admin Debug Flags toggle.

### Wave 1 — New v2 Components (2-3 ימים, 9 קומיטים)
- W1.1–W1.2: `ERIRing` (SVG סטטי) + `StatsHero.tsx`.
- W1.3–W1.4: `WeakZoneCard` + `WeakZoneCards`.
- W1.5–W1.6: `ERIWhyPanel` + `WhyAccordion` (lazy + Suspense).
- W1.7–W1.8: `WeeklyReportTab` placeholder + `TopicPerformanceTableCollapsible.tsx`.
- **W1.9: Human checkpoint — עצור ובקש מעידן לבדוק.**

### Wave 2 — Integration & Cleanup (1-2 ימים, 10 קומיטים)
- W2.1–W2.2: `TopicsDrilldownView.tsx` (Sheet) + `StatsViewV2.tsx` (≤200 LOC).
- W2.3–W2.4: `StatsViewRouter.tsx` + snapshot test של StatsView הישן.
- W2.5: `vite.config.ts` manual chunks.
- W2.6–W2.8: Playwright E2E (CTA + mobile + LCP<2500).
- W2.9–W2.11: Reviewers → preview Vercel → merge gate → squash-merge ל-main.

## 6. אילוצים קריטיים — אסור לעבור עליהם

1. **אסור push ל-origin בלי אישור מפורש.** אחרי כל commit — שאל בעברית: "לדחוף עכשיו ל-GitHub?".
2. **אסור לדלג על merge gate** (9 סעיפים ב-PLAN.md Wave 2.10).
3. **אסור לגעת ב-Supabase `agmcauhjhfwksrjllxar`** או ב-`anesthesiology-mentor-main/`.
4. **אסור `git commit --no-verify`** או דילוג על hooks.
5. **Feature flag OFF by default לכולם. ON רק למשתמש דרך localStorage.**
6. **דו"חות למשתמש — עברית פשוטה, בלי ז'רגון.**
7. **אין שינויי DB.** אם צריך — עצור וחזור למשתמש.

## 7. מה לא עושים ב-Phase 1

- **לא משנים FSRS.** זה Phase 3.
- **לא משנים קנסות סימולציה.** זה Phase 2.
- **לא מחברים iframe אמיתי של master report.** רק placeholder.
- **לא משכתבים TopicPerformanceTable.** עוטפים ב-Collapsible.
- **לא מוסיפים dependencies מעבר למה שב-W0.2.**

## 8. נקודות עצירה חובה (STOP points)

1. אחרי Wave 0 — הצג מה נכתב, LCP baseline, מה הבא.
2. אחרי W1.9 — **human checkpoint** — המשתמש בודק ב-dev route.
3. אחרי Wave 1 — סיכום כל הקומפוננטות.
4. אחרי Wave 2.11 — **stop לפני merge ל-main.** המשתמש מאשר.
5. אחרי merge ל-main — **שאל אם לדחוף.**

## 9. כלי עזר זמינים

### Agents
- `phase-orchestrator` — מנהל הפייז (`~/.claude/agents/phase-orchestrator.md`).
- `gsd-executor`, `gsd-verifier`.
- `code-reviewer`, `typescript-reviewer`, `security-reviewer`.
- `tdd-guide`, `e2e-runner`.
- `plugin-dev:agent-creator` — למילוי פערים.

### Skills
- `superpowers:subagent-driven-development`, `superpowers:dispatching-parallel-agents`.
- `superpowers:writing-plans`, `superpowers:executing-plans`.
- `superpowers:test-driven-development`, `superpowers:systematic-debugging`.
- `superpowers:verification-before-completion`, `superpowers:finishing-a-development-branch`.
- `react-skills:*`, `supabase-skills:*`, `github-dev:*`.

### MCP
- `mcp__claude_ai_Supabase__*` — DB (בלי schema changes ב-Phase 1).
- `mcp__claude_ai_Vercel__*` — preview URLs, deployment logs.

## 10. קריאה ראשונה מומלצת

בסדר הזה:
1. הקובץ הזה.
2. `.planning/phase-1/RESEARCH.md`.
3. `.planning/phase-1/PLAN.md`.
4. `~/.claude/agents/phase-orchestrator.md`.
5. `/Users/idankatz15/Desktop/3_APP_DEV/repo-temp/CLAUDE.md`.
6. `~/.claude/plans/binary-swimming-toucan.md` (section Phase 1).

## 11. Smoke test אחרי Wave 2 (לפני merge)

- [ ] Feature flag OFF → StatsView הישן בדיוק כפי שהיה.
- [ ] Feature flag ON → StatsViewV2 חדש.
- [ ] Hero CTA → SessionView עם נושא נכון, ≤15 שאלות.
- [ ] Mobile (390×844) → Hero נגמר מעל 500px.
- [ ] LCP (Slow 3G + 4× CPU throttle) < 2500ms.
- [ ] Dark mode.
- [ ] Regression: תשובות, SRS, admin edits — עובדים כרגיל.

## 12. Escalation

- בדיקה נכשלת אחרי 2 ניסיונות — עצור.
- LCP baseline > 3500ms — עצור.
- TypeScript build נשבר — resolver אוטומטי, הצג לפני commit.
- Playwright לא מתחבר ל-preview — עצור.
- Merge gate נכשל — עצור, אל תמרג.

---

**סוף הפרומפט.** עברית פשוטה, קצרה, בלי ז'רגון.
