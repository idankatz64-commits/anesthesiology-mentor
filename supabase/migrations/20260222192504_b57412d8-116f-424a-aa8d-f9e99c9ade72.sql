
-- Create the questions table
CREATE TABLE public.questions (
  id text PRIMARY KEY,
  ref_id text,
  question text NOT NULL,
  a text DEFAULT '',
  b text DEFAULT '',
  c text DEFAULT '',
  d text DEFAULT '',
  correct text NOT NULL,
  explanation text DEFAULT '',
  topic text DEFAULT '',
  year text DEFAULT '',
  source text DEFAULT '',
  kind text DEFAULT '',
  miller text DEFAULT 'N/A',
  chapter integer DEFAULT 0,
  media_type text DEFAULT '',
  media_link text DEFAULT '',
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Public read access (questions are public content)
CREATE POLICY "Anyone can read questions"
ON public.questions FOR SELECT
USING (true);

-- Only service role can insert/update/delete (via edge function)
-- No INSERT/UPDATE/DELETE policies for anon/authenticated

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.questions;
