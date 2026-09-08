-- GREEN. Behavioural tests for migration 20260908000004 (SECURITY-REVIEW.md
-- F-2 and F-3). Isolated test cluster only. psql stops on the first failing
-- assertion (ON_ERROR_STOP), so a clean run = every check below held.
-- Run on a FRESH build: pre-fix.sql mutates state deliberately.
\i scripts/integrity-db/helpers.sql
set role authenticated;
select t_as('11111111-1111-1111-1111-111111111111');
create temp table t (k text primary key, v jsonb);

-- ===========================================================================
-- F-2 — attempt_confirm replay must not answer a question the session deferred
-- ===========================================================================

-- 1. The defect case: practice + deferred (_locking true, _reveal false).
insert into t select 'f2', t_deferred_replay('practice', 'end');
select t_ok((select v->'first'->>'is_correct' from t where k='f2') is null,
  'F-2: first confirm withholds is_correct under deferred feedback');
select t_ok((select v->'replay'->>'is_correct' from t where k='f2') is null,
  'F-2 FIXED: the replay withholds is_correct too');
select t_ok((select v->'replay'->>'correct_key' from t where k='f2') is null,
  'F-2: correct_key stays hidden on replay (was already correct)');
select t_ok((select v->'replay'->>'explanation' from t where k='f2') is null,
  'F-2: explanation stays hidden on replay');
select t_ok((select v->'replay'->>'locked' from t where k='f2') = 'true',
  'F-2: the replay still reports locked:true — the lock is not what changed');
select t_ok((select v->'first' from t where k='f2') = (select v->'replay' from t where k='f2'),
  'F-2: confirm is now fully idempotent — replay returns byte-identical JSON');

-- 2. The verdict is still COMPUTED and STORED; only the return is withheld.
select t_ok((select is_correct from t_aq()
             where attempt_id = (select (v->>'attempt_id')::uuid from t where k='f2') and question_id = 'q1') = true,
  'F-2: is_correct is still stored on the row — grading is unaffected');

