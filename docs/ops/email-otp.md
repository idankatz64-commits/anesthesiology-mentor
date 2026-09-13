# Email OTP migration — 2026-09-13

Status: deployed to LIVE on 2026-09-13. The private helper and both email templates are installed; public Auth settings confirm `mailer_autoconfirm=false`. Four authorized test emails were received in the owner's Gmail inbox: two QA and two LIVE. New and returning account OTP login succeeded in both environments. No trainee emails were sent.

Verified on 2026-09-13: 691 tests across 86 files passed; TypeScript, changed-source ESLint (zero errors, four existing AppContext warnings), production build and synthetic SQL checks passed. The updated three-page Hebrew guide was visually inspected. QA uses six-digit codes and a 3,600-second expiry; the real LIVE messages used eight-digit codes, accepted by the UI. Browser responsive capture remained unreliable, so narrow-screen visual acceptance is still pending.

Hosted QA revealed a second race: resident state could be read before the membership claim completed, leaving a stale NOT_LINKED screen. A failing regression test reproduced it. `loadResident` now re-reads after a successful bounded pending claim, retaining generation guards and server authorization. Independent review passed, and the hosted QA retry reached onboarding automatically without clicking refresh.

LIVE evidence: deployment `dpl_8APMsCHTHJzd6S6pk3s3P5yC4w14` is Ready at https://anesthesiology-mentor.vercel.app. Bundle `index-CTopAONv.js` SHA-256 `ff0c81f5066aa357dc12563c24d297ba007ca2a5e07a9d07d5fc489db463731d` matches the local prebuilt artifact. Both feature flags were explicitly true during build; the bundle contains the LIVE ref and no QA ref. Source commits: `e27ca35` and `86b6b00`, pushed to the existing branch.

QA simulated the previously auto-confirmed condition only on the controlled test account, then verified a real subsequent email OTP and automatic matching-roster linkage with only `open` scope. LIVE new-user state had no confirmed email or session before OTP; both successful logins retained the same test account ID. Reuse of a consumed LIVE code returned 403/otp_expired. The original 37 LIVE user IDs have the same hash before/after; only the controlled LIVE test account was added, without learning approval. No real account was manually verified or linked.

Remaining acceptance limits: individual affected trainees have not yet tried the new method; address mismatches still need identity review; a Google-only identity transition was not exercised with a real mailbox; mobile visual acceptance remains open. These limits do not mean those flows failed, and successful synthetic accounts do not prove every user's mailbox delivers.

## User journey

Existing and new users enter their email, receive a single-use code, and enter it in the same screen. Existing users must use their original address, including Google users, to retain their account and learning history. New users do not choose a password. Existing sessions continue working. The notice appears on the home, onboarding and admin screens; the guide and PDF explain the change. Old reset-password URLs lead to the new flow.

Authentication does not grant learning permissions. The existing roster, approval and content-scope checks remain. A verified matching roster email can claim its membership; mismatched addresses require identity review. Never merge accounts or mark real users verified to resolve an address mismatch.

No existing passwords, users, identities, sessions or progress are deleted by this migration. The app no longer offers password authentication. Disabling the email provider would also disable email OTP; do not disable it as a way to remove password UI.

## Server configuration

- QA: `idoaqzzvmesjlxnojlpl`; LIVE: `ksbblqnwcmfylpxygyrj`.
- Both **Confirm sign up** and **Magic link or OTP** templates must use `email-otp.html` with subject `קוד הכניסה שלך ל־YouShellNotPass`.
- Confirm email must be enabled before testing new-user OTP; do not assume the dashboard state. Read the public Auth settings and verify `mailer_autoconfirm=false`.
- Preserve the existing dedicated YSNP SMTP configuration. Never reuse an ATLAS key. Mail delivery is proven by receipt, not by saved SMTP fields.
- The UI accepts 6–8 digits and enforces a 60-second resend cooldown. Verify hosted OTP length, expiry and server rate limits before release.
- Apply only `20260913000001_resident_email_otp.sql`, checking migration history first. It replaces the private proof helper without updating users or access rules. Existing email OTP requires a consumed email token and a matching server OTP session after the send time; auto-confirm and password login alone do not count as proof.

## Release checks

1. Use only explicitly authorized test recipients. Verify a real received code for a new account and an existing account, including the previously auto-confirmed path. Confirm no usable new-user session before verification, wrong/expired/reused code rejection, resend, and successful login.
2. Check unchanged account ID/progress for an existing account; verify an exact roster match links with its original scopes, while an outsider remains blocked. Cover Google-only transition before claiming it works for all account types.
3. Confirm the Hebrew code email is readable on mobile. Check entry, code, error and resend screens at narrow widths. A clipped browser-tool screenshot is not mobile acceptance evidence.
4. Record LIVE baseline function definition, settings, user IDs and learning counts before cutover. Repeat the verified QA configuration and apply the reviewed helper on LIVE. Do not copy the QA key or URL.
5. Build with explicit LIVE URL/key plus `VITE_DURABLE_ATTEMPTS=true` and `VITE_RESIDENT_ONBOARDING=true`. Use the established Vercel prebuilt workflow; branch autodeploy is disabled. Inspect the deployed bundle, then repeat an authorized LIVE mailbox/login test.
6. Recheck affected real users after they authenticate. Account existence and Auth confirmation timestamps alone are not proof they can learn. Keep address mismatch cases open until confirmed.

## Local validation

`VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_PUBLISHABLE_KEY=local-test-key npm test`

Run TypeScript and ESLint on changed source files. Repository-wide ESLint currently also walks an old aborted Vercel dependency install; those unrelated failures are not application lint findings.

Use `scripts/entitlement-db/run.sh` only against a disposable local PostgreSQL instance, followed by `psql ... -d ysnp_entitlement_test -f scripts/otp-db/tests.sql`. The OTP SQL fixture is synthetic, transactional and not a hosted Auth lifecycle test. Never run that fixture on QA or LIVE.

## Rollback

Capture the actual pre-cutover Auth templates/settings and private helper definition before LIVE changes. If receipt or account continuity fails, stop cutover or restore that snapshot plus the previous frontend deployment. Coordinate templates and frontend: the previous UI expects links/passwords, the new UI expects codes. Preserve all user records and learning data; do not reverse the migration by deleting users or proof records.

## Sources

- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://github.com/supabase/auth/blob/master/internal/api/verify.go
- https://github.com/supabase/auth/blob/master/internal/api/magic_link.go

Local tests and source review support the implementation. Hosted behavior must still be checked against the deployed Auth version.
