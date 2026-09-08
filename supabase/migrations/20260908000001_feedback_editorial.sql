-- 8.9.2026 · Feedback + Idan-only editorial approval (backend contract).
--
-- Residents report app bugs and question problems, and propose corrections
-- (stem / option / key / explanation) with a reason and a reference. Nothing a
-- resident or contributor submits changes live content. Only the editorial
-- OWNER approves, and approval publishes exactly the reviewed version, bound to
-- the base content the reviewer saw. Explanation-author grants are separate
-- from admin/editor and from national-exam entitlement; they only widen what a
-- resident may *submit* (a missing explanation), never what gets published.
--
-- Depends on 20260907000001 (attempt_caller) and 20260907000002
-- (can_read_question_source). Verified locally by scripts/feedback-db/run.sh.
-- Applies nothing to any remote project.
--
-- ONE-TIME OWNER CONFIGURATION (production / staging; service role or SQL editor):
--   1. Look the id up, never type it from memory:
--        select id, email from auth.users where lower(email) = lower('<idan-login-email>');
--   2. insert into public.editorial_owner (id, label) values ('<that id>', 'Idan Katz');
--   3. Verify: select * from public.editorial_owner;   -- exactly one row
--   Until that row exists every owner action raises NOT_OWNER and no client can
--   write public.questions directly (service-role edge functions are unaffected).
--
-- LEGACY CONFLICTS RESOLVED HERE (inventory):
--   * questions INSERT/UPDATE/DELETE policies from 20260224211718 used
--     public.is_admin(), which is true for editors too → replaced by owner-only.
--     (QuestionEditorTab / ImportQuestionsTab direct writes now succeed only for
--     the owner. sync-questions / admin-manage-users are service-role edge
--     functions gated by the broad is_admin — outside this migration, see RESULT.)
--   * ownership is never read from admin_users / profiles.is_admin, so the
--     admin-manage-users role tooling cannot grant it.
--   * public.user_feedback (20260221235422) is left untouched: no caller in the
--     app, unrelated access preserved.

-- ---------------------------------------------------------------------------
-- 1. owner identity — explicit, single row, no API access, fail closed
-- ---------------------------------------------------------------------------
create table public.editorial_owner (
  id uuid primary key,
  label text not null,
  set_at timestamptz not null default now(),
  singleton boolean not null default true check (singleton),
  unique (singleton)
);
comment on table public.editorial_owner is 'Exactly one row: the user who may approve/publish content and grant explanation authors. Set once by hand; never derived from admin_users.';
alter table public.editorial_owner enable row level security;
revoke all on public.editorial_owner from public, anon, authenticated;

create or replace function public.is_editorial_owner(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select _uid is not null and exists (select 1 from public.editorial_owner o where o.id = _uid)
$$;
create or replace function public.caller_is_editorial_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_editorial_owner(auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- 2. explanation-author grants — owner-written, revocation is immediate
-- ---------------------------------------------------------------------------
create table public.explanation_authors (
  user_id uuid primary key,
  granted_by uuid not null,
  granted_at timestamptz not null default now(),
  revoked_by uuid,
  revoked_at timestamptz,
  note text
);
alter table public.explanation_authors enable row level security;
revoke all on public.explanation_authors from public, anon, authenticated;

create or replace function public.is_explanation_author(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.explanation_authors a where a.user_id = _uid and a.revoked_at is null)
$$;

-- ---------------------------------------------------------------------------
-- 3. feedback items + published-version history (RPC-only tables)
-- ---------------------------------------------------------------------------
create table public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('app_bug', 'question_report', 'correction')),
  question_id text,
  target text check (target in ('question', 'a', 'b', 'c', 'd', 'correct', 'explanation')),
  issue_text text not null check (length(issue_text) between 1 and 4000),
  proposed_text text check (proposed_text is null or length(proposed_text) between 1 and 20000),
  reference text check (reference is null or length(reference) <= 1000),
  page_context text check (page_context is null or length(page_context) <= 500),
  base_hash text,
  target_hash text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'handled', 'rejected')),
  submitted_by uuid not null,
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) <= 2000),
  published_version_id uuid,
  check ((kind = 'app_bug') = (question_id is null)),
  check ((kind = 'correction') = (target is not null and proposed_text is not null and base_hash is not null and target_hash is not null)),
  check (kind <> 'correction' or length(btrim(coalesce(reference, ''))) > 0)
);
create index feedback_items_status_idx on public.feedback_items (status, created_at desc);
create index feedback_items_submitter_idx on public.feedback_items (submitted_by, created_at desc);
create index feedback_items_question_idx on public.feedback_items (question_id);
comment on column public.feedback_items.base_hash is 'feedback_question_hash of the WHOLE question record at submission (durable-snapshot shape: content + provenance + media). Only hashes are stored — never the question content.';
comment on column public.feedback_items.target_hash is 'md5 of the target column alone at submission; kept for history, not for approval.';
alter table public.feedback_items enable row level security;
revoke all on public.feedback_items from public, anon, authenticated;

