-- Year of residency per academy member, so a member can be averaged against
-- their own year-cohort and not only against the whole group.
-- Nullable: existing members have no year until an admin fills it in.
-- Already applied to production via Supabase MCP on 2026-08-14.
alter table public.academy_members
  add column if not exists residency_year smallint
  constraint academy_members_residency_year_range check (residency_year is null or residency_year between 1 and 7);

comment on column public.academy_members.residency_year is
  'Year of residency (1-7), used to average a member against their own cohort year. Null = unknown.';
