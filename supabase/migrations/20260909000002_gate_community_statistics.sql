-- Preserve the hosted aggregate contracts; restrict community statistics to approved learners.
CREATE OR REPLACE FUNCTION public.get_global_topic_stats()
RETURNS TABLE(topic text, total_users bigint, avg_accuracy numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.is_approved(auth.uid()), false) THEN
    RAISE EXCEPTION 'APPROVAL_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT ua.topic, COUNT(DISTINCT ua.user_id),
    ROUND((SUM(ua.correct_count)::numeric / NULLIF(SUM(ua.answered_count), 0)) * 100, 1)
  FROM public.user_answers ua
  WHERE ua.topic IS NOT NULL
  GROUP BY ua.topic ORDER BY ua.topic;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_global_daily_accuracy(since_date timestamptz)
RETURNS TABLE(day text, avg_accuracy numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.is_approved(auth.uid()), false) THEN
    RAISE EXCEPTION 'APPROVAL_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT to_char((ah.answered_at AT TIME ZONE 'Asia/Jerusalem')::date, 'YYYY-MM-DD'),
    ROUND(AVG(CASE WHEN ah.is_correct THEN 1.0 ELSE 0.0 END)::numeric, 4)
  FROM public.answer_history ah
  WHERE ah.answered_at >= since_date
  GROUP BY (ah.answered_at AT TIME ZONE 'Asia/Jerusalem')::date ORDER BY 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_question_success_rate(qid text)
RETURNS TABLE(total_users bigint, success_rate numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.is_approved(auth.uid()), false) THEN
    RAISE EXCEPTION 'APPROVAL_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH agg AS (
    SELECT COUNT(DISTINCT ua.user_id)::bigint AS total_users,
      COALESCE(ROUND(AVG(CASE WHEN ua.answered_count > 0
        THEN (ua.correct_count::numeric / ua.answered_count) * 100
        ELSE NULL END)::numeric, 1), 0) AS raw_rate
    FROM public.user_answers ua
    WHERE ua.question_id = qid AND ua.answered_count > 0
  )
  SELECT agg.total_users, CASE WHEN agg.total_users < 3 THEN NULL ELSE agg.raw_rate END FROM agg;
END;
$$;

REVOKE ALL ON FUNCTION public.get_global_topic_stats() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_global_daily_accuracy(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_question_success_rate(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_global_topic_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_global_daily_accuracy(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_question_success_rate(text) TO authenticated;
