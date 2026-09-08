-- 7.9.2026 · Milestone 2: durable practice/exam attempts.
--
-- Every attempt freezes its questions (content + answer key) at start, records each
-- confirmed answer with confidence and active time, and is scored on the server.
-- Practice earns learning credit (user_answers → answer_history → spaced_repetition)
-- per confirmed answer; exams earn it once, at submission. A question whose key is not
-- A–D is stored but never scored or credited. A root groups the original attempt with
-- its repeats; repeating is allowed 7 days after the root's latest submission.
--
-- Clients never write these tables directly: only the RPCs below are granted.
-- Reading attempt content goes through attempt_read, which hides keys and
-- explanations until the attempt is submitted (or, with immediate feedback, until
-- that question is confirmed).

create table public.attempt_roots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  mode text not null check (mode in ('practice', 'exam')),
  question_ids text[] not null,
  created_at timestamptz not null default now(),
  latest_submitted_at timestamptz
);
create index attempt_roots_user_idx on public.attempt_roots (user_id, latest_submitted_at desc);

create table public.question_snapshots (
  content_hash text primary key,
  question_id text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null references public.attempt_roots (id),
  user_id uuid not null,
  mode text not null check (mode in ('practice', 'exam')),
  feedback_timing text not null check (feedback_timing in ('immediate', 'end')),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'abandoned')),
  question_order text[] not null,
  total_count integer not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  quarter text,
  total_active_ms bigint,
  answered_count integer,
  scored_count integer,
  correct_count integer
);
create index attempts_user_idx on public.attempts (user_id, submitted_at desc);
create unique index attempts_one_open_per_root on public.attempts (root_id) where status = 'in_progress';

create table public.attempt_questions (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  question_id text not null,
  position integer not null,
  content_hash text not null references public.question_snapshots (content_hash),
  correct_key text check (correct_key in ('A', 'B', 'C', 'D')),
  selected text check (selected in ('A', 'B', 'C', 'D')),
  confidence text check (confidence in ('confident', 'hesitant', 'guessed')),
  answer_ms integer,
  confirmed_at timestamptz,
  is_correct boolean,
  credited boolean not null default false,
  primary key (attempt_id, question_id)
);

alter table public.attempt_roots enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_questions enable row level security;
alter table public.question_snapshots enable row level security;
create policy "owner reads own roots" on public.attempt_roots for select to authenticated
  using (user_id = auth.uid() and public.is_approved(auth.uid()));
create policy "owner reads own attempts" on public.attempts for select to authenticated
  using (user_id = auth.uid() and public.is_approved(auth.uid()));
revoke all on public.attempt_roots, public.attempts, public.attempt_questions, public.question_snapshots from public, anon, authenticated;
grant select on public.attempt_roots, public.attempts to authenticated;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.attempt_caller() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_approved(_uid) then raise exception 'NOT_APPROVED'; end if;
  return _uid;
end $$;

create or replace function public.attempt_israel_quarter(_at timestamptz) returns text
language sql immutable as $$
  select to_char(timezone('Asia/Jerusalem', _at), 'YYYY-"Q"Q')
$$;

