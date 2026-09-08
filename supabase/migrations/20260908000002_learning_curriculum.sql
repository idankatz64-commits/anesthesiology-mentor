-- Learning evidence + versioned curriculum config (Today A, 8 Sep 2026).
-- Additive on top of 20260907000001 (durable attempts), 20260907000002
-- (resident entitlement) and 20260908000001 (editorial owner, worker B).
-- Nothing here edits an older migration; every change is a new column,
-- table or function, or an in-place replacement of attempt_result that only
-- adds keys. Publish authority reuses B's single editorial owner row.
--
-- 1. Self-run simulations are durable attempts, labelled — not an official quiz
--    ---------------------------------------------------------------------------
-- A simulation is scored like an exam (feedback at the end, credit applied
-- once at attempt_submit) but stays visibly labelled `kind = 'simulation'`
-- so nothing reports it as an official Academy quiz. Official quizzes stay
-- in quiz_attempts and never touch this table.
alter table public.attempts add column if not exists kind text check (kind in ('simulation'));
alter table public.attempts add column if not exists recommendation_id text;

create or replace function public.attempt_result(_attempt public.attempts) returns jsonb
language sql immutable as $$
  select jsonb_build_object('attempt_id', _attempt.id, 'root_id', _attempt.root_id, 'status', _attempt.status,
    'correct_count', _attempt.correct_count, 'scored_count', _attempt.scored_count, 'answered_count', _attempt.answered_count,
    'total_count', _attempt.total_count, 'quarter', _attempt.quarter, 'submitted_at', _attempt.submitted_at, 'total_active_ms', _attempt.total_active_ms,
    'kind', _attempt.kind, 'recommendation_id', _attempt.recommendation_id)
$$;

