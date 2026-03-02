
-- 1. Create all tables first
CREATE TABLE public.study_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code text UNIQUE NOT NULL,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'waiting',
  question_ids text[] NOT NULL,
  current_question_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE TABLE public.room_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.study_rooms ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  is_ready boolean NOT NULL DEFAULT false,
  last_active_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE TABLE public.room_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.study_rooms ON DELETE CASCADE,
  question_index integer NOT NULL,
  user_id uuid NOT NULL,
  selected_answer text NOT NULL,
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, question_index, user_id)
);

-- 2. Enable RLS
ALTER TABLE public.study_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_answers ENABLE ROW LEVEL SECURITY;

-- 3. Helper function (tables exist now)
CREATE OR REPLACE FUNCTION public.is_room_participant(_user_id uuid, _room_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.room_participants WHERE user_id = _user_id AND room_id = _room_id);
$$;

-- 4. study_rooms policies
CREATE POLICY "Participants can view study rooms" ON public.study_rooms FOR SELECT TO authenticated USING (public.is_room_participant(auth.uid(), id));
CREATE POLICY "Authenticated users can create study rooms" ON public.study_rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creator can update study room" ON public.study_rooms FOR UPDATE TO authenticated USING (auth.uid() = created_by);
CREATE POLICY "Anyone can lookup waiting rooms" ON public.study_rooms FOR SELECT TO authenticated USING (status = 'waiting');

-- 5. room_participants policies
CREATE POLICY "Participants can view room participants" ON public.room_participants FOR SELECT TO authenticated USING (public.is_room_participant(auth.uid(), room_id));
CREATE POLICY "Users can join rooms" ON public.room_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own participant row" ON public.room_participants FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can leave rooms" ON public.room_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 6. room_answers policies
CREATE POLICY "Users can insert own room answers" ON public.room_answers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Participants can view room answers" ON public.room_answers FOR SELECT TO authenticated USING (public.is_room_participant(auth.uid(), room_id));

-- 7. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.study_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_answers;