-- Freezes the current content of every question in the attempt.
create or replace function public.attempt_freeze_questions(_attempt_id uuid, _order text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  with snap as (
    select q.id, o.position,
      jsonb_strip_nulls(jsonb_build_object(
        'id', q.id, 'ref_id', q.ref_id, 'question', q.question, 'a', q.a, 'b', q.b, 'c', q.c, 'd', q.d,
        'correct', q.correct, 'explanation', q.explanation, 'topic', q.topic, 'chapter', q.chapter,
        'miller', q.miller, 'year', q.year, 'source', q.source, 'kind', q.kind,
        'media_type', q.media_type, 'media_link', q.media_link)) as snapshot
    from unnest(_order) with ordinality o(id, position)
    join public.questions q on q.id = o.id
  ), hashed as (
    select *, md5(snapshot::text) as content_hash from snap
  ), stored as (
    insert into public.question_snapshots (content_hash, question_id, snapshot)
    select content_hash, id, snapshot from hashed
    on conflict (content_hash) do nothing
  )
  insert into public.attempt_questions (attempt_id, question_id, position, content_hash, correct_key)
  select _attempt_id, id, position, content_hash,
    case when upper(trim(snapshot->>'correct')) in ('A', 'B', 'C', 'D') then upper(trim(snapshot->>'correct')) end
  from hashed;
end $$;

-- Exact port of the client SM-2 policy (updateSpacedRepetition) plus the history
-- write, in the order the confidence-stamp trigger needs: history first, SRS second.
create or replace function public.attempt_apply_credit(_user_id uuid, _question_id text, _topic text, _is_correct boolean, _confidence text) returns void
language plpgsql security definer set search_path = public as $$
declare
  _interval integer := 1; _ease numeric := 2.5; _reps integer := 0;
begin
  perform public.increment_user_answer(_user_id, _question_id, _is_correct, _topic);
  select coalesce(interval_days, 1), coalesce(ease_factor, 2.5), coalesce(repetitions, 0)
    into _interval, _ease, _reps
    from public.spaced_repetition where user_id = _user_id and question_id = _question_id;
  if not found then _interval := 1; _ease := 2.5; _reps := 0; end if;
  if not _is_correct or _confidence = 'guessed' then
    _interval := 1; _ease := greatest(1.3, _ease - 0.2); _reps := 0;
  elsif _confidence = 'hesitant' then
    _interval := case when _reps = 0 then 1 when _reps = 1 then 3 else greatest(1, least(365, round(_interval * 1.2))) end;
    _ease := greatest(1.3, _ease - 0.05); _reps := _reps + 1;
  else
    _interval := case when _reps = 0 then 1 when _reps = 1 then 6 else greatest(1, least(365, round(_interval * _ease))) end;
    _ease := least(4.0, _ease + 0.1); _reps := _reps + 1;
  end if;
  insert into public.spaced_repetition (user_id, question_id, next_review_date, confidence, last_correct, updated_at, interval_days, ease_factor, repetitions)
  values (_user_id, _question_id, timezone('Asia/Jerusalem', now())::date + _interval, _confidence, _is_correct, now(), _interval, _ease, _reps)
  on conflict (user_id, question_id) do update set
    next_review_date = excluded.next_review_date, confidence = excluded.confidence, last_correct = excluded.last_correct,
    updated_at = excluded.updated_at, interval_days = excluded.interval_days, ease_factor = excluded.ease_factor, repetitions = excluded.repetitions;
end $$;

create or replace function public.attempt_validate_order(_question_ids text[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if _question_ids is null or cardinality(_question_ids) = 0 then raise exception 'EMPTY_QUESTIONS'; end if;
  if exists (select 1 from unnest(_question_ids) u(qid) where u.qid is null or length(u.qid) > 200) then raise exception 'INVALID_INPUT'; end if;
  if (select count(distinct u.qid) from unnest(_question_ids) u(qid)) <> cardinality(_question_ids) then raise exception 'DUPLICATE_QUESTIONS'; end if;
  if exists (select 1 from unnest(_question_ids) u(qid) where not exists (select 1 from public.questions q where q.id = u.qid)) then raise exception 'MISSING_QUESTIONS'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.attempt_start(_mode text, _feedback_timing text, _question_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _root uuid; _attempt uuid;
begin
  if _mode not in ('practice', 'exam') or _feedback_timing not in ('immediate', 'end') then raise exception 'INVALID_INPUT'; end if;
  perform public.attempt_validate_order(_question_ids);
  insert into public.attempt_roots (user_id, mode, question_ids) values (_uid, _mode, _question_ids) returning id into _root;
  insert into public.attempts (root_id, user_id, mode, feedback_timing, question_order, total_count)
    values (_root, _uid, _mode, _feedback_timing, _question_ids, cardinality(_question_ids)) returning id into _attempt;
  perform public.attempt_freeze_questions(_attempt, _question_ids);
  return jsonb_build_object('attempt_id', _attempt, 'root_id', _root, 'question_order', to_jsonb(_question_ids));
end $$;

-- A shuffle that happens to equal the previous order is rotated by one, so a
-- repeat of two or more questions always starts in a different order.
create or replace function public.attempt_distinct_order(_order text[], _previous text[]) returns text[]
language sql immutable as $$
  select case when cardinality(_order) >= 2 and _order = _previous then _order[2:cardinality(_order)] || _order[1:1] else _order end
$$;

-- A repeat never re-reads live questions: it copies the original attempt's
-- frozen rows (snapshot reference + key), so a later edit or deletion of a
-- question cannot change what the repeat shows or how it is scored.
create or replace function public.attempt_repeat(_root_id uuid, _feedback_timing text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _root public.attempt_roots; _attempt uuid; _order text[]; _previous text[]; _open public.attempts;
begin
  if _feedback_timing not in ('immediate', 'end') then raise exception 'INVALID_INPUT'; end if;
  select * into _root from public.attempt_roots where id = _root_id and user_id = _uid for update;
  if not found then raise exception 'ROOT_NOT_FOUND'; end if;
  if _root.latest_submitted_at is null then raise exception 'NOT_SUBMITTED_YET'; end if;
  if _root.latest_submitted_at + interval '7 days' > now() then raise exception 'COOLDOWN_ACTIVE'; end if;
  -- An open attempt on this root is returned as-is (its own order and timing):
  -- a client that lost the first response, or a second tab, recovers it.
  select * into _open from public.attempts where root_id = _root_id and status = 'in_progress';
  if found then return jsonb_build_object('attempt_id', _open.id, 'root_id', _root_id, 'question_order', to_jsonb(_open.question_order)); end if;
  select question_order into _previous from public.attempts where root_id = _root_id order by started_at desc limit 1;
  select public.attempt_distinct_order(array_agg(u.qid order by random()), _previous) into _order from unnest(_root.question_ids) u(qid);
  insert into public.attempts (root_id, user_id, mode, feedback_timing, question_order, total_count)
    values (_root_id, _uid, _root.mode, _feedback_timing, _order, cardinality(_order)) returning id into _attempt;
  insert into public.attempt_questions (attempt_id, question_id, position, content_hash, correct_key)
    select _attempt, aq.question_id, array_position(_order, aq.question_id), aq.content_hash, aq.correct_key
      from public.attempt_questions aq
     where aq.attempt_id = (select id from public.attempts where root_id = _root_id order by started_at asc limit 1);
  return jsonb_build_object('attempt_id', _attempt, 'root_id', _root_id, 'question_order', to_jsonb(_order));
end $$;

create or replace function public.attempt_confirm(_attempt_id uuid, _question_id text, _selected text, _confidence text, _answer_ms integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := public.attempt_caller(); _attempt public.attempts; _row public.attempt_questions;
  _locking boolean; _is_correct boolean; _reveal boolean; _explanation text;
begin
  if _selected is null or _selected not in ('A', 'B', 'C', 'D')
     or _confidence is null or _confidence not in ('confident', 'hesitant', 'guessed')
     or _answer_ms is null or _answer_ms < 0 or _answer_ms > 86400000 then
    raise exception 'INVALID_INPUT';
  end if;
  select * into _attempt from public.attempts where id = _attempt_id and user_id = _uid for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if _attempt.status <> 'in_progress' then raise exception 'ATTEMPT_NOT_OPEN'; end if;
  select * into _row from public.attempt_questions where attempt_id = _attempt_id and question_id = _question_id;
  if not found then raise exception 'QUESTION_NOT_IN_ATTEMPT'; end if;

  _locking := _attempt.mode = 'practice' or _attempt.feedback_timing = 'immediate';
  _reveal := _attempt.feedback_timing = 'immediate';
  -- Immediate feedback reveals the frozen explanation too: a resumed read strips it, so the client cannot show it otherwise.
  if _reveal then select s.snapshot->>'explanation' into _explanation from public.question_snapshots s where s.content_hash = _row.content_hash; end if;
  if _row.confirmed_at is not null and _locking then
    if _row.selected = _selected and _row.confidence = _confidence then
      return jsonb_build_object('is_correct', _row.is_correct, 'correct_key', case when _reveal then _row.correct_key end, 'explanation', _explanation, 'locked', true);
    end if;
    raise exception 'CONFIRMED_IMMUTABLE';
  end if;

  _is_correct := case when _row.correct_key is null then null else _selected = _row.correct_key end;
  update public.attempt_questions
     set selected = _selected, confidence = _confidence, answer_ms = _answer_ms, confirmed_at = now(), is_correct = _is_correct
   where attempt_id = _attempt_id and question_id = _question_id;
  if _attempt.mode = 'practice' and _is_correct is not null and not _row.credited then
    perform public.attempt_apply_credit(_uid, _question_id, (select s.snapshot->>'topic' from public.question_snapshots s where s.content_hash = _row.content_hash), _is_correct, _confidence);
    update public.attempt_questions set credited = true where attempt_id = _attempt_id and question_id = _question_id;
  end if;
  return jsonb_build_object('is_correct', case when _reveal then _is_correct end, 'correct_key', case when _reveal then _row.correct_key end, 'explanation', _explanation, 'locked', _locking);
end $$;

create or replace function public.attempt_result(_attempt public.attempts) returns jsonb
language sql immutable as $$
  select jsonb_build_object('attempt_id', _attempt.id, 'root_id', _attempt.root_id, 'status', _attempt.status,
    'correct_count', _attempt.correct_count, 'scored_count', _attempt.scored_count, 'answered_count', _attempt.answered_count,
    'total_count', _attempt.total_count, 'quarter', _attempt.quarter, 'submitted_at', _attempt.submitted_at, 'total_active_ms', _attempt.total_active_ms)
$$;

-- Submit result = totals plus per-question correctness (null = unscored), so the
-- client can mirror server scoring without a second round trip.
create or replace function public.attempt_submit_result(_attempt public.attempts) returns jsonb
language sql stable security definer set search_path = public as $$
  select public.attempt_result(_attempt) || jsonb_build_object('questions', coalesce((
    select jsonb_agg(jsonb_build_object('question_id', question_id, 'is_correct', is_correct) order by position)
    from public.attempt_questions where attempt_id = _attempt.id and selected is not null), '[]'::jsonb))
$$;

create or replace function public.attempt_submit(_attempt_id uuid, _total_active_ms bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _attempt public.attempts; _q record; _now timestamptz := now();
begin
  select * into _attempt from public.attempts where id = _attempt_id and user_id = _uid for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if _attempt.status = 'submitted' then return public.attempt_submit_result(_attempt); end if;
  if _attempt.status <> 'in_progress' then raise exception 'ATTEMPT_NOT_OPEN'; end if;
  if _total_active_ms is null or _total_active_ms < 0 or _total_active_ms > 8640000000 then raise exception 'INVALID_INPUT'; end if;
  if _attempt.mode = 'exam' then
    for _q in select aq.question_id, aq.is_correct, aq.confidence, s.snapshot->>'topic' as topic
              from public.attempt_questions aq join public.question_snapshots s on s.content_hash = aq.content_hash
              where aq.attempt_id = _attempt_id and aq.is_correct is not null and not aq.credited order by aq.position loop
      perform public.attempt_apply_credit(_uid, _q.question_id, _q.topic, _q.is_correct, _q.confidence);
      update public.attempt_questions set credited = true where attempt_id = _attempt_id and question_id = _q.question_id;
    end loop;
  end if;
  update public.attempts set status = 'submitted', submitted_at = _now, quarter = public.attempt_israel_quarter(_now), total_active_ms = _total_active_ms,
      answered_count = (select count(*) from public.attempt_questions where attempt_id = _attempt_id and selected is not null),
      scored_count = (select count(*) from public.attempt_questions where attempt_id = _attempt_id and is_correct is not null),
      correct_count = (select count(*) from public.attempt_questions where attempt_id = _attempt_id and is_correct)
    where id = _attempt_id returning * into _attempt;
  update public.attempt_roots set latest_submitted_at = _now where id = _attempt.root_id;
  return public.attempt_submit_result(_attempt);
end $$;

create or replace function public.attempt_abandon(_attempt_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _status text;
begin
  select status into _status from public.attempts where id = _attempt_id and user_id = _uid for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if _status = 'abandoned' then return; end if;
  if _status <> 'in_progress' then raise exception 'ATTEMPT_NOT_OPEN'; end if;
  update public.attempts set status = 'abandoned' where id = _attempt_id;
end $$;

-- Read-only view of one attempt: frozen questions plus recorded answers. Keys,
-- explanations and correctness are revealed only once the attempt is submitted,
-- or for immediate-feedback attempts once that question was confirmed.
create or replace function public.attempt_read(_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _attempt public.attempts; _questions jsonb;
begin
  select * into _attempt from public.attempts where id = _attempt_id and user_id = _uid;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'question_id', aq.question_id, 'position', aq.position,
      'snapshot', case when reveal then s.snapshot else s.snapshot - 'correct' - 'explanation' end,
      'selected', aq.selected, 'confidence', aq.confidence, 'answer_ms', aq.answer_ms, 'confirmed_at', aq.confirmed_at,
      'is_correct', case when reveal then aq.is_correct end,
      'scored', aq.correct_key is not null) order by aq.position), '[]'::jsonb)
    into _questions
    from public.attempt_questions aq
    join public.question_snapshots s on s.content_hash = aq.content_hash
    cross join lateral (select _attempt.status = 'submitted' or (_attempt.feedback_timing = 'immediate' and aq.confirmed_at is not null) as reveal) r
   where aq.attempt_id = _attempt_id;
  return public.attempt_result(_attempt) || jsonb_build_object('mode', _attempt.mode, 'feedback_timing', _attempt.feedback_timing,
    'started_at', _attempt.started_at, 'question_order', to_jsonb(_attempt.question_order), 'questions', _questions);
end $$;

revoke all on function public.attempt_caller() from public, anon, authenticated;
revoke all on function public.attempt_freeze_questions(uuid, text[]) from public, anon, authenticated;
revoke all on function public.attempt_apply_credit(uuid, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.attempt_validate_order(text[]) from public, anon, authenticated;
revoke all on function public.attempt_distinct_order(text[], text[]) from public, anon, authenticated;
revoke all on function public.attempt_result(public.attempts) from public, anon, authenticated;
revoke all on function public.attempt_submit_result(public.attempts) from public, anon, authenticated;
revoke all on function public.attempt_israel_quarter(timestamptz) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['attempt_start(text, text, text[])', 'attempt_repeat(uuid, text)', 'attempt_confirm(uuid, text, text, text, integer)',
                          'attempt_submit(uuid, bigint)', 'attempt_abandon(uuid)', 'attempt_read(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
