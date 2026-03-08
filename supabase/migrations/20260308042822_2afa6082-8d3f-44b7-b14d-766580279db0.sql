CREATE TABLE public.answer_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id text NOT NULL,
  topic text,
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.answer_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own answer_history" ON public.answer_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own answer_history" ON public.answer_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_answer_history_user_date ON public.answer_history (user_id, answered_at);