create table public.question_content_versions (
  id uuid primary key default gen_random_uuid(),
  question_id text not null,
  target text not null check (target in ('question', 'a', 'b', 'c', 'd', 'correct', 'explanation')),
  old_text text,
  new_text text,
  old_hash text not null,
  new_hash text not null,
  base_question_hash text not null,
  question_hash text not null,
  feedback_id uuid references public.feedback_items (id),
  rollback_of uuid references public.question_content_versions (id),
  author_id uuid,
  reviewer_id uuid not null,
  published_at timestamptz not null default now()
);
create index question_content_versions_question_idx on public.question_content_versions (question_id, target, published_at desc);
alter table public.question_content_versions enable row level security;
revoke all on public.question_content_versions from public, anon, authenticated;
alter table public.feedback_items add constraint feedback_items_version_fk
  foreign key (published_version_id) references public.question_content_versions (id);

-- ---------------------------------------------------------------------------
-- 4. private helpers
-- ---------------------------------------------------------------------------
create or replace function public.feedback_owner_caller() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := auth.uid();
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_editorial_owner(_uid) then raise exception 'NOT_OWNER'; end if;
  return _uid;
end $$;

create or replace function public.feedback_target_text(_q public.questions, _target text) returns text
language sql immutable as $$
  select case _target
    when 'question' then _q.question when 'a' then _q.a when 'b' then _q.b when 'c' then _q.c when 'd' then _q.d
    when 'correct' then _q.correct when 'explanation' then _q.explanation end
$$;

create or replace function public.feedback_hash(_text text) returns text
language sql immutable as $$ select md5(coalesce(_text, '')) $$;

-- production already has questions.manually_edited (QuestionEditorTab sets it;
-- sync-questions skips such rows). The bare harness does not.
alter table public.questions add column if not exists manually_edited boolean default false;

-- Canonical hash of the WHOLE question record: byte-for-byte the durable
-- attempt snapshot (attempt_freeze_questions in 20260907000001), i.e. every
-- content AND provenance field — id, ref_id, stem, options, key, explanation,
-- topic, chapter, miller, year, source, kind, media_type, media_link — so
-- feedback_question_hash(q) = question_snapshots.content_hash for a question
-- frozen in that state. Submission, review, stale, approval and rollback all
-- bind to THIS: any change to any of these fields between owner review and
-- approval is STALE_BASE. jsonb key order is canonical; nulls are stripped.
create or replace function public.feedback_question_hash(_q public.questions) returns text
language sql immutable as $$
  select md5(jsonb_strip_nulls(jsonb_build_object(
    'id', _q.id, 'ref_id', _q.ref_id, 'question', _q.question, 'a', _q.a, 'b', _q.b, 'c', _q.c, 'd', _q.d,
    'correct', _q.correct, 'explanation', _q.explanation, 'topic', _q.topic, 'chapter', _q.chapter,
    'miller', _q.miller, 'year', _q.year, 'source', _q.source, 'kind', _q.kind,
    'media_type', _q.media_type, 'media_link', _q.media_link))::text)
$$;

