-- Resident identity + national ("ארצי") entitlement — backend contract only.
-- Builds on academy_members and the shared public.is_approved(uuid) gate.
-- Applies nothing to any remote project; verified locally by
-- scripts/entitlement-db/run.sh (RED→GREEN) and the predecessor
-- scripts/attempts-db/tests.sql on top of this migration.
--
-- PRE-APPLY GATES (see PHASE-2A-RESULT.md): email confirmation must be ON in
-- Supabase Auth before password linking can ever prove ownership; the
-- lower(btrim(email)) unique index fails loudly if the roster holds
-- case-duplicates; blank / non-exact 'ארצי' sources become admin-only until
-- an admin classifies them.

-- ---------------------------------------------------------------------------
-- 1. roster columns: exam flag, admin-only national toggle (+ actor/time),
--    self-onboarding fields, link time
-- ---------------------------------------------------------------------------
alter table public.academy_members
  add column if not exists exam_this_year boolean not null default false,
  add column if not exists exam_date date,
  add column if not exists national_access boolean not null default false,
  add column if not exists national_access_set_at timestamptz,
  add column if not exists national_access_set_by uuid,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists linked_at timestamptz;
alter table public.academy_members drop constraint if exists academy_members_exam_date_range;
alter table public.academy_members
  add constraint academy_members_exam_date_range check (exam_date is null or exam_date between date '2020-01-01' and date '2100-12-31');
comment on column public.academy_members.exam_this_year is 'Roster/self-report flag: sits the national exam this year. Informational only — never an entitlement.';
comment on column public.academy_members.national_access is 'Admin-only toggle: may read source=''ארצי'' questions. Set only through set_member_national_access().';
create unique index if not exists academy_members_email_normalized_key on public.academy_members (lower(btrim(email)));

-- Column-level grants: the toggle, its audit fields, the owner link and the
-- link time can only change through the SECURITY DEFINER RPCs below. RLS on
-- academy_members stays admin-only for direct writes.
revoke insert, update on public.academy_members from anon, authenticated;
grant insert (email, full_name, access_level, status, residency_year, exam_this_year, exam_date, onboarding_completed_at),
      update (email, full_name, access_level, status, residency_year, exam_this_year, exam_date, onboarding_completed_at)
  on public.academy_members to authenticated;

-- ---------------------------------------------------------------------------
-- 1b. roster authority = admin_users.role = 'admin', nothing else. Fail-closed:
--     an editor row, a NULL-role row (admin-manage-users treats NULL as editor)
--     or no row at all are all refused. The broad public.is_admin() — every
--     admin_users row, editors included — is deliberately left as it is for
--     content reads and everything else that already relies on it.
-- ---------------------------------------------------------------------------
create or replace function public.is_roster_admin(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users a where a.id = _uid and a.role = 'admin')
$$;
-- caller-bound wrapper for the policies (the uuid variant stays private)
create or replace function public.caller_is_roster_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_roster_admin(auth.uid())
$$;

-- Direct roster writes (the admin UI's add / status / access level / year /
-- remove) require a roster admin. Both SELECT policies are untouched: editors
-- keep reading the roster, members keep reading their own row.
drop policy if exists "Admins can insert members" on public.academy_members;
create policy "Roster admins can insert members" on public.academy_members
  for insert to authenticated with check (public.caller_is_roster_admin());
drop policy if exists "Admins can update members" on public.academy_members;
create policy "Roster admins can update members" on public.academy_members
  for update to authenticated using (public.caller_is_roster_admin()) with check (public.caller_is_roster_admin());
drop policy if exists "Admins can delete members" on public.academy_members;
create policy "Roster admins can delete members" on public.academy_members
  for delete to authenticated using (public.caller_is_roster_admin());

-- ---------------------------------------------------------------------------
-- 2. classification by source text only (never by kind)
-- ---------------------------------------------------------------------------
create or replace function public.question_access_scope(_source text) returns text
language sql immutable as $$
  select case
    when btrim(coalesce(_source, '')) = 'ארצי' then 'national'
    when btrim(coalesce(_source, '')) in ('', 'N/A', '#N/A') or _source like '%ארצי%' then 'unclassified'
    else 'open' end
$$;

