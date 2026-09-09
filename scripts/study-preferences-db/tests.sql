-- QA only. Run as database administrator; every write rolls back.
begin;
do $$
declare ids uuid[];
begin
  select array_agg(id) into ids from (select id from auth.users where public.is_approved(id) order by id limit 2) u;
  if cardinality(ids) <> 2 then raise exception 'Need two approved QA identities'; end if;
  perform set_config('ysnp_test.a', ids[1]::text, true);
  perform set_config('ysnp_test.b', ids[2]::text, true);
end $$;
set local role authenticated;
do $$
declare original_b jsonb; result jsonb; failed boolean;
begin
  if has_table_privilege('authenticated', 'public.study_preferences', 'SELECT') or has_table_privilege('authenticated', 'public.study_preferences', 'UPDATE') then raise exception 'Direct table grants'; end if;
  if has_function_privilege('anon', 'public.study_preferences_read()', 'EXECUTE') then raise exception 'Anonymous RPC grant'; end if;
  perform set_config('request.jwt.claim.sub', current_setting('ysnp_test.b'), true);
  original_b := public.study_preferences_read();
  perform set_config('request.jwt.claim.sub', current_setting('ysnp_test.a'), true);
  result := public.study_preferences_save('2024-01-31', 'grouped', array[9,54]);
  if result->>'start_date' <> '2024-01-31' or result->>'mode' <> 'grouped' or result->'chapters' <> '[9,54]'::jsonb then raise exception 'Save roundtrip'; end if;
  if public.study_preferences_read() is distinct from result then raise exception 'Read roundtrip'; end if;
  perform set_config('request.jwt.claim.sub', current_setting('ysnp_test.b'), true);
  if public.study_preferences_read() is distinct from original_b then raise exception 'Cross-user leak'; end if;
  perform set_config('request.jwt.claim.sub', current_setting('ysnp_test.a'), true);
  failed := false;
  begin perform public.study_preferences_save('2024-01-31', 'grouped', array[9,9]); exception when others then if sqlerrm = 'INVALID_INPUT' then failed := true; else raise; end if; end;
  if not failed then raise exception 'Duplicate input accepted'; end if;
  failed := false;
  begin perform public.study_preferences_save('2024-01-31', 'bad', array[]::integer[]); exception when others then if sqlerrm = 'INVALID_INPUT' then failed := true; else raise; end if; end;
  if not failed then raise exception 'Invalid mode accepted'; end if;
  perform public.study_preferences_save('2024-01-31', 'random', array[]::integer[]);
  perform set_config('request.jwt.claim.sub', '', true);
  failed := false;
  begin perform public.study_preferences_read(); exception when others then if sqlerrm = 'NOT_AUTHENTICATED' then failed := true; else raise; end if; end;
  if not failed then raise exception 'Anonymous read accepted'; end if;
end $$;
rollback;
select 'PASS: roundtrip, identity isolation, private table, anonymous denial, bounded inputs; all writes rolled back' as result;
