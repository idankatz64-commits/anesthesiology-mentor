-- Synthetic behavioural tests for persisted FSRS events/state/logs. These run
-- only in ysnp_fsrs_test on the local PostgreSQL cluster.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function public.fsrs_t_ok(_condition boolean, _message text) returns void language plpgsql as $$
begin if _condition is distinct from true then raise exception 'ASSERTION FAILED: %', _message; end if; end $$;
create or replace function public.fsrs_t_as(_uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub',_uid,false)::void
$$;
create or replace function public.fsrs_t_jwt(_uid text,_email text,_providers text[]) returns void language sql as $$
  select set_config('request.jwt.claim.sub',_uid,false),
         set_config('request.jwt.claims',jsonb_build_object('email',_email,'app_metadata',jsonb_build_object('providers',to_jsonb(_providers)))::text,false)
$$;
create or replace function public.fsrs_t_expect_error(_sql text,_code text) returns void language plpgsql as $$
declare _got text;
begin
  begin execute _sql; exception when others then _got:=sqlerrm; end;
  if _got is null or _got<>_code then raise exception 'expected %, got %',_code,coalesce(_got,'NO ERROR'); end if;
end $$;

-- The harness can commit an initial-card result only. Algorithm arithmetic is
-- pinned independently in fsrsAdapter.test.ts; this helper exercises SQL state.
create or replace function public.fsrs_t_process_initial(_expected_event uuid) returns jsonb language plpgsql as $$
declare _claim jsonb; _event public.fsrs_review_events; _at timestamptz; _due timestamptz;
        _rating integer; _stability double precision; _difficulty double precision; _result jsonb;
begin
  _claim:=public.fsrs_worker_claim(1)->0;
  if (_claim->>'event_id')::uuid is distinct from _expected_event then
    raise exception 'ASSERTION FAILED: wrong event claimed';
  end if;
  select * into _event from public.fsrs_review_events where id=_expected_event;
  if not _event.primary_eligible then return public.fsrs_worker_exclude(_expected_event,(_claim->>'lease_token')::uuid); end if;
  if (_claim->'previous_card'->>'state')::integer<>0 then raise exception 'ASSERTION FAILED: expected empty card'; end if;
  _rating:=public.fsrs_event_rating(_event); _at:=(_claim->>'confirmed_at')::timestamptz;
  _due:=_at+case _rating when 1 then interval '1 minute' when 2 then interval '6 minutes'
                          when 3 then interval '10 minutes' else interval '8 days' end;
  _stability:=case _rating when 1 then 0.212 when 2 then 1.2931 when 3 then 2.3065 else 8.2956 end;
  _difficulty:=case _rating when 1 then 6.4133 when 2 then 5.11217071 when 3 then 2.11810397 else 1 end;
  _result:=jsonb_build_object(
    'algorithm_version','ts-fsrs@5.4.2','parameter_version','default-r0.90-v1',
    'parameters',public.fsrs_shadow_parameters(),'rating',_rating,'previous_card',_claim->'previous_card',
    'new_card',jsonb_build_object('due',to_char(_due at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'stability',_stability,'difficulty',_difficulty,'elapsed_days',0,'scheduled_days',0,
      'learning_steps',1,'reps',1,'lapses',0,'state',1,
      'last_review',to_char(_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'predicted_due',to_char(_due at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'retrievability_before',null);
  return public.fsrs_worker_commit(_expected_event,(_claim->>'lease_token')::uuid,_result);
end $$;

-- Surface and RLS: browsers have aggregate RPCs only; worker RPCs are server-only.
select fsrs_t_ok(not has_table_privilege('authenticated','public.fsrs_review_events','SELECT')
  and not has_table_privilege('authenticated','public.fsrs_card_states','SELECT')
  and not has_table_privilege('authenticated','public.fsrs_review_logs','SELECT'),'FSRS tables are not browser-readable');
select fsrs_t_ok(not has_function_privilege('authenticated','public.fsrs_worker_claim(integer)','EXECUTE')
  and has_function_privilege('service_role','public.fsrs_worker_claim(integer)','EXECUTE'),'worker claim is service-role only');
select fsrs_t_ok(has_function_privilege('authenticated','public.fsrs_shadow_summary()','EXECUTE')
  and not has_function_privilege('anon','public.fsrs_shadow_summary()','EXECUTE'),'summary is authenticated owner-gated');

set role authenticated;
create temp table fsrs_t_state(k text primary key,v text);
select fsrs_t_as('11111111-1111-1111-1111-111111111111');

-- Eligible explicit-confidence event: real trigger -> queue -> state/log commit.
insert into fsrs_t_state select 'p1',(attempt_start('practice','immediate',array['q1'])->>'attempt_id');
reset role;
-- Change the live key after start: grading must remain bound to the frozen A key.
update public.questions set correct='B' where id='q1';
set role authenticated; select fsrs_t_as('11111111-1111-1111-1111-111111111111');
select attempt_confirm((select v::uuid from fsrs_t_state where k='p1'),'q1','A','confident',1200);
select attempt_confirm((select v::uuid from fsrs_t_state where k='p1'),'q1','A','confident',1200);
reset role;
update public.questions set correct='A' where id='q1';
insert into fsrs_t_state select 'e1',id::text from fsrs_review_events where attempt_id=(select v::uuid from fsrs_t_state where k='p1');
create temp table fsrs_t_sm2 as select next_review_date from spaced_repetition
 where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1';
select fsrs_t_ok((select count(*) from fsrs_review_events where attempt_id=(select v::uuid from fsrs_t_state where k='p1'))=1
  and (select primary_eligible and is_correct and not feedback_exposed_before and confidence='confident'
       from fsrs_review_events where id=(select v::uuid from fsrs_t_state where k='e1')),'enqueue once and frozen-snapshot grading captured');
insert into fsrs_t_state select 'commit1',fsrs_t_process_initial((select v::uuid from fsrs_t_state where k='e1'))::text;
select fsrs_t_ok((select count(*) from fsrs_card_states where last_event_id=(select v::uuid from fsrs_t_state where k='e1'))=1
  and (select count(*) from fsrs_review_logs where event_id=(select v::uuid from fsrs_t_state where k='e1') and outcome='applied' and rating=3)=1,'state and applied log persisted');
select fsrs_t_ok((select next_review_date from spaced_repetition where user_id='11111111-1111-1111-1111-111111111111' and question_id='q1')
  is not distinct from (select next_review_date from fsrs_t_sm2),'FSRS commit did not change active SM2 due date');
select fsrs_t_ok((fsrs_worker_commit((select v::uuid from fsrs_t_state where k='e1'),gen_random_uuid(),'{}')->>'status')='processed'
  and (select count(*) from fsrs_review_logs where event_id=(select v::uuid from fsrs_t_state where k='e1'))=1,'commit retry is idempotent');

-- Unscored remains stored and explicitly excluded; it is never coerced to wrong.
set role authenticated; select fsrs_t_as('11111111-1111-1111-1111-111111111111');
insert into fsrs_t_state select 'u1',(attempt_start('practice','immediate',array['qna'])->>'attempt_id');
select attempt_confirm((select v::uuid from fsrs_t_state where k='u1'),'qna','A','hesitant',300);
reset role;
insert into fsrs_t_state select 'ue1',id::text from fsrs_review_events where attempt_id=(select v::uuid from fsrs_t_state where k='u1');
select fsrs_t_process_initial((select v::uuid from fsrs_t_state where k='ue1'));
select fsrs_t_ok((select is_correct is null and not primary_eligible and exclusion_reason='unscored' from fsrs_review_events where id=(select v::uuid from fsrs_t_state where k='ue1'))
  and (select outcome='excluded' and rating is null from fsrs_review_logs where event_id=(select v::uuid from fsrs_t_state where k='ue1')),'unscored persisted then excluded');

-- A delayed end-feedback exam is retained but quarantined when a newer practice
-- event for the same card was already applied. Neither FSRS state nor SM-2 rewinds.
set role authenticated; select fsrs_t_as('11111111-1111-1111-1111-111111111111');
insert into fsrs_t_state select 'x1',(attempt_start('exam','end',array['q2'])->>'attempt_id');
select attempt_confirm((select v::uuid from fsrs_t_state where k='x1'),'q2','A','guessed',800);
select attempt_confirm((select v::uuid from fsrs_t_state where k='x1'),'q2','B','hesitant',900);
reset role;
select fsrs_t_ok((select count(*) from fsrs_review_events where attempt_id=(select v::uuid from fsrs_t_state where k='x1'))=0,'mutable exam not captured early');
select pg_sleep(0.02);
set role authenticated; select fsrs_t_as('11111111-1111-1111-1111-111111111111');
insert into fsrs_t_state select 'p2',(attempt_start('practice','immediate',array['q2'])->>'attempt_id');
select attempt_confirm((select v::uuid from fsrs_t_state where k='p2'),'q2','B','confident',500); reset role;
insert into fsrs_t_state select 'pe2',id::text from fsrs_review_events where attempt_id=(select v::uuid from fsrs_t_state where k='p2');
select fsrs_t_process_initial((select v::uuid from fsrs_t_state where k='pe2'));
insert into fsrs_t_state select 'q2_state_before',to_jsonb(s)::text from fsrs_card_states s
 where user_id='11111111-1111-1111-1111-111111111111' and question_id='q2';
set role authenticated; select fsrs_t_as('11111111-1111-1111-1111-111111111111');
select attempt_submit((select v::uuid from fsrs_t_state where k='x1'),1700); reset role;
-- Submission legitimately updates active SM-2 credit. Snapshot after submission
-- so the assertion isolates the subsequent FSRS quarantine operation.
insert into fsrs_t_state select 'q2_sm2_before',next_review_date::text from spaced_repetition
 where user_id='11111111-1111-1111-1111-111111111111' and question_id='q2';
insert into fsrs_t_state select 'xe1',id::text from fsrs_review_events where attempt_id=(select v::uuid from fsrs_t_state where k='x1');
select fsrs_t_ok((select is_correct and confidence='hesitant' from fsrs_review_events where id=(select v::uuid from fsrs_t_state where k='xe1')),'final exam answer captured at submit');
select fsrs_t_ok(fsrs_worker_claim(1)='[]'::jsonb,'late end-exam event is not sent to FSRS calculation');
select fsrs_t_ok(
  (select status='processed' and last_error='LATE_OUT_OF_ORDER' from fsrs_processing_queue where event_id=(select v::uuid from fsrs_t_state where k='xe1'))
  and (select outcome='excluded' and exclusion_reason='late_out_of_order' from fsrs_review_logs where event_id=(select v::uuid from fsrs_t_state where k='xe1'))
  and (select to_jsonb(s)::text from fsrs_card_states s where user_id='11111111-1111-1111-1111-111111111111' and question_id='q2')=(select v from fsrs_t_state where k='q2_state_before')
  and (select next_review_date::text from spaced_repetition where user_id='11111111-1111-1111-1111-111111111111' and question_id='q2')=(select v from fsrs_t_state where k='q2_sm2_before'),
  'late event retained with explicit quarantine and no FSRS or SM2 mutation');

-- Equality also fails closed using event UUID as the deterministic secondary key.
set role authenticated; select fsrs_t_as('11111111-1111-1111-1111-111111111111');
insert into fsrs_t_state select 'xeq',(attempt_start('exam','end',array['q2'])->>'attempt_id');
select attempt_confirm((select v::uuid from fsrs_t_state where k='xeq'),'q2','B','confident',400); reset role;
insert into fsrs_review_events(id,event_key,user_id,question_id,attempt_id,root_id,mode,feedback_timing,
  source,source_class,confirmed_at,is_correct,confidence,confidence_estimated,answer_ms,prior_feedback_at,
  feedback_exposed_before,primary_eligible,exclusion_reason)
select '00000000-0000-0000-0000-000000000001',a.id::text||':q2:equal-order-probe',a.user_id,'q2',a.id,a.root_id,
  a.mode,a.feedback_timing,null,'unclassified',s.last_review_at,true,'confident',false,400,null,false,true,null
from attempts a join fsrs_card_states s on s.user_id=a.user_id and s.question_id='q2'
where a.id=(select v::uuid from fsrs_t_state where k='xeq');
insert into fsrs_processing_queue(event_id) values ('00000000-0000-0000-0000-000000000001');
insert into fsrs_t_state values ('equal_claim',fsrs_worker_claim(1)::text);
select fsrs_t_ok((select v='[]' from fsrs_t_state where k='equal_claim')
  and (select exclusion_reason='late_out_of_order' from fsrs_review_logs where event_id='00000000-0000-0000-0000-000000000001'),
  'equal confirmation timestamp with earlier event UUID is quarantined');

-- Actual earlier reveal timestamp, with no guessed rapid-repeat threshold.
set role authenticated; select fsrs_t_as('11111111-1111-1111-1111-111111111111');
insert into fsrs_t_state select 'u2',(attempt_start('practice','immediate',array['qna'])->>'attempt_id');
select attempt_confirm((select v::uuid from fsrs_t_state where k='u2'),'qna','B','confident',200);
select pg_sleep(0.02);
insert into fsrs_t_state select 'u3',(attempt_start('practice','immediate',array['qna'])->>'attempt_id');
select attempt_confirm((select v::uuid from fsrs_t_state where k='u3'),'qna','C','guessed',210); reset role;
insert into fsrs_t_state select 'ue2',id::text from fsrs_review_events where attempt_id=(select v::uuid from fsrs_t_state where k='u2');
insert into fsrs_t_state select 'ue3',id::text from fsrs_review_events where attempt_id=(select v::uuid from fsrs_t_state where k='u3');
select fsrs_t_ok((select feedback_exposed_before and prior_feedback_at<confirmed_at from fsrs_review_events where id=(select v::uuid from fsrs_t_state where k='ue2'))
  and (select feedback_exposed_before and prior_feedback_at=(select confirmed_at from fsrs_review_events where id=(select v::uuid from fsrs_t_state where k='ue2'))
       from fsrs_review_events where id=(select v::uuid from fsrs_t_state where k='ue3')),'latest actual prior reveal timestamp persisted');
select fsrs_t_process_initial((select v::uuid from fsrs_t_state where k='ue2'));
select fsrs_t_process_initial((select v::uuid from fsrs_t_state where k='ue3'));

-- National event survives entitlement revocation, but only owner aggregate sees it.
set role authenticated;
select fsrs_t_jwt('66666666-6666-6666-6666-666666666666','resident.google@example.com',array['google']);
select claim_academy_membership();
select fsrs_t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access((select id from academy_members where lower(email)='resident.google@example.com'),true);
select fsrs_t_jwt('66666666-6666-6666-6666-666666666666','resident.google@example.com',array['google']);
insert into fsrs_t_state select 'n1',(attempt_start('practice','immediate',array['n1'])->>'attempt_id');
select attempt_confirm((select v::uuid from fsrs_t_state where k='n1'),'n1','A','confident',500); reset role;
insert into fsrs_t_state select 'ne1',id::text from fsrs_review_events where attempt_id=(select v::uuid from fsrs_t_state where k='n1');
select fsrs_t_process_initial((select v::uuid from fsrs_t_state where k='ne1'));
set role authenticated; select fsrs_t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access((select id from academy_members where lower(email)='resident.google@example.com'),false);
select fsrs_t_as('11111111-1111-1111-1111-111111111111');
select fsrs_t_expect_error('select fsrs_shadow_summary()','NOT_OWNER');
select fsrs_t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
insert into fsrs_t_state select 'summary',fsrs_shadow_summary()::text; reset role;
select fsrs_t_ok(((select v::jsonb from fsrs_t_state where k='summary')->>'active_scheduler')='sm2'
  and (((select v::jsonb from fsrs_t_state where k='summary')->'events'->>'national')::integer)>=1
  and (((select v::jsonb from fsrs_t_state where k='summary')->'events'->>'late_out_of_order')::integer)=2
  and not ((select v::jsonb from fsrs_t_state where k='summary') ?| array['user_id','question_id','question','selected','correct']),
  'owner aggregate is de-identified and labels SM2 active');

-- Immutable event/log rows reject even privileged mutation.
select fsrs_t_expect_error(format('update fsrs_review_events set answer_ms=1 where id=%L',(select v from fsrs_t_state where k='e1')),'FSRS_IMMUTABLE');
select fsrs_t_expect_error(format('delete from fsrs_review_logs where event_id=%L',(select v from fsrs_t_state where k='e1')),'FSRS_IMMUTABLE');

-- Leave exactly two same-card excluded events for the two-session lease test.
set role authenticated; select fsrs_t_as('22222222-2222-2222-2222-222222222222');
insert into fsrs_t_state select 'c1',(attempt_start('practice','immediate',array['qna'])->>'attempt_id');
select attempt_confirm((select v::uuid from fsrs_t_state where k='c1'),'qna','A','confident',100);
select pg_sleep(0.02);
insert into fsrs_t_state select 'c2',(attempt_start('practice','immediate',array['qna'])->>'attempt_id');
select attempt_confirm((select v::uuid from fsrs_t_state where k='c2'),'qna','B','hesitant',110); reset role;
select fsrs_t_ok((select count(*) from fsrs_processing_queue where status in ('pending','retry','processing'))=2,'exactly two concurrency events ready');

select 'FSRS SQL BEHAVIOUR TESTS PASSED' as result;
\echo FSRS SQL BEHAVIOUR TESTS PASSED
