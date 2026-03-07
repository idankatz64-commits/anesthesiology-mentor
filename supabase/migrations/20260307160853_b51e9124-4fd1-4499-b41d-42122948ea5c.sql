
CREATE OR REPLACE FUNCTION public.log_question_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF OLD.question IS DISTINCT FROM NEW.question THEN
    INSERT INTO question_audit_log (question_id, changed_by, field_changed, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'question', OLD.question, NEW.question);
  END IF;
  IF OLD.explanation IS DISTINCT FROM NEW.explanation THEN
    INSERT INTO question_audit_log (question_id, changed_by, field_changed, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'explanation', OLD.explanation, NEW.explanation);
  END IF;
  IF OLD.correct IS DISTINCT FROM NEW.correct THEN
    INSERT INTO question_audit_log (question_id, changed_by, field_changed, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'correct', OLD.correct, NEW.correct);
  END IF;
  RETURN NEW;
END;
$function$;
