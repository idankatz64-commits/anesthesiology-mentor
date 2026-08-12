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
