-- Shared assertion helpers for the integrity suite. Same shapes as the
-- attempts-db / entitlement-db harnesses so a failure reads identically.
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
-- attempt_questions has no client grant by design; inspect through a definer.
create or replace function public.t_aq() returns setof public.attempt_questions language sql security definer as $$ select * from public.attempt_questions $$;
create or replace function public.t_member(_email text) returns public.academy_members language sql security definer as $$
  select * from public.academy_members where lower(btrim(email)) = lower(btrim(_email))
$$;

-- Opens a practice/deferred attempt over q1+q2, confirms q1 correctly, and
-- returns the replay of that identical confirmation. This is the single call
-- F-2 is about: same arguments, second time.
create or replace function public.t_deferred_replay(_mode text, _timing text) returns jsonb language plpgsql as $$
declare _a uuid; _first jsonb; _replay jsonb;
begin
  _a := (public.attempt_start(_mode, _timing, array['q1','q2']))->>'attempt_id';
  _first  := public.attempt_confirm(_a, 'q1', 'A', 'confident', 4200);
  _replay := public.attempt_confirm(_a, 'q1', 'A', 'confident', 4200);
  return jsonb_build_object('attempt_id', _a, 'first', _first, 'replay', _replay);
end $$;
