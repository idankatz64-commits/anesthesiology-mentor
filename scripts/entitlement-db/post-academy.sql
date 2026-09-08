-- Runs after the academy migrations, before the entitlement migration: mirrors
-- Supabase's default table privileges (grant all to authenticated) and seeds
-- the roster the way an admin would have before this phase.
grant all on public.academy_members, public.quizzes, public.quiz_attempts to authenticated;
insert into public.academy_members (email, full_name, status) values
  ('Resident.Google@Example.com', 'Resident Google', 'active'),
  ('pw.unverified@example.com', 'Password Unverified', 'active'),
  ('pw.verified@example.com', 'Password Verified', 'active'),
  ('google.unconfirmed@example.com', 'Google Unconfirmed', 'active'),
  ('roster.only@example.com', 'Never Signed Up', 'active');

-- SIMULATED reproduction of the production is_approved (lockdown 2026-08-14,
-- not in this repo): admin · editor · active academy_members row · profiles.approved.
-- The attempts-db fixture only knows profiles; the entitlement tests need the
-- academy_members leg because residents get their approval from the roster.
create or replace function public.is_approved(_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = _uid and (p.approved or p.is_admin or p.is_editor))
      or exists (select 1 from public.admin_users a where a.id = _uid)
      or exists (select 1 from public.academy_members m where m.user_id = _uid and m.status = 'active')
$$;
