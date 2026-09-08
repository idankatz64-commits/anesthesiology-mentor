-- 8.9.2026 · Persisted FSRS 5.4.2 shadow processor.
-- SM-2 remains the active scheduler. This migration never updates
-- spaced_repetition.next_review_date and does not backfill historical answers.
-- Depends on durable attempts, resident entitlement and feedback editorial owner.

-- Immutable authoritative review events. Payload is derived only from frozen
-- attempt rows; processing state lives separately so the event never changes.
create table public.fsrs_review_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  user_id uuid not null,
  question_id text not null,
  attempt_id uuid not null references public.attempts(id),
  root_id uuid not null references public.attempt_roots(id),
  mode text not null check (mode in ('practice','exam')),
  feedback_timing text not null check (feedback_timing in ('immediate','end')),
  source text,
  source_class text not null check (source_class in ('open','national','unclassified')),
  confirmed_at timestamptz not null,
  is_correct boolean,
  confidence text check (confidence in ('confident','hesitant','guessed')),
  confidence_estimated boolean not null default false,
  answer_ms integer check (answer_ms is null or answer_ms between 0 and 86400000),
  prior_feedback_at timestamptz,
  feedback_exposed_before boolean not null,
  primary_eligible boolean not null,
  exclusion_reason text check (exclusion_reason in ('unscored','missing_confidence','estimated_confidence')),
  algorithm_version text not null default 'ts-fsrs@5.4.2' check (algorithm_version='ts-fsrs@5.4.2'),
  parameter_version text not null default 'default-r0.90-v1' check (parameter_version='default-r0.90-v1'),
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id),
  check (feedback_exposed_before = (prior_feedback_at is not null)),
  check (prior_feedback_at is null or prior_feedback_at < confirmed_at),
  check (primary_eligible = (is_correct is not null and confidence is not null and not confidence_estimated)),
  check ((primary_eligible and exclusion_reason is null) or (not primary_eligible and exclusion_reason is not null))
);
create index fsrs_review_events_card_order_idx on public.fsrs_review_events(user_id, question_id, confirmed_at, id);
create index fsrs_review_events_source_idx on public.fsrs_review_events(source_class, confirmed_at);

