
ALTER TABLE public.question_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit log" ON public.question_audit_log
FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "System can insert audit log" ON public.question_audit_log
FOR INSERT TO authenticated
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.log_question_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
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