create or replace function public.is_content_admin(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin(_uid)
      or exists (select 1 from public.profiles p where p.id = _uid and (p.is_admin or p.is_editor))
$$;

-- Scopes a user may read. Empty for anyone the shared gate rejects.
create or replace function public.readable_scopes(_uid uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when _uid is null or not public.is_approved(_uid) then array[]::text[]
    when public.is_content_admin(_uid) then array['open', 'national', 'unclassified']
    when exists (select 1 from public.academy_members m where m.user_id = _uid and m.status = 'active' and m.national_access) then array['open', 'national']
    else array['open'] end
$$;

-- caller-bound wrapper for the policy (the uuid variant stays private)
create or replace function public.my_readable_scopes() returns text[]
language sql stable security definer set search_path = public as $$
  select public.readable_scopes(auth.uid())
$$;

create or replace function public.can_read_question_source(_uid uuid, _source text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.question_access_scope(_source) = any (public.readable_scopes(_uid))
$$;

-- questions: one SELECT policy, TO authenticated, scoped by source. Every
-- pre-existing SELECT policy is dropped (an additional policy can only widen).
alter table public.questions enable row level security;
do $$
declare _p record;
begin
  for _p in select policyname from pg_policies where schemaname = 'public' and tablename = 'questions' and cmd = 'SELECT' loop
    raise notice 'dropping questions SELECT policy: %', _p.policyname;
    execute format('drop policy %I on public.questions', _p.policyname);
  end loop;
end $$;
create policy "Approved users read questions within their source scope" on public.questions
  for select to authenticated
  using (public.question_access_scope(source) in (select unnest(public.my_readable_scopes())));

-- ---------------------------------------------------------------------------
-- 3. verified identity linking
-- ---------------------------------------------------------------------------
-- The normalized e-mail the server can PROVE the user owns, else null:
-- auth row confirmed AND an identity for that same address that is either
-- Google, or an e-mail identity whose confirmation mail was sent and then
-- confirmed (under autoconfirm nothing is ever sent, so nothing is proven).
create or replace function public.resident_verified_email(_uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select lower(btrim(u.email))
    from auth.users u
   where u.id = _uid and u.email is not null and u.email_confirmed_at is not null
     and exists (
       select 1 from auth.identities i
        where i.user_id = u.id
          and lower(btrim(i.identity_data->>'email')) = lower(btrim(u.email))
          and (i.provider = 'google'
               or (i.provider = 'email' and u.confirmation_sent_at is not null and u.email_confirmed_at >= u.confirmation_sent_at)))
$$;

create or replace function public.resident_member_json(_m public.academy_members) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', _m.id, 'email', _m.email, 'full_name', _m.full_name, 'access_level', _m.access_level,
    'status', _m.status, 'residency_year', _m.residency_year, 'exam_this_year', _m.exam_this_year, 'exam_date', _m.exam_date,
    'national_access', _m.national_access, 'onboarding_completed_at', _m.onboarding_completed_at, 'linked_at', _m.linked_at)
$$;

-- Same signature as before. Links exactly one free roster row whose normalized
-- e-mail equals the proven address; idempotent; never creates auth users.
create or replace function public.claim_academy_membership()
returns table (access_level text, status text)
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _email text; _member public.academy_members;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  _email := public.resident_verified_email(_uid);
  if _email is not null and not exists (select 1 from public.academy_members m where m.user_id = _uid) then
    select * into _member from public.academy_members m where lower(btrim(m.email)) = _email for update;
    if found and _member.user_id is null then
      update public.academy_members set user_id = _uid, linked_at = now() where id = _member.id;
    end if;
  end if;
  return query select m.access_level, m.status from public.academy_members m where m.user_id = _uid;
end $$;

create or replace function public.resident_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _member public.academy_members; _email text; _reason text;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select * into _member from public.academy_members m where m.user_id = _uid;
  if found then return jsonb_build_object('linked', true, 'reason', null, 'member', public.resident_member_json(_member)); end if;
  select lower(btrim(u.email)) into _email from auth.users u where u.id = _uid;
  select * into _member from public.academy_members m where lower(btrim(m.email)) = _email;
  _reason := case
    when not found then 'NOT_ON_ROSTER'
    when _member.user_id is not null then 'EMAIL_ALREADY_LINKED'
    when public.resident_verified_email(_uid) is null then 'EMAIL_NOT_VERIFIED'
    else 'NOT_LINKED' end;
  return jsonb_build_object('linked', false, 'reason', _reason, 'member', null);
end $$;

-- Self-onboarding: only residency_year, exam_date, exam_this_year.
create or replace function public.complete_my_onboarding(_residency_year smallint, _exam_date date, _exam_this_year boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _member public.academy_members;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if _residency_year is null or _residency_year not between 1 and 7 or _exam_this_year is null
     or (_exam_date is not null and _exam_date not between date '2020-01-01' and (current_date + interval '10 years')::date) then
    raise exception 'INVALID_INPUT';
  end if;
  update public.academy_members m
     set residency_year = _residency_year, exam_date = _exam_date, exam_this_year = _exam_this_year,
         onboarding_completed_at = coalesce(m.onboarding_completed_at, now())
   where m.user_id = _uid returning * into _member;
  if not found then raise exception 'NOT_MEMBER'; end if;
  return jsonb_build_object('linked', true, 'reason', null, 'member', public.resident_member_json(_member));
end $$;

-- ---------------------------------------------------------------------------
-- 4. roster import + national toggle — roster admins only (is_roster_admin)
-- ---------------------------------------------------------------------------
-- rows: [{name, email, residency_year, exam_this_year}] (other keys ignored). All-or-nothing:
-- any rejected row → nothing written, {applied:false, rejected:[{row, reason}]}.
create or replace function public.upsert_resident_roster(_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _rejected jsonb; _inserted integer; _updated integer;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_roster_admin(_uid) then raise exception 'NOT_ADMIN'; end if;
  if _rows is null or jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) not between 1 and 500 then raise exception 'INVALID_INPUT'; end if;
  create temp table _roster on commit drop as
    select r.ord as row_number,
           nullif(btrim(r.value->>'name'), '') as full_name,
           nullif(lower(btrim(r.value->>'email')), '') as email,
           nullif(btrim(r.value->>'residency_year'), '') as residency_year_text,
           case when nullif(btrim(r.value->>'residency_year'), '') ~ '^[1-7]$'
                then (r.value->>'residency_year')::smallint end as residency_year,
           case when not (r.value ? 'exam_this_year') and r.value ? 'residency_year' then null
                when not (r.value ? 'exam_this_year') then false
                when jsonb_typeof(r.value->'exam_this_year') = 'boolean' then (r.value->>'exam_this_year')::boolean end as exam_this_year
      from jsonb_array_elements(_rows) with ordinality r(value, ord);
  select jsonb_agg(jsonb_build_object('row', row_number, 'reason', reason) order by row_number) into _rejected
    from (select row_number, case
            when email is null then 'MISSING_EMAIL'
            when email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(email) > 254 then 'INVALID_EMAIL'
            when length(full_name) > 200 then 'INVALID_NAME'
            when residency_year_text is not null and residency_year is null then 'INVALID_RESIDENCY_YEAR'
            when exam_this_year is null then 'INVALID_EXAM_FLAG'
            when count(*) over (partition by email) > 1 then 'DUPLICATE_IN_BATCH' end as reason
          from _roster) x where reason is not null;
  if _rejected is not null then return jsonb_build_object('applied', false, 'rejected', _rejected); end if;
  -- One statement, arbitrated by the normalized-email unique index: two
  -- concurrent imports of the same new address serialize on the index and the
  -- second becomes an update, instead of both seeing "no row" and one failing.
  -- Only full_name + supplied residency_year + exam_this_year are written to an existing row.
  -- ponytail: xmax = 0 marks the rows this statement inserted; updated rows carry a locker xid.
  with up as (
    insert into public.academy_members (email, full_name, residency_year, exam_this_year)
    select r.email, r.full_name, r.residency_year, r.exam_this_year from _roster r
    on conflict (lower(btrim(email))) do update
      set full_name = excluded.full_name,
          residency_year = coalesce(excluded.residency_year, academy_members.residency_year),
          exam_this_year = excluded.exam_this_year
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into _inserted, _updated from up;
  return jsonb_build_object('applied', true, 'inserted', _inserted, 'updated', _updated);
end $$;

create or replace function public.set_member_national_access(_member_id uuid, _enabled boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _member public.academy_members;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_roster_admin(_uid) then raise exception 'NOT_ADMIN'; end if;
  if _member_id is null or _enabled is null then raise exception 'INVALID_INPUT'; end if;
  update public.academy_members set national_access = _enabled, national_access_set_at = now(), national_access_set_by = _uid
   where id = _member_id returning * into _member;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  return jsonb_build_object('member_id', _member.id, 'national_access', _member.national_access,
    'national_access_set_at', _member.national_access_set_at, 'national_access_set_by', _member.national_access_set_by);
end $$;

-- ---------------------------------------------------------------------------
-- 5. durable attempts: entitlement at start, and on every read/confirm/submit/
--    repeat from the FROZEN source (a later edit/delete of the live row cannot
--    reclassify what was frozen). Bodies are the 20260907000001 versions plus
--    one entitlement line each; abandon stays open to the owner.
-- ---------------------------------------------------------------------------
create or replace function public.attempt_check_entitlement(_uid uuid, _attempt_id uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.attempt_questions aq join public.question_snapshots s on s.content_hash = aq.content_hash
     where aq.attempt_id = _attempt_id
       and not (public.question_access_scope(s.snapshot->>'source') = any (public.readable_scopes(_uid)))) then
    raise exception 'NOT_ENTITLED';
  end if;
end $$;

create or replace function public.attempt_start(_mode text, _feedback_timing text, _question_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _root uuid; _attempt uuid;
begin
  if _mode not in ('practice', 'exam') or _feedback_timing not in ('immediate', 'end') then raise exception 'INVALID_INPUT'; end if;
  perform public.attempt_validate_order(_question_ids);
  if exists (select 1 from public.questions q where q.id = any (_question_ids) and not public.can_read_question_source(_uid, q.source)) then raise exception 'NOT_ENTITLED'; end if;
  insert into public.attempt_roots (user_id, mode, question_ids) values (_uid, _mode, _question_ids) returning id into _root;
  insert into public.attempts (root_id, user_id, mode, feedback_timing, question_order, total_count)
    values (_root, _uid, _mode, _feedback_timing, _question_ids, cardinality(_question_ids)) returning id into _attempt;
  perform public.attempt_freeze_questions(_attempt, _question_ids);
  return jsonb_build_object('attempt_id', _attempt, 'root_id', _root, 'question_order', to_jsonb(_question_ids));
end $$;

create or replace function public.attempt_repeat(_root_id uuid, _feedback_timing text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _root public.attempt_roots; _attempt uuid; _order text[]; _previous text[]; _open public.attempts; _first uuid;
begin
  if _feedback_timing not in ('immediate', 'end') then raise exception 'INVALID_INPUT'; end if;
  select * into _root from public.attempt_roots where id = _root_id and user_id = _uid for update;
  if not found then raise exception 'ROOT_NOT_FOUND'; end if;
  select id into _first from public.attempts where root_id = _root_id order by started_at asc limit 1;
  perform public.attempt_check_entitlement(_uid, _first);
  if _root.latest_submitted_at is null then raise exception 'NOT_SUBMITTED_YET'; end if;
  if _root.latest_submitted_at + interval '7 days' > now() then raise exception 'COOLDOWN_ACTIVE'; end if;
  select * into _open from public.attempts where root_id = _root_id and status = 'in_progress';
  if found then return jsonb_build_object('attempt_id', _open.id, 'root_id', _root_id, 'question_order', to_jsonb(_open.question_order)); end if;
  select question_order into _previous from public.attempts where root_id = _root_id order by started_at desc limit 1;
  select public.attempt_distinct_order(array_agg(u.qid order by random()), _previous) into _order from unnest(_root.question_ids) u(qid);
  insert into public.attempts (root_id, user_id, mode, feedback_timing, question_order, total_count)
    values (_root_id, _uid, _root.mode, _feedback_timing, _order, cardinality(_order)) returning id into _attempt;
  insert into public.attempt_questions (attempt_id, question_id, position, content_hash, correct_key)
    select _attempt, aq.question_id, array_position(_order, aq.question_id), aq.content_hash, aq.correct_key
      from public.attempt_questions aq where aq.attempt_id = _first;
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
  perform public.attempt_check_entitlement(_uid, _attempt_id);
  if _attempt.status <> 'in_progress' then raise exception 'ATTEMPT_NOT_OPEN'; end if;
  select * into _row from public.attempt_questions where attempt_id = _attempt_id and question_id = _question_id;
  if not found then raise exception 'QUESTION_NOT_IN_ATTEMPT'; end if;

  _locking := _attempt.mode = 'practice' or _attempt.feedback_timing = 'immediate';
  _reveal := _attempt.feedback_timing = 'immediate';
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

create or replace function public.attempt_submit(_attempt_id uuid, _total_active_ms bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _attempt public.attempts; _q record; _now timestamptz := now();
begin
  select * into _attempt from public.attempts where id = _attempt_id and user_id = _uid for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  perform public.attempt_check_entitlement(_uid, _attempt_id);
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

create or replace function public.attempt_read(_attempt_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _attempt public.attempts; _questions jsonb;
begin
  select * into _attempt from public.attempts where id = _attempt_id and user_id = _uid;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  perform public.attempt_check_entitlement(_uid, _attempt_id);
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

-- ---------------------------------------------------------------------------
-- 6. academy quizzes: a quiz whose questions the member may not read is
--    invisible to them and cannot be submitted (server-side).
-- ---------------------------------------------------------------------------
create or replace function public.quiz_is_entitled(_uid uuid, _question_ids text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.questions q where q.id = any (_question_ids) and not public.can_read_question_source(_uid, q.source))
$$;

create or replace function public.my_quiz_is_entitled(_question_ids text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.quiz_is_entitled(auth.uid(), _question_ids)
$$;

drop policy if exists "Members and admins can read quizzes" on public.quizzes;
create policy "Members and admins can read quizzes" on public.quizzes for select to authenticated
  using (
    public.is_admin(auth.uid())
    or (now() >= opens_at
        and exists (select 1 from public.academy_members m where m.user_id = auth.uid() and m.status = 'active')
        and public.my_quiz_is_entitled(question_ids))
  );

-- body of 20260812000003 plus the NOT_ENTITLED check after the quiz is loaded
create or replace function public.submit_quiz_attempt(_quiz_id uuid, _question_ids text[], _answers jsonb)
returns table (score integer, total integer)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_quiz public.quizzes%rowtype; v_score integer := 0; v_total integer; v_ans text; i integer;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not exists (select 1 from public.academy_members m where m.user_id = v_user and m.status = 'active') then raise exception 'NOT_MEMBER'; end if;
  select * into v_quiz from public.quizzes q where q.id = _quiz_id;
  if not found then raise exception 'QUIZ_NOT_FOUND'; end if;
  if not public.quiz_is_entitled(v_user, v_quiz.question_ids) then raise exception 'NOT_ENTITLED'; end if;
  if now() < v_quiz.opens_at or now() > v_quiz.closes_at then raise exception 'WINDOW_CLOSED'; end if;
  if exists (select 1 from public.quiz_attempts a where a.quiz_id = _quiz_id and a.user_id = v_user) then raise exception 'ALREADY_SUBMITTED'; end if;
  v_total := coalesce(array_length(_question_ids, 1), 0);
  if v_total = 0 then raise exception 'EMPTY_ATTEMPT'; end if;
  if v_total <> coalesce(array_length(v_quiz.question_ids, 1), 0) then raise exception 'INCOMPLETE_SUBMISSION'; end if;
  if (select count(distinct x) from unnest(_question_ids) as x) <> v_total then raise exception 'DUPLICATE_QUESTIONS'; end if;
  for i in 1..v_total loop
    if not (_question_ids[i] = any (v_quiz.question_ids)) then raise exception 'QUESTION_NOT_IN_QUIZ'; end if;
    v_ans := _answers ->> (i - 1);
    if v_ans is not null and exists (select 1 from public.questions q where q.id = _question_ids[i] and q.correct = v_ans) then
      v_score := v_score + 1;
    end if;
  end loop;
  insert into public.quiz_attempts (quiz_id, user_id, question_ids, answers, score, total)
  values (_quiz_id, v_user, _question_ids, _answers, v_score, v_total);
  return query select v_score, v_total;
end $$;

-- ---------------------------------------------------------------------------
-- 7. grants: clients call only the RPCs; helpers stay private
-- ---------------------------------------------------------------------------
revoke all on function public.question_access_scope(text) from public, anon;
revoke all on function public.is_content_admin(uuid) from public, anon, authenticated;
revoke all on function public.is_roster_admin(uuid) from public, anon, authenticated;
revoke all on function public.caller_is_roster_admin() from public, anon;
revoke all on function public.readable_scopes(uuid) from public, anon, authenticated;
revoke all on function public.can_read_question_source(uuid, text) from public, anon, authenticated;
revoke all on function public.resident_verified_email(uuid) from public, anon, authenticated;
revoke all on function public.resident_member_json(public.academy_members) from public, anon, authenticated;
revoke all on function public.attempt_check_entitlement(uuid, uuid) from public, anon, authenticated;
revoke all on function public.quiz_is_entitled(uuid, text[]) from public, anon, authenticated;
revoke all on function public.resident_me() from public, anon;
revoke all on function public.complete_my_onboarding(smallint, date, boolean) from public, anon;
revoke all on function public.upsert_resident_roster(jsonb) from public, anon;
revoke all on function public.set_member_national_access(uuid, boolean) from public, anon;
revoke all on function public.claim_academy_membership() from public, anon;
revoke all on function public.submit_quiz_attempt(uuid, text[], jsonb) from public, anon;
revoke all on function public.my_readable_scopes() from public, anon;
revoke all on function public.my_quiz_is_entitled(text[]) from public, anon;
grant execute on function public.question_access_scope(text), public.my_readable_scopes(), public.my_quiz_is_entitled(text[]), public.caller_is_roster_admin() to authenticated;
grant execute on function public.resident_me(), public.complete_my_onboarding(smallint, date, boolean),
  public.upsert_resident_roster(jsonb), public.set_member_national_access(uuid, boolean),
  public.claim_academy_membership(), public.submit_quiz_attempt(uuid, text[], jsonb) to authenticated;