-- Writes exactly one column of one question and marks the row manually_edited
-- so sync-questions never overwrites a published correction. Only the
-- approve/rollback RPCs call it.
create or replace function public.feedback_write_target(_question_id text, _target text, _text text) returns void
language sql security definer set search_path = public as $$
  update public.questions set
    manually_edited = true,
    question = case when _target = 'question' then _text else question end,
    a = case when _target = 'a' then _text else a end,
    b = case when _target = 'b' then _text else b end,
    c = case when _target = 'c' then _text else c end,
    d = case when _target = 'd' then _text else d end,
    correct = case when _target = 'correct' then _text else correct end,
    explanation = case when _target = 'explanation' then _text else explanation end
  where id = _question_id
$$;

-- Safe item shape. Bodies (including the owner's free-text review note, which
-- may quote the content) are included only when _with_bodies; the caller
-- decides that from the reader's entitlement. Never contains question content.
create or replace function public.feedback_item_json(_i public.feedback_items, _with_bodies boolean) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', _i.id, 'kind', _i.kind, 'question_id', _i.question_id, 'target', _i.target, 'status', _i.status,
    'submitted_by', _i.submitted_by, 'created_at', _i.created_at, 'reviewed_by', _i.reviewed_by, 'reviewed_at', _i.reviewed_at,
    'published_version_id', _i.published_version_id, 'page_context', _i.page_context,
    'body_hidden', not _with_bodies,
    'review_note', case when _with_bodies then _i.review_note end,
    'issue_text', case when _with_bodies then _i.issue_text end,
    'proposed_text', case when _with_bodies then _i.proposed_text end,
    'reference', case when _with_bodies then _i.reference end)
$$;

-- ---------------------------------------------------------------------------
-- 5. resident RPCs: role, submit, my items
-- ---------------------------------------------------------------------------
create or replace function public.feedback_my_role() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'owner', public.is_editorial_owner(auth.uid()),
    'author', public.is_explanation_author(auth.uid()),
    'approved', coalesce(public.is_approved(auth.uid()), false))
$$;

create or replace function public.feedback_submit(_kind text, _question_id text, _target text, _issue_text text, _proposed_text text, _reference text, _page_context text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _q public.questions; _proposed text := _proposed_text; _base_hash text; _target_hash text; _id uuid;
begin
  if _kind not in ('app_bug', 'question_report', 'correction') then raise exception 'INVALID_INPUT'; end if;
  -- serialize this user's count+insert so two simultaneous requests cannot both take the last hourly slot
  perform pg_advisory_xact_lock(hashtext('feedback_submit'), hashtext(_uid::text));
  if _issue_text is null or length(btrim(_issue_text)) = 0 or length(_issue_text) > 4000 then raise exception 'INVALID_INPUT'; end if;
  if _reference is not null and length(_reference) > 1000 then raise exception 'INVALID_INPUT'; end if;
  if _page_context is not null and length(_page_context) > 500 then raise exception 'INVALID_INPUT'; end if;
  -- ponytail: fixed window; per-user token bucket if abuse ever shows up
  if (select count(*) from public.feedback_items f where f.submitted_by = _uid and f.created_at > now() - interval '1 hour') >= 30 then raise exception 'RATE_LIMITED'; end if;

  if _kind = 'app_bug' then
    if _question_id is not null or _target is not null or _proposed is not null then raise exception 'INVALID_INPUT'; end if;
  else
    if _question_id is null then raise exception 'INVALID_INPUT'; end if;
    select * into _q from public.questions q where q.id = _question_id;
    if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
    if not public.can_read_question_source(_uid, _q.source) then raise exception 'NOT_ENTITLED'; end if;
  end if;

  if _kind = 'question_report' then
    if _target is not null or _proposed is not null then raise exception 'INVALID_INPUT'; end if;
  elsif _kind = 'correction' then
    if _target is null or _target not in ('question', 'a', 'b', 'c', 'd', 'correct', 'explanation') then raise exception 'INVALID_INPUT'; end if;
    if _proposed is null or length(btrim(_proposed)) = 0 or length(_proposed) > 20000 then raise exception 'INVALID_INPUT'; end if;
    if _target = 'correct' then
      _proposed := upper(btrim(_proposed));
      if _proposed not in ('A', 'B', 'C', 'D') then raise exception 'INVALID_INPUT'; end if;
    end if;
    if length(btrim(coalesce(_reference, ''))) = 0 then raise exception 'INVALID_INPUT'; end if;
    _base_hash := public.feedback_question_hash(_q);
    _target_hash := public.feedback_hash(public.feedback_target_text(_q, _target));
    -- adding a MISSING explanation needs an explicit author grant (or the owner)
    if _target = 'explanation' and length(btrim(coalesce(_q.explanation, ''))) = 0
       and not (public.is_explanation_author(_uid) or public.is_editorial_owner(_uid)) then
      raise exception 'NOT_AUTHOR';
    end if;
  end if;

  insert into public.feedback_items (kind, question_id, target, issue_text, proposed_text, reference, page_context, base_hash, target_hash, submitted_by)
  values (_kind, _question_id, _target, _issue_text, _proposed, nullif(btrim(_reference), ''), nullif(btrim(_page_context), ''), _base_hash, _target_hash, _uid)
  returning id into _id;
  return jsonb_build_object('id', _id, 'status', 'pending');
end $$;

-- The caller's own items. Bodies are shown only while the caller may still read
-- the question's source (a revoked national grant hides what they wrote about it).
create or replace function public.feedback_mine() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.feedback_item_json(f, f.question_id is null or exists (
           select 1 from public.questions q where q.id = f.question_id and public.can_read_question_source(public.attempt_caller(), q.source)))
         order by f.created_at desc), '[]'::jsonb)
    from public.feedback_items f where f.submitted_by = public.attempt_caller()
