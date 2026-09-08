-- Minimal synthetic stand-ins for the Supabase objects the attempts migration
-- depends on. Test cluster only (127.0.0.1:55439). Never run against production.

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('sub', current_setting('request.jwt.claim.sub', true))
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;

create table public.profiles (
  id uuid primary key,
  approved boolean not null default false,
  is_admin boolean not null default false,
  is_editor boolean not null default false
);
create or replace function public.is_approved(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = _uid and (p.approved or p.is_admin or p.is_editor))
$$;

create table public.questions (
  id text primary key,
  ref_id text, question text, a text, b text, c text, d text, correct text, explanation text,
  topic text, year text, source text, miller text, chapter integer, media_type text, media_link text, kind text,
  updated_at timestamptz default now()
);

-- production shapes (migrations 20260221235845, 20260308042822, 20260221215404, 20260418000001)
create table public.user_answers (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null, question_id text not null, topic text,
  is_correct boolean not null, answered_count int not null default 1, correct_count int not null default 0,
  ever_wrong boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(user_id, question_id)
);
create table public.answer_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, question_id text not null, topic text, is_correct boolean not null,
  answered_at timestamptz not null default now(),
  confidence text, confidence_estimated boolean
);
create table public.spaced_repetition (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null, question_id text not null,
  next_review_date date not null default (current_date + 1),
  confidence text check (confidence in ('confident', 'hesitant', 'guessed')),
  last_correct boolean,
  updated_at timestamptz not null default now(),
  interval_days integer default 1, ease_factor numeric default 2.5, repetitions integer default 0,
  unique(user_id, question_id)
);
-- Atomic upsert for user_answers to prevent race condition on concurrent answers.
-- Replaces client-side read-modify-write with a single DB operation.
CREATE OR REPLACE FUNCTION increment_user_answer(
  p_user_id   uuid,
  p_question_id text,
  p_is_correct  boolean,
  p_topic       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_answers (
    user_id, question_id, is_correct,
    answered_count, correct_count, ever_wrong,
    topic, updated_at
  )
  VALUES (
    p_user_id, p_question_id, p_is_correct,
    1,
    CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    NOT p_is_correct,
    p_topic,
    NOW()
  )
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    answered_count = user_answers.answered_count + 1,
    correct_count  = user_answers.correct_count + CASE WHEN p_is_correct THEN 1 ELSE 0 END,
    ever_wrong     = user_answers.ever_wrong OR NOT p_is_correct,
    is_correct     = p_is_correct,
    topic          = COALESCE(p_topic, user_answers.topic),
    updated_at     = NOW();
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION increment_user_answer(uuid, text, boolean, text) TO authenticated;
CREATE OR REPLACE FUNCTION public.sync_user_answers_to_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.answer_history (user_id, question_id, topic, is_correct, answered_at)
  VALUES (NEW.user_id, NEW.question_id, NEW.topic, NEW.is_correct, NEW.updated_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_answer_history
  AFTER INSERT OR UPDATE ON public.user_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_answers_to_history();
-- 3.9.2026 · confidence → answer_history
-- answer_history.confidence היה NULL בכל 80,489 השורות: ה-RPC increment_user_answer כותב
-- user_answers (→ טריגר → answer_history) בלי confidence, וה-confidence נכתב רק על שורת
-- המצב ב-spaced_repetition, שנדרסת בכל חזרה. בלי יומן-confidence אין על מה לאמן FSRS.
--
-- הפתרון: חותמת. כל כתיבה ל-spaced_repetition מעדכנת את שורת ה-answer_history האחרונה
-- של אותו (user, question) — רק אם היא עדיין בלי confidence ונוצרה ב-10 הדקות האחרונות.
-- ponytail: fail-safe — אם כתיבת ה-SRS נחתה לפני שורת-היומן (מרוץ נדיר), נשאר NULL, לא ערך שגוי.
-- לא נוגע בשורות היסטוריות (backfill = החלטה נפרדת).

create or replace function public.stamp_answer_history_confidence()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.confidence is null then
    return new;
  end if;
  update public.answer_history h
     set confidence = new.confidence
   where h.id = (
     select id
       from public.answer_history
      where user_id = new.user_id
        and question_id = new.question_id
        and confidence is null
        and answered_at >= now() - interval '10 minutes'
      order by answered_at desc
      limit 1
   );
  return new;
end;
$$;

drop trigger if exists trg_stamp_answer_history_confidence on public.spaced_repetition;
create trigger trg_stamp_answer_history_confidence
  after insert or update of confidence, updated_at on public.spaced_repetition
  for each row
  execute function public.stamp_answer_history_confidence();

-- האינדקס שהחיפוש בטריגר צריך (user, question, זמן)
create index if not exists answer_history_user_question_time_idx
  on public.answer_history (user_id, question_id, answered_at desc);

-- production lets users read their own rows in these tables (RLS); the harness grants plainly
grant select on public.user_answers, public.answer_history, public.spaced_repetition, public.questions, public.profiles to authenticated;

-- synthetic users and questions
insert into public.profiles (id, approved) values
  ('11111111-1111-1111-1111-111111111111', true),
  ('22222222-2222-2222-2222-222222222222', true),
  ('33333333-3333-3333-3333-333333333333', false);
insert into public.questions (id, ref_id, question, a, b, c, d, correct, explanation, topic, chapter) values
  ('q1', 'q1', 'synthetic question 1', 'alef', 'bet', 'gimel', 'dalet', 'A', 'synthetic explanation 1', 'Demo topic', 1),
  ('q2', 'q2', 'synthetic question 2', 'alef', 'bet', 'gimel', 'dalet', 'B', 'synthetic explanation 2', 'Demo topic', 1),
  ('q3', 'q3', 'synthetic question 3', 'alef', 'bet', 'gimel', 'dalet', 'C', 'synthetic explanation 3', 'Other topic', 2),
  ('qna', 'qna', 'synthetic question without key', 'alef', 'bet', 'gimel', 'dalet', 'N/A', 'no key', 'Demo topic', 1),
  ('qempty', 'qempty', 'synthetic question with empty key', 'alef', 'bet', 'gimel', 'dalet', '', 'no key', 'Demo topic', 1),
  ('boom', 'boom', 'synthetic question whose SRS write fails', 'alef', 'bet', 'gimel', 'dalet', 'A', 'rollback probe', 'Demo topic', 1);

-- rollback probe: any SRS write for question "boom" fails, so a confirm that
-- reached the credit step must leave no partial rows behind.
create or replace function public.test_boom() returns trigger language plpgsql as $$
begin
  if new.question_id = 'boom' then raise exception 'SIMULATED_SRS_FAILURE'; end if;
  return new;
end $$;
create trigger trg_test_boom before insert or update on public.spaced_repetition
  for each row execute function public.test_boom();