create table public.fsrs_processing_queue (
  event_id uuid primary key references public.fsrs_review_events(id),
  status text not null default 'pending' check (status in ('pending','processing','retry','processed','failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  claimed_state_revision integer,
  claimed_card jsonb,
  last_error text,
  processed_at timestamptz,
  check ((status='processing') = (lease_token is not null and lease_expires_at is not null and claimed_state_revision is not null and claimed_card is not null)),
  check ((status='processed') = (processed_at is not null))
);
create index fsrs_processing_queue_ready_idx on public.fsrs_processing_queue(status, available_at);

create table public.fsrs_card_states (
  user_id uuid not null,
  question_id text not null,
  algorithm_version text not null check (algorithm_version='ts-fsrs@5.4.2'),
  parameter_version text not null check (parameter_version='default-r0.90-v1'),
  parameters jsonb not null,
  card jsonb not null,
  due timestamptz not null,
  stability double precision not null check (stability > 0),
  difficulty double precision not null check (difficulty between 1 and 10),
  retrievability_at_review double precision check (retrievability_at_review between 0 and 1),
  review_count integer not null check (review_count > 0),
  last_event_id uuid not null unique references public.fsrs_review_events(id),
  last_review_at timestamptz not null,
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index fsrs_card_states_due_idx on public.fsrs_card_states(due);

create table public.fsrs_review_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.fsrs_review_events(id),
  user_id uuid not null,
  question_id text not null,
  algorithm_version text not null,
  parameter_version text not null,
  parameters jsonb not null,
  outcome text not null check (outcome in ('applied','excluded')),
  exclusion_reason text,
  rating integer check (rating between 1 and 4),
  previous_card jsonb not null,
  new_card jsonb not null,
  predicted_due timestamptz,
  retrievability_before double precision check (retrievability_before between 0 and 1),
  state_revision integer not null,
  processed_at timestamptz not null default now(),
  check ((outcome='applied' and exclusion_reason is null and rating is not null and predicted_due is not null)
      or (outcome='excluded' and exclusion_reason is not null and rating is null and predicted_due is null))
);
create index fsrs_review_logs_card_idx on public.fsrs_review_logs(user_id, question_id, processed_at);

alter table public.fsrs_review_events enable row level security;
alter table public.fsrs_processing_queue enable row level security;
alter table public.fsrs_card_states enable row level security;
alter table public.fsrs_review_logs enable row level security;
revoke all on public.fsrs_review_events, public.fsrs_processing_queue, public.fsrs_card_states, public.fsrs_review_logs
  from public, anon, authenticated;

create or replace function public.fsrs_reject_immutable_mutation() returns trigger
language plpgsql set search_path=public as $$
begin
  raise exception 'FSRS_IMMUTABLE';
end $$;
create trigger fsrs_review_events_immutable before update or delete on public.fsrs_review_events
  for each row execute function public.fsrs_reject_immutable_mutation();
create trigger fsrs_review_logs_immutable before update or delete on public.fsrs_review_logs
  for each row execute function public.fsrs_reject_immutable_mutation();

create or replace function public.fsrs_shadow_parameters() returns jsonb
language sql immutable set search_path=public as $$
  select jsonb_build_object(
    'request_retention',0.9,'maximum_interval',36500,'enable_fuzz',false,'enable_short_term',true,
    'learning_steps',jsonb_build_array('1m','10m'),'relearning_steps',jsonb_build_array('10m'),
    'w',to_jsonb(array[0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542]::double precision[])
  )
$$;

create or replace function public.fsrs_empty_card(_at timestamptz) returns jsonb
language sql immutable set search_path=public as $$
  select jsonb_build_object('due',to_char(date_trunc('milliseconds',_at) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'stability',0,'difficulty',0,'elapsed_days',0,'scheduled_days',0,'learning_steps',0,
    'reps',0,'lapses',0,'state',0,'last_review',null)
$$;

create or replace function public.fsrs_event_rating(_event public.fsrs_review_events) returns integer
language sql immutable set search_path=public as $$
  select case when not _event.primary_eligible then null
              when not _event.is_correct then 1
              when _event.confidence='guessed' then 2
              else 3 end
$$;

-- Derive one immutable event from the frozen attempt snapshot. The prior exposure
-- time is the actual earlier reveal: confirm time for immediate feedback and
-- submit time for end feedback. No arbitrary "rapid" threshold is invented.
create or replace function public.fsrs_enqueue_attempt_question(_attempt_id uuid, _question_id text) returns void
language plpgsql security definer set search_path=public as $$
declare
  _a public.attempts; _aq public.attempt_questions; _snapshot jsonb;
  _source text; _prior timestamptz; _event uuid; _reason text;
begin
  select * into _a from public.attempts where id=_attempt_id;
  select * into _aq from public.attempt_questions where attempt_id=_attempt_id and question_id=_question_id;
  if _a.id is null or _aq.attempt_id is null or _aq.confirmed_at is null then return; end if;
  select snapshot into _snapshot from public.question_snapshots where content_hash=_aq.content_hash;
  _source := _snapshot->>'source';

  select max(x.exposed_at) into _prior from (
    select case when pa.feedback_timing='immediate' then paq.confirmed_at
                when pa.status='submitted' then pa.submitted_at end as exposed_at
      from public.attempt_questions paq
      join public.attempts pa on pa.id=paq.attempt_id
     where pa.user_id=_a.user_id and paq.question_id=_question_id and paq.confirmed_at is not null
  ) x where x.exposed_at < _aq.confirmed_at;

  _reason := case when _aq.is_correct is null then 'unscored'
                  when _aq.confidence is null then 'missing_confidence' end;
  insert into public.fsrs_review_events(
    event_key,user_id,question_id,attempt_id,root_id,mode,feedback_timing,source,source_class,
    confirmed_at,is_correct,confidence,confidence_estimated,answer_ms,prior_feedback_at,
    feedback_exposed_before,primary_eligible,exclusion_reason
  ) values (
    _attempt_id::text || ':' || _question_id,_a.user_id,_question_id,_attempt_id,_a.root_id,_a.mode,_a.feedback_timing,
    _source,public.question_access_scope(_source),_aq.confirmed_at,_aq.is_correct,_aq.confidence,false,_aq.answer_ms,_prior,
    _prior is not null,_aq.is_correct is not null and _aq.confidence is not null,_reason
  ) on conflict (attempt_id,question_id) do nothing returning id into _event;
  if _event is not null then insert into public.fsrs_processing_queue(event_id) values (_event); end if;
end $$;

create or replace function public.fsrs_capture_confirmed_answer() returns trigger
language plpgsql security definer set search_path=public as $$
declare _a public.attempts;
begin
  if new.confirmed_at is null then return new; end if;
  select * into _a from public.attempts where id=new.attempt_id;
  -- End-feedback exams remain editable until submit; capture only their final row.
  if _a.mode='exam' and _a.feedback_timing='end' and _a.status<>'submitted' then return new; end if;
  perform public.fsrs_enqueue_attempt_question(new.attempt_id,new.question_id);
  return new;
end $$;
create trigger fsrs_capture_confirmed_answer after insert or update on public.attempt_questions
  for each row execute function public.fsrs_capture_confirmed_answer();

create or replace function public.fsrs_capture_submitted_attempt() returns trigger
language plpgsql security definer set search_path=public as $$
declare _q record;
begin
  if new.status='submitted' and old.status is distinct from 'submitted' then
    for _q in select question_id from public.attempt_questions where attempt_id=new.id and confirmed_at is not null loop
      perform public.fsrs_enqueue_attempt_question(new.id,_q.question_id);
    end loop;
  end if;
  return new;
end $$;
create trigger fsrs_capture_submitted_attempt after update of status on public.attempts
  for each row execute function public.fsrs_capture_submitted_attempt();

-- Service-role worker API. The Edge Function authenticates the editorial owner
-- first, then uses its server-only key. Browsers receive no table or worker RPC grant.
create or replace function public.fsrs_worker_claim(_limit integer default 25) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  _r record; _token uuid; _state public.fsrs_card_states; _card jsonb;
  _revision integer; _log_id uuid; _out jsonb := '[]'::jsonb;
begin
  if _limit is null or _limit < 1 or _limit > 50 then raise exception 'INVALID_LIMIT'; end if;
  update public.fsrs_processing_queue
     set status='failed', lease_token=null, lease_expires_at=null, claimed_state_revision=null, claimed_card=null,
         last_error=coalesce(last_error,'LEASE_EXHAUSTED')
   where status='processing' and lease_expires_at<=now() and attempt_count>=5;

  for _r in
    select e.*, q.attempt_count
      from public.fsrs_processing_queue q join public.fsrs_review_events e on e.id=q.event_id
     where ((q.status in ('pending','retry') and q.available_at<=now())
            or (q.status='processing' and q.lease_expires_at<=now() and q.attempt_count<5))
       and not exists (
         select 1 from public.fsrs_review_events earlier
         join public.fsrs_processing_queue eq on eq.event_id=earlier.id
          where earlier.user_id=e.user_id and earlier.question_id=e.question_id
            and (earlier.confirmed_at,earlier.id) < (e.confirmed_at,e.id)
            and eq.status<>'processed'
       )
     order by e.confirmed_at,e.id
     for update of q skip locked limit _limit
  loop
    select * into _state from public.fsrs_card_states
     where user_id=_r.user_id and question_id=_r.question_id;
    _revision := coalesce(_state.revision,0);
    -- A delayed end-feedback submission can insert an older primary event after
    -- a newer state was already applied. Keep that source event immutable, but
    -- quarantine it before any library calculation or card mutation. UUID is
    -- the deterministic secondary order for equal confirmation timestamps.
    if _r.primary_eligible and _state.user_id is not null
       and (_r.confirmed_at,_r.id) <= (_state.last_review_at,_state.last_event_id) then
      insert into public.fsrs_review_logs(event_id,user_id,question_id,algorithm_version,parameter_version,parameters,
        outcome,exclusion_reason,rating,previous_card,new_card,predicted_due,retrievability_before,state_revision)
      values (_r.id,_r.user_id,_r.question_id,_r.algorithm_version,_r.parameter_version,public.fsrs_shadow_parameters(),
        'excluded','late_out_of_order',null,_state.card,_state.card,null,null,_state.revision)
      returning id into _log_id;
      update public.fsrs_processing_queue set status='processed',processed_at=now(),last_error='LATE_OUT_OF_ORDER',
        lease_token=null,lease_expires_at=null,claimed_state_revision=null,claimed_card=null where event_id=_r.id;
      continue;
    end if;
    _card := _state.card;
    _card := coalesce(_card,public.fsrs_empty_card(_r.confirmed_at));
    _token := gen_random_uuid();
    update public.fsrs_processing_queue set status='processing',attempt_count=attempt_count+1,
      lease_token=_token,lease_expires_at=now()+interval '2 minutes',claimed_state_revision=_revision,
      claimed_card=_card,last_error=null,processed_at=null where event_id=_r.id;
    _out := _out || jsonb_build_array(jsonb_build_object(
      'event_id',_r.id,'lease_token',_token,'user_id',_r.user_id,'question_id',_r.question_id,
      -- JavaScript Date has millisecond precision. Keep the immutable source
      -- timestamp exact, but make the processor contract explicitly millisecond.
      'confirmed_at',date_trunc('milliseconds',_r.confirmed_at),'is_correct',_r.is_correct,'confidence',_r.confidence,
      'confidence_estimated',_r.confidence_estimated,'primary_eligible',_r.primary_eligible,
      'exclusion_reason',_r.exclusion_reason,'feedback_exposed_before',_r.feedback_exposed_before,
      'prior_feedback_at',_r.prior_feedback_at,'answer_ms',_r.answer_ms,
      'algorithm_version',_r.algorithm_version,'parameter_version',_r.parameter_version,
      'parameters',public.fsrs_shadow_parameters(),'previous_card',_card,'state_revision',_revision
    ));
  end loop;
  return _out;
end $$;

create or replace function public.fsrs_worker_exclude(_event_id uuid,_lease_token uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare _q public.fsrs_processing_queue; _e public.fsrs_review_events; _id uuid;
begin
  select * into _q from public.fsrs_processing_queue where event_id=_event_id for update;
  if _q.status='processed' then return jsonb_build_object('event_id',_event_id,'status','processed'); end if;
  if _q.status<>'processing' or _q.lease_token is distinct from _lease_token or _q.lease_expires_at<=now() then raise exception 'LEASE_MISMATCH'; end if;
  select * into _e from public.fsrs_review_events where id=_event_id;
  if _e.primary_eligible or _e.exclusion_reason is null then raise exception 'EVENT_IS_ELIGIBLE'; end if;
  insert into public.fsrs_review_logs(event_id,user_id,question_id,algorithm_version,parameter_version,parameters,
    outcome,exclusion_reason,rating,previous_card,new_card,predicted_due,retrievability_before,state_revision)
  values (_e.id,_e.user_id,_e.question_id,_e.algorithm_version,_e.parameter_version,public.fsrs_shadow_parameters(),
    'excluded',_e.exclusion_reason,null,_q.claimed_card,_q.claimed_card,null,null,_q.claimed_state_revision)
  returning id into _id;
  update public.fsrs_processing_queue set status='processed',processed_at=now(),lease_token=null,lease_expires_at=null,
    claimed_state_revision=null,claimed_card=null where event_id=_event_id;
  return jsonb_build_object('event_id',_event_id,'log_id',_id,'status','excluded');
end $$;

create or replace function public.fsrs_worker_commit(_event_id uuid,_lease_token uuid,_result jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  _q public.fsrs_processing_queue; _e public.fsrs_review_events; _state public.fsrs_card_states;
  _rating integer; _reported_rating integer; _new jsonb; _due timestamptz; _predicted_due timestamptz;
  _last timestamptz; _stability double precision; _difficulty double precision; _retrievability double precision;
  _elapsed integer; _scheduled integer; _learning_steps integer; _reps integer; _lapses integer; _card_state integer;
  _revision integer; _id uuid;
begin
  if _result is null or jsonb_typeof(_result)<>'object' then raise exception 'INVALID_RESULT'; end if;
  select * into _q from public.fsrs_processing_queue where event_id=_event_id for update;
  if _q.status='processed' then return jsonb_build_object('event_id',_event_id,'status','processed'); end if;
  if _q.status<>'processing' or _q.lease_token is distinct from _lease_token or _q.lease_expires_at<=now() then raise exception 'LEASE_MISMATCH'; end if;
  select * into _e from public.fsrs_review_events where id=_event_id;
  if not _e.primary_eligible then raise exception 'EVENT_IS_EXCLUDED'; end if;
  select * into _state from public.fsrs_card_states where user_id=_e.user_id and question_id=_e.question_id for update;
  _revision := coalesce(_state.revision,0);
  if _revision<>_q.claimed_state_revision then raise exception 'STALE_STATE'; end if;
  _rating := public.fsrs_event_rating(_e);
  _new := _result->'new_card';
  begin
    _reported_rating := (_result->>'rating')::integer;
    _due := (_new->>'due')::timestamptz; _last := (_new->>'last_review')::timestamptz;
    _predicted_due := (_result->>'predicted_due')::timestamptz;
    _stability := (_new->>'stability')::double precision; _difficulty := (_new->>'difficulty')::double precision;
    _elapsed := (_new->>'elapsed_days')::integer; _scheduled := (_new->>'scheduled_days')::integer;
    _learning_steps := (_new->>'learning_steps')::integer;
    _reps := (_new->>'reps')::integer; _lapses := (_new->>'lapses')::integer; _card_state := (_new->>'state')::integer;
    _retrievability := case when _result->>'retrievability_before' is null then null else (_result->>'retrievability_before')::double precision end;
  exception when others then raise exception 'INVALID_RESULT'; end;

  if (_result->>'algorithm_version') is distinct from 'ts-fsrs@5.4.2'
     or (_result->>'parameter_version') is distinct from 'default-r0.90-v1'
     or (_result->'parameters') is distinct from public.fsrs_shadow_parameters()
     or _reported_rating is distinct from _rating
     or (_result->'previous_card') is distinct from _q.claimed_card
     or jsonb_typeof(_new)<>'object'
     or _due is distinct from _predicted_due
     or _due<=date_trunc('milliseconds',_e.confirmed_at)
     or _last is distinct from date_trunc('milliseconds',_e.confirmed_at)
     or _stability::text in ('NaN','Infinity','-Infinity') or _stability<=0
     or _difficulty::text in ('NaN','Infinity','-Infinity') or _difficulty<1 or _difficulty>10
     or _elapsed<0 or _scheduled<0 or _learning_steps<0
     or _reps<>coalesce((_q.claimed_card->>'reps')::integer,0)+1
     or _lapses<coalesce((_q.claimed_card->>'lapses')::integer,0)
     or _card_state not between 0 and 3
     or ((_q.claimed_card->>'state')::integer=0 and _retrievability is not null)
     or ((_q.claimed_card->>'state')::integer<>0 and _retrievability is null)
     or (_retrievability is not null and (_retrievability::text in ('NaN','Infinity','-Infinity') or _retrievability<0 or _retrievability>1)) then
    raise exception 'INVALID_RESULT';
  end if;

  insert into public.fsrs_review_logs(event_id,user_id,question_id,algorithm_version,parameter_version,parameters,
    outcome,exclusion_reason,rating,previous_card,new_card,predicted_due,retrievability_before,state_revision)
  values (_e.id,_e.user_id,_e.question_id,_e.algorithm_version,_e.parameter_version,public.fsrs_shadow_parameters(),
    'applied',null,_rating,_q.claimed_card,_new,_due,_retrievability,_revision+1) returning id into _id;
  insert into public.fsrs_card_states(user_id,question_id,algorithm_version,parameter_version,parameters,card,due,
    stability,difficulty,retrievability_at_review,review_count,last_event_id,last_review_at,revision)
  values (_e.user_id,_e.question_id,_e.algorithm_version,_e.parameter_version,public.fsrs_shadow_parameters(),_new,_due,
    _stability,_difficulty,_retrievability,_reps,_e.id,_e.confirmed_at,_revision+1)
  on conflict (user_id,question_id) do update set algorithm_version=excluded.algorithm_version,
    parameter_version=excluded.parameter_version,parameters=excluded.parameters,card=excluded.card,due=excluded.due,
    stability=excluded.stability,difficulty=excluded.difficulty,retrievability_at_review=excluded.retrievability_at_review,
    review_count=excluded.review_count,last_event_id=excluded.last_event_id,last_review_at=excluded.last_review_at,
    revision=excluded.revision,updated_at=now();
  update public.fsrs_processing_queue set status='processed',processed_at=now(),lease_token=null,lease_expires_at=null,
    claimed_state_revision=null,claimed_card=null where event_id=_event_id;
  return jsonb_build_object('event_id',_event_id,'log_id',_id,'status','applied','revision',_revision+1);
end $$;

create or replace function public.fsrs_worker_fail(_event_id uuid,_lease_token uuid,_error_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare _q public.fsrs_processing_queue; _status text; _delay integer;
begin
  if _error_code is null or _error_code!~'^[A-Z0-9_:-]{1,120}$' then _error_code:='PROCESSOR_ERROR'; end if;
  select * into _q from public.fsrs_processing_queue where event_id=_event_id for update;
  if _q.status='processed' then return jsonb_build_object('event_id',_event_id,'status','processed'); end if;
  if _q.status<>'processing' or _q.lease_token is distinct from _lease_token or _q.lease_expires_at<=now() then raise exception 'LEASE_MISMATCH'; end if;
  _status := case when _q.attempt_count>=5 then 'failed' else 'retry' end;
  _delay := least(900,15*(2^greatest(_q.attempt_count-1,0))::integer);
  update public.fsrs_processing_queue set status=_status,available_at=now()+make_interval(secs=>_delay),
    lease_token=null,lease_expires_at=null,claimed_state_revision=null,claimed_card=null,last_error=_error_code
   where event_id=_event_id;
  return jsonb_build_object('event_id',_event_id,'status',_status,'retry_after_seconds',_delay);
end $$;

create or replace function public.fsrs_shadow_retry_failed() returns integer
language plpgsql security definer set search_path=public as $$
declare _uid uuid:=public.feedback_owner_caller(); _count integer;
begin
  update public.fsrs_processing_queue set status='retry',attempt_count=0,available_at=now(),last_error=null
   where event_id in (select event_id from public.fsrs_processing_queue where status='failed' order by event_id limit 100);
  get diagnostics _count=row_count; return _count;
end $$;

-- Owner-only aggregate: no identities, question bodies, answer keys or explanations.
create or replace function public.fsrs_shadow_summary() returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare _uid uuid:=public.feedback_owner_caller(); _out jsonb;
begin
  select jsonb_build_object(
    'active_scheduler','sm2','shadow_algorithm','ts-fsrs@5.4.2','parameter_version','default-r0.90-v1',
    'events',jsonb_build_object(
      'total',count(*),'eligible',count(*) filter(where e.primary_eligible),
      'excluded',count(*) filter(where not e.primary_eligible),
      'unscored',count(*) filter(where e.exclusion_reason='unscored'),
      'missing_confidence',count(*) filter(where e.exclusion_reason='missing_confidence'),
      'estimated_confidence',count(*) filter(where e.exclusion_reason='estimated_confidence'),
      'late_out_of_order',count(*) filter(where l.exclusion_reason='late_out_of_order'),
      'after_prior_feedback',count(*) filter(where e.feedback_exposed_before),
      'national',count(*) filter(where e.source_class='national'),
      'first_confirmed_at',min(e.confirmed_at),'last_confirmed_at',max(e.confirmed_at)),
    'processing',jsonb_build_object(
      'pending',count(*) filter(where q.status in ('pending','retry')),
      'processing',count(*) filter(where q.status='processing'),
      'processed',count(*) filter(where q.status='processed'),
      'failed',count(*) filter(where q.status='failed')),
    'comparison',(select jsonb_build_object(
      'fsrs_cards',count(*),'cards_with_sm2',count(sm2.user_id),
      'fsrs_earlier',count(*) filter(where s.due::date<sm2.next_review_date),
      'same_date',count(*) filter(where s.due::date=sm2.next_review_date),
      'fsrs_later',count(*) filter(where s.due::date>sm2.next_review_date),
      'mean_delta_days',round(avg((s.due::date-sm2.next_review_date)::numeric),2))
      from public.fsrs_card_states s left join public.spaced_repetition sm2
        on sm2.user_id=s.user_id and sm2.question_id=s.question_id),
    'limitations',jsonb_build_array(
      'Shadow only: SM-2 remains authoritative','Default parameters, not personal calibration',
      'Sparse events and post-feedback events are reported separately',
      'Late or out-of-order events are retained but quarantined without changing FSRS or SM-2',
      'No exam-pass probability is computed')
  ) into _out from public.fsrs_review_events e
    left join public.fsrs_processing_queue q on q.event_id=e.id
    left join public.fsrs_review_logs l on l.event_id=e.id;
  return _out;
end $$;

revoke all on function public.fsrs_reject_immutable_mutation() from public,anon,authenticated;
revoke all on function public.fsrs_shadow_parameters() from public,anon,authenticated;
revoke all on function public.fsrs_empty_card(timestamptz) from public,anon,authenticated;
revoke all on function public.fsrs_event_rating(public.fsrs_review_events) from public,anon,authenticated;
revoke all on function public.fsrs_enqueue_attempt_question(uuid,text) from public,anon,authenticated;
revoke all on function public.fsrs_capture_confirmed_answer() from public,anon,authenticated;
revoke all on function public.fsrs_capture_submitted_attempt() from public,anon,authenticated;
revoke all on function public.fsrs_worker_claim(integer) from public,anon,authenticated;
revoke all on function public.fsrs_worker_exclude(uuid,uuid) from public,anon,authenticated;
revoke all on function public.fsrs_worker_commit(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.fsrs_worker_fail(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.fsrs_shadow_retry_failed() from public,anon;
revoke all on function public.fsrs_shadow_summary() from public,anon;
grant execute on function public.fsrs_worker_claim(integer),public.fsrs_worker_exclude(uuid,uuid),
  public.fsrs_worker_commit(uuid,uuid,jsonb),public.fsrs_worker_fail(uuid,uuid,text) to service_role;
grant execute on function public.fsrs_shadow_retry_failed(),public.fsrs_shadow_summary() to authenticated;
