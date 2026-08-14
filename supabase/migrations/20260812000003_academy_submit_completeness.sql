-- Academy module (Phase A) hardening round 2: submit_quiz_attempt completeness.
-- Additive/tightening only — no existing table, trigger, or function touched.
-- Design: docs/specs/2026-08-12-academy-module-design.md
-- Applied via Supabase MCP on 2026-08-12; recorded here for source-of-truth.

-- The v1 hardening only checked each submitted question_id belongs to the
-- quiz, never that the submitted set is COMPLETE and DUPLICATE-FREE. A caller
-- could submit one confident question (or repeat an easy id) and score 100%.
-- Length-equality + distinct-count enforce exact set equality with the
-- quiz's question_ids.
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
  IF v_total <> coalesce(array_length(v_quiz.question_ids, 1), 0) THEN
    RAISE EXCEPTION 'INCOMPLETE_SUBMISSION';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(_question_ids) AS x) <> v_total THEN
    RAISE EXCEPTION 'DUPLICATE_QUESTIONS';
  END IF;
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
