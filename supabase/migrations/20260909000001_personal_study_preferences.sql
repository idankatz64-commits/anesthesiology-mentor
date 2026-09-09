-- User-owned planning preferences only; never edit profiles or progress.
create table public.study_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  start_date date not null check (start_date between date '2000-01-01' and date '2100-12-31'),
  mode text not null check (mode in ('quarterly', 'grouped', 'random')),
  chapters integer[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.study_preferences enable row level security;
revoke all on public.study_preferences from public, anon, authenticated;

create function public.study_preferences_read() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller(); _result jsonb;
begin
  select jsonb_build_object('start_date', start_date, 'mode', mode, 'chapters', chapters)
    into _result from public.study_preferences where user_id = _uid;
  return _result;
end $$;

create function public.study_preferences_save(_start_date date, _mode text, _chapters integer[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := public.attempt_caller();
begin
  if _start_date is null or _start_date not between date '2000-01-01' and date '2100-12-31'
    or _mode is null or _mode not in ('quarterly', 'grouped', 'random')
    or _chapters is null or cardinality(_chapters) > 500
    or exists (select 1 from unnest(_chapters) c where c is null or c < 1 or c > 1000)
    or cardinality(_chapters) <> (select count(distinct c) from unnest(_chapters) c)
  then raise exception 'INVALID_INPUT'; end if;
  insert into public.study_preferences(user_id, start_date, mode, chapters)
    values (_uid, _start_date, _mode, _chapters)
    on conflict (user_id) do update set start_date = excluded.start_date, mode = excluded.mode,
      chapters = excluded.chapters, updated_at = now();
  return public.study_preferences_read();
end $$;
revoke all on function public.study_preferences_read(), public.study_preferences_save(date, text, integer[]) from public, anon, authenticated;
grant execute on function public.study_preferences_read(), public.study_preferences_save(date, text, integer[]) to authenticated;
