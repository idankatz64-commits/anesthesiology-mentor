
CREATE TABLE public.saved_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Each user can have only one saved session at a time
CREATE UNIQUE INDEX saved_sessions_user_id_idx ON public.saved_sessions (user_id);

ALTER TABLE public.saved_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own saved sessions"
  ON public.saved_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved sessions"
  ON public.saved_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved sessions"
  ON public.saved_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved sessions"
  ON public.saved_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
