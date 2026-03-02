
-- Create anki_decks table
CREATE TABLE public.anki_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.anki_decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own anki decks" ON public.anki_decks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own anki decks" ON public.anki_decks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own anki decks" ON public.anki_decks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own anki decks" ON public.anki_decks FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_anki_decks_user ON public.anki_decks (user_id);

-- Create anki_cards table
CREATE TABLE public.anki_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid NOT NULL REFERENCES public.anki_decks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  front text NOT NULL,
  back text NOT NULL,
  due_date timestamptz NOT NULL DEFAULT now(),
  interval_days integer NOT NULL DEFAULT 1,
  ease_factor real NOT NULL DEFAULT 2.5,
  repetitions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.anki_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own anki cards" ON public.anki_cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own anki cards" ON public.anki_cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own anki cards" ON public.anki_cards FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own anki cards" ON public.anki_cards FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_anki_cards_deck ON public.anki_cards (deck_id);
CREATE INDEX idx_anki_cards_user_due ON public.anki_cards (user_id, due_date);
