-- Behavioural tests for learning evidence, simulation attempts, quiz timing
-- and versioned curriculum config (migration 20260908000002). Isolated test
-- cluster only; psql stops on the first failing assertion.
-- SIMULATED: auth.users / is_approved / editorial owner are synthetic fixtures.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function public.t_as(_uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', _uid, false)::void
$$;
create or replace function public.t_jwt(_uid text, _email text, _providers text[]) returns void language sql as $$
  select set_config('request.jwt.claim.sub', _uid, false),
         set_config('request.jwt.claims', jsonb_build_object('email', _email, 'app_metadata', jsonb_build_object('providers', to_jsonb(_providers)))::text, false)
$$;
create or replace function public.t_expect_error(_sql text, _code text) returns void language plpgsql as $$
declare _got text;
begin
  begin execute _sql; exception when others then _got := sqlerrm; end;
  if _got is null then raise exception 'expected error % but none raised from: %', _code, _sql; end if;
  if _got <> _code then raise exception 'expected % got % from: %', _code, _got, _sql; end if;
end $$;
create or replace function public.t_ok(_cond boolean, _msg text) returns void language plpgsql as $$
begin if _cond is distinct from true then raise exception 'ASSERTION FAILED: %', _msg; end if; end $$;
create or replace function public.t_member(_email text) returns public.academy_members language sql security definer as $$
  select * from public.academy_members where lower(btrim(email)) = lower(btrim(_email))
$$;
create or replace function public.t_user_answers(_uid uuid) returns setof public.user_answers language sql security definer as $$ select * from public.user_answers where user_id = _uid $$;
create or replace function public.t_quiz_attempts() returns setof public.quiz_attempts language sql security definer as $$ select * from public.quiz_attempts $$;
create or replace function public.t_configs() returns setof public.curriculum_configs language sql security definer as $$ select * from public.curriculum_configs $$;

set role authenticated;
create temp table t_state (k text primary key, v text);

-- 0. surface: no table privileges, helpers private, RPCs callable -------------
select t_ok(not has_table_privilege('authenticated', 'public.learning_recommendations', 'SELECT') and not has_table_privilege('authenticated', 'public.curriculum_configs', 'SELECT')
        and not has_table_privilege('authenticated', 'public.curriculum_configs', 'UPDATE'), 'new tables have no client grants');
select t_ok(not has_function_privilege('authenticated', 'public.curriculum_config_json(public.curriculum_configs)', 'EXECUTE'), 'config json helper private');
select t_ok(not has_function_privilege('anon', 'public.learning_evidence_read()', 'EXECUTE') and has_function_privilege('authenticated', 'public.learning_evidence_read()', 'EXECUTE'), 'evidence RPC authenticated only');
select t_ok(not has_function_privilege('anon', 'public.curriculum_publish(text, text, text)', 'EXECUTE'), 'publish not anon');
select t_ok(not has_function_privilege('anon', 'public.management_aggregate_read()', 'EXECUTE') and has_function_privilege('authenticated', 'public.management_aggregate_read()', 'EXECUTE'), 'management aggregate authenticated only (owner check inside)');
select t_ok(not has_function_privilege('authenticated', 'public.curriculum_config_hash(jsonb)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.progress_percent(bigint, bigint)', 'EXECUTE'), 'hash/percent helpers private');

-- 1. seed: 42 candidates, draft, provenance, nothing activated -----------------
select t_ok((select count(*) from t_configs()) = 1, 'exactly one seeded config');
select t_ok((select status from t_configs()) = 'draft', 'seed is a draft');
select t_ok((select jsonb_array_length(chapters) from t_configs()) = 42, 'seed has 42 chapters');
select t_ok((select chapters->0 from t_configs()) = '{"chapter": 8, "title": "Consciousness, Memory, and Anesthesia"}'::jsonb, 'first candidate copied exactly');
select t_ok((select chapters->41 from t_configs()) = '{"chapter": 82, "title": "Adult Cardiopulmonary Resuscitation (ACLS)"}'::jsonb, 'last candidate copied exactly');
select t_ok((select source->>'original_status' from t_configs()) = 'draft_user_deferred_approval', 'original status preserved');
select t_ok((select source->>'sha256' from t_configs()) = 'fbe3d2e39a90109adca1e46cad3aef3ddcd06e017a809d75e6dcc6e30e45f81b', 'source sha256 preserved');
select t_ok((select source->>'candidate_sha256' from t_configs()) = '92b54e1e80ea383e4227f65f0f2c2bf14d39f891fc8b8c9a9279b7d8e7d6447c', 'candidate sha256 preserved');
select t_ok((select approved_at from t_configs()) is null and (select approved_by from t_configs()) is null, 'seed not approved by anyone');

-- 2. simulation = labelled durable exam attempt, credited once, never a quiz --
select t_as('11111111-1111-1111-1111-111111111111');
select t_expect_error($$select attempt_start_simulation(array['q1','q1'])$$, 'DUPLICATE_QUESTIONS');
insert into t_state select 'sim', attempt_start_simulation(array['q1','q2','qna'])::text;
select t_ok((select v::jsonb->>'kind' from t_state where k='sim') = 'simulation', 'start returns kind');
select t_ok((select mode || '/' || coalesce(kind, '-') from attempts where id = (select (v::jsonb->>'attempt_id')::uuid from t_state where k='sim')) = 'exam/simulation', 'stored as exam + simulation label');
select t_ok((attempt_read((select (v::jsonb->>'attempt_id')::uuid from t_state where k='sim'))->>'kind') = 'simulation', 'attempt_read carries kind');
select attempt_confirm((select (v::jsonb->>'attempt_id')::uuid from t_state where k='sim'), 'q1', 'A', 'confident', 1500);
select attempt_confirm((select (v::jsonb->>'attempt_id')::uuid from t_state where k='sim'), 'q2', 'A', 'guessed', 2500);
select attempt_confirm((select (v::jsonb->>'attempt_id')::uuid from t_state where k='sim'), 'qna', 'A', 'hesitant', 500);
select t_ok((select count(*) from learning_evidence_read() e) is null or jsonb_array_length(learning_evidence_read()) = 0, 'in-progress attempt is not evidence');
insert into t_state select 'sim_res', attempt_submit((select (v::jsonb->>'attempt_id')::uuid from t_state where k='sim'), 5000)::text;
select t_ok((select v::jsonb->>'kind' from t_state where k='sim_res') = 'simulation', 'submit result carries kind');
select t_ok((select v::jsonb->>'total_active_ms' from t_state where k='sim_res') = '5000', 'simulation time recorded, not limited');
select t_ok((select v::jsonb->>'correct_count' from t_state where k='sim_res') = '1' and (select v::jsonb->>'scored_count' from t_state where k='sim_res') = '2', 'scored 1/2, unscored excluded');
select t_ok((select count(*) from t_user_answers('11111111-1111-1111-1111-111111111111')) = 2, 'credit applied to the two scored questions');
select attempt_submit((select (v::jsonb->>'attempt_id')::uuid from t_state where k='sim'), 99999);
select t_ok((select sum(answered_count) from t_user_answers('11111111-1111-1111-1111-111111111111')) = 2, 'resubmit does not double-credit');
select t_ok((select count(*) from t_quiz_attempts()) = 0, 'self simulation never becomes an official quiz attempt');

-- 3. evidence: owner scoped, no content, unscored stays null -------------------
insert into t_state select 'ev1', learning_evidence_read()::text;
select t_ok(jsonb_array_length((select v::jsonb from t_state where k='ev1')) = 3, 'three confirmed rows');
select t_ok((select bool_and(e->>'confirmed_at' is not null and e->>'mode' = 'exam' and e->>'kind' = 'simulation' and e->>'feedback_timing' = 'end')
             from jsonb_array_elements((select v::jsonb from t_state where k='ev1')) e), 'authoritative time, mode, kind, timing on every row');
select t_ok((select e->'is_correct' from jsonb_array_elements((select v::jsonb from t_state where k='ev1')) e where e->>'question_id' = 'qna') = 'null'::jsonb, 'unscored stays null, never coerced to wrong');
select t_ok((select (e->>'scored')::boolean from jsonb_array_elements((select v::jsonb from t_state where k='ev1')) e where e->>'question_id' = 'qna') = false, 'unscored flagged');
select t_ok((select (e->>'is_correct')::boolean from jsonb_array_elements((select v::jsonb from t_state where k='ev1')) e where e->>'question_id' = 'q2') = false, 'wrong answer is false');
select t_ok((select e->>'confidence' from jsonb_array_elements((select v::jsonb from t_state where k='ev1')) e where e->>'question_id' = 'q1') = 'confident', 'explicit confidence kept');
select t_ok((select bool_and(not (e ?| array['question','a','b','c','d','correct','explanation','snapshot','selected','correct_key']))
             from jsonb_array_elements((select v::jsonb from t_state where k='ev1')) e), 'no question content or key leaves the server');
select t_ok((select bool_and(e ? 'chapter' and e ? 'scope' and e ? 'prior_exposures') from jsonb_array_elements((select v::jsonb from t_state where k='ev1')) e), 'chapter, scope and exposure present');
select t_as('22222222-2222-2222-2222-222222222222');
select t_ok(learning_evidence_read() = '[]'::jsonb, 'another user sees nothing');
select t_as('33333333-3333-3333-3333-333333333333');
select t_expect_error($$select learning_evidence_read()$$, 'NOT_APPROVED');
select t_as('');
select t_expect_error($$select learning_evidence_read()$$, 'NOT_AUTHENTICATED');

-- 4. repeat exposure + recommendation link (no causality claimed) -------------
select t_as('11111111-1111-1111-1111-111111111111');
insert into t_state select 'p1', attempt_start('practice', 'immediate', array['q1'])::text;
select t_expect_error(format($$select learning_recommendation_link(%L, '{"id":"rec-1"}')$$, (select v::jsonb->>'attempt_id' from t_state where k='p1')), 'INVALID_INPUT');
select learning_recommendation_link((select (v::jsonb->>'attempt_id')::uuid from t_state where k='p1'), '{"id":"rec-1","kind":"weak-chapter","setup":{"mode":"practice","chapters":[1]},"provenance":{"engine":"learningInsights"}}');
select t_expect_error(format($$select learning_recommendation_link(%L, '{"id":"rec-2","setup":{}}')$$, (select v::jsonb->>'attempt_id' from t_state where k='p1')), 'ATTEMPT_NOT_OPEN');
select attempt_confirm((select (v::jsonb->>'attempt_id')::uuid from t_state where k='p1'), 'q1', 'B', 'hesitant', 800);
select attempt_submit((select (v::jsonb->>'attempt_id')::uuid from t_state where k='p1'), 800);
select t_expect_error(format($$select learning_recommendation_link(%L, '{"id":"rec-3","setup":{}}')$$, (select v::jsonb->>'attempt_id' from t_state where k='p1')), 'ATTEMPT_NOT_OPEN');
insert into t_state select 'ev2', learning_evidence_read()::text;
select t_ok(jsonb_array_length((select v::jsonb from t_state where k='ev2')) = 4, 'practice row added');
select t_ok((select array_agg((e->>'prior_exposures')::int order by e->>'confirmed_at') from jsonb_array_elements((select v::jsonb from t_state where k='ev2')) e where e->>'question_id' = 'q1') = array[0, 1], 'exposure counts prior attempts of the same question');
select t_ok((select e->>'recommendation_id' from jsonb_array_elements((select v::jsonb from t_state where k='ev2')) e where e->>'mode' = 'practice') = 'rec-1', 'later attempt linked to the recommendation');
select t_ok((select e->>'recommendation_id' from jsonb_array_elements((select v::jsonb from t_state where k='ev2')) e where e->>'question_id' = 'q2') is null, 'unlinked attempt has no recommendation');
select t_as('22222222-2222-2222-2222-222222222222');
insert into t_state select 'p2', attempt_start('practice', 'immediate', array['q1'])::text;
select t_as('11111111-1111-1111-1111-111111111111');
select t_expect_error(format($$select learning_recommendation_link(%L, '{"id":"rec-x","setup":{}}')$$, (select v::jsonb->>'attempt_id' from t_state where k='p2')), 'ATTEMPT_NOT_OPEN');

-- 5. denied/revoked national: evidence survives with scope only ---------------
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_ok((select count(*) from claim_academy_membership() where status='active') = 1, 'resident links');
select t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access((select id from t_member('resident.google@example.com')), true);
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
insert into t_state select 'nat', attempt_start('practice', 'end', array['n1'])::text;
select attempt_confirm((select (v::jsonb->>'attempt_id')::uuid from t_state where k='nat'), 'n1', 'A', 'confident', 900);
select attempt_submit((select (v::jsonb->>'attempt_id')::uuid from t_state where k='nat'), 900);
select t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access((select id from t_member('resident.google@example.com')), false);
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_ok((select count(*) from questions where id = 'n1') = 0, 'national question hidden after revoke');
select t_ok((select e->>'scope' from jsonb_array_elements(learning_evidence_read()) e where e->>'question_id' = 'n1') = 'national', 'revoked member keeps own evidence row with scope, no content');
select t_ok((select e->>'mode' from jsonb_array_elements(learning_evidence_read()) e) = 'practice', 'practice mode reported as practice, never guessed');

-- 6. Academy quiz: time + explicit confidence persisted, validation delegated --
select t_as('44444444-4444-4444-4444-444444444444');
with q as (insert into public.quizzes (title, question_ids, opens_at, closes_at, created_by) values ('timed quiz', array['q1','q2'], now() - interval '1 hour', now() + interval '1 hour', auth.uid()) returning id)
insert into t_state select 'quiz', id::text from q;
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
select t_expect_error(format($$select submit_quiz_attempt(%L, array['q1','q2'], '["A","B"]', -1, null, null)$$, (select v from t_state where k='quiz')), 'INVALID_INPUT');
select t_expect_error(format($$select submit_quiz_attempt(%L, array['q1','q2'], '["A","B"]', 1000, array[1], null)$$, (select v from t_state where k='quiz')), 'INVALID_INPUT');
select t_expect_error(format($$select submit_quiz_attempt(%L, array['q1','q2'], '["A","B"]', 1000, null, array['sure','guessed'])$$, (select v from t_state where k='quiz')), 'INVALID_INPUT');
select t_expect_error(format($$select submit_quiz_attempt(%L, array['q1'], '["A"]', 1000, null, null)$$, (select v from t_state where k='quiz')), 'INCOMPLETE_SUBMISSION');
select t_ok((select count(*) from t_quiz_attempts()) = 0, 'refused submits stored nothing');
select t_ok((select score from submit_quiz_attempt((select v::uuid from t_state where k='quiz'), array['q1','q2'], '["A","B"]', 123456, array[3000, 4000], array['confident', 'guessed'])) = 2, 'timed submit scores like the original');
select t_ok((select total_active_ms || '/' || array_to_string(answer_ms, ',') || '/' || array_to_string(confidence, ',') from t_quiz_attempts()) = '123456/3000,4000/confident,guessed', 'quiz time and confidence persisted');
select t_expect_error(format($$select submit_quiz_attempt(%L, array['q1','q2'], '["A","B"]', 1, null, null)$$, (select v from t_state where k='quiz')), 'ALREADY_SUBMITTED');
select t_ok((select count(*) from t_quiz_attempts()) = 1, 'exactly one official attempt');
select t_ok(jsonb_array_length(learning_evidence_read()) = 1, 'official quiz is not durable evidence (only the earlier practice row)');

-- 7. curriculum read/draft/publish: admins draft, only the owner publishes ----
select t_as('11111111-1111-1111-1111-111111111111');
insert into t_state select 'cr1', curriculum_config_read()::text;
select t_ok((select v::jsonb->'approved' from t_state where k='cr1') = 'null'::jsonb, 'resident: nothing approved yet');
select t_ok((select v::jsonb->'draft' from t_state where k='cr1') = '{"version":"core-candidate-2026-09-07","status":"draft"}'::jsonb, 'resident sees only draft version/status');
select t_ok((select v::jsonb->>'can_edit' from t_state where k='cr1') = 'false' and (select v::jsonb->>'can_publish' from t_state where k='cr1') = 'false' and (select v::jsonb->'versions' from t_state where k='cr1') = '[]'::jsonb, 'resident has no admin surface');
select t_expect_error($$select curriculum_draft_save('v-res', '[{"chapter":1,"title":"x"}]', null)$$, 'NOT_ADMIN');
select t_expect_error($$select curriculum_publish('core-candidate-2026-09-07', null, 'x')$$, 'NOT_OWNER');
select t_as('33333333-3333-3333-3333-333333333333');
select t_expect_error($$select curriculum_config_read()$$, 'NOT_APPROVED');
select t_as('44444444-4444-4444-4444-444444444444');
insert into t_state select 'cr2', curriculum_config_read()::text;
select t_ok(jsonb_array_length((select v::jsonb->'draft'->'chapters' from t_state where k='cr2')) = 42, 'admin sees the full draft');
select t_ok((select v::jsonb->>'can_edit' from t_state where k='cr2') = 'true' and (select v::jsonb->>'can_publish' from t_state where k='cr2') = 'false', 'admin can draft, cannot publish');
select t_ok(jsonb_array_length((select v::jsonb->'versions' from t_state where k='cr2')) = 1, 'admin sees the version list');
select t_expect_error($$select curriculum_draft_save('bad version!', '[{"chapter":1,"title":"x"}]', null)$$, 'INVALID_INPUT');
select t_expect_error($$select curriculum_draft_save('v-empty', '[]', null)$$, 'INVALID_INPUT');
select t_expect_error($$select curriculum_draft_save('v-dup', '[{"chapter":1,"title":"x"},{"chapter":1,"title":"y"}]', null)$$, 'INVALID_INPUT');
select t_expect_error($$select curriculum_draft_save('v-notitle', '[{"chapter":1,"title":" "}]', null)$$, 'INVALID_INPUT');
select t_expect_error($$select curriculum_draft_save('v-frac', '[{"chapter":1.5,"title":"x"}]', null)$$, 'INVALID_INPUT');
select t_expect_error($$select curriculum_draft_save('core-candidate-2026-09-07', '[{"chapter":1,"title":"x"}]', null)$$, 'DUPLICATE_VERSION');
select t_ok((curriculum_draft_save('v-test-1', '[{"chapter":12,"title":"Respiratory"},{"chapter":13,"title":"Cardiac"}]', '{"description":"harness import"}')->>'status') = 'draft', 'admin saves a new draft version');
select t_expect_error($$select curriculum_publish('v-test-1', null, 'x')$$, 'NOT_OWNER');
select t_as('55555555-5555-5555-5555-555555555555');
select t_expect_error($$select curriculum_publish('v-test-1', null, 'x')$$, 'NOT_OWNER');
-- owner (B's single editorial_owner row) publishes one exact version
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select t_expect_error($$select management_aggregate_read()$$, 'NOT_CONFIGURED');
-- the publisher reviews exact content: full draft + version list with content hashes, even without the admin role
insert into t_state select 'h_cand', v->>'content_hash' from jsonb_array_elements(curriculum_config_read()->'versions') v where v->>'version' = 'core-candidate-2026-09-07';
insert into t_state select 'h_v1', v->>'content_hash' from jsonb_array_elements(curriculum_config_read()->'versions') v where v->>'version' = 'v-test-1';
select t_ok((select length(v) from t_state where k='h_cand') = 64 and (select v from t_state where k='h_cand') <> (select v from t_state where k='h_v1'), 'owner sees per-version content hashes');
select t_ok(jsonb_array_length(curriculum_config_read()->'draft'->'chapters') = 2 and (curriculum_config_read()->'draft'->>'content_hash') = (select v from t_state where k='h_v1'), 'owner reviews the full newest draft with its hash');
select t_expect_error($$select curriculum_publish('nope', null, 'x')$$, 'VERSION_NOT_FOUND');
-- compare-and-set guards: wrong belief about the active version, or content that differs from the reviewed hash → nothing replaced
select t_expect_error(format($$select curriculum_publish('core-candidate-2026-09-07', 'v-test-1', %L)$$, (select v from t_state where k='h_cand')), 'STALE_CONFIG');
select t_expect_error($$select curriculum_publish('core-candidate-2026-09-07', null, 'deadbeef')$$, 'STALE_CONFIG');
select t_expect_error($$select curriculum_publish('core-candidate-2026-09-07', null, null)$$, 'STALE_CONFIG');
select t_ok((select count(*) from t_configs() where status = 'approved') = 0, 'guarded attempts published nothing');
insert into t_state select 'pub', curriculum_publish('core-candidate-2026-09-07', null, (select v from t_state where k='h_cand'))::text;
select t_ok((select v::jsonb->>'status' from t_state where k='pub') = 'approved' and (select v::jsonb->>'approved_at' from t_state where k='pub') is not null, 'owner publishes the candidate version');
select t_ok((select approved_by from t_configs() where version = 'core-candidate-2026-09-07') = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f', 'approver recorded');
select t_ok(curriculum_publish('core-candidate-2026-09-07', 'core-candidate-2026-09-07', (select v from t_state where k='h_cand'))::text = (select v from t_state where k='pub'), 'republish of the active version is idempotent');
select t_ok((select status from t_configs() where version = 'v-test-1') = 'draft', 'other draft untouched');
-- stale browser: a second publisher still believes nothing is active → refused, must refresh
select t_expect_error(format($$select curriculum_publish('v-test-1', null, %L)$$, (select v from t_state where k='h_v1')), 'STALE_CONFIG');
select t_ok((select status from t_configs() where version = 'v-test-1') = 'draft', 'stale publish replaced nothing');
-- intentional rollback: publish a new version with fresh identities, then re-activate the older approved one the same way
select t_as('44444444-4444-4444-4444-444444444444');
select curriculum_draft_save('v-roll', '[{"chapter":1,"title":"Roll"}]', null);
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
insert into t_state select 'h_roll', v->>'content_hash' from jsonb_array_elements(curriculum_config_read()->'versions') v where v->>'version' = 'v-roll';
select curriculum_publish('v-roll', 'core-candidate-2026-09-07', (select v from t_state where k='h_roll'));
select t_ok((curriculum_config_read()->'approved'->>'version') = 'v-roll', 'newer version activated with correct identities');
select t_expect_error(format($$select curriculum_publish('core-candidate-2026-09-07', null, %L)$$, (select v from t_state where k='h_cand')), 'STALE_CONFIG');
select curriculum_publish('core-candidate-2026-09-07', 'v-roll', (select v from t_state where k='h_cand'));
select t_ok((curriculum_config_read()->'approved'->>'version') = 'core-candidate-2026-09-07'
        and (select approved_at from t_configs() where version = 'core-candidate-2026-09-07') > (select approved_at from t_configs() where version = 'v-roll'), 'explicit rollback re-activates the older approved version');
-- resident now gets the approved config in full, newest draft still visible as version/status
select t_as('11111111-1111-1111-1111-111111111111');
insert into t_state select 'cr3', curriculum_config_read()::text;
select t_ok((select v::jsonb->'approved'->>'version' from t_state where k='cr3') = 'core-candidate-2026-09-07' and jsonb_array_length((select v::jsonb->'approved'->'chapters' from t_state where k='cr3')) = 42, 'resident receives the approved 42-chapter config');
select t_ok((select v::jsonb->'draft'->>'version' from t_state where k='cr3') = 'v-test-1' and (select v::jsonb->'draft'->'chapters' from t_state where k='cr3') is null, 'newest draft announced by version only');
-- version change: a newer draft never replaces the approved one until published
select t_as('44444444-4444-4444-4444-444444444444');
select curriculum_draft_save('v-test-2', '[{"chapter":40,"title":"Airway"}]', null);
select t_as('11111111-1111-1111-1111-111111111111');
select t_ok((curriculum_config_read()->'approved'->>'version') = 'core-candidate-2026-09-07' and (curriculum_config_read()->'draft'->>'version') = 'v-test-2', 'approved version stable while drafts move');
-- immutability: no client can rewrite a stored version
select t_expect_error($$update public.curriculum_configs set chapters = '[]'$$, 'permission denied for table curriculum_configs');
select t_as('44444444-4444-4444-4444-444444444444');
select t_expect_error($$update public.curriculum_configs set status = 'approved'$$, 'permission denied for table curriculum_configs');
select t_expect_error($$delete from public.curriculum_configs$$, 'permission denied for table curriculum_configs');

-- 8. senior persona fixture visible through resident_me for the plan engine ---
select t_ok((select residency_year || '/' || exam_date::text from t_member('roster.only@example.com')) = '5/2026-11-15', 'senior persona fixture in place');

-- 9. owner-only management aggregate: approved coverage/success only ----------
-- resident.google (active roster row, linked in section 5) answers the two open
-- chapter-12 fixture questions: o1 wrong in practice then right in an exam, o2 never.
select t_jwt('66666666-6666-6666-6666-666666666666', 'resident.google@example.com', array['google']);
insert into t_state select 'ag_p', attempt_start('practice', 'immediate', array['o1'])::text;
select attempt_confirm((select (v::jsonb->>'attempt_id')::uuid from t_state where k='ag_p'), 'o1', 'B', 'hesitant', 700);
select attempt_submit((select (v::jsonb->>'attempt_id')::uuid from t_state where k='ag_p'), 700);
insert into t_state select 'ag_e', attempt_start('exam', 'end', array['o1'])::text;
select attempt_confirm((select (v::jsonb->>'attempt_id')::uuid from t_state where k='ag_e'), 'o1', 'A', 'confident', 900);
select attempt_submit((select (v::jsonb->>'attempt_id')::uuid from t_state where k='ag_e'), 900);
select t_expect_error($$select management_aggregate_read()$$, 'NOT_OWNER');
select t_as('44444444-4444-4444-4444-444444444444');
select t_expect_error($$select management_aggregate_read()$$, 'NOT_OWNER');
select t_as('');
select t_expect_error($$select management_aggregate_read()$$, 'NOT_AUTHENTICATED');
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
insert into t_state select 'agg', management_aggregate_read()::text;
select t_ok((select v::jsonb->>'curriculum_version' from t_state where k='agg') = 'core-candidate-2026-09-07', 'aggregate labelled with the active version');
select t_ok((select jsonb_array_length(v::jsonb->'residents') from t_state where k='agg') = 5, 'every active roster resident listed, linked or not');
insert into t_state select 'agg_rg', r::text from jsonb_array_elements((select v::jsonb->'residents' from t_state where k='agg')) r where r->>'full_name' = 'Resident Google';
select t_ok((select v::jsonb->'overall' from t_state where k='agg_rg') = '{"coverage_percent": 50.0, "success_percent": 100.0}'::jsonb, 'overall: 1 of 2 open chapter-12 questions covered, latest exam answer correct');
select t_ok((select c from jsonb_array_elements((select v::jsonb->'chapters' from t_state where k='agg_rg')) c where (c->>'chapter')::int = 12) = '{"chapter": 12, "coverage_percent": 50.0, "success_percent": 100.0}'::jsonb, 'chapter 12 coverage/success');
select t_ok((select c->'coverage_percent' from jsonb_array_elements((select v::jsonb->'chapters' from t_state where k='agg_rg')) c where (c->>'chapter')::int = 8) = 'null'::jsonb, 'chapter without open bank reports null, never 0');
select t_ok((select jsonb_array_length(v::jsonb->'chapters') from t_state where k='agg_rg') = 42, 'one entry per approved chapter');
select t_ok((select r->'overall' from jsonb_array_elements((select v::jsonb->'residents' from t_state where k='agg')) r where r->>'full_name' = 'Never Signed Up') = '{"coverage_percent": 0.0, "success_percent": null}'::jsonb, 'unlinked resident: zero coverage, no success claim');
select t_ok((select v from t_state where k='agg') !~ 'question_id|required|quota|is_correct|confidence|snapshot|"o1"|"n1"|email', 'no question ids, evidence detail, quota or e-mail in the management shape');
select t_ok((select bool_and(r ?& array['member_id','full_name','residency_year','overall','chapters'] and not (r ?| array['user_id','email','national_access'])) from jsonb_array_elements((select v::jsonb->'residents' from t_state where k='agg')) r), 'resident identification limited to id, name, year');

select 'ALL LEARNING TESTS PASSED' as result;
\echo ALL LEARNING TESTS PASSED
