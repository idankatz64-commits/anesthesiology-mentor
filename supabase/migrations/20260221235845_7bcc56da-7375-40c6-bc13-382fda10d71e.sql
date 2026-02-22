
-- Table for syncing individual user answers (one row per user per question, upserted)
CREATE TABLE public.user_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question_id TEXT NOT NULL,
  topic TEXT,
  is_correct BOOLEAN NOT NULL,
  answered_count INT NOT NULL DEFAULT 1,
  correct_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, question_id)
);

ALTER TABLE public.user_answers ENABLE ROW LEVEL SECURITY;

-- Users can insert/update their own answers
CREATE POLICY "Users can insert own answers"
ON public.user_answers FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own answers"
ON public.user_answers FOR UPDATE
USING (auth.uid() = user_id);

-- Users can read own answers (for personal stats)
CREATE POLICY "Users can read own answers"
ON public.user_answers FOR SELECT
USING (auth.uid() = user_id);

-- Security definer function for global topic stats (no individual data exposed)
CREATE OR REPLACE FUNCTION public.get_global_topic_stats()
RETURNS TABLE(topic TEXT, total_users BIGINT, avg_accuracy NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ua.topic,
    COUNT(DISTINCT ua.user_id) as total_users,
    ROUND(
      (SUM(ua.correct_count)::NUMERIC / NULLIF(SUM(ua.answered_count), 0)) * 100, 1
    ) as avg_accuracy
  FROM public.user_answers ua
  WHERE ua.topic IS NOT NULL
  GROUP BY ua.topic
  ORDER BY ua.topic;
$$;

-- Security definer function for single question success rate
CREATE OR REPLACE FUNCTION public.get_question_success_rate(qid TEXT)
RETURNS TABLE(total_users BIGINT, correct_users BIGINT, success_rate NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::BIGINT as total_users,
    COUNT(*) FILTER (WHERE is_correct)::BIGINT as correct_users,
    ROUND(
      (COUNT(*) FILTER (WHERE is_correct)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 0
    ) as success_rate
  FROM public.user_answers
  WHERE question_id = qid;
$$;

-- Community notes table
CREATE TABLE public.community_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question_id TEXT NOT NULL,
  note_text TEXT NOT NULL,
  author_display TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.community_notes ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read community notes
CREATE POLICY "Authenticated users can read community notes"
ON public.community_notes FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Users can insert their own notes
CREATE POLICY "Users can insert own community notes"
ON public.community_notes FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own notes
CREATE POLICY "Users can delete own community notes"
ON public.community_notes FOR DELETE
USING (auth.uid() = user_id);
