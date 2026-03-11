CREATE OR REPLACE FUNCTION public.sync_user_answers_to_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.answer_history (user_id, question_id, topic, is_correct, answered_at)
  VALUES (NEW.user_id, NEW.question_id, NEW.topic, NEW.is_correct, NEW.updated_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_answer_history
  AFTER INSERT OR UPDATE ON public.user_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_answers_to_history();