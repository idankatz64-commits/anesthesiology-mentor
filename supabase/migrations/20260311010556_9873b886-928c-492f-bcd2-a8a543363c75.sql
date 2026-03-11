
-- Backfill answer_history from user_answers for records that are missing
-- This inserts one record per user_answers row where no answer_history exists for that user+question on that date
INSERT INTO public.answer_history (user_id, question_id, topic, is_correct, answered_at)
SELECT ua.user_id, ua.question_id, ua.topic, ua.is_correct, ua.updated_at
FROM public.user_answers ua
WHERE NOT EXISTS (
  SELECT 1 FROM public.answer_history ah
  WHERE ah.user_id = ua.user_id
    AND ah.question_id = ua.question_id
    AND DATE(ah.answered_at) = DATE(ua.updated_at)
);
