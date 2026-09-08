-- Synthetic stand-ins for the auth/admin objects the resident-entitlement
-- migration depends on. Loaded AFTER scripts/attempts-db/fixtures.sql, BEFORE
-- the academy + durable-attempts + entitlement migrations.
-- Test cluster only (127.0.0.1:55439). Never run against production.
--
-- SIMULATED: auth.users / auth.identities are minimal shapes of the Supabase
-- Auth tables. Every assertion that depends on them is a simulation until the
-- same tests run on a real Supabase staging project.

create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  confirmation_sent_at timestamptz
);
create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  identity_data jsonb not null default '{}'::jsonb
);

-- auth.jwt(): tests set the full claims JSON through request.jwt.claims;
-- `sub` always mirrors request.jwt.claim.sub so auth.uid() and the JWT agree.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
      || jsonb_build_object('sub', current_setting('request.jwt.claim.sub', true))
$$;

-- production shape (admin_users + is_admin from 20260224211426). The `role`
-- column exists in production (src/integrations/supabase/types.ts: text, nullable;
-- no repo migration adds it). admin-manage-users writes role 'admin' | 'editor'
-- and treats a missing role as 'editor'. is_admin() ignores role: EVERY row,
-- editors included, is a broad admin. That is the production behaviour under test.
create table public.admin_users (id uuid primary key, email text, role text);
create or replace function public.is_admin(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where id = _user_id)
$$;
grant select on public.admin_users to authenticated;
alter table public.admin_users enable row level security;
create policy "Users can check own admin status" on public.admin_users for select to authenticated using (id = auth.uid());

-- profiles: production also carries display_name; the harness profile row is enough.
-- users: 1111/2222 approved (profiles), 3333 pending, 4444 admin, 5555 editor,
-- 6666.. residents whose approval comes ONLY from a linked active roster row.
insert into public.profiles (id, approved, is_admin, is_editor) values
  ('44444444-4444-4444-4444-444444444444', true, true, false),
  ('55555555-5555-5555-5555-555555555555', true, false, true),
  ('66666666-6666-6666-6666-666666666666', false, false, false),
  ('77777777-7777-7777-7777-777777777777', false, false, false),
  ('88888888-8888-8888-8888-888888888888', false, false, false),
  ('99999999-9999-9999-9999-999999999999', false, false, false),
  ('10101010-1010-1010-1010-101010101010', false, false, false),
  ('12121212-1212-1212-1212-121212121212', false, false, false);
-- 4444 real admin · 5555 editor (in admin_users, as production stores editors;
-- profiles.is_editor kept as well — the documented three-way admin storage) ·
-- 1313 legacy row with NULL role (what the edge function treats as an editor).
insert into public.admin_users (id, email, role) values
  ('44444444-4444-4444-4444-444444444444', 'admin@example.com', 'admin'),
  ('55555555-5555-5555-5555-555555555555', 'editor@example.com', 'editor'),
  ('13131313-1313-1313-1313-131313131313', 'nullrole@example.com', null);

insert into auth.users (id, email, email_confirmed_at, confirmation_sent_at) values
  ('11111111-1111-1111-1111-111111111111', 'plain1@example.com', now(), now() - interval '1 hour'),
  ('22222222-2222-2222-2222-222222222222', 'plain2@example.com', now(), now() - interval '1 hour'),
  ('33333333-3333-3333-3333-333333333333', 'pending@example.com', now(), now() - interval '1 hour'),
  ('44444444-4444-4444-4444-444444444444', 'admin@example.com', now(), now() - interval '1 hour'),
  ('55555555-5555-5555-5555-555555555555', 'editor@example.com', now(), now() - interval '1 hour'),
  -- Google sign-in, confirmed
  ('66666666-6666-6666-6666-666666666666', 'Resident.Google@Example.com', now(), null),
  -- password sign-up under autoconfirm: email_confirmed_at is set although no
  -- confirmation mail was ever sent, so ownership was never proven
  ('77777777-7777-7777-7777-777777777777', 'pw.unverified@example.com', now(), null),
  -- password sign-up that really confirmed the address (mail sent, then clicked)
  ('88888888-8888-8888-8888-888888888888', 'pw.verified@example.com', now(), now() - interval '1 hour'),
  -- Google identity but no confirmation on the auth row
  ('99999999-9999-9999-9999-999999999999', 'google.unconfirmed@example.com', null, null),
  -- verified password user whose JWT will lie about its email
  ('10101010-1010-1010-1010-101010101010', 'honest@example.com', now(), now() - interval '1 hour'),
  -- second Google user whose address equals resident 6666's roster row
  ('12121212-1212-1212-1212-121212121212', 'resident.google@example.com', now(), null);
insert into auth.identities (user_id, provider, identity_data) values
  ('66666666-6666-6666-6666-666666666666', 'google', '{"email":"resident.google@example.com","email_verified":true}'),
  ('77777777-7777-7777-7777-777777777777', 'email',  '{"email":"pw.unverified@example.com","email_verified":false}'),
  ('88888888-8888-8888-8888-888888888888', 'email',  '{"email":"pw.verified@example.com","email_verified":true}'),
  ('99999999-9999-9999-9999-999999999999', 'google', '{"email":"google.unconfirmed@example.com","email_verified":true}'),
  ('10101010-1010-1010-1010-101010101010', 'email',  '{"email":"honest@example.com","email_verified":true}'),
  ('12121212-1212-1212-1212-121212121212', 'google', '{"email":"resident.google@example.com","email_verified":true}');

-- questions: the base fixture leaves `source` null. Give the shared questions a
-- named (open) source, then add national / ambiguous / blank ones.
update public.questions set source = 'בית חולים סינתטי';
insert into public.questions (id, ref_id, question, a, b, c, d, correct, explanation, topic, chapter, source, kind) values
  ('n1', 'n1', 'national synthetic 1', 'alef', 'bet', 'gimel', 'dalet', 'A', 'national explanation 1', 'Demo topic', 1, 'ארצי', 'test'),
  ('n2', 'n2', 'national synthetic 2', 'alef', 'bet', 'gimel', 'dalet', 'B', 'national explanation 2', 'Demo topic', 1, 'ארצי', 'sim'),
  ('amb1', 'amb1', 'ambiguous source', 'alef', 'bet', 'gimel', 'dalet', 'C', 'ambiguous explanation', 'Demo topic', 1, 'ארצי 2019', 'test'),
  ('blank1', 'blank1', 'blank source', 'alef', 'bet', 'gimel', 'dalet', 'D', 'blank explanation', 'Demo topic', 1, null, 'test');

-- Supabase grants schema usage + uid()/jwt() to the API roles; auth.users and
-- auth.identities stay unreadable to them (as in production).
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