create or replace function public.attempt_start_simulation(_question_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _started jsonb;
begin
  _started := public.attempt_start('exam', 'end', _question_ids);
  update public.attempts set kind = 'simulation' where id = (_started->>'attempt_id')::uuid;
  return _started || jsonb_build_object('kind', 'simulation');
end $$;

-- 2. Recommendations are recorded, later attempts are linked, causality is not claimed
--    ---------------------------------------------------------------------------
create table if not exists public.learning_recommendations (
  user_id uuid not null,
  id text not null,
  kind text not null,
  setup jsonb not null,
  provenance jsonb,
  issued_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.learning_recommendations enable row level security;
revoke all on public.learning_recommendations from public, anon, authenticated;

create or replace function public.learning_recommendation_link(_attempt_id uuid, _recommendation jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _id text := _recommendation->>'id';
begin
  if _id is null or length(_id) > 200 or coalesce(jsonb_typeof(_recommendation->'setup'), '') <> 'object' then raise exception 'INVALID_INPUT'; end if;
  insert into public.learning_recommendations (user_id, id, kind, setup, provenance)
    values (_uid, _id, coalesce(_recommendation->>'kind', 'unknown'), _recommendation->'setup', _recommendation->'provenance')
    on conflict (user_id, id) do nothing;
  update public.attempts set recommendation_id = _id
   where id = _attempt_id and user_id = _uid and status = 'in_progress' and recommendation_id is null;
  if not found then raise exception 'ATTEMPT_NOT_OPEN'; end if;
end $$;

-- 3. Owner-scoped evidence from immutable submitted records
--    ---------------------------------------------------------------------------
-- One row per confirmed question of a submitted attempt. Authoritative time is
-- the server confirmed_at. is_correct stays null for unscored items (never
-- coerced to wrong). No stem/options/key/explanation leaves the server: only
-- the frozen chapter and the access scope of the frozen source, so the client
-- can explain "outside your current entitlement" without seeing the content.
create or replace function public.learning_evidence_read() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(e)::jsonb order by e.confirmed_at), '[]'::jsonb)
  from (
    select aq.question_id, a.id as attempt_id, a.root_id, a.mode, a.kind, a.feedback_timing, a.recommendation_id,
           aq.confirmed_at, aq.is_correct, aq.confidence, aq.answer_ms, aq.selected is not null as answered,
           aq.correct_key is not null as scored,
           (s.snapshot->>'chapter')::integer as chapter,
           public.question_access_scope(s.snapshot->>'source') as scope,
           row_number() over (partition by aq.question_id order by aq.confirmed_at) - 1 as prior_exposures
    from public.attempts a
    join public.attempt_questions aq on aq.attempt_id = a.id
    join public.question_snapshots s on s.content_hash = aq.content_hash
    where a.user_id = public.attempt_caller() and a.status = 'submitted' and aq.confirmed_at is not null
  ) e
$$;

-- 4. Academy quiz time and explicit confidence, additive
--    ---------------------------------------------------------------------------
alter table public.quiz_attempts add column if not exists total_active_ms bigint check (total_active_ms >= 0 and total_active_ms <= 8640000000);
alter table public.quiz_attempts add column if not exists answer_ms integer[];
alter table public.quiz_attempts add column if not exists confidence text[];

-- Same validation and scoring as the 3-argument function (called, not copied);
-- only the timing/confidence columns are added afterwards.
create or replace function public.submit_quiz_attempt(_quiz_id uuid, _question_ids text[], _answers jsonb,
                                                     _total_active_ms bigint, _answer_ms integer[], _confidence text[])
returns table(score integer, total integer)
language plpgsql security definer set search_path = public as $$
declare _n integer := coalesce(array_length(_question_ids, 1), 0);
begin
  if _total_active_ms is null or _total_active_ms < 0 or _total_active_ms > 8640000000 then raise exception 'INVALID_INPUT'; end if;
  if _answer_ms is not null and (array_length(_answer_ms, 1) <> _n or exists (select 1 from unnest(_answer_ms) x where x < 0)) then raise exception 'INVALID_INPUT'; end if;
  if _confidence is not null and (array_length(_confidence, 1) <> _n or exists (select 1 from unnest(_confidence) c where c is not null and c not in ('confident', 'hesitant', 'guessed'))) then raise exception 'INVALID_INPUT'; end if;
  return query select * from public.submit_quiz_attempt(_quiz_id, _question_ids, _answers);
  update public.quiz_attempts set total_active_ms = _total_active_ms, answer_ms = _answer_ms, confidence = _confidence
   where quiz_id = _quiz_id and user_id = auth.uid();
end $$;

-- 5. Versioned curriculum config: draft by content admins, published by the editorial owner only
--    ---------------------------------------------------------------------------
create table if not exists public.curriculum_configs (
  version text primary key check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  chapters jsonb not null,
  source jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz
);
alter table public.curriculum_configs enable row level security;
revoke all on public.curriculum_configs from public, anon, authenticated;

-- Exact-content identity of a stored version (jsonb text form is canonical).
-- The publisher echoes it back so a publish can never land on content that
-- differs from what was reviewed on screen.
create or replace function public.curriculum_config_hash(_chapters jsonb) returns text
language sql immutable as $$ select encode(sha256(convert_to(_chapters::text, 'UTF8')), 'hex') $$;

create or replace function public.curriculum_config_json(_c public.curriculum_configs) returns jsonb
language sql immutable as $$
  select jsonb_build_object('version', _c.version, 'status', _c.status, 'chapters', _c.chapters, 'source', _c.source,
    'created_at', _c.created_at, 'approved_at', _c.approved_at, 'content_hash', public.curriculum_config_hash(_c.chapters))
$$;

-- Residents: the latest approved config in full, plus the version/status of the
-- newest draft so the UI can say "awaiting approved core configuration".
-- Content admins and the publisher additionally get the full draft and the
-- version list (a publish requires reviewing exact content, so the owner must
-- be able to see it even without the admin role).
create or replace function public.curriculum_config_read() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _admin boolean; _approved public.curriculum_configs; _draft public.curriculum_configs; _owner boolean := false; _full boolean;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_approved(_uid) then raise exception 'NOT_APPROVED'; end if;
  _admin := public.is_content_admin(_uid);
  _owner := public.is_editorial_owner(_uid);
  _full := _admin or _owner;
  select * into _approved from public.curriculum_configs where status = 'approved' order by approved_at desc limit 1;
  select * into _draft from public.curriculum_configs where status = 'draft' order by created_at desc limit 1;
  return jsonb_build_object(
    'approved', case when _approved.version is not null then public.curriculum_config_json(_approved) end,
    'draft', case when _draft.version is null then null
                  when _full then public.curriculum_config_json(_draft)
                  else jsonb_build_object('version', _draft.version, 'status', _draft.status) end,
    'can_edit', _admin, 'can_publish', _owner,
    'versions', case when _full then (select coalesce(jsonb_agg(jsonb_build_object('version', c.version, 'status', c.status,
        'created_at', c.created_at, 'approved_at', c.approved_at, 'chapter_count', jsonb_array_length(c.chapters),
        'content_hash', public.curriculum_config_hash(c.chapters)) order by c.created_at desc), '[]'::jsonb)
        from public.curriculum_configs c) else '[]'::jsonb end);
end $$;

create or replace function public.curriculum_draft_save(_version text, _chapters jsonb, _source jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _row public.curriculum_configs;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_content_admin(_uid) then raise exception 'NOT_ADMIN'; end if;
  if _version is null or _version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' then raise exception 'INVALID_INPUT'; end if;
  if jsonb_typeof(_chapters) <> 'array' or jsonb_array_length(_chapters) = 0 or jsonb_array_length(_chapters) > 500
     or exists (select 1 from jsonb_array_elements(_chapters) c
                 where jsonb_typeof(c->'chapter') <> 'number' or (c->>'chapter')::numeric <> floor((c->>'chapter')::numeric)
                    or (c->>'chapter')::numeric < 1 or coalesce(btrim(c->>'title'), '') = '')
     or (select count(distinct c->>'chapter') from jsonb_array_elements(_chapters) c) <> jsonb_array_length(_chapters)
  then raise exception 'INVALID_INPUT'; end if;
  if exists (select 1 from public.curriculum_configs where version = _version) then raise exception 'DUPLICATE_VERSION'; end if;
  insert into public.curriculum_configs (version, chapters, source, created_by) values (_version, _chapters, _source, _uid) returning * into _row;
  return public.curriculum_config_json(_row);
end $$;

-- Publishing is the editorial owner's decision on one exact version. Admins
-- are not promoted; the owner identity is never guessed here — it is the
-- single row worker B's migration protects.
-- Compare-and-set: the caller states which version it believes is active
-- (_expected_active, null = none) and the content hash of the version it
-- reviewed (_expected_hash). Publications are serialized by an advisory lock,
-- so a concurrent publish, a stale browser or a version whose content differs
-- from the reviewed one gets STALE_CONFIG and replaces nothing. Re-activating
-- an older approved version is allowed the same way (fresh identities, fresh
-- hash); republishing the active version is a no-op.
drop function if exists public.curriculum_publish(text);
create or replace function public.curriculum_publish(_version text, _expected_active text, _expected_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _row public.curriculum_configs; _active text;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_editorial_owner(_uid) then raise exception 'NOT_OWNER'; end if;
  -- ponytail: one global lock; publishing is rare and must be strictly serial.
  perform pg_advisory_xact_lock(hashtext('public.curriculum_publish'));
  select version into _active from public.curriculum_configs where status = 'approved' order by approved_at desc limit 1;
  if _active is distinct from _expected_active then raise exception 'STALE_CONFIG'; end if;
  select * into _row from public.curriculum_configs where version = _version for update;
  if not found then raise exception 'VERSION_NOT_FOUND'; end if;
  if _expected_hash is null or _expected_hash <> public.curriculum_config_hash(_row.chapters) then raise exception 'STALE_CONFIG'; end if;
  if _row.version = _active then return public.curriculum_config_json(_row); end if;
  update public.curriculum_configs set status = 'approved', approved_by = _uid, approved_at = now() where version = _version returning * into _row;
  return public.curriculum_config_json(_row);
end $$;

-- 5b. Owner-only management aggregate
--     ---------------------------------------------------------------------------
-- Per active roster resident, per chapter of the active core version: coverage
-- (distinct open questions with a scored durable answer / open questions in
-- the chapter) and success (share of latest exam answers that are correct),
-- the same inputs chapterProgressPolicy uses. A durable row counts only when
-- its frozen source was open AND the question is open now (never national).
-- Response: member id, name, residency year, percentages. No question ids,
-- counts, quotas, evidence rows or content. Authority = editorial owner only.
create or replace function public.progress_percent(_part bigint, _total bigint) returns numeric
language sql immutable as $$ select case when coalesce(_total, 0) = 0 then null else round(_part * 100.0 / _total, 1) end $$;

create or replace function public.management_aggregate_read() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _cfg public.curriculum_configs; _out jsonb;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_editorial_owner(_uid) then raise exception 'NOT_OWNER'; end if;
  select * into _cfg from public.curriculum_configs where status = 'approved' order by approved_at desc limit 1;
  if _cfg.version is null then raise exception 'NOT_CONFIGURED'; end if;
  -- ponytail: correlated counts over roster × chapters; fine for one cohort, materialize if it ever grows.
  with cfg as (select distinct (c->>'chapter')::integer as chapter from jsonb_array_elements(_cfg.chapters) c),
  member as (select m.id, m.full_name, m.residency_year, m.user_id from public.academy_members m where m.status = 'active'),
  bank as (select q.chapter, q.id as question_id from public.questions q join cfg on cfg.chapter = q.chapter
           where public.question_access_scope(q.source) = 'open'),
  ev as (select a.user_id, aq.question_id, a.mode, aq.confirmed_at, aq.is_correct
         from public.attempts a
         join public.attempt_questions aq on aq.attempt_id = a.id
         join public.question_snapshots s on s.content_hash = aq.content_hash
         where a.status = 'submitted' and aq.confirmed_at is not null and aq.is_correct is not null
           and public.question_access_scope(s.snapshot->>'source') = 'open'),
  covered as (select distinct mb.id as member_id, b.chapter, b.question_id
              from member mb join ev on ev.user_id = mb.user_id join bank b on b.question_id = ev.question_id),
  latest_quiz as (select distinct on (mb.id, b.question_id) mb.id as member_id, b.chapter, ev.is_correct
                  from member mb join ev on ev.user_id = mb.user_id and ev.mode = 'exam' join bank b on b.question_id = ev.question_id
                  order by mb.id, b.question_id, ev.confirmed_at desc),
  per_chapter as (
    select mb.id as member_id, cfg.chapter,
      (select count(*) from bank b where b.chapter = cfg.chapter) as bank_n,
      (select count(*) from covered c where c.member_id = mb.id and c.chapter = cfg.chapter) as covered_n,
      (select count(*) from latest_quiz l where l.member_id = mb.id and l.chapter = cfg.chapter) as quiz_n,
      (select count(*) from latest_quiz l where l.member_id = mb.id and l.chapter = cfg.chapter and l.is_correct) as quiz_ok
    from member mb cross join cfg),
  per_member as (select member_id, sum(bank_n) as bank_n, sum(covered_n) as covered_n, sum(quiz_n) as quiz_n, sum(quiz_ok) as quiz_ok
                 from per_chapter group by member_id)
  select jsonb_build_object('curriculum_version', _cfg.version, 'generated_at', now(), 'residents', coalesce(jsonb_agg(jsonb_build_object(
      'member_id', mb.id, 'full_name', mb.full_name, 'residency_year', mb.residency_year,
      'overall', jsonb_build_object('coverage_percent', public.progress_percent(pm.covered_n::bigint, pm.bank_n::bigint),
                                    'success_percent', public.progress_percent(pm.quiz_ok::bigint, pm.quiz_n::bigint)),
      'chapters', (select jsonb_agg(jsonb_build_object('chapter', pc.chapter,
                     'coverage_percent', public.progress_percent(pc.covered_n, pc.bank_n),
                     'success_percent', public.progress_percent(pc.quiz_ok, pc.quiz_n)) order by pc.chapter)
                   from per_chapter pc where pc.member_id = mb.id)
    ) order by mb.full_name, mb.id), '[]'::jsonb))
  into _out from member mb join per_member pm on pm.member_id = mb.id;
  return _out;
end $$;

-- Seed: the 42 core candidates, copied verbatim from CORE-CANDIDATE.json with
-- its provenance. Status stays draft; nothing is activated by this migration.
insert into public.curriculum_configs (version, status, chapters, source)
values ('core-candidate-2026-09-07', 'draft', $J$[{"chapter":8,"title":"Consciousness, Memory, and Anesthesia"},{"chapter":9,"title":"Sleep Medicine"},{"chapter":10,"title":"Cerebral Physiology and the Effects of Anesthetic Drugs"},{"chapter":11,"title":"Neuromuscular Physiology and Pharmacology"},{"chapter":12,"title":"Respiratory Physiology and Pathophysiology"},{"chapter":13,"title":"Cardiac Physiology"},{"chapter":14,"title":"Gastrointestinal and Hepatic Physiology"},{"chapter":15,"title":"Renal Anatomy, Physiology, and Pharmacology"},{"chapter":16,"title":"Basic Principles of Pharmacology"},{"chapter":17,"title":"Inhaled Anesthetics: Mechanisms of Action"},{"chapter":18,"title":"Inhaled Anesthetic Uptake, Distribution, and Toxicity"},{"chapter":19,"title":"Pulmonary Pharmacology of Inhaled Anesthetics"},{"chapter":20,"title":"Inhaled Anesthetic Delivery Systems"},{"chapter":21,"title":"Intravenous Anesthetics"},{"chapter":22,"title":"Opioids"},{"chapter":24,"title":"Neuromuscular Blocking Drugs and Reversal Agents"},{"chapter":25,"title":"Local Anesthetics"},{"chapter":28,"title":"Preoperative Evaluation"},{"chapter":29,"title":"Anesthetic Implications of Concurrent Diseases"},{"chapter":31,"title":"Neuromuscular and Other Genetic Disorders"},{"chapter":32,"title":"Cardiovascular Monitoring"},{"chapter":33,"title":"Perioperative Echocardiography and POCUS"},{"chapter":37,"title":"Respiratory Monitoring"},{"chapter":38,"title":"Renal Pathophysiology and Perioperative Ischemia"},{"chapter":39,"title":"Neuromuscular Monitoring"},{"chapter":40,"title":"Airway Management in the Adult"},{"chapter":41,"title":"Spinal, Epidural, and Caudal Anesthesia"},{"chapter":42,"title":"Peripheral Nerve Blocks and Ultrasound Guidance"},{"chapter":43,"title":"Perioperative Fluid and Electrolyte Therapy"},{"chapter":44,"title":"Perioperative Acid–Base Balance"},{"chapter":45,"title":"Patient Blood Management: Transfusion Therapy"},{"chapter":46,"title":"Patient Blood Management: Coagulation"},{"chapter":49,"title":"Anesthesia for Thoracic Surgery"},{"chapter":50,"title":"Anesthesia for Cardiac Surgical Procedures"},{"chapter":53,"title":"Anesthesia for Neurologic Surgery"},{"chapter":58,"title":"Anesthesia for Obstetrics"},{"chapter":61,"title":"Geriatric Anesthesia"},{"chapter":62,"title":"Anesthesia for Trauma"},{"chapter":72,"title":"Pediatric Anesthesia"},{"chapter":76,"title":"The Postanesthesia Care Unit"},{"chapter":79,"title":"Critical Care Anesthesiology"},{"chapter":82,"title":"Adult Cardiopulmonary Resuscitation (ACLS)"}]$J$::jsonb, $J${"path":"/Users/idankatz15/Desktop/3_APP_DEV/ysnp-vision-mockup/pilot-plan.html","sha256":"fbe3d2e39a90109adca1e46cad3aef3ddcd06e017a809d75e6dcc6e30e45f81b","description":"42 entries in operational plan; source explicitly says final core approval pending. Matches meeting execution copy.","candidate_path":"/Users/idankatz15/Documents/Codex/agent-os/runtime/external-workers/ysnp-autonomous-20260907/CORE-CANDIDATE.json","candidate_sha256":"92b54e1e80ea383e4227f65f0f2c2bf14d39f891fc8b8c9a9279b7d8e7d6447c","original_status":"draft_user_deferred_approval","user_decision":"לבנות את המנגנון; אאשר את הרשימה בהמשך"}$J$::jsonb)
on conflict (version) do nothing;

-- 6. Grants
--    ---------------------------------------------------------------------------
revoke all on function public.curriculum_config_json(public.curriculum_configs), public.curriculum_config_hash(jsonb), public.progress_percent(bigint, bigint) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['attempt_start_simulation(text[])', 'learning_recommendation_link(uuid, jsonb)', 'learning_evidence_read()',
                          'submit_quiz_attempt(uuid, text[], jsonb, bigint, integer[], text[])',
                          'curriculum_config_read()', 'curriculum_draft_save(text, jsonb, jsonb)', 'curriculum_publish(text, text, text)',
                          'management_aggregate_read()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
