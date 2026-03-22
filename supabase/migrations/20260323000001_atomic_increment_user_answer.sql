-- Atomic upsert for user_answers to prevent race condition on concurrent answers.
-- Replaces client-side read-modify-write with a single DB operation.
CREATE OR REPLACE FUNCTION increment_user_answer(
  p_user_id   uuid,
  p_question_id text,
  p_is_correct  boolean,
  p_topic       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_answers (
    user_id, question_id, is_correct,
    answered_count, correct_count, ever_wrong,
    topic, updated_at
  )
  VALUES (
    p_user_id, p_question_id, p_is_correct,
    1,
    CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    NOT p_is_correct,
    p_topic,
    NOW()
  )
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    answered_count = user_answers.answered_count + 1,
    correct_count  = user_answers.correct_count + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    ever_wrong     = user_answers.ever_wrong OR NOT p_is_correct,
    is_correct     = p_is_correct,
    topic          = COALESCE(p_topic, user_answers.topic),
    updated_at     = NOW();
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION increment_user_answer(uuid, text, boolean, text) TO authenticated;
