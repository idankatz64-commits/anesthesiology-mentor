# Academy Module — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cohort management (email allowlist + two access tiers), quiz/attempt entities with server-enforced windows, a fixed-question quiz flow riding the existing simulation engine, and a basic admin dashboard — everything needed to run the 3×40 baseline.

**Architecture:** Three new Postgres tables (`academy_members`, `quizzes`, `quiz_attempts`) + 2 SECURITY DEFINER RPCs, all additive — zero changes to existing tables/triggers (especially never `user_answers` / `trg_sync_answer_history`). Frontend adds one resident view (`AcademyView`), three admin tabs, and threads a `quizId` through the existing `SessionState`/simulation engine so a quiz session submits to `quiz_attempts` instead of the SRS pipeline.

**Tech Stack:** React+Vite+TS, Tailwind, supabase-js (client at `@/integrations/supabase/client`), vitest. Spec: `docs/specs/2026-08-12-academy-module-design.md`.

## Global Constraints

- **NEVER run `supabase db reset` or `supabase db push`** — replaying this repo's migrations breaks prod (only 4/26 were ever applied). DB changes are applied via Supabase MCP against project `ksbblqnwcmfylpxygyrj`, and recorded as a migration file in the repo with the header comment convention.
- **Additive only.** Do not modify existing tables, triggers, functions, or RLS. Quiz answers go to `quiz_attempts` ONLY — never write quiz answers to `user_answers`/`answer_history`/`spaced_repetition`.
- New tables are not in generated `types.ts`; use the existing precedent (raw query + cast, like `topic_summaries` / `(supabase.from("saved_sessions") as any)`), with local TS interfaces.
- All user-facing strings in Hebrew. UI components match existing admin-tab styling (read `src/components/admin/UserManagementTab.tsx` for classes before writing a tab).
- `npm test` (vitest) must stay green; `npx tsc --noEmit` must not gain new errors (baseline: 3 pre-existing).
- No `console.log` in production code (`console.warn`/`console.error` for genuine failures only, matching AppContext conventions). Errors surface to the user via toast — never silently swallowed.
- Commit after every task (conventional commits). Do NOT push unless Idan approves.

## File Structure

| File                                                                                                  | Action | Responsibility                                                                   |
| ----------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| `supabase/migrations/20260812000001_academy_module.sql`                                               | Create | Schema + RLS + RPCs (record of what MCP applied)                                 |
| `src/lib/academyDomains.ts`                                                                           | Create | Miller chapter → clinical domain mapping (pure data)                             |
| `src/lib/quizScore.ts`                                                                                | Create | Pure attempt scoring                                                             |
| `src/lib/academyRepository.ts`                                                                        | Create | All Supabase calls for academy tables + pure helpers                             |
| `src/lib/types.ts`                                                                                    | Modify | `ViewId` + `SessionState.quizId`                                                 |
| `src/contexts/AppContext.tsx`                                                                         | Modify | Membership hydration, `academyOnly`, `startSession` quiz param, autosave payload |
| `src/components/views/SessionView.tsx`                                                                | Modify | Quiz-attempt submit branch                                                       |
| `src/components/views/AcademyView.tsx`                                                                | Create | Resident screen: open quizzes + my results                                       |
| `src/pages/Index.tsx`                                                                                 | Modify | `'academy'` case + academy-only guard                                            |
| `src/components/Sidebar.tsx`, `src/components/MobileBottomNav.tsx`, `src/components/MobileHeader.tsx` | Modify | Nav entry + tier filtering                                                       |
| `src/pages/AdminDashboard.tsx`                                                                        | Modify | 3 new tabs                                                                       |
| `src/components/admin/AcademyMembersTab.tsx`                                                          | Create | Cohort management                                                                |
| `src/components/admin/AcademyQuizzesTab.tsx`                                                          | Create | Quiz creation + list                                                             |
| `src/components/admin/AcademyDashboardTab.tsx`                                                        | Create | Submission matrix + domain breakdown                                             |
| `src/test/academyDomains.test.ts`, `src/test/quizScore.test.ts`, `src/test/academyRepository.test.ts` | Create | Unit tests for all pure logic                                                    |

---

### Task 0: Database migration (schema + RLS + RPCs)

**Files:**

- Create: `supabase/migrations/20260812000001_academy_module.sql`

**Interfaces:**

- Produces: tables `public.academy_members`, `public.quizzes`, `public.quiz_attempts`; RPCs `public.claim_academy_membership()` and `public.quiz_cohort_stats(_quiz_id uuid)`. All later tasks depend on these exact column names.

- [ ] **Step 1: Write the migration file** with exactly this content:

```sql
-- Academy module (Phase A): cohort members, quizzes, quiz attempts.
-- Additive only — touches NO existing table, trigger, or function.
-- Design: docs/specs/2026-08-12-academy-module-design.md
-- Applied via Supabase MCP on 2026-08-12; recorded here for source-of-truth.

CREATE TABLE IF NOT EXISTS public.academy_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text,
  user_id uuid UNIQUE,
  access_level text NOT NULL DEFAULT 'academy' CHECK (access_level IN ('academy','full')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.academy_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  quiz_type text NOT NULL DEFAULT 'weekly' CHECK (quiz_type IN ('baseline','weekly')),
  question_ids text[] NOT NULL,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  time_limit_minutes integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quizzes_window_valid CHECK (closes_at > opens_at)
);
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  question_ids text[] NOT NULL,
  answers jsonb NOT NULL,
  score integer NOT NULL,
  total integer NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quiz_attempts_once UNIQUE (quiz_id, user_id)
);
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON public.quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON public.quiz_attempts(quiz_id);

-- academy_members policies
DROP POLICY IF EXISTS "Members can read own membership" ON public.academy_members;
CREATE POLICY "Members can read own membership"
  ON public.academy_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR lower(email) = lower(coalesce(auth.jwt()->>'email','')));

DROP POLICY IF EXISTS "Admins can read members" ON public.academy_members;
CREATE POLICY "Admins can read members"
  ON public.academy_members FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert members" ON public.academy_members;
CREATE POLICY "Admins can insert members"
  ON public.academy_members FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update members" ON public.academy_members;
CREATE POLICY "Admins can update members"
  ON public.academy_members FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete members" ON public.academy_members;
CREATE POLICY "Admins can delete members"
  ON public.academy_members FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- quizzes policies
DROP POLICY IF EXISTS "Members and admins can read quizzes" ON public.quizzes;
CREATE POLICY "Members and admins can read quizzes"
  ON public.quizzes FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.academy_members m
      WHERE m.user_id = auth.uid() AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Admins can insert quizzes" ON public.quizzes;
CREATE POLICY "Admins can insert quizzes"
  ON public.quizzes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update quizzes" ON public.quizzes;
CREATE POLICY "Admins can update quizzes"
  ON public.quizzes FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete quizzes" ON public.quizzes;
CREATE POLICY "Admins can delete quizzes"
  ON public.quizzes FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- quiz_attempts policies. The INSERT policy is the server-side enforcement of
-- the quiz window and cohort membership — the client cannot bypass it.
DROP POLICY IF EXISTS "Members can submit attempt during window" ON public.quiz_attempts;
CREATE POLICY "Members can submit attempt during window"
  ON public.quiz_attempts FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.academy_members m
      WHERE m.user_id = auth.uid() AND m.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = quiz_id AND now() >= q.opens_at AND now() <= q.closes_at
    )
  );

DROP POLICY IF EXISTS "Users can read own attempts" ON public.quiz_attempts;
CREATE POLICY "Users can read own attempts"
  ON public.quiz_attempts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can read attempts" ON public.quiz_attempts;
CREATE POLICY "Admins can read attempts"
  ON public.quiz_attempts FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete attempts" ON public.quiz_attempts;
CREATE POLICY "Admins can delete attempts"
  ON public.quiz_attempts FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
-- No user UPDATE/DELETE on attempts: submissions are immutable.

-- Link a logged-in user to their allowlisted email, then return membership.
CREATE OR REPLACE FUNCTION public.claim_academy_membership()
RETURNS TABLE (access_level text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.academy_members m
     SET user_id = auth.uid()
   WHERE m.user_id IS NULL
     AND auth.uid() IS NOT NULL
     AND lower(m.email) = lower(coalesce(auth.jwt()->>'email',''));

  RETURN QUERY
    SELECT m.access_level, m.status
      FROM public.academy_members m
     WHERE m.user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.claim_academy_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_academy_membership() FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_academy_membership() TO authenticated;

-- Anonymous cohort aggregate a resident may see (avg/median, no names).
CREATE OR REPLACE FUNCTION public.quiz_cohort_stats(_quiz_id uuid)
RETURNS TABLE (submitted bigint, avg_pct numeric, median_pct numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*),
         round(avg(100.0 * a.score / nullif(a.total, 0)), 1),
         round((percentile_cont(0.5) WITHIN GROUP
           (ORDER BY 100.0 * a.score / nullif(a.total, 0)))::numeric, 1)
    FROM public.quiz_attempts a
   WHERE a.quiz_id = _quiz_id
     AND (
       public.is_admin(auth.uid())
       OR EXISTS (
         SELECT 1 FROM public.academy_members m
         WHERE m.user_id = auth.uid() AND m.status = 'active'
       )
     );
$$;
REVOKE ALL ON FUNCTION public.quiz_cohort_stats(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quiz_cohort_stats(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.quiz_cohort_stats(uuid) TO authenticated;
```

