
-- Create spaced repetition table
CREATE TABLE public.spaced_repetition (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question_id TEXT NOT NULL,
  next_review_date DATE NOT NULL DEFAULT CURRENT_DATE,
  confidence TEXT CHECK (confidence IN ('confident', 'hesitant', 'guessed')),
  last_correct BOOLEAN,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, question_id)
);

-- Enable RLS
ALTER TABLE public.spaced_repetition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own spaced repetition data"
ON public.spaced_repetition FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own spaced repetition data"
ON public.spaced_repetition FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own spaced repetition data"
ON public.spaced_repetition FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own spaced repetition data"
ON public.spaced_repetition FOR DELETE USING (auth.uid() = user_id);