$$;

-- ---------------------------------------------------------------------------
-- 6. owner RPCs: queue, review content, approve, resolve, rollback, authors
-- ---------------------------------------------------------------------------
create or replace function public.feedback_queue(_status text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := public.feedback_owner_caller(); _out jsonb;
begin
  if _status is not null and _status not in ('pending', 'approved', 'handled', 'rejected') then raise exception 'INVALID_INPUT'; end if;
  select coalesce(jsonb_agg(public.feedback_item_json(f, true) || jsonb_build_object(
           'stale', f.kind = 'correction' and (q.id is null or public.feedback_question_hash(q) <> f.base_hash),
           'question_ref_id', q.ref_id, 'question_source', q.source, 'question_exists', q.id is not null)
         order by f.created_at desc), '[]'::jsonb)
    into _out
    from public.feedback_items f left join public.questions q on q.id = f.question_id
   where _status is null or f.status = _status;
  return _out;
end $$;

-- Exact review content: the LIVE question record (stem, options, key,
-- explanation AND the hashed provenance/media fields), the live target text,
-- and current_hash = whole-question hash the owner must
-- send back on approve/rollback (owner-only — this is the only place question
-- content leaves the questions table).
create or replace function public.feedback_review(_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := public.feedback_owner_caller(); _i public.feedback_items; _q public.questions; _current text; _hash text;
begin
  select * into _i from public.feedback_items where id = _id;
  if not found then raise exception 'FEEDBACK_NOT_FOUND'; end if;
  if _i.question_id is not null then select * into _q from public.questions where id = _i.question_id; end if;
  _current := case when _q.id is not null and _i.target is not null then public.feedback_target_text(_q, _i.target) end;
  _hash := case when _q.id is not null then public.feedback_question_hash(_q) end;
  return public.feedback_item_json(_i, true) || jsonb_build_object(
    'question_exists', _q.id is not null, 'question_ref_id', _q.ref_id, 'question_source', _q.source,
    'question_topic', _q.topic, 'question_chapter', _q.chapter, 'question_miller', _q.miller, 'question_year', _q.year,
    'question_kind', _q.kind, 'question_media_type', _q.media_type, 'question_media_link', _q.media_link,
    'question_text', _q.question, 'option_a', _q.a, 'option_b', _q.b, 'option_c', _q.c, 'option_d', _q.d,
    'current_key', _q.correct, 'explanation_text', _q.explanation,
    'current_text', _current, 'current_hash', _hash,
    'current_target_hash', case when _q.id is not null and _i.target is not null then public.feedback_hash(_current) end,
    'stale', _i.kind = 'correction' and (_hash is null or _hash <> _i.base_hash));
end $$;

-- Publishes the reviewed replacement. Both the stored base hash (the WHOLE
-- question the proposer edited against) and _expected_base_hash (the whole
-- question the reviewer just saw) must equal the live content, else
-- STALE_BASE and nothing changes.
create or replace function public.feedback_approve(_id uuid, _expected_base_hash text, _note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.feedback_owner_caller(); _i public.feedback_items; _q public.questions; _current text; _hash text; _after text; _version uuid;
begin
  if _note is not null and length(_note) > 2000 then raise exception 'INVALID_INPUT'; end if;
  select * into _i from public.feedback_items where id = _id for update;
  if not found then raise exception 'FEEDBACK_NOT_FOUND'; end if;
  if _i.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  if _i.kind <> 'correction' then raise exception 'NOT_PUBLISHABLE'; end if;
  select * into _q from public.questions where id = _i.question_id for update;
  if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
  _current := public.feedback_target_text(_q, _i.target);
  _hash := public.feedback_question_hash(_q);
  if _hash <> _i.base_hash or _expected_base_hash is distinct from _hash then raise exception 'STALE_BASE'; end if;
  perform public.feedback_write_target(_i.question_id, _i.target, _i.proposed_text);
  select public.feedback_question_hash(q) into _after from public.questions q where q.id = _i.question_id;
  insert into public.question_content_versions (question_id, target, old_text, new_text, old_hash, new_hash, base_question_hash, question_hash, feedback_id, author_id, reviewer_id)
  values (_i.question_id, _i.target, _current, _i.proposed_text, public.feedback_hash(_current), public.feedback_hash(_i.proposed_text), _hash, _after, _i.id, _i.submitted_by, _uid)
  returning id into _version;
  update public.feedback_items set status = 'approved', reviewed_by = _uid, reviewed_at = now(), review_note = nullif(btrim(_note), ''), published_version_id = _version
   where id = _id;
  return jsonb_build_object('id', _id, 'status', 'approved', 'version_id', _version);
end $$;

-- Closes an item without touching content.
create or replace function public.feedback_resolve(_id uuid, _status text, _note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.feedback_owner_caller(); _i public.feedback_items;
begin
  if _status not in ('handled', 'rejected') then raise exception 'INVALID_INPUT'; end if;
  if _note is not null and length(_note) > 2000 then raise exception 'INVALID_INPUT'; end if;
  select * into _i from public.feedback_items where id = _id for update;
  if not found then raise exception 'FEEDBACK_NOT_FOUND'; end if;
  if _i.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  update public.feedback_items set status = _status, reviewed_by = _uid, reviewed_at = now(), review_note = nullif(btrim(_note), '') where id = _id;
  return jsonb_build_object('id', _id, 'status', _status);
end $$;

create or replace function public.feedback_versions(_question_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := public.feedback_owner_caller(); _out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'question_id', v.question_id, 'target', v.target, 'old_text', v.old_text, 'new_text', v.new_text,
           'old_hash', v.old_hash, 'new_hash', v.new_hash, 'base_question_hash', v.base_question_hash, 'question_hash', v.question_hash,
           'feedback_id', v.feedback_id, 'rollback_of', v.rollback_of,
           'author_id', v.author_id, 'reviewer_id', v.reviewer_id, 'published_at', v.published_at) order by v.published_at desc), '[]'::jsonb)
    into _out from public.question_content_versions v where v.question_id = _question_id;
  return _out;
end $$;

-- Restores the base of a published version. Only the latest version of that
-- (question, target) can be rolled back, only while its text is still live,
-- and only against the exact whole question the owner just reviewed
-- (_expected_hash = current_hash from feedback_review / the versions screen).
create or replace function public.feedback_rollback(_version_id uuid, _expected_hash text, _note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.feedback_owner_caller(); _v public.question_content_versions; _q public.questions; _hash text; _whole text; _after text; _new uuid;
begin
  if _note is not null and length(_note) > 2000 then raise exception 'INVALID_INPUT'; end if;
  select * into _v from public.question_content_versions where id = _version_id for update;
  if not found then raise exception 'VERSION_NOT_FOUND'; end if;
  if exists (select 1 from public.question_content_versions later where later.question_id = _v.question_id and later.target = _v.target and later.published_at > _v.published_at) then
    raise exception 'NOT_LATEST';
  end if;
  select * into _q from public.questions where id = _v.question_id for update;
  if not found then raise exception 'QUESTION_NOT_FOUND'; end if;
  _hash := public.feedback_hash(public.feedback_target_text(_q, _v.target));
  _whole := public.feedback_question_hash(_q);
  if _hash <> _v.new_hash or _expected_hash is distinct from _whole then raise exception 'STALE_BASE'; end if;
  perform public.feedback_write_target(_v.question_id, _v.target, _v.old_text);
  select public.feedback_question_hash(q) into _after from public.questions q where q.id = _v.question_id;
  insert into public.question_content_versions (question_id, target, old_text, new_text, old_hash, new_hash, base_question_hash, question_hash, rollback_of, reviewer_id)
  values (_v.question_id, _v.target, _v.new_text, _v.old_text, _v.new_hash, _v.old_hash, _whole, _after, _v.id, _uid) returning id into _new;
  return jsonb_build_object('version_id', _new, 'rollback_of', _v.id);
end $$;

-- Author grants: owner only. Grant requires an approved target; revoke is immediate.
create or replace function public.feedback_set_author(_user_id uuid, _enabled boolean, _note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.feedback_owner_caller();
begin
  if _user_id is null or _enabled is null then raise exception 'INVALID_INPUT'; end if;
  if _note is not null and length(_note) > 500 then raise exception 'INVALID_INPUT'; end if;
  if _enabled then
    if not coalesce(public.is_approved(_user_id), false) then raise exception 'TARGET_NOT_APPROVED'; end if;
    insert into public.explanation_authors (user_id, granted_by, note) values (_user_id, _uid, nullif(btrim(_note), ''))
    on conflict (user_id) do update set granted_by = _uid, granted_at = now(), revoked_by = null, revoked_at = null, note = excluded.note;
  else
    update public.explanation_authors set revoked_by = _uid, revoked_at = now(), note = coalesce(nullif(btrim(_note), ''), note)
     where user_id = _user_id and revoked_at is null;
  end if;
  return jsonb_build_object('user_id', _user_id, 'author', public.is_explanation_author(_user_id));
end $$;

create or replace function public.feedback_authors() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := public.feedback_owner_caller(); _out jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'granted_by', a.granted_by, 'granted_at', a.granted_at,
           'revoked_by', a.revoked_by, 'revoked_at', a.revoked_at, 'note', a.note, 'active', a.revoked_at is null) order by a.granted_at desc), '[]'::jsonb)
    into _out from public.explanation_authors a;
  return _out;
end $$;

-- ---------------------------------------------------------------------------
-- 7. legacy bypass: direct question writes were is_admin (editors included).
--    Every INSERT/UPDATE/DELETE policy on questions is dropped and replaced by
--    owner-only. SELECT policies are untouched (20260907000002 owns them).
-- ---------------------------------------------------------------------------
do $$
declare _p record;
begin
  for _p in select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'questions' and cmd in ('INSERT', 'UPDATE', 'DELETE') loop
    raise notice 'dropping questions % policy: %', _p.cmd, _p.policyname;
    execute format('drop policy %I on public.questions', _p.policyname);
  end loop;
end $$;
create policy "Editorial owner can insert questions" on public.questions for insert to authenticated with check (public.caller_is_editorial_owner());
create policy "Editorial owner can update questions" on public.questions for update to authenticated using (public.caller_is_editorial_owner()) with check (public.caller_is_editorial_owner());
create policy "Editorial owner can delete questions" on public.questions for delete to authenticated using (public.caller_is_editorial_owner());

-- ---------------------------------------------------------------------------
-- 8. grants: clients call only the RPCs; helpers stay private
-- ---------------------------------------------------------------------------
revoke all on function public.is_editorial_owner(uuid) from public, anon, authenticated;
revoke all on function public.is_explanation_author(uuid) from public, anon, authenticated;
revoke all on function public.feedback_owner_caller() from public, anon, authenticated;
revoke all on function public.feedback_target_text(public.questions, text) from public, anon, authenticated;
revoke all on function public.feedback_hash(text) from public, anon, authenticated;
revoke all on function public.feedback_question_hash(public.questions) from public, anon, authenticated;
revoke all on function public.feedback_write_target(text, text, text) from public, anon, authenticated;
revoke all on function public.feedback_item_json(public.feedback_items, boolean) from public, anon, authenticated;
revoke all on function public.caller_is_editorial_owner() from public, anon;
revoke all on function public.feedback_my_role() from public, anon;
revoke all on function public.feedback_submit(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.feedback_mine() from public, anon;
revoke all on function public.feedback_queue(text) from public, anon;
revoke all on function public.feedback_review(uuid) from public, anon;
revoke all on function public.feedback_approve(uuid, text, text) from public, anon;
revoke all on function public.feedback_resolve(uuid, text, text) from public, anon;
revoke all on function public.feedback_versions(text) from public, anon;
revoke all on function public.feedback_rollback(uuid, text, text) from public, anon;
revoke all on function public.feedback_set_author(uuid, boolean, text) from public, anon;
revoke all on function public.feedback_authors() from public, anon;
grant execute on function public.caller_is_editorial_owner(), public.feedback_my_role(),
  public.feedback_submit(text, text, text, text, text, text, text), public.feedback_mine(),
  public.feedback_queue(text), public.feedback_review(uuid), public.feedback_approve(uuid, text, text),
  public.feedback_resolve(uuid, text, text), public.feedback_versions(text), public.feedback_rollback(uuid, text, text),
  public.feedback_set_author(uuid, boolean, text), public.feedback_authors() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. service-role gate + owner-only resident picker (fix round, 8.9.2026)
-- ---------------------------------------------------------------------------
-- Edge Functions that write questions / admin rows with the service key
-- (sync-questions, admin-manage-users) now call is_editorial_owner(<verified
-- JWT uid>) through supabase/functions/_shared/editorialOwner.ts. The service
-- role needs EXECUTE on that predicate and nothing else; authenticated / anon
-- stay revoked (see above), so no client can enumerate or test ownership.
grant execute on function public.is_editorial_owner(uuid) to service_role;

-- Owner-only candidate list for explanation-author grants: approved users only
-- (pending accounts never appear, and feedback_set_author refuses them anyway),
-- minimal fields (id, email, name, current grant state). Name comes from
-- profiles.display_name when that column exists (production) or the roster
-- full_name; to_jsonb keeps the function valid on schemas without the column.
create or replace function public.feedback_author_candidates(_search text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := public.feedback_owner_caller(); _q text := nullif(btrim(coalesce(_search, '')), ''); _out jsonb;
begin
  if _q is not null and length(_q) > 100 then raise exception 'INVALID_INPUT'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id', c.id, 'email', c.email, 'name', c.name, 'author', c.author, 'note', c.note) order by lower(c.email)), '[]'::jsonb)
    into _out
  from (
    select u.id, u.email,
           coalesce(nullif(to_jsonb(p) ->> 'display_name', ''), (select m.full_name from public.academy_members m where m.user_id = u.id limit 1)) as name,
           public.is_explanation_author(u.id) as author, a.note
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.explanation_authors a on a.user_id = u.id
     where u.id <> _uid
       and coalesce(public.is_approved(u.id), false)
       and (_q is null or u.email ilike '%' || _q || '%'
            or coalesce(to_jsonb(p) ->> 'display_name', '') ilike '%' || _q || '%'
            or exists (select 1 from public.academy_members m where m.user_id = u.id and m.full_name ilike '%' || _q || '%'))
     order by lower(u.email)
     limit 200
  ) c;
  return _out;
end $$;
revoke all on function public.feedback_author_candidates(text) from public, anon;
grant execute on function public.feedback_author_candidates(text) to authenticated;
