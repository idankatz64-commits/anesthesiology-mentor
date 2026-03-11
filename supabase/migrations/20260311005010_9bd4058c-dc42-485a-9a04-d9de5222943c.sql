CREATE OR REPLACE FUNCTION public.get_global_daily_accuracy(since_date timestamptz)
RETURNS TABLE(day date, avg_accuracy numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    DATE(ah.answered_at) as day,
    ROUND((COUNT(*) FILTER (WHERE ah.is_correct)::numeric / NULLIF(COUNT(*), 0)) * 100, 1) as avg_accuracy
  FROM public.answer_history ah
  WHERE ah.answered_at >= since_date
  GROUP BY DATE(ah.answered_at)
  ORDER BY day;
$$;