- [ ] **Step 2: Apply via Supabase MCP** — use `mcp__claude_ai_Supabase__apply_migration` against project `ksbblqnwcmfylpxygyrj` with name `academy_module` and the exact SQL above. Do NOT use the Supabase CLI.

- [ ] **Step 3: Verify with read-only probes** via `mcp__claude_ai_Supabase__execute_sql`:

```sql
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('academy_members','quizzes','quiz_attempts');
-- Expected: 3 rows, relrowsecurity = true for all

SELECT polname, polcmd FROM pg_policy
WHERE polrelid IN ('public.academy_members'::regclass,'public.quizzes'::regclass,'public.quiz_attempts'::regclass)
ORDER BY 1;
-- Expected: 13 policies

SELECT proname, proacl FROM pg_proc
WHERE proname IN ('claim_academy_membership','quiz_cohort_stats');
-- Expected: 2 rows; proacl must NOT include anon (grant hygiene — the
-- increment_user_answer drift lesson)
```

- [ ] **Step 4: Run advisors** — `mcp__claude_ai_Supabase__get_advisors` (security). Expected: no NEW findings mentioning academy tables/functions (the pre-existing findings stay).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260812000001_academy_module.sql
git commit -m "feat(academy): schema, RLS and RPCs for cohort, quizzes, attempts"
```

---

### Task 1: Clinical domain mapping

**Files:**

- Create: `src/lib/academyDomains.ts`
- Test: `src/test/academyDomains.test.ts`

**Interfaces:**

- Produces: `ACADEMY_DOMAINS: AcademyDomain[]`, `UNCLASSIFIED_DOMAIN: string`, `domainOfChapter(chapter: number | null | undefined): string` (returns the domain **label**). Consumed by Task 9 dashboard.

- [ ] **Step 1: Write the failing test** (`src/test/academyDomains.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { ACADEMY_DOMAINS, UNCLASSIFIED_DOMAIN, domainOfChapter } from "@/lib/academyDomains";

