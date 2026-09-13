-- Only run against the synthetic local ysnp_entitlement_test database.
\set ON_ERROR_STOP on
begin;
alter table auth.users add column recovery_sent_at timestamptz, add column recovery_token text;
create table auth.sessions(id uuid primary key, user_id uuid not null);
create table auth.mfa_amr_claims(session_id uuid not null, authentication_method text, created_at timestamptz);
\ir ../../supabase/migrations/20260913000001_resident_email_otp.sql

do $$
declare uid uuid := '13131313-aaaa-4000-8000-000000000001'; sid uuid := '13131313-bbbb-4000-8000-000000000001';
begin
  insert into auth.users(id,email,email_confirmed_at,recovery_token) values(uid,'otp@example.com',now()-interval '2 days','');
  insert into auth.identities(user_id,provider,identity_data) values(uid,'email','{"email":"otp@example.com","email_verified":false}');
  if public.resident_verified_email(uid) is not null then raise exception 'auto-confirm alone accepted'; end if;
  update auth.users set recovery_sent_at=now()-interval '1 minute',recovery_token='unconsumed' where id=uid;
  insert into auth.sessions values(sid,uid);
  insert into auth.mfa_amr_claims values(sid,'password',now());
  if public.resident_verified_email(uid) is not null then raise exception 'sent mail plus password accepted'; end if;
  update auth.mfa_amr_claims set authentication_method='otp' where session_id=sid;
  if public.resident_verified_email(uid) is not null then raise exception 'unconsumed email token plus other OTP accepted'; end if;
  update auth.users set recovery_token='' where id=uid;
  if public.resident_verified_email(uid) is distinct from 'otp@example.com' then raise exception 'completed email OTP rejected'; end if;
  insert into public.academy_members(email,full_name,access_level,status) values('otp@example.com','Synthetic OTP','full','active');
  perform set_config('request.jwt.claim.sub',uid::text,true);
  perform public.claim_academy_membership();
  if not public.is_approved(uid) then raise exception 'matching roster not linked'; end if;
  if public.readable_scopes(uid) is distinct from array['open']::text[] then raise exception 'OTP broadened national/admin entitlement'; end if;
  update auth.users set recovery_sent_at=now()+interval '1 minute',recovery_token='new-request' where id=uid;
  if public.resident_verified_email(uid) is not null then raise exception 'resend did not require new proof'; end if;
  if not public.is_approved(uid) then raise exception 'resend revoked established roster access'; end if;
  update auth.users set recovery_sent_at=now()-interval '1 minute',recovery_token='',email_confirmed_at=now()+interval '1 minute' where id=uid;
  if public.resident_verified_email(uid) is not null then raise exception 'old OTP accepted for newer email confirmation'; end if;
  update auth.users set email_confirmed_at=now()-interval '2 days' where id=uid;
  update auth.sessions set user_id='13131313-aaaa-4000-8000-000000000002' where id=sid;
  if public.resident_verified_email(uid) is not null then raise exception 'another users OTP accepted'; end if;
  update auth.sessions set user_id=uid where id=sid;
  update auth.identities set identity_data='{"email":"other@example.com"}' where user_id=uid;
  if public.resident_verified_email(uid) is not null then raise exception 'identity mismatch accepted'; end if;
  if has_function_privilege('anon','public.resident_verified_email(uuid)','execute') or has_function_privilege('authenticated','public.resident_verified_email(uuid)','execute') then raise exception 'private helper exposed'; end if;
  raise notice 'PASS: OTP proof, unverified/password/SMS-like rejection, roster linking, entitlement preservation, resend, changed email, cross-user, identity mismatch, helper privileges';
end $$;
rollback;
