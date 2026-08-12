-- Academy module (Phase A) hardening: verified-email claim, server-side
-- scoring, closed direct-write path, masked small-cohort aggregates.
-- Additive/tightening only — no existing table, trigger, or function touched.
-- Design: docs/specs/2026-08-12-academy-module-design.md
-- Applied via Supabase MCP on 2026-08-12; recorded here for source-of-truth.

-- 1. Verified-email claim: only Google-verified emails may self-link.
-- Password signups with autoconfirm must NOT link (email is unverified).
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
     AND lower(m.email) = lower(coalesce(auth.jwt()->>'email',''))
     AND (auth.jwt()->'app_metadata'->'providers') ? 'google';

  RETURN QUERY
    SELECT m.access_level, m.status
      FROM public.academy_members m
     WHERE m.user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.claim_academy_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_academy_membership() FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_academy_membership() TO authenticated;

-- 2. Server-side scoring RPC: the only way to submit an attempt. Validates
-- membership, quiz window, no duplicate submission, and every question_id
-- belongs to the quiz, then computes the score itself (client cannot forge it).
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(
  _quiz_id uuid,
  _question_ids text[],
  _answers jsonb
) RETURNS TABLE(score integer, total integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_quiz public.quizzes%ROWTYPE;
  v_score integer := 0;
  v_total integer;
  v_ans text;
  i integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academy_members m WHERE m.user_id = v_user AND m.status = 'active') THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  SELECT * INTO v_quiz FROM public.quizzes q WHERE q.id = _quiz_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'QUIZ_NOT_FOUND'; END IF;
  IF now() < v_quiz.opens_at OR now() > v_quiz.closes_at THEN RAISE EXCEPTION 'WINDOW_CLOSED'; END IF;
  IF EXISTS (SELECT 1 FROM public.quiz_attempts a WHERE a.quiz_id = _quiz_id AND a.user_id = v_user) THEN
    RAISE EXCEPTION 'ALREADY_SUBMITTED';
  END IF;
  v_total := coalesce(array_length(_question_ids, 1), 0);
  IF v_total = 0 THEN RAISE EXCEPTION 'EMPTY_ATTEMPT'; END IF;
  FOR i IN 1..v_total LOOP
    IF NOT (_question_ids[i] = ANY (v_quiz.question_ids)) THEN
      RAISE EXCEPTION 'QUESTION_NOT_IN_QUIZ';
    END IF;
    v_ans := _answers ->> (i - 1);
    IF v_ans IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.questions q WHERE q.id = _question_ids[i] AND q.correct = v_ans
    ) THEN
      v_score := v_score + 1;
    END IF;
  END LOOP;
  INSERT INTO public.quiz_attempts (quiz_id, user_id, question_ids, answers, score, total)
  VALUES (_quiz_id, v_user, _question_ids, _answers, v_score, v_total);
  RETURN QUERY SELECT v_score, v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_quiz_attempt(uuid, text[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_quiz_attempt(uuid, text[], jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, text[], jsonb) TO authenticated;

-- 3. Close the direct-write path: submit_quiz_attempt() is now the ONLY way
-- members write attempts, so a direct INSERT with a forged score is impossible.
DROP POLICY IF EXISTS "Members can submit attempt during window" ON public.quiz_attempts;

-- 4. Aggregate masking: hide avg/median for cohorts smaller than 3 attempts
-- (small-n de-anonymization guard). submitted count is always shown.
CREATE OR REPLACE FUNCTION public.quiz_cohort_stats(_quiz_id uuid)
RETURNS TABLE (submitted bigint, avg_pct numeric, median_pct numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*),
         CASE WHEN count(*) >= 3 THEN round(avg(100.0 * a.score / nullif(a.total, 0)), 1) END,
         CASE WHEN count(*) >= 3 THEN round((percentile_cont(0.5) WITHIN GROUP
           (ORDER BY 100.0 * a.score / nullif(a.total, 0)))::numeric, 1) END
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