-- 3. Practice credits at confirm time regardless of reveal, and the replay
--    must not double-credit. (Withholding the value must not skip the write.)
select t_ok((select answered_count from user_answers
             where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1') = 1,
  'F-2: deferred practice still credited history exactly once across confirm+replay');
select t_ok((select repetitions from spaced_repetition
             where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1') = 1,
  'F-2: deferred practice still advanced SRS exactly once');

-- 4. Immutability is untouched: a DIFFERENT answer on replay is still refused.
select t_expect_error(format($$select attempt_confirm(%L, 'q1', 'B', 'confident', 4200)$$,
  (select v->>'attempt_id' from t where k='f2')), 'CONFIRMED_IMMUTABLE');
select t_expect_error(format($$select attempt_confirm(%L, 'q1', 'A', 'guessed', 4200)$$,
  (select v->>'attempt_id' from t where k='f2')), 'CONFIRMED_IMMUTABLE');

-- 5. Controls — the three combinations that were never leaking must not change.
select t_as('22222222-2222-2222-2222-222222222222');
insert into t select 'immediate_practice', t_deferred_replay('practice', 'immediate');
select t_ok((select v->'replay'->>'is_correct' from t where k='immediate_practice') = 'true'
        and (select v->'replay'->>'correct_key' from t where k='immediate_practice') = 'A'
        and (select v->'replay'->>'explanation' from t where k='immediate_practice') is not null,
  'CONTROL: practice + immediate still reveals everything on replay');
insert into t select 'immediate_exam', t_deferred_replay('exam', 'immediate');
select t_ok((select v->'replay'->>'is_correct' from t where k='immediate_exam') = 'true'
        and (select v->'replay'->>'correct_key' from t where k='immediate_exam') = 'A',
  'CONTROL: exam + immediate still reveals on replay');
-- exam + deferred never reaches the replay branch (_locking false): the answer
-- stays editable, and a different selection overwrites instead of raising.
select t_as('11111111-1111-1111-1111-111111111111');
insert into t select 'exam_end', to_jsonb((attempt_start('exam','end', array['q1','q2']))->>'attempt_id');
select attempt_confirm((select v#>>'{}' from t where k='exam_end')::uuid, 'q1', 'A', 'confident', 100);
select attempt_confirm((select v#>>'{}' from t where k='exam_end')::uuid, 'q1', 'B', 'hesitant', 200);
select t_ok((select selected from t_aq()
             where attempt_id = (select v#>>'{}' from t where k='exam_end')::uuid and question_id='q1') = 'B',
  'CONTROL: exam + deferred is not locking — the answer is still editable');

-- 6. The whole point: at submit, the withheld verdict is reported normally.
insert into t select 'submit', attempt_submit((select (v->>'attempt_id')::uuid from t where k='f2'), 60000);
select t_ok((select v->>'correct_count' from t where k='submit') = '1',
  'F-2: the score is intact at submit — nothing was lost, only deferred');

-- ===========================================================================
-- F-3 — a partial roster re-import must not erase omitted fields
-- ===========================================================================
select t_as('44444444-4444-4444-4444-444444444444');

-- 1. Seed a complete member, then re-import the e-mail alone.
select upsert_resident_roster('[{"name":"Dr Ploni","email":"partial@example.org","residency_year":3,"exam_this_year":true}]');
insert into t select 'r_partial', upsert_resident_roster('[{"email":"partial@example.org"}]');
select t_ok((select v->>'applied' from t where k='r_partial') = 'true'
        and (select v->>'updated' from t where k='r_partial') = '1'
        and (select v->>'inserted' from t where k='r_partial') = '0',
  'F-3: the e-mail-only re-import still applies as an update');
select t_ok((select full_name from t_member('partial@example.org')) = 'Dr Ploni',
  'F-3 FIXED: omitted name preserved');
select t_ok((select exam_this_year from t_member('partial@example.org')) = true,
  'F-3 FIXED: omitted exam_this_year preserved (coalesce alone could not do this)');
select t_ok((select residency_year from t_member('partial@example.org')) = 3,
  'F-3: omitted residency_year still preserved');

-- 2. A blank name is the same as an absent one (it always was: nullif on btrim).
select upsert_resident_roster('[{"name":"   ","email":"partial@example.org"}]');
select t_ok((select full_name from t_member('partial@example.org')) = 'Dr Ploni',
  'F-3: a blank name preserves rather than clears');

-- 3. An EXPLICIT false must still write. This is the half a bare coalesce
--    would have broken, and the roster-race probe in entitlement-db depends
--    on it ("Race B" writes false over true and must win).
select upsert_resident_roster('[{"email":"partial@example.org","exam_this_year":false}]');
select t_ok((select exam_this_year from t_member('partial@example.org')) = false,
  'F-3: explicit exam_this_year=false still overwrites a stored true');
select upsert_resident_roster('[{"email":"partial@example.org","exam_this_year":true}]');
select t_ok((select exam_this_year from t_member('partial@example.org')) = true,
  'F-3: explicit exam_this_year=true still overwrites a stored false');

-- 4. Supplied fields still win.
select upsert_resident_roster('[{"name":"Dr Renamed","email":"partial@example.org","residency_year":6,"exam_this_year":true}]');
select t_ok((select full_name from t_member('partial@example.org')) = 'Dr Renamed'
        and (select residency_year from t_member('partial@example.org')) = 6,
  'F-3: a supplied name and year still overwrite');

-- 5. A NEW row is unchanged: e-mail only still inserts with the column default.
insert into t select 'r_new', upsert_resident_roster('[{"email":"brand.new@example.org"}]');
select t_ok((select v->>'inserted' from t where k='r_new') = '1'
        and (select full_name from t_member('brand.new@example.org')) is null
        and (select residency_year from t_member('brand.new@example.org')) is null
        and (select exam_this_year from t_member('brand.new@example.org')) = false,
  'F-3: a brand-new e-mail-only row still inserts with exam_this_year=false');

-- 6. Per-row resolution inside ONE statement: the set-list must consult the
--    staged row, not a batch-wide constant.
insert into t select 'r_mixed', upsert_resident_roster(
  '[{"email":"partial@example.org"},{"name":"Sheet Two","email":"brand.new@example.org","residency_year":5,"exam_this_year":true}]');
select t_ok((select v->>'updated' from t where k='r_mixed') = '2', 'F-3: mixed batch is two updates');
select t_ok((select full_name from t_member('partial@example.org')) = 'Dr Renamed'
        and (select exam_this_year from t_member('partial@example.org')) = true
        and (select residency_year from t_member('partial@example.org')) = 6,
  'F-3: the omitted-field row was preserved in the mixed batch');
select t_ok((select full_name from t_member('brand.new@example.org')) = 'Sheet Two'
        and (select exam_this_year from t_member('brand.new@example.org')) = true
        and (select residency_year from t_member('brand.new@example.org')) = 5,
  'F-3: the supplied-field row was overwritten in the same statement');

-- 7. Case/whitespace normalization still routes to the same row.
select upsert_resident_roster('[{"email":"  PARTIAL@Example.ORG  ","exam_this_year":false}]');
select t_ok((select count(*) from academy_members where lower(btrim(email)) = 'partial@example.org') = 1
        and (select exam_this_year from t_member('partial@example.org')) = false
        and (select full_name from t_member('partial@example.org')) = 'Dr Renamed',
  'F-3: normalized e-mail still hits the one row; preservation works through it');
select upsert_resident_roster('[{"email":"partial@example.org","exam_this_year":true}]');

-- 8. VALIDATION IS UNCHANGED. Same rows rejected, same reasons, all-or-nothing.
select t_expect_error($$select upsert_resident_roster('{}')$$, 'INVALID_INPUT');
select t_expect_error($$select upsert_resident_roster('[]')$$, 'INVALID_INPUT');
insert into t select 'r_reject', upsert_resident_roster(
  '[{"name":"Good","email":"val.good@example.org","exam_this_year":false},
    {"name":"Bad","email":"not-an-email","exam_this_year":false},
    {"name":"Dup A","email":"val.dup@example.org","exam_this_year":false},
    {"name":"Dup B","email":"VAL.DUP@example.org","exam_this_year":true},
    {"name":"NoMail"},
    {"name":"Bad Year","email":"val.year@example.org","residency_year":8,"exam_this_year":false},
    {"name":"Bad Flag","email":"val.flag@example.org","residency_year":3,"exam_this_year":"yes"},
    {"name":"Missing Flag","email":"val.missing@example.org","residency_year":4}]');
select t_ok((select v->>'applied' from t where k='r_reject') = 'false', 'VALIDATION: batch with rejects is not applied');
select t_ok((select jsonb_array_length(v->'rejected') from t where k='r_reject') = 7, 'VALIDATION: seven bad rows reported');
select t_ok((select jsonb_agg(e->>'reason' order by (e->>'row')::int) from t, jsonb_array_elements(v->'rejected') e where k='r_reject')
            = '["INVALID_EMAIL","DUPLICATE_IN_BATCH","DUPLICATE_IN_BATCH","MISSING_EMAIL","INVALID_RESIDENCY_YEAR","INVALID_EXAM_FLAG","INVALID_EXAM_FLAG"]'::jsonb,
  'VALIDATION: same reasons in the same order as before the fix');
select t_ok((select count(*) from academy_members where lower(btrim(email)) like 'val.%') = 0,
  'VALIDATION: all-or-nothing — the good row in a rejected batch is not written');
select t_expect_error($$select upsert_resident_roster((select jsonb_agg(jsonb_build_object('name','x','email','cap'||g||'@example.org','exam_this_year',false)) from generate_series(1,501) g))$$, 'INVALID_INPUT');

-- 9. The blast radius is still what the review measured: the set-list touches
--    three columns and nothing else.
select set_member_national_access((select id from t_member('partial@example.org')), true);
-- Planting the owner/status/level/onboarding values is test SETUP, not part of
-- the behaviour under test, and `authenticated` deliberately has no UPDATE on
-- this table (only the definer functions write it). Drop out of the client
-- role for the seed, then go straight back in for the call being tested.
reset role;
update public.academy_members set user_id = '77777777-7777-7777-7777-777777777777',
       status = 'suspended', access_level = 'full', onboarding_completed_at = now()
 where lower(btrim(email)) = 'partial@example.org';
set role authenticated;
select upsert_resident_roster('[{"name":"Attempted Reset","email":"partial@example.org","exam_this_year":false,
                                 "national_access":false,"user_id":null,"status":"active","access_level":"academy"}]');
select t_ok((select national_access from t_member('partial@example.org')) = true
        and (select user_id from t_member('partial@example.org')) = '77777777-7777-7777-7777-777777777777'
        and (select status from t_member('partial@example.org')) = 'suspended'
        and (select access_level from t_member('partial@example.org')) = 'full'
        and (select onboarding_completed_at from t_member('partial@example.org')) is not null,
  'F-3: a re-import still cannot touch the toggle, owner, status, level or onboarding stamp');

-- 10. Authorization is unchanged: non-roster-admins are still refused.
select t_as('11111111-1111-1111-1111-111111111111');
select t_expect_error($$select upsert_resident_roster('[{"email":"nope@example.org","exam_this_year":true}]')$$, 'NOT_ADMIN');
select t_as('55555555-5555-5555-5555-555555555555');
select t_expect_error($$select upsert_resident_roster('[{"email":"nope@example.org","exam_this_year":true}]')$$, 'NOT_ADMIN');
select t_as('');
select t_expect_error($$select upsert_resident_roster('[{"email":"nope@example.org","exam_this_year":true}]')$$, 'NOT_AUTHENTICATED');
reset role;
