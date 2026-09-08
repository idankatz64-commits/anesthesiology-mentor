-- Behavioural tests for the durable attempts migration. Runs on the isolated
-- test cluster only. Every block raises on a broken invariant; psql stops on
-- the first error (ON_ERROR_STOP), so a clean run means every assertion held.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function public.t_as(_uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', _uid, false)::void
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

-- inspection helper: attempt_questions has no client grant by design
create or replace function public.t_aq() returns setof public.attempt_questions language sql security definer as $$ select * from public.attempt_questions $$;

set role authenticated;

-- 1. authentication and approval gates -------------------------------------
select t_as('');
select t_expect_error($$select attempt_start('practice','immediate', array['q1'])$$, 'NOT_AUTHENTICATED');
select t_as('33333333-3333-3333-3333-333333333333');
select t_expect_error($$select attempt_start('practice','immediate', array['q1'])$$, 'NOT_APPROVED');

-- 2. input validation --------------------------------------------------------
select t_as('11111111-1111-1111-1111-111111111111');
select t_expect_error($$select attempt_start('practice','immediate', array[]::text[])$$, 'EMPTY_QUESTIONS');
select t_expect_error($$select attempt_start('practice','immediate', array['q1','q1'])$$, 'DUPLICATE_QUESTIONS');
select t_expect_error($$select attempt_start('practice','immediate', array['q1','nope'])$$, 'MISSING_QUESTIONS');
select t_expect_error($$select attempt_start('review','immediate', array['q1'])$$, 'INVALID_INPUT');
select t_expect_error($$select attempt_start('practice','later', array['q1'])$$, 'INVALID_INPUT');
select t_expect_error($$select attempt_start('practice','immediate', array[repeat('x', 300)])$$, 'INVALID_INPUT');

-- 3. practice: start snapshots questions, unknown keys stay unscored ---------
create temp table t_state (k text primary key, v text);
insert into t_state select 'a1', (attempt_start('practice','immediate', array['q1','q2','qna','qempty','boom']))->>'attempt_id';
select t_ok((select count(*) from t_aq() where attempt_id = (select v::uuid from t_state where k='a1')) = 5, 'five attempt questions');
select t_ok((select correct_key from t_aq() where attempt_id = (select v::uuid from t_state where k='a1') and question_id='qna') is null, 'N/A key stored as null');
select t_ok((select correct_key from t_aq() where attempt_id = (select v::uuid from t_state where k='a1') and question_id='qempty') is null, 'empty key stored as null');
select t_ok((select correct_key from t_aq() where attempt_id = (select v::uuid from t_state where k='a1') and question_id='q1') = 'A', 'A key stored');

-- 4. confirm validation ------------------------------------------------------
select t_expect_error(format($$select attempt_confirm(%L, 'q3', 'A', 'confident', 1000)$$, (select v from t_state where k='a1')), 'QUESTION_NOT_IN_ATTEMPT');
select t_expect_error(format($$select attempt_confirm(%L, 'q1', 'E', 'confident', 1000)$$, (select v from t_state where k='a1')), 'INVALID_INPUT');
select t_expect_error(format($$select attempt_confirm(%L, 'q1', 'A', 'sure', 1000)$$, (select v from t_state where k='a1')), 'INVALID_INPUT');
select t_expect_error(format($$select attempt_confirm(%L, 'q1', 'A', 'confident', -1)$$, (select v from t_state where k='a1')), 'INVALID_INPUT');
select t_expect_error(format($$select attempt_confirm(%L, 'q1', 'A', null, 1000)$$, (select v from t_state where k='a1')), 'INVALID_INPUT');

-- 5. practice confirm credits atomically, retry is idempotent ---------------
insert into t_state select 'c1', attempt_confirm((select v::uuid from t_state where k='a1'), 'q1', 'A', 'confident', 4200)::text;
select t_ok((select v::jsonb->>'is_correct' from t_state where k='c1') = 'true', 'q1 correct');
select t_ok((select v::jsonb->>'correct_key' from t_state where k='c1') = 'A', 'immediate feedback reveals key');
select t_ok((select answered_count from user_answers where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1') = 1, 'history credited once');
select t_ok((select repetitions from spaced_repetition where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1') = 1, 'SRS repetitions 1 after first confident correct');
select t_ok((select interval_days from spaced_repetition where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1') = 1, 'SRS interval 1');
select t_ok((select ease_factor from spaced_repetition where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1') = 2.6, 'SRS ease +0.1');
select t_ok((select confidence from answer_history where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1') = 'confident', 'confidence stamped onto history (history before SRS)');
-- identical retry: same result, no double credit
select t_ok(attempt_confirm((select v::uuid from t_state where k='a1'), 'q1', 'A', 'confident', 4200)::text = (select v from t_state where k='c1'), 'retry returns same result');
select t_ok((select answered_count from user_answers where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1') = 1, 'retry did not double credit history');
select t_ok((select count(*) from answer_history where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1') = 1, 'retry did not add history rows');
select t_ok((select repetitions from spaced_repetition where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1') = 1, 'retry left SRS unchanged');
-- changed answer after confirmation is refused
select t_expect_error(format($$select attempt_confirm(%L, 'q1', 'B', 'confident', 4200)$$, (select v from t_state where k='a1')), 'CONFIRMED_IMMUTABLE');
select t_expect_error(format($$select attempt_confirm(%L, 'q1', 'A', 'guessed', 4200)$$, (select v from t_state where k='a1')), 'CONFIRMED_IMMUTABLE');
select t_ok((select selected from t_aq() where attempt_id=(select v::uuid from t_state where k='a1') and question_id='q1') = 'A', 'stored answer unchanged');

-- wrong + guessed path of SM-2
select attempt_confirm((select v::uuid from t_state where k='a1'), 'q2', 'C', 'guessed', 900);
select t_ok((select ever_wrong from user_answers where user_id='11111111-1111-1111-1111-111111111111' and question_id='q2'), 'wrong answer recorded');
select t_ok((select (repetitions, interval_days, ease_factor) = (0, 1, 2.3) from spaced_repetition where user_id='11111111-1111-1111-1111-111111111111' and question_id='q2'), 'SM-2 reset on wrong/guessed');
select t_ok((select next_review_date from spaced_repetition where user_id='11111111-1111-1111-1111-111111111111' and question_id='q2') = (timezone('Asia/Jerusalem', now())::date + 1), 'next review = Israel today + 1');

-- unscored question: answer stored, no credit anywhere
insert into t_state select 'cna', attempt_confirm((select v::uuid from t_state where k='a1'), 'qna', 'B', 'hesitant', 300)::text;
select t_ok((select v::jsonb->>'is_correct' from t_state where k='cna') is null, 'unscored has null is_correct');
select t_ok(not exists (select 1 from user_answers where question_id='qna'), 'unscored writes no history');
select t_ok(not exists (select 1 from spaced_repetition where question_id='qna'), 'unscored writes no SRS');
select t_ok((select selected from t_aq() where attempt_id=(select v::uuid from t_state where k='a1') and question_id='qna') = 'B', 'unscored answer retained');

-- 6. failure inside credit rolls the whole confirmation back ----------------
select t_expect_error(format($$select attempt_confirm(%L, 'boom', 'A', 'confident', 100)$$, (select v from t_state where k='a1')), 'SIMULATED_SRS_FAILURE');
select t_ok((select selected is null and credited = false from t_aq() where attempt_id=(select v::uuid from t_state where k='a1') and question_id='boom'), 'failed confirm left no answer');
select t_ok(not exists (select 1 from user_answers where question_id='boom'), 'failed confirm left no history');
select t_ok(not exists (select 1 from answer_history where question_id='boom'), 'failed confirm left no history log');

-- 7. ownership: another approved user sees and touches nothing ---------------
select t_as('22222222-2222-2222-2222-222222222222');
select t_expect_error(format($$select attempt_confirm(%L, 'q2', 'B', 'confident', 1)$$, (select v from t_state where k='a1')), 'ATTEMPT_NOT_FOUND');
select t_expect_error(format($$select attempt_submit(%L, 1)$$, (select v from t_state where k='a1')), 'ATTEMPT_NOT_FOUND');
select t_expect_error(format($$select attempt_read(%L)$$, (select v from t_state where k='a1')), 'ATTEMPT_NOT_FOUND');
select t_expect_error(format($$select attempt_abandon(%L)$$, (select v from t_state where k='a1')), 'ATTEMPT_NOT_FOUND');
select t_ok((select count(*) from attempts) = 0, 'RLS hides other users attempts');
select t_ok((select count(*) from attempt_roots) = 0, 'RLS hides other users roots');
select t_expect_error($$insert into attempts (root_id, user_id, mode, feedback_timing, question_order, total_count) values (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'practice', 'immediate', array['q1'], 1)$$, 'permission denied for table attempts');
select t_expect_error($$select * from attempt_questions$$, 'permission denied for table attempt_questions');
select t_expect_error($$select * from question_snapshots$$, 'permission denied for table question_snapshots');
select t_as('11111111-1111-1111-1111-111111111111');
select t_ok((select count(*) from attempts) = 1, 'owner sees own attempt');

-- 8. practice submit: idempotent, counts, quarter ----------------------------
insert into t_state select 's1', attempt_submit((select v::uuid from t_state where k='a1'), 60000)::text;
select t_ok((select (v::jsonb->>'correct_count')::int = 1 and (v::jsonb->>'scored_count')::int = 2 and (v::jsonb->>'answered_count')::int = 3 and (v::jsonb->>'total_count')::int = 5 from t_state where k='s1'), 'practice counts');
select t_ok((select v::jsonb->>'quarter' from t_state where k='s1') = to_char(timezone('Asia/Jerusalem', now()), 'YYYY-"Q"Q'), 'quarter assigned in Asia/Jerusalem');
select t_ok(attempt_submit((select v::uuid from t_state where k='a1'), 999999)::text = (select v from t_state where k='s1'), 'resubmit returns stored result and ignores payload');
select t_ok((select total_active_ms from attempts where id=(select v::uuid from t_state where k='a1')) = 60000, 'resubmit did not overwrite time');
select t_expect_error(format($$select attempt_confirm(%L, 'q2', 'B', 'confident', 1)$$, (select v from t_state where k='a1')), 'ATTEMPT_NOT_OPEN');
select t_expect_error(format($$select attempt_abandon(%L)$$, (select v from t_state where k='a1')), 'ATTEMPT_NOT_OPEN');
select t_ok((select latest_submitted_at is not null from attempt_roots where id = (select root_id from attempts where id=(select v::uuid from t_state where k='a1'))), 'root records latest submission');

-- 9. exam with end feedback: editable until submit, credit only at submit ---
insert into t_state select 'a2', (attempt_start('exam','end', array['q1','q2','q3','qna']))->>'attempt_id';
insert into t_state select 'c2', attempt_confirm((select v::uuid from t_state where k='a2'), 'q3', 'A', 'confident', 1500)::text;
select t_ok((select v::jsonb->>'correct_key' from t_state where k='c2') is null and (select v::jsonb->>'is_correct' from t_state where k='c2') is null, 'end feedback reveals nothing at confirm');
select attempt_confirm((select v::uuid from t_state where k='a2'), 'q3', 'C', 'hesitant', 2500);
select t_ok((select selected = 'C' and confidence = 'hesitant' and answer_ms = 2500 from t_aq() where attempt_id=(select v::uuid from t_state where k='a2') and question_id='q3'), 'exam-end answer editable');
select t_ok(not exists (select 1 from user_answers where question_id='q3'), 'exam confirm gives no credit');
select attempt_confirm((select v::uuid from t_state where k='a2'), 'q1', 'B', 'confident', 700);
select attempt_confirm((select v::uuid from t_state where k='a2'), 'qna', 'D', 'guessed', 100);
-- read before submit hides keys/explanations
insert into t_state select 'r2', attempt_read((select v::uuid from t_state where k='a2'))::text;
select t_ok((select bool_and(q->'snapshot'->>'correct' is null and q->'snapshot'->>'explanation' is null and q->>'is_correct' is null) from t_state, jsonb_array_elements(v::jsonb->'questions') q where k='r2'), 'read hides keys before submit');
select t_ok((select jsonb_array_length(v::jsonb->'questions') = 4 from t_state where k='r2'), 'read returns all questions');
insert into t_state select 's2', attempt_submit((select v::uuid from t_state where k='a2'), 90000)::text;
select t_ok((select (v::jsonb->>'correct_count')::int = 1 and (v::jsonb->>'scored_count')::int = 2 and (v::jsonb->>'answered_count')::int = 3 from t_state where k='s2'), 'exam counts (q3 correct, q1 wrong, qna unscored, q2 unanswered)');
select t_ok((select v::jsonb->'questions' = '[{"question_id":"q1","is_correct":false},{"question_id":"q3","is_correct":true},{"question_id":"qna","is_correct":null}]'::jsonb from t_state where k='s2'), 'submit returns per-question correctness in position order');
select t_ok((select answered_count from user_answers where user_id='11111111-1111-1111-1111-111111111111' and question_id='q3') = 1, 'exam credit at submit');
select t_ok((select answered_count from user_answers where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1') = 2, 'q1 credited second time from exam');
select t_ok((select repetitions = 0 and ease_factor = 2.4 from spaced_repetition where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1'), 'SM-2 reset after wrong exam answer');
select t_ok((select answered_count from user_answers where user_id='11111111-1111-1111-1111-111111111111' and question_id='q2') = 1, 'unanswered exam question not credited (count unchanged from practice)');
select t_ok(not exists (select 1 from user_answers where question_id='qna'), 'unscored exam question not credited');
select t_ok((select answered_count from user_answers where user_id='11111111-1111-1111-1111-111111111111' and question_id='q3') = 1, 'resubmit does not re-credit' ) from attempt_submit((select v::uuid from t_state where k='a2'), 1);
insert into t_state select 'r2b', attempt_read((select v::uuid from t_state where k='a2'))::text;
select t_ok((select bool_and(q->'snapshot'->>'explanation' is not null) from t_state, jsonb_array_elements(v::jsonb->'questions') q where k='r2b'), 'read reveals explanations after submit');
select t_ok((select q->>'is_correct' = 'true' from t_state, jsonb_array_elements(v::jsonb->'questions') q where k='r2b' and q->>'question_id'='q3'), 'read reveals correctness after submit');
select t_ok((select q->>'is_correct' is null from t_state, jsonb_array_elements(v::jsonb->'questions') q where k='r2b' and q->>'question_id'='qna'), 'unscored stays unscored in review');

-- 10. exam with immediate feedback locks confirmed answers -------------------
insert into t_state select 'a3', (attempt_start('exam','immediate', array['q1','q2']))->>'attempt_id';
select attempt_confirm((select v::uuid from t_state where k='a3'), 'q1', 'A', 'confident', 50);
select t_expect_error(format($$select attempt_confirm(%L, 'q1', 'B', 'confident', 50)$$, (select v from t_state where k='a3')), 'CONFIRMED_IMMUTABLE');
select t_ok(not exists (select 1 from user_answers where question_id='q1' and answered_count = 3), 'immediate exam does not credit at confirm');
-- snapshot frozen: editing the question after start must not change scoring or review content
reset role;
update questions set correct = 'B', question = 'edited after start' where id = 'q1';
set role authenticated;
select t_as('11111111-1111-1111-1111-111111111111');
select attempt_confirm((select v::uuid from t_state where k='a3'), 'q2', 'B', 'hesitant', 60);
insert into t_state select 's3', attempt_submit((select v::uuid from t_state where k='a3'), 500)::text;
select t_ok((select (v::jsonb->>'correct_count')::int = 2 from t_state where k='s3'), 'scored against frozen key, not the edited one');
select t_ok((select q->'snapshot'->>'question' = 'synthetic question 1' from t_state, jsonb_array_elements(attempt_read(v::uuid)->'questions') q where k='a3' and q->>'question_id'='q1'), 'review shows frozen content');
reset role;
update questions set correct = 'A', question = 'synthetic question 1' where id = 'q1';
set role authenticated;
select t_as('11111111-1111-1111-1111-111111111111');

-- 11. abandon ---------------------------------------------------------------
insert into t_state select 'a4', (attempt_start('practice','immediate', array['q1']))->>'attempt_id';
select attempt_abandon((select v::uuid from t_state where k='a4'));
select attempt_abandon((select v::uuid from t_state where k='a4'));
select t_ok((select status from attempts where id=(select v::uuid from t_state where k='a4')) = 'abandoned', 'abandoned');
select t_expect_error(format($$select attempt_submit(%L, 1)$$, (select v from t_state where k='a4')), 'ATTEMPT_NOT_OPEN');
select t_ok((select latest_submitted_at is null from attempt_roots where id=(select root_id from attempts where id=(select v::uuid from t_state where k='a4'))), 'abandon never counts as submission');

-- 12. repeat: cooldown, ownership, frozen membership, different order --------
insert into t_state select 'root2', root_id::text from attempts where id=(select v::uuid from t_state where k='a2');
select t_expect_error(format($$select attempt_repeat(%L, 'end')$$, (select v from t_state where k='root2')), 'COOLDOWN_ACTIVE');
select t_expect_error(format($$select attempt_repeat(%L, 'end')$$, (select root_id from attempts where id=(select v::uuid from t_state where k='a4'))), 'NOT_SUBMITTED_YET');
-- reading/reviewing must not touch the cooldown clock
select attempt_read((select v::uuid from t_state where k='a2'));
reset role;
update attempt_roots set latest_submitted_at = now() - interval '7 days' - interval '1 minute' where id=(select v::uuid from t_state where k='root2');
set role authenticated;
select t_as('22222222-2222-2222-2222-222222222222');
select t_expect_error(format($$select attempt_repeat(%L, 'end')$$, (select v from t_state where k='root2')), 'ROOT_NOT_FOUND');
select t_as('11111111-1111-1111-1111-111111111111');
select t_expect_error(format($$select attempt_repeat(%L, 'whenever')$$, (select v from t_state where k='root2')), 'INVALID_INPUT');
insert into t_state select 'rep', attempt_repeat((select v::uuid from t_state where k='root2'), 'immediate')::text;
select t_ok((select (v::jsonb->>'root_id') = (select v from t_state where k='root2') from t_state where k='rep'), 'repeat shares root');
select t_ok((select mode = 'exam' and feedback_timing = 'immediate' and status = 'in_progress' from attempts where id=(select v::jsonb->>'attempt_id' from t_state where k='rep')::uuid), 'repeat keeps mode, takes chosen timing');
select t_ok((select (select array_agg(x order by x) from unnest(question_order) x) = (select array_agg(x order by x) from unnest(array['q1','q2','q3','qna']) x) from attempts where id=(select v::jsonb->>'attempt_id' from t_state where k='rep')::uuid), 'repeat has the same question set');
select t_ok((select question_order from attempts where id=(select v::jsonb->>'attempt_id' from t_state where k='rep')::uuid) <> (select question_order from attempts where id=(select v::uuid from t_state where k='a2')), 'repeat order differs');
select t_ok((select count(*) from t_aq() where attempt_id=(select v::jsonb->>'attempt_id' from t_state where k='rep')::uuid and selected is null) = 4, 'repeat starts with no answers');
-- a repeated call (lost response, second tab) returns the open attempt as-is: same id, same order, its own timing
select t_ok((select attempt_repeat((select v::uuid from t_state where k='root2'), 'end')) = (select v::jsonb from t_state where k='rep'), 'repeat on an open root returns the existing open attempt');
select t_ok((select feedback_timing = 'immediate' from attempts where id=(select v::jsonb->>'attempt_id' from t_state where k='rep')::uuid), 'existing open attempt keeps its own feedback timing');
-- keys are re-frozen per attempt: an unknown key for the repeat is unscored again
select t_ok((select correct_key is null from t_aq() where attempt_id=(select v::jsonb->>'attempt_id' from t_state where k='rep')::uuid and question_id='qna'), 'repeat keeps unknown key unscored');
select t_ok((select latest_submitted_at < now() - interval '7 days' from attempt_roots where id=(select v::uuid from t_state where k='root2')), 'starting a repeat does not move the cooldown clock');

-- 13. repeat reuses the original frozen rows; live edits/deletions cannot leak in
select attempt_confirm((select v::jsonb->>'attempt_id' from t_state where k='rep')::uuid, 'q1', 'A', 'confident', 10);
insert into t_state select 'srep', attempt_submit((select v::jsonb->>'attempt_id' from t_state where k='rep')::uuid, 100)::text;
reset role;
update attempt_roots set latest_submitted_at = now() - interval '8 days' where id=(select v::uuid from t_state where k='root2');
create temp table t_q3 as select * from questions where id = 'q3';
delete from questions where id = 'q3';
update questions set correct = 'B', question = 'edited before repeat', explanation = 'edited explanation' where id = 'q1';
set role authenticated;
select t_as('11111111-1111-1111-1111-111111111111');
insert into t_state select 'rep2', attempt_repeat((select v::uuid from t_state where k='root2'), 'end')::text;
select t_ok((select count(*) from t_aq() where attempt_id=(select v::jsonb->>'attempt_id' from t_state where k='rep2')::uuid) = 4, 'second repeat carries all 4 questions although q3 was deleted');
select t_ok((select total_count from attempts where id=(select v::jsonb->>'attempt_id' from t_state where k='rep2')::uuid) = 4, 'second repeat total_count matches the frozen set');
select t_ok((select correct_key from t_aq() where attempt_id=(select v::jsonb->>'attempt_id' from t_state where k='rep2')::uuid and question_id='q1') = 'A', 'second repeat keeps the original frozen key after a live edit');
select t_ok((select array_agg(content_hash order by question_id) from t_aq() where attempt_id=(select v::jsonb->>'attempt_id' from t_state where k='rep2')::uuid)
          = (select array_agg(content_hash order by question_id) from t_aq() where attempt_id=(select v::uuid from t_state where k='a2')), 'second repeat references exactly the original snapshots');
select t_ok((select q->'snapshot'->>'question' = 'synthetic question 1' from t_state, jsonb_array_elements(attempt_read((v::jsonb->>'attempt_id')::uuid)->'questions') q where k='rep2' and q->>'question_id'='q1'), 'second repeat shows the frozen wording');
select t_ok((select question_order from attempts where id=(select v::jsonb->>'attempt_id' from t_state where k='rep2')::uuid) <> (select question_order from attempts where id=(select v::jsonb->>'attempt_id' from t_state where k='rep')::uuid), 'second repeat order differs from the previous attempt');
select t_ok((select array_position(question_order, 'q1') from attempts where id=(select v::jsonb->>'attempt_id' from t_state where k='rep2')::uuid) = (select position from t_aq() where attempt_id=(select v::jsonb->>'attempt_id' from t_state where k='rep2')::uuid and question_id='q1'), 'positions follow the new order');
-- third repeat (after abandoning the second) is still frozen and still reordered
select attempt_abandon((select v::jsonb->>'attempt_id' from t_state where k='rep2')::uuid);
insert into t_state select 'rep3', attempt_repeat((select v::uuid from t_state where k='root2'), 'immediate')::text;
select t_ok((select count(*) from t_aq() where attempt_id=(select v::jsonb->>'attempt_id' from t_state where k='rep3')::uuid and (question_id <> 'q1' or correct_key = 'A')) = 4, 'third repeat still frozen');
select t_ok((select question_order from attempts where id=(select v::jsonb->>'attempt_id' from t_state where k='rep3')::uuid) <> (select question_order from attempts where id=(select v::jsonb->>'attempt_id' from t_state where k='rep2')::uuid), 'third repeat order differs from the second');
reset role;
-- deterministic reorder fallback: an identical shuffle is rotated, one question keeps its only order
select t_ok(attempt_distinct_order(array['a','b','c'], array['a','b','c']) = array['b','c','a'], 'identical shuffle is rotated');
select t_ok(attempt_distinct_order(array['b','a','c'], array['a','b','c']) = array['b','a','c'], 'different shuffle is kept');
select t_ok(attempt_distinct_order(array['a'], array['a']) = array['a'], 'single question keeps its only order');
insert into questions select * from t_q3;
update questions set correct = 'A', question = 'synthetic question 1', explanation = 'synthetic explanation 1' where id = 'q1';

reset role;
select 'ALL SQL ASSERTIONS PASSED' as result;
\set QUIET off
select 'ALL SQL ASSERTIONS PASSED' as result;
