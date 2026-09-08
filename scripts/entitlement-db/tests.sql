-- Behavioural tests for resident identity + national entitlement
-- (migration 20260907000002). Isolated test cluster only. psql stops on the
-- first failing assertion (ON_ERROR_STOP), so a clean run = every check held.
-- SIMULATED: auth.users / auth.identities / is_approved are synthetic fixtures;
-- re-run on Supabase staging before trusting the auth-backed sections.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function public.t_as(_uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', _uid, false)::void
$$;
-- full synthetic JWT: sub + email + app_metadata.providers
create or replace function public.t_jwt(_uid text, _email text, _providers text[]) returns void language sql as $$
  select set_config('request.jwt.claim.sub', _uid, false),
         set_config('request.jwt.claims', jsonb_build_object('email', _email, 'app_metadata', jsonb_build_object('providers', to_jsonb(_providers)))::text, false)
$$;
create or replace function public.t_expect_error(_sql text, _code text) returns void language plpgsql as $$
declare _got text;
begin
  begin
    execute _sql;
  exception when others then
    _got := sqlerrm;
  end;
  if _got is null then raise exception 'expected error % but none raised from: %', _code, _sql; end if;
  if _got <> _code then raise exception 'expected % got % from: %', _code, _got, _sql; end if;
end $$;
create or replace function public.t_ok(_cond boolean, _msg text) returns void language plpgsql as $$
begin if _cond is distinct from true then raise exception 'ASSERTION FAILED: %', _msg; end if; end $$;
create or replace function public.t_aq() returns setof public.attempt_questions language sql security definer as $$ select * from public.attempt_questions $$;
create or replace function public.t_snap() returns setof public.question_snapshots language sql security definer as $$ select * from public.question_snapshots $$;
create or replace function public.t_auth_users() returns bigint language sql security definer as $$ select count(*) from auth.users $$;
create or replace function public.t_member(_email text) returns public.academy_members language sql security definer as $$
  select * from public.academy_members where lower(btrim(email)) = lower(btrim(_email))
$$;

-- 0. classification is by source text only ----------------------------------
select t_ok(question_access_scope('ארצי') = 'national', 'exact national');
select t_ok(question_access_scope('  ארצי ') = 'national', 'trimmed national');
select t_ok(question_access_scope('ארצי 2019') = 'unclassified', 'national-looking but not exact stays closed');
select t_ok(question_access_scope(null) = 'unclassified', 'null source closed');
select t_ok(question_access_scope('') = 'unclassified', 'blank source closed');
select t_ok(question_access_scope('N/A') = 'unclassified', 'N/A closed');
select t_ok(question_access_scope('#N/A') = 'unclassified', '#N/A closed');
select t_ok(question_access_scope('בית חולים סינתטי') = 'open', 'hospital source open');
select t_ok((select count(*) from pg_policies where schemaname='public' and tablename='questions' and cmd='SELECT') = 1, 'exactly one SELECT policy on questions');
select t_ok((select bool_and('authenticated' = any(roles)) from pg_policies where schemaname='public' and tablename='questions' and cmd='SELECT'), 'questions SELECT policy is TO authenticated, not public');

-- 1. anon / unapproved -------------------------------------------------------
set role anon;
select t_expect_error($$select count(*) from public.questions$$, 'permission denied for table questions');
reset role;
set role authenticated;
create temp table t_state (k text primary key, v text);
select t_as('33333333-3333-3333-3333-333333333333');
select t_ok((select count(*) from questions) = 0, 'pending user sees no questions at all');
select t_expect_error($$select attempt_start('practice','immediate', array['q1'])$$, 'NOT_APPROVED');
select t_ok((resident_me()->>'linked') = 'false' and (resident_me()->>'reason') = 'NOT_ON_ROSTER', 'pending user is not on the roster');
select t_expect_error($$select complete_my_onboarding(3::smallint, null, true)$$, 'NOT_MEMBER');
select t_as('');
select t_expect_error($$select resident_me()$$, 'NOT_AUTHENTICATED');
select t_expect_error($$select claim_academy_membership()$$, 'NOT_AUTHENTICATED');

-- 2. approved non-member: open yes, national/ambiguous/blank no ---------------
select t_as('11111111-1111-1111-1111-111111111111');
select t_ok((select array_agg(id order by id) from questions) = array['boom','q1','q2','q3','qempty','qna'], 'approved user reads only open-source questions');
select t_ok((select correct from questions where id='q1') = 'A', 'current model still exposes the key of readable open questions (no narrowing)');
select t_expect_error($$select attempt_start('practice','immediate', array['q1','n1'])$$, 'NOT_ENTITLED');
select t_expect_error($$select attempt_start('practice','immediate', array['amb1'])$$, 'NOT_ENTITLED');
select t_expect_error($$select attempt_start('practice','immediate', array['blank1'])$$, 'NOT_ENTITLED');
insert into t_state select 'open1', (attempt_start('practice','immediate', array['q1']))->>'attempt_id';
select t_ok((select v from t_state where k='open1') is not null, 'open attempt starts');

-- 3. self-elevation is impossible --------------------------------------------
select t_expect_error($$update public.profiles set approved = true where id = auth.uid()$$, 'permission denied for table profiles');
select t_expect_error($$update public.academy_members set national_access = true$$, 'permission denied for table academy_members');
select t_expect_error($$update public.academy_members set national_access_set_by = auth.uid()$$, 'permission denied for table academy_members');
select t_expect_error($$update public.academy_members set user_id = auth.uid()$$, 'permission denied for table academy_members');
-- admin-editable columns exist but RLS is admin-only: silent no-op for a user
update public.academy_members set status = 'suspended', full_name = 'hacked';
select t_ok((select count(*) from academy_members where status = 'suspended') = 0, 'RLS blocks a user from editing roster rows directly');
select t_ok((select count(*) from t_member('roster.only@example.com') m where m.full_name = 'hacked') = 0, 'roster row untouched');
select t_expect_error($$insert into public.academy_members (email) values ('self@example.com')$$, 'new row violates row-level security policy for table "academy_members"');
select t_expect_error($$select set_member_national_access((select id from t_member('roster.only@example.com')), true)$$, 'NOT_ADMIN');
select t_expect_error($$select upsert_resident_roster('[{"name":"x","email":"plain1@example.com","exam_this_year":true}]')$$, 'NOT_ADMIN');

-- 3b. editor: a broad is_admin (unchanged) with NO roster authority ------------
-- The roster / national toggle boundary is admin_users.role = 'admin', fail-closed.
reset role;
select t_ok(is_admin('55555555-5555-5555-5555-555555555555'), 'editor IS broad is_admin (global semantics untouched)');
select t_ok(is_admin('13131313-1313-1313-1313-131313131313'), 'NULL-role admin_users row IS broad is_admin');
select t_ok(is_roster_admin('44444444-4444-4444-4444-444444444444'), 'role=admin is a roster admin');
select t_ok(not is_roster_admin('55555555-5555-5555-5555-555555555555'), 'role=editor is not a roster admin');
select t_ok(not is_roster_admin('13131313-1313-1313-1313-131313131313'), 'NULL role is not a roster admin (fail-closed)');
select t_ok(not is_roster_admin('11111111-1111-1111-1111-111111111111'), 'non-admin is not a roster admin');
select t_ok(not is_roster_admin(null), 'null uid is not a roster admin');
select t_ok((select count(*) from pg_policies where schemaname='public' and tablename='academy_members' and cmd in ('INSERT','UPDATE','DELETE')) = 3, 'exactly three write policies on academy_members');
select t_ok((select count(*) from pg_policies where schemaname='public' and tablename='academy_members' and cmd in ('INSERT','UPDATE','DELETE') and (coalesce(qual,'') || coalesce(with_check,'')) ~ '\mis_admin\(') = 0, 'no academy_members write policy uses broad is_admin');
select t_ok((select count(*) from pg_policies where schemaname='public' and tablename='academy_members' and cmd in ('INSERT','UPDATE','DELETE') and (coalesce(qual,'') || coalesce(with_check,'')) ~ 'caller_is_roster_admin\(') = 3, 'every academy_members write policy uses the roster-admin predicate');
set role authenticated;
select t_as('55555555-5555-5555-5555-555555555555');
select t_ok((select role from admin_users where id = auth.uid()) = 'editor', 'editor row carries role=editor');
select t_ok((select count(*) from academy_members) = 5, 'editor still READS the whole roster (SELECT policy unchanged)');
select t_expect_error($$select is_roster_admin(auth.uid())$$, 'permission denied for function is_roster_admin');
select t_ok(caller_is_roster_admin() = false, 'editor caller predicate is false');
select t_expect_error($$select set_member_national_access((select id from t_member('roster.only@example.com')), true)$$, 'NOT_ADMIN');
select t_expect_error($$select upsert_resident_roster('[{"name":"Editor changed","email":"roster.only@example.com","exam_this_year":true}]')$$, 'NOT_ADMIN');
select t_expect_error($$select upsert_resident_roster('[{"name":"Editor added","email":"editor.added@example.com","exam_this_year":true}]')$$, 'NOT_ADMIN');
-- direct writes through RLS: protected columns are a permission error, the rest a no-op
select t_expect_error($$update public.academy_members set national_access = true$$, 'permission denied for table academy_members');
select t_expect_error($$update public.academy_members set national_access_set_by = auth.uid()$$, 'permission denied for table academy_members');
select t_expect_error($$update public.academy_members set user_id = auth.uid()$$, 'permission denied for table academy_members');
select t_expect_error($$update public.academy_members set linked_at = now()$$, 'permission denied for table academy_members');
update public.academy_members set full_name = 'Editor direct write', status = 'suspended', access_level = 'full', exam_this_year = true;
select t_ok((select count(*) from academy_members where status = 'suspended' or access_level = 'full' or exam_this_year or full_name = 'Editor direct write') = 0, 'editor direct UPDATE is a no-op on every roster column');
select t_expect_error($$insert into public.academy_members (email) values ('editor.added@example.com')$$, 'new row violates row-level security policy for table "academy_members"');
delete from public.academy_members;
select t_ok((select count(*) from academy_members) = 5, 'editor direct DELETE is a no-op');
select t_ok((select count(*) from t_member('roster.only@example.com') m where m.full_name = 'Never Signed Up' and m.status = 'active' and m.national_access = false and m.user_id is null) = 1, 'roster row untouched by the editor');
-- NULL-role admin_users row: identical refusal
select t_as('13131313-1313-1313-1313-131313131313');
select t_expect_error($$select set_member_national_access((select id from t_member('roster.only@example.com')), true)$$, 'NOT_ADMIN');
select t_expect_error($$select upsert_resident_roster('[{"name":"x","email":"roster.only@example.com","exam_this_year":true}]')$$, 'NOT_ADMIN');
update public.academy_members set status = 'suspended';
select t_ok((select count(*) from academy_members where status = 'suspended') = 0, 'NULL-role direct UPDATE is a no-op');
select t_expect_error($$insert into public.academy_members (email) values ('nullrole.added@example.com')$$, 'new row violates row-level security policy for table "academy_members"');
-- the real admin keeps every legitimate direct operation
select t_as('44444444-4444-4444-4444-444444444444');
select t_ok(caller_is_roster_admin(), 'admin caller predicate is true');
insert into public.academy_members (email, full_name) values ('admin.added@example.com', 'Added Directly');
update public.academy_members set status = 'suspended', access_level = 'full', residency_year = 2 where lower(email) = 'admin.added@example.com';
select t_ok((select status || '/' || access_level || '/' || residency_year from t_member('admin.added@example.com')) = 'suspended/full/2', 'admin direct insert + update work');
delete from public.academy_members where lower(email) = 'admin.added@example.com';
select t_ok((select id from t_member('admin.added@example.com')) is null, 'admin direct delete works');
select t_ok((select count(*) from academy_members) = 5, 'roster back to its five rows');

-- 4. linking: verified only, exact normalized email, idempotent, no duplicates
-- Google user, confirmed, email matches roster row in a different case
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_ok((select count(*) from claim_academy_membership() where status='active') = 1, 'verified google user links');
select t_ok((select user_id from t_member('resident.google@example.com')) = '66666666-6666-6666-6666-666666666666', 'roster row now owned by 6666');
select t_ok((select linked_at from t_member('resident.google@example.com')) is not null, 'link time recorded');
select t_ok((select count(*) from claim_academy_membership() where status='active') = 1, 'second claim is idempotent');
select t_ok((select count(*) from academy_members where user_id = '66666666-6666-6666-6666-666666666666') = 1, 'still exactly one row linked');
select t_ok((resident_me()->>'linked') = 'true' and (resident_me()->'member'->>'full_name') = 'Resident Google' and (resident_me()->'member'->>'national_access') = 'false', 'resident_me returns own row, no national access yet');
select t_ok((select count(*) from questions where id in ('n1','n2')) = 0, 'linked resident without the toggle cannot read national questions');
-- another verified google user with the same normalized email: rejected, first owner kept
select t_jwt('12121212-1212-1212-1212-121212121212', 'resident.google@example.com', array['google']);
select t_ok((select count(*) from claim_academy_membership()) = 0, 'duplicate email cannot take over a linked row');
select t_ok((select user_id from t_member('resident.google@example.com')) = '66666666-6666-6666-6666-666666666666', 'original owner preserved');
select t_ok((resident_me()->>'reason') = 'EMAIL_ALREADY_LINKED', 'duplicate reported as EMAIL_ALREADY_LINKED');
-- password user under autoconfirm: email_confirmed_at set but nothing was ever sent → unproven
select t_jwt('77777777-7777-7777-7777-777777777777', 'pw.unverified@example.com', array['email']);
select t_ok((select count(*) from claim_academy_membership()) = 0, 'autoconfirmed password user cannot link');
select t_ok((select user_id from t_member('pw.unverified@example.com')) is null, 'row stays unlinked');
select t_ok((resident_me()->>'reason') = 'EMAIL_NOT_VERIFIED', 'reported as EMAIL_NOT_VERIFIED');
select t_ok((select count(*) from questions) = 0, 'unlinked pending user still sees nothing');
-- google identity but unconfirmed auth row
select t_jwt('99999999-9999-9999-9999-999999999999', 'google.unconfirmed@example.com', array['google']);
select t_ok((select count(*) from claim_academy_membership()) = 0, 'unconfirmed google row cannot link');
select t_ok((resident_me()->>'reason') = 'EMAIL_NOT_VERIFIED', 'unconfirmed google reported as EMAIL_NOT_VERIFIED');
-- JWT claims someone else's email: the server-side auth row wins
select t_jwt('10101010-1010-1010-1010-101010101010', 'pw.verified@example.com', array['email']);
select t_ok((select count(*) from claim_academy_membership()) = 0, 'a lying JWT email cannot claim another roster row');
select t_ok((select user_id from t_member('pw.verified@example.com')) is null, 'pw.verified row untouched by impostor');
-- honestly confirmed password user links
select t_jwt('88888888-8888-8888-8888-888888888888', 'pw.verified@example.com', array['email']);
select t_ok((select count(*) from claim_academy_membership() where status='active') = 1, 'confirmed password user links');
select t_ok((select user_id from t_member('pw.verified@example.com')) = '88888888-8888-8888-8888-888888888888', 'row owned by 8888');
select t_ok(t_auth_users() = 11, 'no auth.users rows were created by linking');

-- 5. self-onboarding: only the allowed fields ---------------------------------
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_expect_error($$select complete_my_onboarding(0::smallint, null, true)$$, 'INVALID_INPUT');
select t_expect_error($$select complete_my_onboarding(8::smallint, null, true)$$, 'INVALID_INPUT');
select t_expect_error($$select complete_my_onboarding(3::smallint, '2010-01-01', true)$$, 'INVALID_INPUT');
select t_expect_error($$select complete_my_onboarding(3::smallint, (current_date + interval '11 years')::date, true)$$, 'INVALID_INPUT');
select t_expect_error($$select complete_my_onboarding(null, null, true)$$, 'INVALID_INPUT');
insert into t_state select 'ob1', complete_my_onboarding(3::smallint, '2027-06-15', true)::text;
select t_ok((select v::jsonb->'member'->>'residency_year' from t_state where k='ob1') = '3', 'residency year saved');
select t_ok((select exam_date from t_member('resident.google@example.com')) = '2027-06-15', 'exam date saved');
select t_ok((select exam_this_year from t_member('resident.google@example.com')), 'exam_this_year saved');
select t_ok((select onboarding_completed_at from t_member('resident.google@example.com')) is not null, 'onboarding stamped');
select t_ok((select national_access from t_member('resident.google@example.com')) = false, 'onboarding never touches national_access');
select t_ok((select status || '/' || access_level from t_member('resident.google@example.com')) = 'active/academy', 'onboarding never touches status/access_level');
insert into t_state select 'ob_ts', onboarding_completed_at::text from t_member('resident.google@example.com');
select pg_sleep(0.01);
select complete_my_onboarding(4::smallint, null, false);
select t_ok((select onboarding_completed_at::text from t_member('resident.google@example.com')) = (select v from t_state where k='ob_ts'), 'onboarding timestamp is first-completion only');
select t_ok((select residency_year from t_member('resident.google@example.com')) = 4 and (select exam_date from t_member('resident.google@example.com')) is null, 'fields can be corrected later');
-- exam_this_year alone never opens national content
select t_ok((select count(*) from questions where id in ('n1','n2')) = 0, 'exam_this_year is not an entitlement');

-- 6. admin toggle on / off, actor + time recorded ----------------------------
select t_as('44444444-4444-4444-4444-444444444444');
select t_expect_error($$select set_member_national_access(gen_random_uuid(), true)$$, 'MEMBER_NOT_FOUND');
insert into t_state select 'tog1', set_member_national_access((select id from t_member('resident.google@example.com')), true)::text;
select t_ok((select v::jsonb->>'national_access' from t_state where k='tog1') = 'true', 'toggle returns new state');
select t_ok((select national_access_set_by from t_member('resident.google@example.com')) = '44444444-4444-4444-4444-444444444444', 'actor recorded');
select t_ok((select national_access_set_at from t_member('resident.google@example.com')) is not null, 'time recorded');
select t_ok((select exam_this_year from t_member('resident.google@example.com')) = false, 'toggle is distinct from exam_this_year');
-- admin and editor keep full read
select t_ok((select count(*) from questions) = 10, 'admin reads every question incl. national/ambiguous/blank');
select t_as('55555555-5555-5555-5555-555555555555');
select t_ok((select count(*) from questions) = 10, 'editor reads every question');
-- resident now entitled
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_ok((select count(*) from questions where id in ('n1','n2')) = 2, 'national questions readable after toggle on');
select t_ok((select count(*) from questions where id in ('amb1','blank1')) = 0, 'ambiguous/blank sources stay closed even with national access');
select t_expect_error($$select attempt_start('practice','immediate', array['amb1'])$$, 'NOT_ENTITLED');
select t_ok((resident_me()->'member'->>'national_access') = 'true', 'resident_me reflects the toggle');
-- toggle off
select t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access((select id from t_member('resident.google@example.com')), false);
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_ok((select count(*) from questions where id in ('n1','n2')) = 0, 'national questions hidden after toggle off');
select t_expect_error($$select attempt_start('practice','immediate', array['n1'])$$, 'NOT_ENTITLED');

-- 7. durable attempts: entitlement at start, read, confirm, submit, repeat ----
select t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access((select id from t_member('resident.google@example.com')), true);
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
insert into t_state select 'nat1', (attempt_start('practice','immediate', array['n1','n2','q1']))->>'attempt_id';
select t_ok((select count(*) from t_aq() where attempt_id = (select v::uuid from t_state where k='nat1')) = 3, 'national attempt frozen with 3 questions');
select t_ok((select count(*) from t_snap() s join t_aq() a on a.content_hash = s.content_hash where a.attempt_id = (select v::uuid from t_state where k='nat1') and s.snapshot->>'source' = 'ארצי') = 2, 'snapshots carry the national source');
select t_ok((select (attempt_read((select v::uuid from t_state where k='nat1')))->'questions'->0->'snapshot' ? 'correct') = false, 'read before reveal hides the key on national questions too');
select attempt_confirm((select v::uuid from t_state where k='nat1'), 'n1', 'A', 'confident', 1000);
-- second, still-open national attempt to lose entitlement mid-way
insert into t_state select 'nat2', (attempt_start('practice','immediate', array['n2']))->>'attempt_id';
-- cross-user: another entitled member cannot see it
select t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access((select id from t_member('pw.verified@example.com')), true);
select t_jwt('88888888-8888-8888-8888-888888888888', 'pw.verified@example.com', array['email']);
select t_expect_error(format($$select attempt_read(%L)$$, (select v from t_state where k='nat1')), 'ATTEMPT_NOT_FOUND');
select t_expect_error(format($$select attempt_confirm(%L, 'n2', 'B', 'confident', 1000)$$, (select v from t_state where k='nat1')), 'ATTEMPT_NOT_FOUND');
select t_ok((select count(*) from attempts) = 0, 'other users attempts invisible in the archive table');
-- owner submits nat1, then loses the entitlement
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select attempt_confirm((select v::uuid from t_state where k='nat1'), 'n2', 'B', 'confident', 1000);
select attempt_confirm((select v::uuid from t_state where k='nat1'), 'q1', 'A', 'confident', 1000);
select attempt_submit((select v::uuid from t_state where k='nat1'), 1000);
select t_ok((select answered_count from user_answers where user_id='66666666-6666-6666-6666-666666666666' and question_id='n1') = 1, 'national answer credited once');
select t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access((select id from t_member('resident.google@example.com')), false);
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_expect_error(format($$select attempt_read(%L)$$, (select v from t_state where k='nat1')), 'NOT_ENTITLED');
select t_expect_error(format($$select attempt_repeat(%L, 'immediate')$$, (select root_id from attempts where id = (select v::uuid from t_state where k='nat1'))), 'NOT_ENTITLED');
select t_expect_error(format($$select attempt_confirm(%L, 'n2', 'B', 'confident', 1000)$$, (select v from t_state where k='nat2')), 'NOT_ENTITLED');
select t_expect_error(format($$select attempt_submit(%L, 1000)$$, (select v from t_state where k='nat2')), 'NOT_ENTITLED');
select t_ok((select count(*) from attempts where id = (select v::uuid from t_state where k='nat1')) = 1, 'archive row (metadata) still listed after revocation');
select t_ok((select count(*) from t_aq() a where a.attempt_id = (select v::uuid from t_state where k='nat2') and a.selected is not null) = 0, 'blocked confirm stored nothing');
select t_ok((select status from attempts where id = (select v::uuid from t_state where k='nat2')) = 'in_progress', 'blocked submit changed nothing');
-- open-only attempt still works for the same user
insert into t_state select 'open2', (attempt_start('practice','immediate', array['q2']))->>'attempt_id';
select attempt_read((select v::uuid from t_state where k='open2'));
-- abandon is allowed even without entitlement (it only closes state)
select attempt_abandon((select v::uuid from t_state where k='nat2'));
select t_ok((select status from attempts where id = (select v::uuid from t_state where k='nat2')) = 'abandoned', 'abandon allowed');
-- retake after re-grant: credit is once-only, repeat works from frozen rows
select t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access((select id from t_member('resident.google@example.com')), true);
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select attempt_read((select v::uuid from t_state where k='nat1'));
reset role;
update attempt_roots set latest_submitted_at = now() - interval '7 days' - interval '1 minute' where id = (select root_id from attempts where id = (select v::uuid from t_state where k='nat1'));
set role authenticated;
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
insert into t_state select 'nat1r', (attempt_repeat((select root_id from attempts where id = (select v::uuid from t_state where k='nat1')), 'immediate'))->>'attempt_id';
-- credit model unchanged from 20260907000001: once per attempt row (a retake is a new row, a retry is not)
select attempt_confirm((select v::uuid from t_state where k='nat1r'), 'n1', 'A', 'confident', 1000);
select attempt_confirm((select v::uuid from t_state where k='nat1r'), 'n1', 'A', 'confident', 1000);
select t_ok((select answered_count from user_answers where user_id='66666666-6666-6666-6666-666666666666' and question_id='n1') = 2, 'retake credits its own row exactly once (retry did not double-credit)');
select t_ok((select count(*) from answer_history where user_id='66666666-6666-6666-6666-666666666666' and question_id='n1') = 2, 'two history rows: original + retake');

-- 8. edited / deleted original sources: frozen classification + content ------
reset role;
update public.questions set source = 'בית חולים סינתטי', question = 'EDITED AFTER FREEZE' where id = 'n1';
delete from public.questions where id = 'n2';
set role authenticated;
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_ok((select (attempt_read((select v::uuid from t_state where k='nat1')))->'questions'->0->'snapshot'->>'question') = 'national synthetic 1', 'frozen content preserved after source edit');
select t_ok((select count(*) from t_aq() a join t_snap() s on s.content_hash = a.content_hash where a.attempt_id = (select v::uuid from t_state where k='nat1') and s.snapshot->>'question' = 'national synthetic 2') = 1, 'frozen content preserved after source delete');
select t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access((select id from t_member('resident.google@example.com')), false);
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_expect_error(format($$select attempt_read(%L)$$, (select v from t_state where k='nat1')), 'NOT_ENTITLED');
select t_expect_error(format($$select attempt_repeat(%L, 'immediate')$$, (select root_id from attempts where id = (select v::uuid from t_state where k='nat1'))), 'NOT_ENTITLED');
select t_ok((select count(*) from questions where id = 'n1') = 1, 'the re-sourced live row itself is open now (live reads follow the live source)');
-- re-grant: repeat still rebuilds from frozen rows although n2 no longer exists
select t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access((select id from t_member('resident.google@example.com')), true);
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select attempt_abandon((select v::uuid from t_state where k='nat1r'));
reset role;
update attempt_roots set latest_submitted_at = now() - interval '7 days' - interval '1 minute' where id = (select root_id from attempts where id = (select v::uuid from t_state where k='nat1'));
set role authenticated;
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
insert into t_state select 'nat1r2', (attempt_repeat((select root_id from attempts where id = (select v::uuid from t_state where k='nat1')), 'immediate'))->>'attempt_id';
select t_ok((select count(*) from t_aq() where attempt_id = (select v::uuid from t_state where k='nat1r2') and question_id='n2') = 1, 'repeat after source delete still has the frozen n2');

-- 9. losing approval mid-attempt (suspended) --------------------------------
select t_as('44444444-4444-4444-4444-444444444444');
update public.academy_members set status = 'suspended' where id = (select id from t_member('resident.google@example.com'));
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_expect_error(format($$select attempt_confirm(%L, 'n1', 'A', 'confident', 1000)$$, (select v from t_state where k='nat1r2')), 'NOT_APPROVED');
select t_expect_error($$select attempt_start('practice','immediate', array['q1'])$$, 'NOT_APPROVED');
select t_ok((select count(*) from questions) = 0, 'suspended member reads nothing even with the toggle on');
select t_as('44444444-4444-4444-4444-444444444444');
update public.academy_members set status = 'active' where id = (select id from t_member('resident.google@example.com'));

-- 10. roster upsert: admin only, normalized, all-or-nothing, name+year+flag ---
select t_as('44444444-4444-4444-4444-444444444444');
select t_expect_error($$select upsert_resident_roster('{}')$$, 'INVALID_INPUT');
select t_expect_error($$select upsert_resident_roster('[]')$$, 'INVALID_INPUT');
insert into t_state select 'r1', upsert_resident_roster('[{"name":"New One","email":"  New.One@Example.com ","exam_this_year":true},{"name":"Resident Google RENAMED","email":"resident.google@example.com","exam_this_year":true}]')::text;
select t_ok((select v::jsonb->>'applied' from t_state where k='r1') = 'true', 'batch applied');
select t_ok((select v::jsonb->>'inserted' from t_state where k='r1') = '1' and (select v::jsonb->>'updated' from t_state where k='r1') = '1', 'one insert, one update');
select t_ok((select email from t_member('new.one@example.com')) = 'new.one@example.com', 'email stored normalized');
select t_ok((select full_name from t_member('resident.google@example.com')) = 'Resident Google RENAMED', 'existing row: name updated');
select t_ok((select user_id from t_member('resident.google@example.com')) = '66666666-6666-6666-6666-666666666666' and (select national_access from t_member('resident.google@example.com')), 'existing row: link and toggle untouched by roster upsert');
select t_ok((select residency_year from t_member('resident.google@example.com')) = 4, 'existing row: self-onboarding fields untouched');
insert into t_state select 'r2', upsert_resident_roster('[{"name":"New One","email":"new.one@example.com","exam_this_year":true}]')::text;
select t_ok((select v::jsonb->>'inserted' from t_state where k='r2') = '0' and (select v::jsonb->>'updated' from t_state where k='r2') = '1', 'idempotent re-import is an update, not a duplicate');
select t_ok((select count(*) from academy_members where lower(email) = 'new.one@example.com') = 1, 'no duplicate rows');
-- Four-column sheet payload persists a valid 1-7 year for new and existing rows.
insert into t_state select 'r4', upsert_resident_roster('[{"name":"Sheet New","email":"sheet.new@example.com","residency_year":3,"exam_this_year":true},{"name":"Resident Google SHEET","email":"resident.google@example.com","residency_year":6,"exam_this_year":false}]')::text;
select t_ok((select v::jsonb->>'applied' from t_state where k='r4') = 'true'
  and (select residency_year from t_member('sheet.new@example.com')) = 3
  and (select residency_year from t_member('resident.google@example.com')) = 6,
  'four-column roster year persisted for new and existing rows');
-- rejects: bad email, duplicate within batch, missing email → nothing applied
insert into t_state select 'r3', upsert_resident_roster('[{"name":"Good","email":"good@example.com","exam_this_year":false},{"name":"Bad","email":"not-an-email","exam_this_year":false},{"name":"Dup A","email":"dup@example.com","exam_this_year":false},{"name":"Dup B","email":"DUP@example.com","exam_this_year":true},{"name":"NoMail"}]')::text;
select t_ok((select v::jsonb->>'applied' from t_state where k='r3') = 'false', 'batch with rejects is not applied');
select t_ok((select jsonb_array_length(v::jsonb->'rejected') from t_state where k='r3') = 4, 'all four bad rows reported');
select t_ok((select count(*) from academy_members where lower(email) in ('good@example.com','dup@example.com')) = 0, 'all-or-nothing: the good row was not inserted either');
select t_ok((select v::jsonb->'rejected'->0->>'reason' from t_state where k='r3') = 'INVALID_EMAIL', 'reason given per row');
insert into t_state select 'r5', upsert_resident_roster('[{"name":"Would Be Good","email":"year-good@example.com","residency_year":2,"exam_this_year":true},{"name":"Bad Year","email":"year-bad@example.com","residency_year":8,"exam_this_year":false},{"name":"Bad Flag","email":"flag-bad@example.com","residency_year":3,"exam_this_year":"yes"},{"name":"Missing Flag","email":"flag-missing@example.com","residency_year":4}]')::text;
select t_ok((select v::jsonb->>'applied' from t_state where k='r5') = 'false'
  and (select jsonb_array_length(v::jsonb->'rejected') from t_state where k='r5') = 3
  and (select count(*) from academy_members where lower(email) in ('year-good@example.com','year-bad@example.com','flag-bad@example.com','flag-missing@example.com')) = 0,
  'invalid year/flag rejects the whole batch without partial import');
select t_expect_error($$select upsert_resident_roster((select jsonb_agg(jsonb_build_object('name','x','email','u'||g||'@example.com','exam_this_year',false)) from generate_series(1,501) g))$$, 'INVALID_INPUT');
-- a roster row cannot pre-set the toggle or the owner
select upsert_resident_roster('[{"name":"Sneaky","email":"sneaky@example.com","exam_this_year":true,"national_access":true,"user_id":"11111111-1111-1111-1111-111111111111","status":"active","access_level":"full"}]');
select t_ok((select national_access from t_member('sneaky@example.com')) = false and (select user_id from t_member('sneaky@example.com')) is null and (select access_level from t_member('sneaky@example.com')) = 'academy', 'roster input cannot set toggle, owner or access level');

-- 11. academy quizzes follow the same entitlement -----------------------------
reset role;
insert into public.questions (id, ref_id, question, a, b, c, d, correct, explanation, topic, chapter, source, kind) values
  ('n3', 'n3', 'national synthetic 3', 'alef', 'bet', 'gimel', 'dalet', 'C', 'national explanation 3', 'Demo topic', 1, 'ארצי', 'test');
set role authenticated;
select t_as('44444444-4444-4444-4444-444444444444');
with q as (insert into public.quizzes (title, question_ids, opens_at, closes_at, created_by) values ('national quiz', array['n3','q1'], now() - interval '1 hour', now() + interval '1 hour', auth.uid()) returning id)
insert into t_state select 'quiz_nat', id::text from q;
with q as (insert into public.quizzes (title, question_ids, opens_at, closes_at, created_by) values ('open quiz', array['q1','q2'], now() - interval '1 hour', now() + interval '1 hour', auth.uid()) returning id)
insert into t_state select 'quiz_open', id::text from q;
select set_member_national_access((select id from t_member('pw.verified@example.com')), false);
-- member without the toggle: open quiz only, national submit refused server-side
select t_jwt('88888888-8888-8888-8888-888888888888', 'pw.verified@example.com', array['email']);
select t_ok((select array_agg(title order by title) from quizzes) = array['open quiz'], 'member without toggle sees only the open quiz');
select t_expect_error(format($$select submit_quiz_attempt(%L, array['n3','q1'], '["C","A"]')$$, (select v from t_state where k='quiz_nat')), 'NOT_ENTITLED');
select t_ok((select count(*) from quiz_attempts) = 0, 'refused submit stored nothing');
-- member with the toggle: both quizzes, national submit scored
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_ok((select count(*) from quizzes) = 2, 'entitled member sees both quizzes');
select t_ok((select score from submit_quiz_attempt((select v::uuid from t_state where k='quiz_nat'), array['n3','q1'], '["C","A"]')) = 2, 'entitled member submits national quiz');
-- admin keeps everything
select t_as('44444444-4444-4444-4444-444444444444');
select t_ok((select count(*) from quizzes) = 2, 'admin sees all quizzes');

-- 12. concurrency-safe linking is probed by run.sh (two psql sessions) --------
select 'ALL ENTITLEMENT TESTS PASSED' as result;
\echo ALL ENTITLEMENT TESTS PASSED
