
CREATE TABLE public.question_edit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  editor_id uuid NOT NULL,
  question_id text,
  edited_at timestamptz NOT NULL DEFAULT now(),
  fields_changed text[] NOT NULL DEFAULT '{}',
  action text NOT NULL DEFAULT 'update'
);

ALTER TABLE public.question_edit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view edit log" ON public.question_edit_log
  FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY "System can insert edit log" ON public.question_edit_log
  FOR INSERT WITH CHECK (true);

CREATE INDEX idx_question_edit_log_editor ON public.question_edit_log(editor_id);
CREATE INDEX idx_question_edit_log_edited_at ON public.question_edit_log(edited_at);