describe("academyDomains", () => {
    it("covers every Miller chapter 1..87 exactly once", () => {
        const seen = new Map<number, string>();
        for (const d of ACADEMY_DOMAINS) {
            for (const ch of d.chapters) {
                expect(seen.has(ch), `chapter ${ch} mapped twice`).toBe(false);
                seen.set(ch, d.id);
            }
        }
        for (let ch = 1; ch <= 87; ch++) {
            expect(seen.has(ch), `chapter ${ch} unmapped`).toBe(true);
        }
        expect(seen.size).toBe(87);
    });

    it("maps known chapters to the right domain", () => {
        expect(domainOfChapter(12)).toBe("פיזיולוגיה"); // Respiratory Physiology
        expect(domainOfChapter(22)).toBe("פרמקולוגיה"); // Opioids
        expect(domainOfChapter(40)).toBe("נתיב אוויר והרדמה אזורית"); // Airway
        expect(domainOfChapter(58)).toBe("מיילדות"); // Obstetrics
        expect(domainOfChapter(72)).toBe("ילדים"); // Pediatric
        expect(domainOfChapter(82)).toBe("טיפול נמרץ, החייאה וחירום"); // ACLS
    });

    it("returns unclassified for 0, null, undefined, out-of-range", () => {
        expect(domainOfChapter(0)).toBe(UNCLASSIFIED_DOMAIN);
        expect(domainOfChapter(null)).toBe(UNCLASSIFIED_DOMAIN);
        expect(domainOfChapter(undefined)).toBe(UNCLASSIFIED_DOMAIN);
        expect(domainOfChapter(999)).toBe(UNCLASSIFIED_DOMAIN);
    });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npm test -- src/test/academyDomains.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation** (`src/lib/academyDomains.ts`):

```ts
// Clinical-domain grouping of Miller 10e chapters for the academy weakness
// profile. 120 baseline questions cannot resolve 87 chapters, so aggregation
// happens at these 12 domains (design doc §4).
export interface AcademyDomain {
    id: string;
    label: string;
    chapters: number[];
}

const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const ACADEMY_DOMAINS: AcademyDomain[] = [
    { id: "foundations", label: "יסודות המקצוע", chapters: [...range(1, 9), 26, 27, ...range(84, 87)] },
    { id: "physiology", label: "פיזיולוגיה", chapters: range(10, 15) },
    { id: "pharmacology", label: "פרמקולוגיה", chapters: range(16, 25) },
    { id: "preop", label: "הערכה טרום-ניתוחית ומחלות נלוות", chapters: [...range(28, 31), 61] },
    { id: "monitoring", label: "ניטור", chapters: [...range(32, 37), 39] },
    { id: "airway-regional", label: "נתיב אוויר והרדמה אזורית", chapters: range(40, 42) },
    { id: "fluids-blood", label: "נוזלים, דם וקרישה", chapters: [38, ...range(43, 46)] },
    { id: "pain", label: "כאב ופליאציה", chapters: [47, 48, 77] },
    { id: "subspecialty", label: "הרדמה תת-התמחותית", chapters: [...range(49, 57), 60, ...range(65, 69)] },
    { id: "obstetrics", label: "מיילדות", chapters: [58, 59] },
    { id: "pediatrics", label: "ילדים", chapters: range(72, 75) },
    {
        id: "icu-emergency",
        label: "טיפול נמרץ, החייאה וחירום",
        chapters: [...range(62, 64), 70, 71, 76, ...range(78, 83)],
    },
];

export const UNCLASSIFIED_DOMAIN = "לא מסווג";

const CHAPTER_TO_LABEL: Record<number, string> = {};
for (const d of ACADEMY_DOMAINS) {
    for (const ch of d.chapters) CHAPTER_TO_LABEL[ch] = d.label;
}

export function domainOfChapter(chapter: number | null | undefined): string {
    if (!chapter) return UNCLASSIFIED_DOMAIN;
    return CHAPTER_TO_LABEL[chapter] ?? UNCLASSIFIED_DOMAIN;
}
```

- [ ] **Step 4: Run test to verify it passes** — `npm test -- src/test/academyDomains.test.ts`. Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/academyDomains.ts src/test/academyDomains.test.ts
git commit -m "feat(academy): clinical domain mapping for Miller chapters"
```

---

### Task 2: Pure attempt scoring

**Files:**

- Create: `src/lib/quizScore.ts`
- Test: `src/test/quizScore.test.ts`

**Interfaces:**

- Consumes: `Question`, `KEYS` from `@/lib/types`.
- Produces: `scoreQuizAttempt(quiz: Question[], answers: (string | null)[]): QuizOutcome` where `QuizOutcome = { score: number; total: number; pct: number; questionIds: string[]; answers: (string | null)[] }`. Scoring semantics MUST mirror `ResultsView.tsx` (`userAns && userAns === q[KEYS.CORRECT]`).

- [ ] **Step 1: Write the failing test** (`src/test/quizScore.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { scoreQuizAttempt } from "@/lib/quizScore";
import { KEYS, Question } from "@/lib/types";

const q = (id: string, correct: string): Question =>
    ({ [KEYS.ID]: id, [KEYS.CORRECT]: correct }) as unknown as Question;

describe("scoreQuizAttempt", () => {
    it("counts only exact matches on answered questions", () => {
        const quiz = [q("1", "A"), q("2", "B"), q("3", "C")];
        const out = scoreQuizAttempt(quiz, ["A", "X", null]);
        expect(out.score).toBe(1);
        expect(out.total).toBe(3);
        expect(out.pct).toBe(33);
        expect(out.questionIds).toEqual(["1", "2", "3"]);
        expect(out.answers).toEqual(["A", "X", null]);
    });

    it("handles all-correct and empty quiz without dividing by zero", () => {
        expect(scoreQuizAttempt([q("1", "A")], ["A"]).pct).toBe(100);
        expect(scoreQuizAttempt([], []).pct).toBe(0);
    });

    it("treats missing answer slots as unanswered", () => {
        const out = scoreQuizAttempt([q("1", "A"), q("2", "B")], ["A"]);
        expect(out.score).toBe(1);
        expect(out.answers).toEqual(["A", null]);
    });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- src/test/quizScore.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`src/lib/quizScore.ts`):

```ts
import { KEYS, Question } from "@/lib/types";

export interface QuizOutcome {
    score: number;
    total: number;
    pct: number;
    questionIds: string[];
    answers: (string | null)[];
}

// Mirrors ResultsView scoring: an answer counts only when it exactly equals
// the question's correct option.
export function scoreQuizAttempt(quiz: Question[], answers: (string | null)[]): QuizOutcome {
    const normalized = quiz.map((_, i) => answers[i] ?? null);
    let score = 0;
    quiz.forEach((question, i) => {
        const userAns = normalized[i];
        if (userAns && userAns === question[KEYS.CORRECT]) score++;
    });
    const total = quiz.length;
    return {
        score,
        total,
        pct: total > 0 ? Math.round((score / total) * 100) : 0,
        questionIds: quiz.map((question) => String(question[KEYS.ID])),
        answers: normalized,
    };
}
```

- [ ] **Step 4: Run to verify pass** — `npm test -- src/test/quizScore.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quizScore.ts src/test/quizScore.test.ts
git commit -m "feat(academy): pure quiz attempt scoring"
```

---

### Task 3: Academy repository (all Supabase calls)

**Files:**

- Create: `src/lib/academyRepository.ts`
- Test: `src/test/academyRepository.test.ts`

**Interfaces:**

- Consumes: `supabase` client, `scoreQuizAttempt` (Task 2), `Question` type.
- Produces (exact signatures later tasks use):
    - `interface AcademyMembership { access_level: "academy" | "full"; status: "active" | "suspended" }`
    - `interface AcademyMemberRow { id: string; email: string; full_name: string | null; user_id: string | null; access_level: string; status: string; created_at: string }`
    - `interface QuizRow { id: string; title: string; quiz_type: "baseline" | "weekly"; question_ids: string[]; opens_at: string; closes_at: string; time_limit_minutes: number | null; created_at: string }`
    - `interface QuizAttemptRow { id: string; quiz_id: string; user_id: string; question_ids: string[]; answers: (string | null)[]; score: number; total: number; submitted_at: string }`
    - `claimAcademyMembership(): Promise<AcademyMembership | null>`
    - `fetchQuizzes(): Promise<QuizRow[]>` · `fetchMyAttempts(userId: string): Promise<QuizAttemptRow[]>`
    - `submitQuizAttempt(row: NewAttempt): Promise<void>` — throws `Error("ALREADY_SUBMITTED")` on PG 23505, `Error("WINDOW_CLOSED")` on RLS denial (PG 42501), `Error(message)` otherwise
    - `buildAttemptRow(quizId: string, userId: string, quiz: Question[], answers: (string | null)[]): NewAttempt` (pure)
    - `parseEmailList(text: string): { valid: string[]; invalid: string[] }` (pure)
    - Admin: `fetchMembers()`, `addMembers(emails: string[])`, `updateMember(id, patch)`, `deleteMember(id)`, `createQuiz(input)`, `deleteQuiz(id)`, `fetchAllAttempts()`, `fetchCohortStats(quizId)`

- [ ] **Step 1: Write the failing test for the pure helpers** (`src/test/academyRepository.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { parseEmailList, buildAttemptRow } from "@/lib/academyRepository";
import { KEYS, Question } from "@/lib/types";

const q = (id: string, correct: string): Question =>
    ({ [KEYS.ID]: id, [KEYS.CORRECT]: correct }) as unknown as Question;

describe("parseEmailList", () => {
    it("splits on newlines/commas/whitespace, lowercases, dedupes", () => {
        const { valid, invalid } = parseEmailList("  A@x.com \n b@y.co.il, a@x.com\nnot-an-email\n");
        expect(valid).toEqual(["a@x.com", "b@y.co.il"]);
        expect(invalid).toEqual(["not-an-email"]);
    });

    it("returns empty arrays for empty input", () => {
        expect(parseEmailList("  \n ")).toEqual({ valid: [], invalid: [] });
    });
});

describe("buildAttemptRow", () => {
    it("snapshots served order and computes score", () => {
        const row = buildAttemptRow("quiz-1", "user-1", [q("10", "A"), q("20", "B")], ["A", "C"]);
        expect(row).toEqual({
            quiz_id: "quiz-1",
            user_id: "user-1",
            question_ids: ["10", "20"],
            answers: ["A", "C"],
            score: 1,
            total: 2,
        });
    });
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- src/test/academyRepository.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** (`src/lib/academyRepository.ts`):

```ts
import { supabase } from "@/integrations/supabase/client";
import { Question } from "@/lib/types";
import { scoreQuizAttempt } from "@/lib/quizScore";

export interface AcademyMembership {
    access_level: "academy" | "full";
    status: "active" | "suspended";
}

export interface AcademyMemberRow {
    id: string;
    email: string;
    full_name: string | null;
    user_id: string | null;
    access_level: string;
    status: string;
    created_at: string;
}

export interface QuizRow {
    id: string;
    title: string;
    quiz_type: "baseline" | "weekly";
    question_ids: string[];
    opens_at: string;
    closes_at: string;
    time_limit_minutes: number | null;
    created_at: string;
}

export interface QuizAttemptRow {
    id: string;
    quiz_id: string;
    user_id: string;
    question_ids: string[];
    answers: (string | null)[];
    score: number;
    total: number;
    submitted_at: string;
}

export type NewAttempt = Omit<QuizAttemptRow, "id" | "submitted_at">;

export interface CohortStats {
    submitted: number;
    avg_pct: number | null;
    median_pct: number | null;
}

// Academy tables are not in the generated types yet — same raw-query
// precedent as topic_summaries / saved_sessions casts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => supabase.from(name as never) as any;

function throwIfError(error: { code?: string; message: string } | null): void {
    if (!error) return;
    if (error.code === "23505") throw new Error("ALREADY_SUBMITTED");
    if (error.code === "42501") throw new Error("WINDOW_CLOSED");
    throw new Error(error.message);
}

// ---------- pure helpers ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmailList(text: string): { valid: string[]; invalid: string[] } {
    const tokens = text
        .split(/[\s,;]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const t of tokens) {
        if (!EMAIL_RE.test(t)) {
            if (!invalid.includes(t)) invalid.push(t);
        } else if (!valid.includes(t)) {
            valid.push(t);
        }
    }
    return { valid, invalid };
}

export function buildAttemptRow(
    quizId: string,
    userId: string,
    quiz: Question[],
    answers: (string | null)[],
): NewAttempt {
    const outcome = scoreQuizAttempt(quiz, answers);
    return {
        quiz_id: quizId,
        user_id: userId,
        question_ids: outcome.questionIds,
        answers: outcome.answers,
        score: outcome.score,
        total: outcome.total,
    };
}

// ---------- member-facing ----------

export async function claimAcademyMembership(): Promise<AcademyMembership | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("claim_academy_membership");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { access_level: row.access_level, status: row.status };
}

export async function fetchQuizzes(): Promise<QuizRow[]> {
    const { data, error } = await table("quizzes").select("*").order("opens_at", { ascending: false });
    throwIfError(error);
    return (data ?? []) as QuizRow[];
}

export async function fetchMyAttempts(userId: string): Promise<QuizAttemptRow[]> {
    const { data, error } = await table("quiz_attempts")
        .select("*")
        .eq("user_id", userId)
        .order("submitted_at", { ascending: false });
    throwIfError(error);
    return (data ?? []) as QuizAttemptRow[];
}

export async function submitQuizAttempt(row: NewAttempt): Promise<void> {
    const { error } = await table("quiz_attempts").insert(row);
    throwIfError(error);
}

export async function fetchCohortStats(quizId: string): Promise<CohortStats | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("quiz_cohort_stats", {
        _quiz_id: quizId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
        submitted: Number(row.submitted ?? 0),
        avg_pct: row.avg_pct === null ? null : Number(row.avg_pct),
        median_pct: row.median_pct === null ? null : Number(row.median_pct),
    };
}

// ---------- admin ----------

export async function fetchMembers(): Promise<AcademyMemberRow[]> {
    const { data, error } = await table("academy_members").select("*").order("created_at", { ascending: true });
    throwIfError(error);
    return (data ?? []) as AcademyMemberRow[];
}

export async function addMembers(emails: string[]): Promise<void> {
    if (emails.length === 0) return;
    const rows = emails.map((email) => ({ email }));
    const { error } = await table("academy_members").upsert(rows, {
        onConflict: "email",
        ignoreDuplicates: true,
    });
    throwIfError(error);
}

export async function updateMember(
    id: string,
    patch: Partial<Pick<AcademyMemberRow, "full_name" | "access_level" | "status">>,
): Promise<void> {
    const { error } = await table("academy_members").update(patch).eq("id", id);
    throwIfError(error);
}

export async function deleteMember(id: string): Promise<void> {
    const { error } = await table("academy_members").delete().eq("id", id);
    throwIfError(error);
}

export interface NewQuiz {
    title: string;
    quiz_type: "baseline" | "weekly";
    question_ids: string[];
    opens_at: string;
    closes_at: string;
    created_by: string | null;
}

export async function createQuiz(input: NewQuiz): Promise<void> {
    const { error } = await table("quizzes").insert(input);
    throwIfError(error);
}

export async function deleteQuiz(id: string): Promise<void> {
    const { error } = await table("quizzes").delete().eq("id", id);
    throwIfError(error);
}

export async function fetchAllAttempts(): Promise<QuizAttemptRow[]> {
    const { data, error } = await table("quiz_attempts").select("*").order("submitted_at", { ascending: true });
    throwIfError(error);
    return (data ?? []) as QuizAttemptRow[];
}
```

- [ ] **Step 4: Run to verify pass** — `npm test -- src/test/academyRepository.test.ts`. Expected: PASS. Also `npx tsc --noEmit` — no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/academyRepository.ts src/test/academyRepository.test.ts
git commit -m "feat(academy): repository layer for members, quizzes, attempts"
```

---

### Task 4: Types + AppContext (membership, tier flag, quiz session plumbing)

**Files:**

- Modify: `src/lib/types.ts` (ViewId at :92, SessionState at :66-81)
- Modify: `src/contexts/AppContext.tsx`

**Interfaces:**

- Consumes: `claimAcademyMembership`, `AcademyMembership` (Task 3).
- Produces (later tasks rely on): `SessionState.quizId?: string`; ViewId includes `'academy'`; context exports `academyMember: AcademyMembership | null`, `academyOnly: boolean`; `startSession(pool, count, mode, quizMeta?: { quizId: string })`; autosave payload round-trips `quizId`.

- [ ] **Step 1: types.ts** — add to `SessionState` (after `unseenOnly: boolean;`):

```ts
  /** Set when this session is an academy quiz — submit routes to quiz_attempts */
  quizId?: string;
```

and add `'academy'` to the `ViewId` union at line 92.

- [ ] **Step 2: AppContext — SavedSessionData + membership state.** In the `SavedSessionData` interface (AppContext.tsx:28-39) add `quizId?: string;`. Add imports:

```ts
import { claimAcademyMembership, AcademyMembership } from "@/lib/academyRepository";
```

Add state next to the `isAdmin`/`isEditor` state (~line 238):

```ts
const [academyMember, setAcademyMember] = useState<AcademyMembership | null>(null);
```

In `hydrateUser`, right after the `admin_users` role query block (~line 293-302), add:

```ts
if (userId) {
    claimAcademyMembership()
        .then((m) => setAcademyMember(m))
        .catch((e) => console.warn("Failed to load academy membership:", e));
} else {
    setAcademyMember(null);
}
```

(Also clear it in the sign-out path next to the existing role clearing at ~line 338-339: `setAcademyMember(null);`.)

- [ ] **Step 3: AppContext — startSession quiz param.** Change the `startSession` callback (AppContext.tsx:424) signature to:

```ts
const startSession = useCallback(
  (pool: Question[], count: number, mode: SessionState["mode"], quizMeta?: { quizId: string }) => {
```

and inside the `setSession({...})` object it builds, add `quizId: quizMeta?.quizId,`. Update the interface declaration of `startSession` in `AppContextType` accordingly.

- [ ] **Step 4: AppContext — autosave round-trip.** In `saveSessionToDb` (AppContext.tsx:1068), where `sessionData` is built from `sessionRef.current` (~1075-1086), add `quizId: sessionRef.current.quizId,`. In `resumeSessionFromDb` (AppContext.tsx:1106), in the `setSession({...})` object add `quizId: savedSessionInfo.quizId,`.

- [ ] **Step 5: AppContext — export.** Add to `AppContextType` interface:

```ts
academyMember: AcademyMembership | null;
academyOnly: boolean;
```

Compute before the value object (~line 1169):

```ts
const academyOnly =
    !!academyMember &&
    academyMember.status === "active" &&
    academyMember.access_level === "academy" &&
    !isAdmin &&
    !isEditor;
```

and add `academyMember, academyOnly,` to the context value object.

- [ ] **Step 6: Verify** — `npx tsc --noEmit` (no new errors) and `npm test` (all existing suites still green — especially `srs*.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/contexts/AppContext.tsx
git commit -m "feat(academy): membership hydration, tier flag, quiz session plumbing"
```

---

### Task 5: SessionView quiz-submit branch

**Files:**

- Modify: `src/components/views/SessionView.tsx` (handleSubmitSimulation at :512-525)

**Interfaces:**

- Consumes: `session.quizId` (Task 4), `buildAttemptRow`, `submitQuizAttempt` (Task 3), `supabase` client.
- Produces: quiz sessions write ONLY to `quiz_attempts`; SRS/user_answers writes are skipped for quiz sessions.

- [ ] **Step 1: Add imports** at the top of SessionView.tsx:

```ts
import { supabase } from "@/integrations/supabase/client";
import { buildAttemptRow, submitQuizAttempt } from "@/lib/academyRepository";
```

(Check first — if `supabase` is already imported, keep the existing import.)

- [ ] **Step 2: Add the quiz submit helper** directly above `handleSubmitSimulation` (:512):

```ts
// Academy quiz: submit routes to quiz_attempts ONLY — never to the SRS
// pipeline (user_answers has a sync trigger; see design doc §3).
const submitQuizAttemptFlow = async (): Promise<boolean> => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
        toast({ title: "אינך מחובר", description: "התחבר מחדש ונסה שוב", variant: "destructive" });
        return false;
    }
    try {
        await submitQuizAttempt(buildAttemptRow(session.quizId as string, userId, quiz, answers));
        return true;
    } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "ALREADY_SUBMITTED") {
            toast({ title: "כבר הגשת את הבוחן הזה", description: "ההגשה הקודמת שלך נשמרה" });
            return true;
        }
        if (msg === "WINDOW_CLOSED") {
            toast({
                title: "חלון הבוחן נסגר",
                description: "ההגשה לא נקלטה — פנה לאחראי האקדמיה",
                variant: "destructive",
            });
        } else {
            toast({
                title: "שגיאה בהגשת הבוחן",
                description: "נסה שוב — התשובות שלך שמורות",
                variant: "destructive",
            });
        }
        return false;
    }
};
```

- [ ] **Step 3: Branch inside handleSubmitSimulation** — replace its body so the quiz path short-circuits before `processQuizAnswersForSrs`:

```ts
const handleSubmitSimulation = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
        if (session.quizId) {
            const ok = await submitQuizAttemptFlow();
            if (!ok) return; // keep session + autosave alive so the resident can retry
            shouldAutoSaveRef.current = false;
            clearSavedSession();
            navigate("results");
            return;
        }
        const outcome = await processQuizAnswersForSrs("handleSubmitSimulation");
        shouldAutoSaveRef.current = false;
        if (outcome.canClearSession) {
            clearSavedSession();
        }
        navigate("results");
    } finally {
        isSubmittingRef.current = false;
    }
};
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npm test` green. Manual verification happens in Task 10.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/SessionView.tsx
git commit -m "feat(academy): quiz sessions submit to quiz_attempts, bypassing SRS writes"
```

---

### Task 6: AcademyView + navigation + tier gating

**Files:**

- Create: `src/components/views/AcademyView.tsx`
- Modify: `src/pages/Index.tsx` (:26-43 switch, imports at :8-19)
- Modify: `src/components/Sidebar.tsx` (:11-21 navItems), `src/components/MobileBottomNav.tsx` (:7-12), `src/components/MobileHeader.tsx` (:8-14)

**Interfaces:**

- Consumes: `useApp()` (`data`, `startSession`, `academyMember`, `academyOnly`, `navigate`), `fetchQuizzes`, `fetchMyAttempts`, `fetchCohortStats`, `QuizRow`, `QuizAttemptRow` (Task 3), `KEYS` (types).
- Produces: view id `'academy'` reachable from nav; academy-tier users locked to it.

- [ ] **Step 1: Create AcademyView** (`src/components/views/AcademyView.tsx`):

```tsx
import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Clock, CheckCircle2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { KEYS, Question } from "@/lib/types";
import {
    fetchQuizzes,
    fetchMyAttempts,
    fetchCohortStats,
    QuizRow,
    QuizAttemptRow,
    CohortStats,
} from "@/lib/academyRepository";

const fmtDate = (iso: string): string =>
    new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function AcademyView() {
    const { data, startSession } = useApp();
    const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
    const [attempts, setAttempts] = useState<QuizAttemptRow[]>([]);
    const [stats, setStats] = useState<Record<string, CohortStats | null>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data: userData } = await supabase.auth.getUser();
                const userId = userData?.user?.id;
                if (!userId) return;
                const [qs, ats] = await Promise.all([fetchQuizzes(), fetchMyAttempts(userId)]);
                if (cancelled) return;
                setQuizzes(qs);
                setAttempts(ats);
                const statEntries = await Promise.all(
                    ats.map(async (a) => [a.quiz_id, await fetchCohortStats(a.quiz_id).catch(() => null)] as const),
                );
                if (!cancelled) setStats(Object.fromEntries(statEntries));
            } catch (e) {
                console.warn("Academy load failed:", e);
                toast.error("טעינת הבחנים נכשלה — נסה לרענן");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const attemptByQuiz = useMemo(() => new Map(attempts.map((a) => [a.quiz_id, a])), [attempts]);

    const now = Date.now();
    const open = quizzes.filter(
        (q) => now >= Date.parse(q.opens_at) && now <= Date.parse(q.closes_at) && !attemptByQuiz.has(q.id),
    );
    const upcoming = quizzes.filter((q) => now < Date.parse(q.opens_at));
    const done = attempts;

    const startQuiz = (quizRow: QuizRow) => {
        const byId = new Map(data.map((q) => [String(q[KEYS.ID]), q]));
        const questions = quizRow.question_ids.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q));
        const missing = quizRow.question_ids.length - questions.length;
        if (questions.length === 0) {
            toast.error("שאלות הבוחן לא נמצאו במאגר — פנה לאחראי האקדמיה");
            return;
        }
        if (missing > 0) toast.warning(`${missing} שאלות לא נמצאו במאגר וידולגו`);
        startSession(questions, questions.length, "simulation", { quizId: quizRow.id });
    };

    if (loading) {
        return <div className="p-8 text-center text-muted-foreground">טוען בחנים…</div>;
    }

    return (
        <div className="max-w-3xl mx-auto p-4 space-y-8" dir="rtl">
            <div className="flex items-center gap-3">
                <GraduationCap className="w-8 h-8 text-primary" />
                <div>
                    <h1 className="text-2xl font-bold">אקדמיה — בחנים</h1>
                    <p className="text-sm text-muted-foreground">בחנים שבועיים וסימולציית פתיחה</p>
                </div>
            </div>

            <section>
                <h2 className="font-semibold mb-3 flex items-center gap-2">
                    <PlayCircle className="w-5 h-5" /> בחנים פתוחים
                </h2>
                {open.length === 0 && <p className="text-sm text-muted-foreground">אין בוחן פתוח כרגע.</p>}
                <div className="space-y-3">
                    {open.map((q) => (
                        <div key={q.id} className="border rounded-xl p-4 flex items-center justify-between gap-4">
                            <div>
                                <div className="font-medium">{q.title}</div>
                                <div className="text-sm text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-4 h-4" /> נסגר: {fmtDate(q.closes_at)} · {q.question_ids.length}{" "}
                                    שאלות
                                </div>
                            </div>
                            <button
                                onClick={() => startQuiz(q)}
                                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90"
                            >
                                התחל בוחן
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {upcoming.length > 0 && (
                <section>
                    <h2 className="font-semibold mb-3">בקרוב</h2>
                    <div className="space-y-2">
                        {upcoming.map((q) => (
                            <div key={q.id} className="border rounded-xl p-3 text-sm text-muted-foreground">
                                {q.title} — נפתח {fmtDate(q.opens_at)}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section>
                <h2 className="font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> הבחנים שלי
                </h2>
                {done.length === 0 && <p className="text-sm text-muted-foreground">עדיין לא הגשת בוחן.</p>}
                <div className="space-y-2">
                    {done.map((a) => {
                        const quizRow = quizzes.find((q) => q.id === a.quiz_id);
                        const s = stats[a.quiz_id];
                        const pct = a.total > 0 ? Math.round((100 * a.score) / a.total) : 0;
                        return (
                            <div key={a.id} className="border rounded-xl p-4 flex items-center justify-between gap-4">
                                <div>
                                    <div className="font-medium">{quizRow?.title ?? "בוחן"}</div>
                                    <div className="text-sm text-muted-foreground">
                                        הוגש {fmtDate(a.submitted_at)}
                                        {s &&
                                            s.avg_pct !== null &&
                                            ` · ממוצע מחזור ${s.avg_pct}% (${s.submitted} הגשות)`}
                                    </div>
                                </div>
                                <div className="text-xl font-bold">{pct}%</div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
```

- [ ] **Step 2: Index.tsx** — import `AcademyView` next to the other view imports (:8-19), and in `renderView()`:
    - Add at the **top** of `renderView()` (before the switch), reading `academyOnly` from the existing `useApp()` destructure in `AppContent`:

```ts
if (academyOnly && !["academy", "session", "results"].includes(currentView)) {
  return <AcademyView />;
}
```

- Add the case: `case 'academy': return <AcademyView />;`

- [ ] **Step 3: Nav entries.**
    - `Sidebar.tsx`: pull `academyMember, academyOnly` from `useApp()`. Build the rendered list as:

```ts
const visibleItems = academyOnly
    ? navItems.filter((i) => i.id === "academy")
    : academyMember || isAdmin
      ? navItems
      : navItems.filter((i) => i.id !== "academy");
```

    and add to `navItems` (:11-21): `{ id: 'academy', label: 'אקדמיה', icon: GraduationCap }` (import `GraduationCap` from lucide-react). Use `visibleItems` in the render loop at :76-113. Note: `Sidebar`'s local `isAdmin` state (:34-40) already exists — reuse it. Also, when `academyOnly` is true, hide the `/admin` link (it's already gated by `is_admin`, no change needed) and the SetupView quick-start buttons are unreachable because `renderView` guards them.

- `MobileBottomNav.tsx` / `MobileHeader.tsx`: same pattern — add the academy item and apply the same `visibleItems` filtering (these components must also call `useApp()` for `academyMember`/`academyOnly`; MobileBottomNav has no `isAdmin`, so use `academyMember ? ... : filter-out`).

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npm test` green; `npm run build` succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/AcademyView.tsx src/pages/Index.tsx src/components/Sidebar.tsx src/components/MobileBottomNav.tsx src/components/MobileHeader.tsx
git commit -m "feat(academy): resident academy view, nav entry, tier gating"
```

---

### Task 7: Admin — cohort members tab

**Files:**

- Create: `src/components/admin/AcademyMembersTab.tsx`
- Modify: `src/pages/AdminDashboard.tsx` (:16 AdminTab union, :18-26 tabs array, :93-99 render chain)

**Interfaces:**

- Consumes: `parseEmailList`, `fetchMembers`, `addMembers`, `updateMember`, `deleteMember`, `AcademyMemberRow` (Task 3).

- [ ] **Step 1: Create the tab** (`src/components/admin/AcademyMembersTab.tsx`):

```tsx
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
    parseEmailList,
    fetchMembers,
    addMembers,
    updateMember,
    deleteMember,
    AcademyMemberRow,
} from "@/lib/academyRepository";

export default function AcademyMembersTab() {
    const [members, setMembers] = useState<AcademyMemberRow[]>([]);
    const [emailsText, setEmailsText] = useState("");
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        try {
            setMembers(await fetchMembers());
        } catch (e) {
            console.error("fetchMembers failed:", e);
            toast.error("טעינת רשימת המחזור נכשלה");
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const handleAdd = async () => {
        const { valid, invalid } = parseEmailList(emailsText);
        if (invalid.length > 0) {
            toast.error(`כתובות לא תקינות: ${invalid.join(", ")}`);
            return;
        }
        if (valid.length === 0) return;
        setBusy(true);
        try {
            await addMembers(valid);
            toast.success(`${valid.length} מיילים נוספו למחזור`);
            setEmailsText("");
            await reload();
        } catch (e) {
            console.error("addMembers failed:", e);
            toast.error("הוספת המיילים נכשלה");
        } finally {
            setBusy(false);
        }
    };

    const patch = async (id: string, p: Parameters<typeof updateMember>[1]) => {
        try {
            await updateMember(id, p);
            await reload();
        } catch (e) {
            console.error("updateMember failed:", e);
            toast.error("עדכון החבר נכשל");
        }
    };

    const remove = async (m: AcademyMemberRow) => {
        if (!window.confirm(`להסיר את ${m.email} מהמחזור?`)) return;
        try {
            await deleteMember(m.id);
            await reload();
        } catch (e) {
            console.error("deleteMember failed:", e);
            toast.error("הסרת החבר נכשלה");
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <div className="border rounded-xl p-4 space-y-3">
                <h3 className="font-semibold">הוספת מתמחים למחזור</h3>
                <p className="text-sm text-muted-foreground">
                    הדבק מיילים (שורה לכל מייל או מופרדים בפסיק). מי שיירשם עם מייל מהרשימה ישויך אוטומטית.
                </p>
                <textarea
                    value={emailsText}
                    onChange={(e) => setEmailsText(e.target.value)}
                    rows={4}
                    dir="ltr"
                    className="w-full border rounded-lg p-2 text-sm font-mono"
                    placeholder="resident1@gmail.com&#10;resident2@gmail.com"
                />
                <button
                    onClick={handleAdd}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
                >
                    הוסף למחזור
                </button>
            </div>

            <div className="border rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-right">
                            <th className="p-2">מייל</th>
                            <th className="p-2">שם</th>
                            <th className="p-2">נרשם?</th>
                            <th className="p-2">רמת גישה</th>
                            <th className="p-2">סטטוס</th>
                            <th className="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {members.map((m) => (
                            <tr key={m.id} className="border-b">
                                <td className="p-2 font-mono" dir="ltr">
                                    {m.email}
                                </td>
                                <td className="p-2">
                                    <input
                                        defaultValue={m.full_name ?? ""}
                                        placeholder="—"
                                        className="border rounded p-1 w-32"
                                        onBlur={(e) => {
                                            const v = e.target.value.trim();
                                            if (v !== (m.full_name ?? "")) void patch(m.id, { full_name: v || null });
                                        }}
                                    />
                                </td>
                                <td className="p-2">{m.user_id ? "✅" : "טרם"}</td>
                                <td className="p-2">
                                    <select
                                        value={m.access_level}
                                        onChange={(e) => void patch(m.id, { access_level: e.target.value })}
                                        className="border rounded p-1"
                                    >
                                        <option value="academy">אקדמיה בלבד</option>
                                        <option value="full">גישה מלאה (שלב א')</option>
                                    </select>
                                </td>
                                <td className="p-2">
                                    <button
                                        onClick={() =>
                                            void patch(m.id, { status: m.status === "active" ? "suspended" : "active" })
                                        }
                                        className={m.status === "active" ? "text-green-600" : "text-amber-600"}
                                    >
                                        {m.status === "active" ? "פעיל" : "מושהה"}
                                    </button>
                                </td>
                                <td className="p-2">
                                    <button onClick={() => void remove(m)} className="text-destructive">
                                        הסר
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {members.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                    המחזור ריק — הוסף מיילים למעלה
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Wire into AdminDashboard** — extend `AdminTab` (:16) with `'academy-members' | 'academy-quizzes' | 'academy-dashboard'`; add to `tabs` (:18-26): `{ id: 'academy-members', label: 'מחזור אקדמיה' }`, `{ id: 'academy-quizzes', label: 'בחנים' }`, `{ id: 'academy-dashboard', label: 'דאשבורד אקדמיה' }`; add render conditions (:93-99): `{activeTab === 'academy-members' && <AcademyMembersTab />}` (the other two components arrive in Tasks 8-9 — add their conditions in those tasks).

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AcademyMembersTab.tsx src/pages/AdminDashboard.tsx
git commit -m "feat(academy): cohort members admin tab"
```

---

### Task 8: Admin — quiz creation tab

**Files:**

- Create: `src/components/admin/AcademyQuizzesTab.tsx`
- Modify: `src/pages/AdminDashboard.tsx` (render condition only)

**Interfaces:**

- Consumes: `createQuiz`, `deleteQuiz`, `fetchQuizzes`, `fetchAllAttempts`, `NewQuiz`, `QuizRow` (Task 3); `useApp().data`; `KEYS`; `MILLER_CHAPTERS`, `getChapterDisplay` from `@/data/millerChapters`; `supabase` for `created_by`.

- [ ] **Step 1: Create the tab** (`src/components/admin/AcademyQuizzesTab.tsx`):

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { KEYS } from "@/lib/types";
import { MILLER_CHAPTERS, getChapterDisplay } from "@/data/millerChapters";
import { createQuiz, deleteQuiz, fetchQuizzes, fetchAllAttempts, QuizRow } from "@/lib/academyRepository";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time
const toLocalInput = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function AcademyQuizzesTab() {
    const { data } = useApp();
    const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
    const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});
    const [title, setTitle] = useState("");
    const [quizType, setQuizType] = useState<"weekly" | "baseline">("weekly");
    const [opensAt, setOpensAt] = useState(toLocalInput(new Date()));
    const [closesAt, setClosesAt] = useState(toLocalInput(new Date(Date.now() + 24 * 3600 * 1000)));
    const [idsText, setIdsText] = useState("");
    const [fillChapter, setFillChapter] = useState<number>(1);
    const [fillCount, setFillCount] = useState(10);
    const [busy, setBusy] = useState(false);

    const questionById = useMemo(() => new Map(data.map((q) => [String(q[KEYS.ID]), q])), [data]);

    const reload = useCallback(async () => {
        try {
            const [qs, attempts] = await Promise.all([fetchQuizzes(), fetchAllAttempts()]);
            setQuizzes(qs);
            const counts: Record<string, number> = {};
            for (const a of attempts) counts[a.quiz_id] = (counts[a.quiz_id] ?? 0) + 1;
            setAttemptCounts(counts);
        } catch (e) {
            console.error("quiz reload failed:", e);
            toast.error("טעינת הבחנים נכשלה");
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const parsedIds = useMemo(
        () =>
            idsText
                .split(/[\s,;]+/)
                .map((t) => t.trim())
                .filter(Boolean),
        [idsText],
    );
    const missingIds = parsedIds.filter((id) => !questionById.has(id));

    const randomFill = () => {
        const chosen = new Set(parsedIds);
        const pool = data.filter((q) => q[KEYS.CHAPTER] === fillChapter && !chosen.has(String(q[KEYS.ID])));
        const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, fillCount);
        if (shuffled.length < fillCount) {
            toast.warning(`בפרק ${fillChapter} נמצאו רק ${shuffled.length} שאלות פנויות`);
        }
        const added = shuffled.map((q) => String(q[KEYS.ID]));
        setIdsText([...parsedIds, ...added].join("\n"));
    };

    const handleCreate = async () => {
        if (!title.trim()) return toast.error("חסרה כותרת לבוחן");
        if (parsedIds.length === 0) return toast.error("לא נבחרו שאלות");
        if (missingIds.length > 0)
            return toast.error(`${missingIds.length} מזהים לא קיימים במאגר: ${missingIds.slice(0, 5).join(", ")}`);
        const opens = new Date(opensAt);
        const closes = new Date(closesAt);
        if (!(closes > opens)) return toast.error("שעת הסגירה חייבת להיות אחרי שעת הפתיחה");
        setBusy(true);
        try {
            const { data: userData } = await supabase.auth.getUser();
            await createQuiz({
                title: title.trim(),
                quiz_type: quizType,
                question_ids: parsedIds,
                opens_at: opens.toISOString(),
                closes_at: closes.toISOString(),
                created_by: userData?.user?.id ?? null,
            });
            toast.success("הבוחן נוצר");
            setTitle("");
            setIdsText("");
            await reload();
        } catch (e) {
            console.error("createQuiz failed:", e);
            toast.error("יצירת הבוחן נכשלה");
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async (quizRow: QuizRow) => {
        if ((attemptCounts[quizRow.id] ?? 0) > 0) return toast.error("יש הגשות לבוחן — לא ניתן למחוק");
        if (!window.confirm(`למחוק את "${quizRow.title}"?`)) return;
        try {
            await deleteQuiz(quizRow.id);
            await reload();
        } catch (e) {
            console.error("deleteQuiz failed:", e);
            toast.error("מחיקת הבוחן נכשלה");
        }
    };

    return (
        <div className="space-y-6" dir="rtl">
            <div className="border rounded-xl p-4 space-y-3">
                <h3 className="font-semibold">יצירת בוחן</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="כותרת (למשל: בייסליין חלק 1)"
                        className="border rounded-lg p-2"
                    />
                    <select
                        value={quizType}
                        onChange={(e) => setQuizType(e.target.value as "weekly" | "baseline")}
                        className="border rounded-lg p-2"
                    >
                        <option value="weekly">בוחן שבועי</option>
                        <option value="baseline">בייסליין</option>
                    </select>
                    <label className="text-sm">
                        נפתח:
                        <input
                            type="datetime-local"
                            value={opensAt}
                            onChange={(e) => setOpensAt(e.target.value)}
                            className="border rounded-lg p-2 w-full"
                            dir="ltr"
                        />
                    </label>
                    <label className="text-sm">
                        נסגר:
                        <input
                            type="datetime-local"
                            value={closesAt}
                            onChange={(e) => setClosesAt(e.target.value)}
                            className="border rounded-lg p-2 w-full"
                            dir="ltr"
                        />
                    </label>
                </div>

                <div className="space-y-2">
                    <div className="flex items-end gap-2 flex-wrap">
                        <label className="text-sm">
                            מילוי אקראי מפרק:
                            <select
                                value={fillChapter}
                                onChange={(e) => setFillChapter(Number(e.target.value))}
                                className="border rounded-lg p-2 w-64 block"
                            >
                                {Object.keys(MILLER_CHAPTERS).map((ch) => (
                                    <option key={ch} value={ch}>
                                        {getChapterDisplay(Number(ch))}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm">
                            כמות:
                            <input
                                type="number"
                                min={1}
                                max={120}
                                value={fillCount}
                                onChange={(e) => setFillCount(Number(e.target.value))}
                                className="border rounded-lg p-2 w-20 block"
                            />
                        </label>
                        <button onClick={randomFill} className="px-3 py-2 rounded-lg border font-medium">
                            מלא אקראית
                        </button>
                    </div>
                    <textarea
                        value={idsText}
                        onChange={(e) => setIdsText(e.target.value)}
                        rows={5}
                        dir="ltr"
                        className="w-full border rounded-lg p-2 text-sm font-mono"
                        placeholder="מזהי שאלות — שורה לכל מזהה"
                    />
                    <div className="text-sm text-muted-foreground">
                        {parsedIds.length} שאלות נבחרו
                        {missingIds.length > 0 && (
                            <span className="text-destructive"> · {missingIds.length} מזהים לא קיימים</span>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleCreate}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
                >
                    צור בוחן
                </button>
            </div>

            <div className="border rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-right">
                            <th className="p-2">כותרת</th>
                            <th className="p-2">סוג</th>
                            <th className="p-2">חלון</th>
                            <th className="p-2">שאלות</th>
                            <th className="p-2">הגשות</th>
                            <th className="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {quizzes.map((q) => (
                            <tr key={q.id} className="border-b">
                                <td className="p-2 font-medium">{q.title}</td>
                                <td className="p-2">{q.quiz_type === "baseline" ? "בייסליין" : "שבועי"}</td>
                                <td className="p-2 text-xs" dir="ltr">
                                    {new Date(q.opens_at).toLocaleString("he-IL")} →{" "}
                                    {new Date(q.closes_at).toLocaleString("he-IL")}
                                </td>
                                <td className="p-2">{q.question_ids.length}</td>
                                <td className="p-2">{attemptCounts[q.id] ?? 0}</td>
                                <td className="p-2">
                                    <button onClick={() => void handleDelete(q)} className="text-destructive">
                                        מחק
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {quizzes.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                    אין בחנים עדיין
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
```

Note: `KEYS.CHAPTER` is the `chapter: number` field; confirm the exact key name in `src/lib/types.ts:6-24` before use (it is `chapter`).

- [ ] **Step 2: Wire render condition** in AdminDashboard: `{activeTab === 'academy-quizzes' && <AcademyQuizzesTab />}` + import.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AcademyQuizzesTab.tsx src/pages/AdminDashboard.tsx
git commit -m "feat(academy): quiz creation admin tab"
```

---

### Task 9: Admin — academy dashboard tab

**Files:**

- Create: `src/components/admin/AcademyDashboardTab.tsx`
- Modify: `src/pages/AdminDashboard.tsx` (render condition only)

**Interfaces:**

- Consumes: `fetchMembers`, `fetchQuizzes`, `fetchAllAttempts` (Task 3), `domainOfChapter`, `ACADEMY_DOMAINS`, `UNCLASSIFIED_DOMAIN` (Task 1), `useApp().data`, `KEYS`.

- [ ] **Step 1: Create the tab** (`src/components/admin/AcademyDashboardTab.tsx`):

```tsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { KEYS } from "@/lib/types";
import { domainOfChapter, ACADEMY_DOMAINS, UNCLASSIFIED_DOMAIN } from "@/lib/academyDomains";
import {
    fetchMembers,
    fetchQuizzes,
    fetchAllAttempts,
    AcademyMemberRow,
    QuizRow,
    QuizAttemptRow,
} from "@/lib/academyRepository";

interface DomainAgg {
    domain: string;
    answered: number;
    correct: number;
}

export default function AcademyDashboardTab() {
    const { data } = useApp();
    const [members, setMembers] = useState<AcademyMemberRow[]>([]);
    const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
    const [attempts, setAttempts] = useState<QuizAttemptRow[]>([]);
    const [selectedMember, setSelectedMember] = useState<string>("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [ms, qs, ats] = await Promise.all([fetchMembers(), fetchQuizzes(), fetchAllAttempts()]);
                setMembers(ms);
                setQuizzes(qs);
                setAttempts(ats);
            } catch (e) {
                console.error("dashboard load failed:", e);
                toast.error("טעינת נתוני הדאשבורד נכשלה");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const questionById = useMemo(() => new Map(data.map((q) => [String(q[KEYS.ID]), q])), [data]);

    // member.user_id -> quiz_id -> attempt
    const attemptsByUser = useMemo(() => {
        const m = new Map<string, Map<string, QuizAttemptRow>>();
        for (const a of attempts) {
            if (!m.has(a.user_id)) m.set(a.user_id, new Map());
            m.get(a.user_id)!.set(a.quiz_id, a);
        }
        return m;
    }, [attempts]);

    const sortedQuizzes = useMemo(
        () => [...quizzes].sort((a, b) => Date.parse(a.opens_at) - Date.parse(b.opens_at)),
        [quizzes],
    );

    const domainRows = useMemo((): DomainAgg[] => {
        const member = members.find((m) => m.id === selectedMember);
        if (!member?.user_id) return [];
        const byDomain = new Map<string, DomainAgg>();
        const order = [...ACADEMY_DOMAINS.map((d) => d.label), UNCLASSIFIED_DOMAIN];
        for (const label of order) byDomain.set(label, { domain: label, answered: 0, correct: 0 });
        for (const attempt of attemptsByUser.get(member.user_id)?.values() ?? []) {
            attempt.question_ids.forEach((qid, i) => {
                const ans = attempt.answers[i];
                if (!ans) return;
                const question = questionById.get(qid);
                const domain = domainOfChapter(question ? (question[KEYS.CHAPTER] as number) : null);
                const agg = byDomain.get(domain)!;
                agg.answered++;
                if (question && ans === question[KEYS.CORRECT]) agg.correct++;
            });
        }
        return [...byDomain.values()].filter((r) => r.answered > 0);
    }, [selectedMember, members, attemptsByUser, questionById]);

    if (loading) return <div className="p-8 text-center text-muted-foreground">טוען…</div>;

    const pctCell = (a: QuizAttemptRow | undefined) => {
        if (!a) return <span className="text-muted-foreground">—</span>;
        const pct = a.total > 0 ? Math.round((100 * a.score) / a.total) : 0;
        return <span className={pct >= 60 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>{pct}%</span>;
    };

    return (
        <div className="space-y-8" dir="rtl">
            <section className="border rounded-xl overflow-x-auto">
                <h3 className="font-semibold p-3">מטריצת הגשות — מתמחה × בוחן</h3>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b bg-muted/50 text-right">
                            <th className="p-2">מתמחה</th>
                            {sortedQuizzes.map((q) => (
                                <th key={q.id} className="p-2 whitespace-nowrap">
                                    {q.title}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {members.map((m) => (
                            <tr key={m.id} className={`border-b ${m.status === "suspended" ? "opacity-50" : ""}`}>
                                <td className="p-2">
                                    {m.full_name || m.email}
                                    {m.status === "suspended" && (
                                        <span className="text-xs text-amber-600 mr-1">(מושהה)</span>
                                    )}
                                    {!m.user_id && (
                                        <span className="text-xs text-muted-foreground mr-1">(טרם נרשם)</span>
                                    )}
                                </td>
                                {sortedQuizzes.map((q) => (
                                    <td key={q.id} className="p-2">
                                        {pctCell(m.user_id ? attemptsByUser.get(m.user_id)?.get(q.id) : undefined)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {members.length === 0 && (
                            <tr>
                                <td
                                    className="p-4 text-center text-muted-foreground"
                                    colSpan={1 + sortedQuizzes.length}
                                >
                                    המחזור ריק
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>

            <section className="border rounded-xl p-3 space-y-3">
                <div className="flex items-center gap-3">
                    <h3 className="font-semibold">פילוח תחומים למתמחה</h3>
                    <select
                        value={selectedMember}
                        onChange={(e) => setSelectedMember(e.target.value)}
                        className="border rounded-lg p-2"
                    >
                        <option value="">בחר מתמחה…</option>
                        {members
                            .filter((m) => m.user_id)
                            .map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.full_name || m.email}
                                </option>
                            ))}
                    </select>
                </div>
                {selectedMember && domainRows.length === 0 && (
                    <p className="text-sm text-muted-foreground">אין עדיין הגשות למתמחה זה.</p>
                )}
                {domainRows.length > 0 && (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/50 text-right">
                                <th className="p-2">תחום קליני</th>
                                <th className="p-2">נענו</th>
                                <th className="p-2">נכונות</th>
                                <th className="p-2">אחוז</th>
                            </tr>
                        </thead>
                        <tbody>
                            {domainRows.map((r) => {
                                const pct = Math.round((100 * r.correct) / r.answered);
                                return (
                                    <tr key={r.domain} className="border-b">
                                        <td className="p-2">{r.domain}</td>
                                        <td className="p-2">{r.answered}</td>
                                        <td className="p-2">{r.correct}</td>
                                        <td
                                            className={`p-2 font-medium ${pct >= 60 ? "text-green-600" : "text-red-600"}`}
                                        >
                                            {pct}%
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}
```

- [ ] **Step 2: Wire render condition** in AdminDashboard: `{activeTab === 'academy-dashboard' && <AcademyDashboardTab />}` + import.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm run build`; `npm test` (full suite) green.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AcademyDashboardTab.tsx src/pages/AdminDashboard.tsx
git commit -m "feat(academy): admin dashboard — submission matrix and domain breakdown"
```

---

### Task 10: End-to-end verification (live, browser)

**Files:** none (verification only)

- [ ] **Step 1: Start dev server** — `npm run dev` (it points at prod Supabase `ksbblqnwcmfylpxygyrj` per `.env`; the academy tables are empty so this is safe).
- [ ] **Step 2: Admin flow** (browser, logged in as Idan): `/admin` → "מחזור אקדמיה" → add `idankatz64+resident@gmail.com` → row appears with "טרם נרשם". → "בחנים" → create quiz "בדיקת מערכת" (weekly, window: now → +2h, 5 questions via מלא אקראית). Expected: quiz listed, 0 הגשות.
- [ ] **Step 3: Resident flow**: register `idankatz64+resident@gmail.com` at `/auth` (email confirm is OFF). Expected after login: sidebar shows ONLY "אקדמיה"; the app lands on AcademyView; the open quiz is visible. Take the quiz → answers lock-free navigation → "הגש מבחן" → ResultsView shows score → back to academy → quiz appears under "הבחנים שלי" with pct + cohort avg.
- [ ] **Step 4: Once-only + window enforcement** (SQL via Supabase MCP):

```sql
SELECT quiz_id, user_id, score, total, array_length(question_ids,1) AS n
FROM quiz_attempts;
-- Expected: exactly 1 row, n = 5, score matches what ResultsView showed
```

Then in the resident browser try to start the same quiz again — Expected: it is not offered (already attempted). Update the quiz window to the past (admin tab or SQL `UPDATE quizzes SET closes_at = now() - interval '1 hour'`) and verify a NEW attempt insert is rejected (RLS) if forced.

- [ ] **Step 5: THE critical regression check** — quiz answers must NOT touch the practice pipeline:

```sql
SELECT
  (SELECT count(*) FROM user_answers)      AS user_answers_cnt,
  (SELECT count(*) FROM answer_history)    AS answer_history_cnt,
  (SELECT count(*) FROM spaced_repetition) AS srs_cnt;
```

Run BEFORE Step 3 and AFTER Step 3 — all three counts must be identical. If any moved, STOP: the SessionView branch leaked into the SRS path.

- [ ] **Step 6: Admin dashboard check** — "דאשבורד אקדמיה": matrix shows the resident row with the quiz pct; domain breakdown shows the 5 questions' domains. Regular-user regression: log in as Idan (non-academy admin), run one normal practice question + verify SRS/stats still work.
- [ ] **Step 7: Full gates** — `npm test` (all green), `npx tsc --noEmit` (baseline errors only), `npm run build`.
- [ ] **Step 8: Cleanup + commit any fixes** — delete the test quiz + attempt + test member rows via SQL, then:

```bash
git add -A && git commit -m "test(academy): e2e verification fixes" # only if fixes were needed
```

---

### Task 11: Deploy

- [ ] **Step 1:** Ask Idan for explicit approval to push (per his git workflow rule).
- [ ] **Step 2:** `git push` → Vercel auto-deploys (~1 min). Verify deployment READY via Vercel MCP and smoke-test the academy nav item on production as admin.
- [ ] **Step 3:** Operational follow-up (with Idan, not code): enter the real cohort email list; create the 3 baseline quizzes (3×40, spread across domains via מלא אקראית per chapter); set their windows.

---

## Self-Review Notes

- **Spec coverage:** cohort+allowlist (T0/T7), auto-link on signup (claim RPC, T0/T4), access tiers + gating (T0/T4/T6), quiz entity with window + fixed list + SRS bypass (T0/T6 startQuiz passes the full list, count=length — the shuffle inside `startSession` randomizes ORDER per resident, which is intentional), once-only at DB level (UNIQUE, T0), attempt snapshot (`question_ids` per attempt, T2/T3), separate `quiz_attempts` table away from the `trg_sync_answer_history` trap (T0/T5), baseline 3×40 = three baseline-type quizzes (T8 + T11 ops), basic dashboard matrix + domain breakdown (T9), resident sees self + anonymous cohort stats (T0 RPC + T6), suspended members excluded from writes and dimmed in matrix (T0 RLS + T9).
- **Deferred to Phase B (per spec §9):** in-attempt timer, question hiding flag, post-close review screen, appeals, per-question miss-rate, demo-data mode. Note: without the timer, `SessionView` shows its default 3h simulation countdown during quizzes — harmless; window is enforced server-side.
- **Type consistency check:** `KEYS.ID`/`KEYS.CORRECT`/`KEYS.CHAPTER` string keys used consistently; `QuizRow`/`QuizAttemptRow` field names match the migration column names exactly; `startSession(..., quizMeta)` matches T4/T6 call sites; `answers` is a JSON array aligned with `question_ids` in both `buildAttemptRow` and the dashboard aggregation.

---

## Amendment 1 (2026-08-12, post-Task-0 security review — approved by Idan)

Two design-level security findings were confirmed and Idan chose the hardened options. These CHANGE Tasks 2, 3, 5:

1. **Verified-email claim.** `claim_academy_membership()` links only when the JWT's `app_metadata.providers` contains `'google'` (Google-verified email). Email+password signups (autoconfirmed, ownership unproven) do NOT link — the members tab shows "טרם נרשם" and onboarding instructs residents to sign in with Google. Residual risk (attacker pre-registers a password account and the victim later Google-links into it) documented in the ledger — accepted for a closed cohort.
2. **Server-side scoring.** New SECURITY DEFINER RPC `public.submit_quiz_attempt(_quiz_id uuid, _question_ids text[], _answers jsonb) RETURNS TABLE(score integer, total integer)` — validates auth/membership/window/duplicate/questions-belong-to-quiz, scores against `questions.correct`, INSERTs the attempt itself, and raises `NOT_AUTHENTICATED` / `NOT_MEMBER` / `QUIZ_NOT_FOUND` / `WINDOW_CLOSED` / `ALREADY_SUBMITTED` / `EMPTY_ATTEMPT` / `QUESTION_NOT_IN_QUIZ` on violation. The `"Members can submit attempt during window"` INSERT policy is DROPPED — the RPC is the only write path (a direct INSERT with a forged score is impossible). UNIQUE constraint stays as race backstop.
3. **Aggregate masking.** `quiz_cohort_stats` returns NULL `avg_pct`/`median_pct` when fewer than 3 attempts exist (single-submission de-anonymization).

Task impacts:
- **Task 2 (quizScore.ts): CANCELLED** — scoring is server-side; ResultsView keeps its existing local display computation. Do not create the file.
- **Task 3:** drop `buildAttemptRow` and `scoreQuizAttempt` import; `submitQuizAttempt(quizId: string, questionIds: string[], answers: (string|null)[]): Promise<{score:number; total:number}>` calls the RPC and maps errors by `error.message.includes('ALREADY_SUBMITTED'|'WINDOW_CLOSED'|'NOT_MEMBER')` → `Error` with those exact names; anything else rethrows `error.message`. `NewAttempt` type no longer needed. Tests: keep `parseEmailList` tests; no buildAttemptRow tests.
- **Task 5:** `submitQuizAttemptFlow` gathers `questionIds = quiz.map(q => String(q[KEYS.ID]))` and `answers` (normalized to null for unanswered) from session state and calls `submitQuizAttempt(session.quizId, questionIds, answers)`; no client-side score is sent. Error toasts unchanged, plus `NOT_MEMBER` → "אינך רשום למחזור — פנה לאחראי האקדמיה".

---

## Amendment 2 (2026-08-13, approved by Idan — "Phase A.5" wave)

Scope approved verbatim by Idan (chat, 12:08):
1. **Academy-tier access redesign.** An academy-tier resident sees THREE areas: אקדמיה, תרגול, סטטיסטיקה (plus סיכומי נושאים in the future — stays hidden for now). Everything else hidden until Idan grants 'full'. The practice pool for academy-tier users is RESTRICTED to questions from quizzes they have already submitted (union of their quiz_attempts.question_ids). SRS/smart-selection operate inside that pool. View allowlist for academyOnly: ['academy','setup-practice','session','results','review','stats'].
2. **Post-submission quiz review.** From "הבחנים שלי" a resident opens a full review of a submitted attempt: each question with its options, their answer, the correct answer highlighted, and the DOMPurify-sanitized explanation. Available immediately after OWN submission (deliberate: ResultsView already showed this content at submit time; re-access adds no new leak surface).
3. **Clearer NOT_MEMBER message:** "אינך משויך למחזור — התחבר עם חשבון Google או פנה לאחראי האקדמיה".

Implementation constraints: the restricted-pool projection happens ONLY at the AppContext value boundary (consumer-facing `data`, `getFilteredQuestions`, `getDueQuestions`); internal paths (resumeSessionFromDb, quiz question resolution) use the RAW bank via a new `getQuestionsByIds(ids)` helper — a quiz must always resolve its questions even when outside the resident's pool. After a successful quiz submit, the submitted ids join the pool immediately (`registerAttemptedQuestions`).
