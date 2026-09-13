-- Email OTP for existing auto-confirmed accounts. Supabase routes email OTP
-- for existing users through its recovery-token verifier. A sent email alone
-- is NOT ownership proof: require its token to have been consumed and an OTP
-- authentication recorded by Auth after that email was sent and confirmed.
-- New signup OTP and existing Google proof keep their previous checks.
-- No accounts, approvals, roster rows, credentials or learning data are changed.
create or replace function public.resident_verified_email(_uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select lower(btrim(u.email))
    from auth.users u
   where u.id = _uid and u.email is not null and u.email_confirmed_at is not null
     and exists (
       select 1 from auth.identities i
        where i.user_id = u.id
          and lower(btrim(i.identity_data->>'email')) = lower(btrim(u.email))
          and (i.provider = 'google'
               or (i.provider = 'email' and (
                 (u.confirmation_sent_at is not null and u.email_confirmed_at >= u.confirmation_sent_at)
                 or (u.recovery_sent_at is not null and u.recovery_token = ''
                     and exists (
                       select 1 from auth.sessions s
                       join auth.mfa_amr_claims a on a.session_id = s.id
                        where s.user_id = u.id and a.authentication_method = 'otp'
                          and a.created_at >= u.recovery_sent_at
                          and a.created_at >= u.email_confirmed_at
                     ))))))
$$;
