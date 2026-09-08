-- Behavioural tests for feedback + Idan-only editorial approval
-- (migration 20260908000001). Isolated test cluster only. psql stops on the
-- first failing assertion (ON_ERROR_STOP), so a clean run = every check held.
-- SIMULATED: auth.users / is_approved / is_admin / audit trigger are synthetic
-- fixtures; re-run on Supabase staging before trusting the auth-backed parts.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset footer off

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
create or replace function public.t_aq() returns setof public.attempt_questions language sql security definer as $$ select * from public.attempt_questions $$;
create or replace function public.t_snap() returns text language sql security definer as $$
  select md5(coalesce(string_agg(content_hash || ':' || question_id || ':' || snapshot::text, '|' order by content_hash, question_id), '')) from public.question_snapshots $$;
create or replace function public.t_fb(_id uuid) returns public.feedback_items language sql security definer as $$ select * from public.feedback_items where id = _id $$;
create or replace function public.t_q(_id text) returns public.questions language sql security definer as $$ select * from public.questions where id = _id $$;
create or replace function public.t_versions(_qid text) returns bigint language sql security definer as $$ select count(*) from public.question_content_versions where question_id = _qid $$;
create or replace function public.t_audit(_qid text) returns bigint language sql security definer as $$ select count(*) from public.question_audit_log where question_id = _qid $$;
create or replace function public.t_qh(_id text) returns text language sql security definer as $$ select public.feedback_question_hash(q) from public.questions q where q.id = _id $$;
create or replace function public.t_member_id(_email text) returns uuid language sql security definer as $$ select id from public.academy_members where lower(email) = lower(_email) $$;

-- 0. shape: legacy write policies replaced, tables private, helpers private ---
select t_ok((select count(*) from pg_policies where schemaname='public' and tablename='questions' and cmd in ('INSERT','UPDATE','DELETE')) = 3, 'exactly three write policies on questions');
select t_ok((select count(*) from pg_policies where schemaname='public' and tablename='questions' and policyname like 'Admins can%') = 0, 'legacy is_admin write policies are gone');
select t_ok((select bool_and(coalesce(qual, '') || coalesce(with_check, '') like '%caller_is_editorial_owner%') from pg_policies where schemaname='public' and tablename='questions' and cmd in ('INSERT','UPDATE','DELETE')), 'every write policy is owner-only');
select t_ok((select count(*) from pg_policies where schemaname='public' and tablename='questions' and cmd='SELECT') = 1, 'SELECT policy untouched');
select t_ok(not has_table_privilege('authenticated', 'public.feedback_items', 'SELECT') and not has_table_privilege('anon', 'public.feedback_items', 'SELECT'), 'feedback_items has no API grants');
select t_ok(not has_table_privilege('authenticated', 'public.editorial_owner', 'SELECT') and not has_table_privilege('authenticated', 'public.editorial_owner', 'INSERT'), 'editorial_owner has no API grants');
select t_ok(not has_table_privilege('authenticated', 'public.explanation_authors', 'SELECT') and not has_table_privilege('authenticated', 'public.explanation_authors', 'INSERT'), 'explanation_authors has no API grants');
select t_ok(not has_table_privilege('authenticated', 'public.question_content_versions', 'SELECT'), 'versions table has no API grants');
select t_ok(not has_function_privilege('authenticated', 'public.feedback_write_target(text,text,text)', 'EXECUTE'), 'write helper not callable by clients');
select t_ok(not has_function_privilege('authenticated', 'public.is_editorial_owner(uuid)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.feedback_owner_caller()', 'EXECUTE'), 'owner helpers not callable by clients');
select t_ok(not has_function_privilege('anon', 'public.feedback_submit(text,text,text,text,text,text,text)', 'EXECUTE'), 'anon cannot submit');
select t_ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT') and not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), 'profiles write revocation preserved');
select t_expect_error($$insert into public.editorial_owner (id, label) values ('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', 'second')$$, 'duplicate key value violates unique constraint "editorial_owner_singleton_key"');
select t_ok(not public.is_admin('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f') and not public.is_editorial_owner('44444444-4444-4444-4444-444444444444') and not public.is_editorial_owner('55555555-5555-5555-5555-555555555555'), 'ownership is not admin-ness in either direction');

-- 1. fail closed while the owner row is unset ---------------------------------
begin;
delete from public.editorial_owner;
set role authenticated;
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select t_expect_error($$select feedback_queue(null)$$, 'NOT_OWNER');
select t_ok(caller_is_editorial_owner() = false, 'former owner is nobody while unset');
select t_as('44444444-4444-4444-4444-444444444444');
select t_expect_error($$select feedback_queue(null)$$, 'NOT_OWNER');
select t_expect_error($$select feedback_set_author('11111111-1111-1111-1111-111111111111', true, null)$$, 'NOT_OWNER');
update public.questions set explanation = 'hacked while unset' where id = 'q1';
select t_ok((t_q('q1')).explanation = 'synthetic explanation 1', 'admin cannot write questions while owner unset');
rollback;

-- 2. unauthenticated / pending ------------------------------------------------
set role authenticated;
create temp table t_state (k text primary key, v text);
select t_as('');
select t_expect_error($$select feedback_submit('app_bug', null, null, 'x', null, null, null)$$, 'NOT_AUTHENTICATED');
select t_expect_error($$select feedback_mine()$$, 'NOT_AUTHENTICATED');
select t_expect_error($$select feedback_queue(null)$$, 'NOT_AUTHENTICATED');
select t_as('33333333-3333-3333-3333-333333333333');
select t_expect_error($$select feedback_submit('app_bug', null, null, 'x', null, null, null)$$, 'NOT_APPROVED');
select t_expect_error($$select feedback_submit('question_report', 'q1', null, 'x', null, null, null)$$, 'NOT_APPROVED');
select t_expect_error($$select feedback_queue(null)$$, 'NOT_OWNER');
select t_ok(feedback_my_role() = '{"owner": false, "author": false, "approved": false}'::jsonb, 'pending role is all false');

-- 3. approved resident submits; cannot publish, grant, or read others ----------
select t_as('11111111-1111-1111-1111-111111111111');
insert into t_state select 'att', (attempt_start('practice', 'immediate', array['q1', 'q3']))->>'attempt_id';
insert into t_state select 'snap0', t_snap();
select t_ok(t_qh('q1') = (select content_hash from t_aq() where attempt_id = (select v::uuid from t_state where k='att') and question_id = 'q1')
        and t_qh('q3') = (select content_hash from t_aq() where attempt_id = (select v::uuid from t_state where k='att') and question_id = 'q3'), 'feedback_question_hash IS the durable snapshot content_hash (same canonical shape)');
select t_ok(feedback_my_role() = '{"owner": false, "author": false, "approved": true}'::jsonb, 'resident role');
insert into t_state select 'bug', (feedback_submit('app_bug', null, null, 'הכפתור לא עובד', null, null, '/stats'))->>'id';
select t_ok((t_fb((select v::uuid from t_state where k='bug'))).kind = 'app_bug' and (t_fb((select v::uuid from t_state where k='bug'))).page_context = '/stats', 'app bug stored');
select t_expect_error($$select feedback_submit('app_bug', 'q1', null, 'x', null, null, null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_submit('nope', null, null, 'x', null, null, null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_submit('app_bug', null, null, '   ', null, null, null)$$, 'INVALID_INPUT');
insert into t_state select 'rep', (feedback_submit('question_report', 'q1', null, 'התשובה נראית שגויה', null, 'Miller 10e ch. 3', null))->>'id';
select t_ok((t_fb((select v::uuid from t_state where k='rep'))).question_id = 'q1' and (t_fb((select v::uuid from t_state where k='rep'))).proposed_text is null and (t_fb((select v::uuid from t_state where k='rep'))).base_hash is null, 'simple report needs no replacement');
select t_expect_error($$select feedback_submit('question_report', 'q1', null, 'x', 'replacement', null, null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_submit('question_report', null, null, 'x', null, null, null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_submit('question_report', 'missing', null, 'x', null, null, null)$$, 'QUESTION_NOT_FOUND');
select t_expect_error($$select feedback_submit('question_report', 'n1', null, 'x', null, null, null)$$, 'NOT_ENTITLED');
select t_expect_error($$select feedback_submit('correction', 'n1', 'explanation', 'x', 'y', 'ref', null)$$, 'NOT_ENTITLED');
select t_expect_error($$select feedback_submit('question_report', 'amb1', null, 'x', null, null, null)$$, 'NOT_ENTITLED');
select t_expect_error($$select feedback_submit('question_report', 'blank1', null, 'x', null, null, null)$$, 'NOT_ENTITLED');
insert into t_state select 'cor1', (feedback_submit('correction', 'q1', 'explanation', 'ההסבר חסר את המנגנון', 'הסבר מתוקן 1', 'Miller 10e p. 100', null))->>'id';
select t_ok((t_fb((select v::uuid from t_state where k='cor1'))).base_hash = t_qh('q1') and (t_fb((select v::uuid from t_state where k='cor1'))).target_hash = md5('synthetic explanation 1'), 'correction binds the whole-question hash (target hash kept for history), not the text');
select t_ok((t_fb((select v::uuid from t_state where k='cor1'))).reference = 'Miller 10e p. 100', 'correction keeps its reference');
-- a correction without a source cannot be filed; simple reports stay reference-optional ('bug' above has none)
select t_expect_error($$select feedback_submit('correction', 'q1', 'explanation', 'x', 'y', null, null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_submit('correction', 'q1', 'explanation', 'x', 'y', '   ', null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_submit('correction', 'q1', 'explanation', 'x', 'y', repeat('r', 1001), null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_submit('correction', 'q1', 'explanation', 'x', null, 'ref', null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_submit('correction', 'q1', 'explanation', 'x', '  ', 'ref', null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_submit('correction', 'q1', null, 'x', 'y', 'ref', null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_submit('correction', 'q1', 'topic', 'x', 'y', 'ref', null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_submit('correction', 'q1', 'correct', 'x', 'E', 'ref', null)$$, 'INVALID_INPUT');
insert into t_state select 'key1', (feedback_submit('correction', 'q1', 'correct', 'המפתח שגוי', ' b ', 'Miller', null))->>'id';
select t_ok((t_fb((select v::uuid from t_state where k='key1'))).proposed_text = 'B' and (t_fb((select v::uuid from t_state where k='key1'))).base_hash = t_qh('q1') and (t_fb((select v::uuid from t_state where k='key1'))).target_hash = md5('A'), 'key proposal normalized and bound');
select t_expect_error($$select feedback_submit('correction', 'noexp', 'explanation', 'x', 'הסבר חדש', 'ref', null)$$, 'NOT_AUTHOR');
select t_ok(jsonb_array_length(feedback_mine()) = 4 and (feedback_mine()->0->>'body_hidden') = 'false' and (feedback_mine()->0->>'issue_text') is not null, 'own items with bodies');
select t_ok((t_q('q1')).explanation = 'synthetic explanation 1' and (t_q('q1')).correct = 'A', 'nothing published by submitting');
-- no publication path of any kind for a resident
select t_expect_error($$select * from public.feedback_items$$, 'permission denied for table feedback_items');
select t_expect_error($$select * from public.editorial_owner$$, 'permission denied for table editorial_owner');
select t_expect_error($$insert into public.explanation_authors (user_id, granted_by) values (auth.uid(), auth.uid())$$, 'permission denied for table explanation_authors');
select t_expect_error($$insert into public.editorial_owner (id, label) values (auth.uid(), 'me')$$, 'permission denied for table editorial_owner');
select t_expect_error($$insert into public.admin_users (id, email, role) values (auth.uid(), 'x', 'admin')$$, 'permission denied for table admin_users');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor1'), md5('synthetic explanation 1'), null)$$, 'NOT_OWNER');
select t_expect_error($$select feedback_resolve((select v::uuid from t_state where k='rep'), 'handled', null)$$, 'NOT_OWNER');
select t_expect_error($$select feedback_set_author(auth.uid(), true, null)$$, 'NOT_OWNER');
select t_expect_error($$select feedback_queue(null)$$, 'NOT_OWNER');
select t_expect_error($$select feedback_review((select v::uuid from t_state where k='cor1'))$$, 'NOT_OWNER');
select t_expect_error($$select feedback_write_target('q1', 'explanation', 'hacked')$$, 'permission denied for function feedback_write_target');
update public.questions set explanation = 'hacked by resident' where id = 'q1';
delete from public.questions where id = 'q1';
select t_expect_error($$insert into public.questions (id, question, source) values ('injected', 'x', 'בית חולים סינתטי')$$, 'new row violates row-level security policy for table "questions"');
select t_ok((t_q('q1')).explanation = 'synthetic explanation 1', 'resident direct write/delete is a no-op');

-- 4. regular editor and admin: is_admin does not publish, grant, or moderate ---
select t_as('55555555-5555-5555-5555-555555555555');
select t_ok(feedback_my_role() = '{"owner": false, "author": false, "approved": true}'::jsonb, 'editor is not owner');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor1'), md5('synthetic explanation 1'), null)$$, 'NOT_OWNER');
select t_expect_error($$select feedback_set_author('11111111-1111-1111-1111-111111111111', true, null)$$, 'NOT_OWNER');
select t_expect_error($$select feedback_queue('pending')$$, 'NOT_OWNER');
select t_expect_error($$select feedback_rollback(gen_random_uuid(), null, null)$$, 'NOT_OWNER');
update public.questions set explanation = 'hacked by editor', correct = 'D' where id = 'q1';
delete from public.questions where id = 'q2';
select t_expect_error($$insert into public.questions (id, question, source) values ('injected', 'x', 'בית חולים סינתטי')$$, 'new row violates row-level security policy for table "questions"');
select t_ok((t_q('q1')).explanation = 'synthetic explanation 1' and (t_q('q1')).correct = 'A' and (t_q('q2')).id = 'q2', 'legacy editor write path closed');
select t_as('44444444-4444-4444-4444-444444444444');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor1'), md5('synthetic explanation 1'), null)$$, 'NOT_OWNER');
select t_expect_error($$select feedback_set_author('11111111-1111-1111-1111-111111111111', true, null)$$, 'NOT_OWNER');
select t_expect_error($$select feedback_queue(null)$$, 'NOT_OWNER');
update public.questions set explanation = 'hacked by admin' where id = 'q1';
delete from public.questions where id = 'q1';
select t_ok((t_q('q1')).explanation = 'synthetic explanation 1', 'legacy admin write path closed');
-- content admins read national, so they may report on it (entitlement predicate reused as-is)
insert into t_state select 'nrep', (feedback_submit('question_report', 'n1', null, 'דיווח על שאלת ארצי', null, null, null))->>'id';
select t_as('13131313-1313-1313-1313-131313131313');
select t_expect_error($$select feedback_queue(null)$$, 'NOT_OWNER');

-- 5. owner: queue, exact review content, atomic approval, stale, reject --------
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select t_ok(feedback_my_role() = '{"owner": true, "author": false, "approved": true}'::jsonb, 'owner role');
select t_ok(jsonb_array_length(feedback_queue('pending')) = 5 and jsonb_array_length(feedback_queue('approved')) = 0, 'queue lists pending items');
select t_expect_error($$select feedback_queue('bogus')$$, 'INVALID_INPUT');
select t_ok(feedback_queue(null)::text not like '%synthetic question%' and feedback_queue(null)::text not like '%synthetic explanation%' and feedback_queue(null)::text not like '%snapshot%', 'queue carries no question content or snapshots');
select t_ok((select bool_and(i->>'stale' = 'false' and (i->>'issue_text') is not null and i->>'body_hidden' = 'false') from jsonb_array_elements(feedback_queue('pending')) i), 'queue items fresh with bodies');
select t_ok((select i->>'question_ref_id' from jsonb_array_elements(feedback_queue('pending')) i where i->>'id' = (select v from t_state where k='cor1')) = 'q1', 'queue shows question ref');
select t_ok((feedback_review((select v::uuid from t_state where k='cor1'))->>'current_text') = 'synthetic explanation 1'
        and (feedback_review((select v::uuid from t_state where k='cor1'))->>'current_hash') = t_qh('q1')
        and (feedback_review((select v::uuid from t_state where k='cor1'))->>'current_target_hash') = md5('synthetic explanation 1')
        and (feedback_review((select v::uuid from t_state where k='cor1'))->>'proposed_text') = 'הסבר מתוקן 1'
        and (feedback_review((select v::uuid from t_state where k='cor1'))->>'question_text') = 'synthetic question 1'
        and (feedback_review((select v::uuid from t_state where k='cor1'))->>'option_a') = 'alef' and (feedback_review((select v::uuid from t_state where k='cor1'))->>'option_d') = 'dalet'
        and (feedback_review((select v::uuid from t_state where k='cor1'))->>'current_key') = 'A' and (feedback_review((select v::uuid from t_state where k='cor1'))->>'explanation_text') = 'synthetic explanation 1'
        and (feedback_review((select v::uuid from t_state where k='cor1'))->>'stale') = 'false', 'review shows the whole live question, the exact live base and the proposal');
select t_ok((feedback_review((select v::uuid from t_state where k='bug'))->>'current_text') is null and (feedback_review((select v::uuid from t_state where k='bug'))->>'question_exists') = 'false', 'app bug review has no question');
select t_expect_error($$select feedback_review(gen_random_uuid())$$, 'FEEDBACK_NOT_FOUND');
-- wrong expected hash → nothing changes
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor1'), md5('something else'), null)$$, 'STALE_BASE');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor1'), null, null)$$, 'STALE_BASE');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor1'), md5('synthetic explanation 1'), null)$$, 'STALE_BASE');
select t_ok((t_q('q1')).explanation = 'synthetic explanation 1' and (t_fb((select v::uuid from t_state where k='cor1'))).status = 'pending' and t_versions('q1') = 0 and coalesce((t_q('q1')).manually_edited, false) = false, 'stale/target-only expected hash rejected without change');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='rep'), null, null)$$, 'NOT_PUBLISHABLE');
select t_expect_error($$select feedback_approve(gen_random_uuid(), null, null)$$, 'FEEDBACK_NOT_FOUND');
-- approve with the reviewed hash → exact replacement published, history written
insert into t_state select 'v1', (feedback_approve((select v::uuid from t_state where k='cor1'), t_qh('q1'), 'מאושר'))->>'version_id';
select t_ok((t_q('q1')).explanation = 'הסבר מתוקן 1' and (t_q('q1')).correct = 'A' and (t_q('q1')).question = 'synthetic question 1', 'only the reviewed column changed');
select t_ok((t_q('q1')).manually_edited = true, 'published question is marked manually_edited (sync-questions skips it)');
select t_ok((t_fb((select v::uuid from t_state where k='cor1'))).status = 'approved' and (t_fb((select v::uuid from t_state where k='cor1'))).reviewed_by = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f' and (t_fb((select v::uuid from t_state where k='cor1'))).review_note = 'מאושר' and (t_fb((select v::uuid from t_state where k='cor1'))).published_version_id = (select v::uuid from t_state where k='v1'), 'item bound to its published version');
select t_ok((select v->>'author_id' = '11111111-1111-1111-1111-111111111111' and v->>'reviewer_id' = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f' and v->>'old_text' = 'synthetic explanation 1' and v->>'new_text' = 'הסבר מתוקן 1' and v->>'old_hash' = md5('synthetic explanation 1') and v->>'new_hash' = md5('הסבר מתוקן 1')
        and v->>'base_question_hash' = (t_fb((select v::uuid from t_state where k='cor1'))).base_hash and v->>'question_hash' = t_qh('q1') from jsonb_array_elements(feedback_versions('q1')) v where v->>'id' = (select v from t_state where k='v1')), 'version history records author, reviewer, old/new target hashes and whole-question hashes before/after');
select t_ok(t_audit('q1') = 1, 'legacy audit trigger still records the publication');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor1'), md5('הסבר מתוקן 1'), null)$$, 'NOT_PENDING');
select t_ok(jsonb_array_length(feedback_queue('approved')) = 1 and jsonb_array_length(feedback_queue('pending')) = 4, 'statuses move');
-- frozen attempt untouched by the publication
select t_ok(t_snap() = (select v from t_state where k='snap0'), 'question snapshots byte-identical after approval');
select t_ok((select correct_key from t_aq() where attempt_id = (select v::uuid from t_state where k='att') and question_id = 'q1') = 'A', 'frozen key unchanged');
-- competing proposal on the same base goes stale after the first publication
select t_as('22222222-2222-2222-2222-222222222222');
insert into t_state select 'corA', (feedback_submit('correction', 'q3', 'explanation', 'a', 'גרסה א', 'Miller 10e', null))->>'id';
select t_as('11111111-1111-1111-1111-111111111111');
insert into t_state select 'corB', (feedback_submit('correction', 'q3', 'explanation', 'b', 'גרסה ב', 'Miller 10e', null))->>'id';
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select feedback_approve((select v::uuid from t_state where k='corA'), t_qh('q3'), null);
select t_ok((feedback_review((select v::uuid from t_state where k='corB'))->>'stale') = 'true' and (feedback_review((select v::uuid from t_state where k='corB'))->>'current_text') = 'גרסה א', 'second proposal reported stale with the new live base');
select t_ok((select i->>'stale' from jsonb_array_elements(feedback_queue('pending')) i where i->>'id' = (select v from t_state where k='corB')) = 'true', 'queue flags stale');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='corB'), md5('synthetic explanation 3'), null)$$, 'STALE_BASE');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='corB'), md5('גרסה א'), null)$$, 'STALE_BASE');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='corB'), t_qh('q3'), null)$$, 'STALE_BASE');
select t_ok((t_q('q3')).explanation = 'גרסה א' and (t_fb((select v::uuid from t_state where k='corB'))).status = 'pending', 'stale proposal cannot publish even with the current hash');
-- rejection / handled leave content alone
select feedback_resolve((select v::uuid from t_state where k='corB'), 'rejected', 'הבסיס השתנה');
select t_ok((t_fb((select v::uuid from t_state where k='corB'))).status = 'rejected' and (t_q('q3')).explanation = 'גרסה א' and t_versions('q3') = 1, 'rejection changes nothing');
select feedback_resolve((select v::uuid from t_state where k='rep'), 'handled', 'טופל');
select feedback_resolve((select v::uuid from t_state where k='bug'), 'handled', null);
select t_ok((t_fb((select v::uuid from t_state where k='bug'))).status = 'handled' and (t_q('q1')).explanation = 'הסבר מתוקן 1', 'handled leaves content');
select t_expect_error($$select feedback_resolve((select v::uuid from t_state where k='bug'), 'rejected', null)$$, 'NOT_PENDING');
select t_expect_error($$select feedback_resolve((select v::uuid from t_state where k='key1'), 'approved', null)$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_resolve(gen_random_uuid(), 'handled', null)$$, 'FEEDBACK_NOT_FOUND');
-- the early key proposal went stale when the explanation was published (whole-question binding), so it is re-proposed on the new base
select t_ok((feedback_review((select v::uuid from t_state where k='key1'))->>'stale') = 'true', 'key proposal filed before the explanation change is stale');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='key1'), t_qh('q1'), null)$$, 'STALE_BASE');
select feedback_resolve((select v::uuid from t_state where k='key1'), 'rejected', 'הוגש מחדש');
select t_as('11111111-1111-1111-1111-111111111111');
insert into t_state select 'key2', (feedback_submit('correction', 'q1', 'correct', 'המפתח שגוי', 'B', 'Miller', null))->>'id';
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
-- key change publishes only the key; frozen attempts keep the old key
select feedback_approve((select v::uuid from t_state where k='key2'), t_qh('q1'), null);
select t_ok((t_q('q1')).correct = 'B' and (t_q('q1')).explanation = 'הסבר מתוקן 1' and t_audit('q1') = 2, 'key published');
select t_ok(t_snap() = (select v from t_state where k='snap0') and (select correct_key from t_aq() where attempt_id = (select v::uuid from t_state where k='att') and question_id = 'q1') = 'A', 'frozen attempt still scores with the old key');
-- rollback: only the latest version of a target, only while it is live, only against the whole question the owner reviewed
select t_ok(jsonb_array_length(feedback_versions('q1')) = 2, 'two versions on q1');
select t_expect_error($$select feedback_rollback((select v::uuid from t_state where k='v1'), md5('elsewhere'), null)$$, 'STALE_BASE');
select t_expect_error($$select feedback_rollback((select v::uuid from t_state where k='v1'), null, null)$$, 'STALE_BASE');
select t_expect_error($$select feedback_rollback((select v::uuid from t_state where k='v1'), (select v->>'question_hash' from jsonb_array_elements(feedback_versions('q1')) v where v->>'id' = (select v from t_state where k='v1')), null)$$, 'STALE_BASE');
select t_ok((t_q('q1')).explanation = 'הסבר מתוקן 1' and jsonb_array_length(feedback_versions('q1')) = 2, 'rollback without the exact current review changes nothing (key changed since that version)');
reset role;
update public.questions set manually_edited = false where id = 'q1';
set role authenticated;
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select feedback_rollback((select v::uuid from t_state where k='v1'), t_qh('q1'), 'חזרה');
select t_ok((t_q('q1')).explanation = 'synthetic explanation 1' and (t_q('q1')).correct = 'B' and jsonb_array_length(feedback_versions('q1')) = 3, 'rollback restores the base of that column only');
select t_ok((t_q('q1')).manually_edited = true, 'rolled-back question is marked manually_edited again');
select t_ok((select v->>'rollback_of' from jsonb_array_elements(feedback_versions('q1')) v order by v->>'published_at' desc limit 1) = (select v from t_state where k='v1'), 'rollback version links its origin');
select t_expect_error($$select feedback_rollback((select v::uuid from t_state where k='v1'), t_qh('q1'), null)$$, 'NOT_LATEST');
select t_expect_error($$select feedback_rollback(gen_random_uuid(), null, null)$$, 'VERSION_NOT_FOUND');
select t_ok(t_snap() = (select v from t_state where k='snap0'), 'snapshots byte-identical after rollback');

-- 6. explanation-author grants: owner only, submit-only, revocation immediate ---
select t_expect_error($$select feedback_set_author('33333333-3333-3333-3333-333333333333', true, null)$$, 'TARGET_NOT_APPROVED');
select t_expect_error($$select feedback_set_author(null, true, null)$$, 'INVALID_INPUT');
select t_ok((feedback_set_author('22222222-2222-2222-2222-222222222222', true, 'מתמחה מצטיין')->>'author') = 'true', 'owner grants');
select t_ok((select count(*) from jsonb_array_elements(feedback_authors()) a where a->>'user_id' = '22222222-2222-2222-2222-222222222222' and a->>'active' = 'true') = 1, 'authors list');
select t_as('22222222-2222-2222-2222-222222222222');
select t_ok(feedback_my_role() = '{"owner": false, "author": true, "approved": true}'::jsonb, 'author role visible');
insert into t_state select 'add', (feedback_submit('correction', 'noexp', 'explanation', 'אין הסבר', 'הסבר שנכתב על ידי מחבר', 'Miller 10e', null))->>'id';
select t_ok((t_q('noexp')).explanation = '' and (t_fb((select v::uuid from t_state where k='add'))).status = 'pending', 'author submission is not a publication');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='add'), md5(''), null)$$, 'NOT_OWNER');
select t_expect_error($$select feedback_set_author('11111111-1111-1111-1111-111111111111', true, null)$$, 'NOT_OWNER');
select t_expect_error($$select feedback_authors()$$, 'NOT_OWNER');
update public.questions set explanation = 'hacked by author' where id = 'noexp';
select t_ok((t_q('noexp')).explanation = '', 'author cannot write questions directly');
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select t_ok((feedback_set_author('22222222-2222-2222-2222-222222222222', false, null)->>'author') = 'false', 'owner revokes');
select t_as('22222222-2222-2222-2222-222222222222');
select t_ok(feedback_my_role() = '{"owner": false, "author": false, "approved": true}'::jsonb, 'revocation visible');
select t_expect_error($$select feedback_submit('correction', 'noexp', 'explanation', 'x', 'y', 'ref', null)$$, 'NOT_AUTHOR');
insert into t_state select 'cor2', (feedback_submit('correction', 'q2', 'explanation', 'still a resident', 'הצעה רגילה', 'Miller 10e', null))->>'id';
select t_ok((t_fb((select v::uuid from t_state where k='cor2'))).status = 'pending', 'revoked author still proposes ordinary corrections');
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select feedback_set_author('22222222-2222-2222-2222-222222222222', true, null);
select t_ok((select count(*) from jsonb_array_elements(feedback_authors()) a where a->>'user_id' = '22222222-2222-2222-2222-222222222222') = 1 and (select a->>'active' from jsonb_array_elements(feedback_authors()) a where a->>'user_id' = '22222222-2222-2222-2222-222222222222') = 'true', 're-grant reuses the row');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='add'), md5(''), null)$$, 'STALE_BASE');
select feedback_approve((select v::uuid from t_state where k='add'), t_qh('noexp'), null);
select t_ok((t_q('noexp')).explanation = 'הסבר שנכתב על ידי מחבר', 'missing explanation published only by the owner');
-- the owner submits like anyone else, and adding a missing explanation is allowed for the owner
select feedback_submit('correction', 'q2', 'a', 'טעות בתשובה א', 'אלף מתוקן', 'Miller 10e', null);

-- 7. national revocation applies to reports, bodies and conflict responses -----
select t_as('88888888-8888-8888-8888-888888888888');
select t_ok(feedback_my_role()->>'approved' = 'true', 'linked resident approved');
insert into t_state select 'n8', (feedback_submit('question_report', 'n1', null, 'דיווח ארצי', null, null, null))->>'id';
insert into t_state select 'n8c', (feedback_submit('correction', 'n1', 'explanation', 'תיקון ארצי', 'הסבר ארצי מוצע', 'Miller 10e', null))->>'id';
select t_ok((select bool_and(i->>'body_hidden' = 'false') from jsonb_array_elements(feedback_mine()) i where i->>'question_id' = 'n1'), 'entitled resident sees own national bodies');
select t_as('44444444-4444-4444-4444-444444444444');
select set_member_national_access(t_member_id('pw.verified@example.com'), false);
select t_as('88888888-8888-8888-8888-888888888888');
select t_expect_error($$select feedback_submit('question_report', 'n1', null, 'x', null, null, null)$$, 'NOT_ENTITLED');
select t_expect_error($$select feedback_submit('correction', 'n1', 'explanation', 'x', 'y', 'ref', null)$$, 'NOT_ENTITLED');
select t_ok((select bool_and(i->>'body_hidden' = 'true' and (i->>'issue_text') is null and (i->>'proposed_text') is null) from jsonb_array_elements(feedback_mine()) i where i->>'question_id' = 'n1'), 'revoked resident no longer sees the bodies of own national items');
select t_ok(jsonb_array_length(feedback_mine()) = 2, 'item metadata still listed');
select feedback_submit('question_report', 'q1', null, 'open still fine', null, null, null);
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select t_ok((select i->>'stale' from jsonb_array_elements(feedback_queue('pending')) i where i->>'id' = (select v from t_state where k='n8c')) = 'false', 'owner still reviews the national proposal');
select feedback_resolve((select v::uuid from t_state where k='n8'), 'handled', 'הערה שמצטטת את המפתח: A');
select t_ok((select i->>'review_note' from jsonb_array_elements(feedback_queue('handled')) i where i->>'id' = (select v from t_state where k='n8')) = 'הערה שמצטטת את המפתח: A', 'owner sees the review note');
select t_as('88888888-8888-8888-8888-888888888888');
select t_ok((select i->>'body_hidden' = 'true' and (i->>'review_note') is null and i->>'status' = 'handled' from jsonb_array_elements(feedback_mine()) i where i->>'id' = (select v from t_state where k='n8')), 'revoked resident never sees the owner note on a national item');

-- 8. rate limit is per user and visible ---------------------------------------
select t_as('11111111-1111-1111-1111-111111111111');
select t_ok((select i->>'review_note' = 'טופל' and i->>'body_hidden' = 'false' from jsonb_array_elements(feedback_mine()) i where i->>'id' = (select v from t_state where k='rep')), 'entitled resident sees the note on an own item');
select t_expect_error($y$do $x$ begin for i in 1..40 loop perform feedback_submit('app_bug', null, null, 'spam ' || i, null, null, null); end loop; end $x$$y$, 'RATE_LIMITED');
select t_as('22222222-2222-2222-2222-222222222222');
select feedback_submit('app_bug', null, null, 'other user unaffected', null, null, null);

-- 9. service-role gate predicate + owner-only resident picker -----------------
reset role;
select t_ok(has_function_privilege('service_role', 'public.is_editorial_owner(uuid)', 'execute'), 'service_role may evaluate is_editorial_owner');
select t_ok(not has_function_privilege('authenticated', 'public.is_editorial_owner(uuid)', 'execute') and not has_function_privilege('anon', 'public.is_editorial_owner(uuid)', 'execute'), 'clients still cannot');
set role service_role;
select t_ok(public.is_editorial_owner('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f') and not public.is_editorial_owner('44444444-4444-4444-4444-444444444444') and not public.is_editorial_owner('55555555-5555-5555-5555-555555555555') and not public.is_editorial_owner(null), 'service role: only the configured owner is owner (admin/editor/null are not)');
reset role;
set role authenticated;
select t_as('11111111-1111-1111-1111-111111111111');
select t_expect_error($$select feedback_author_candidates(null)$$, 'NOT_OWNER');
select t_as('22222222-2222-2222-2222-222222222222');
select t_expect_error($$select feedback_author_candidates(null)$$, 'NOT_OWNER');
select t_as('44444444-4444-4444-4444-444444444444');
select t_expect_error($$select feedback_author_candidates('plain')$$, 'NOT_OWNER');
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select t_ok(jsonb_array_length(feedback_author_candidates(null)) >= 4, 'owner sees candidates');
select t_ok((select bool_and(public.is_approved((c->>'user_id')::uuid)) from jsonb_array_elements(feedback_author_candidates(null)) c), 'every candidate is approved');
select t_ok(not exists (select 1 from jsonb_array_elements(feedback_author_candidates(null)) c where c->>'user_id' in ('33333333-3333-3333-3333-333333333333', '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f')), 'pending account and the owner are not candidates');
select t_ok(exists (select 1 from jsonb_array_elements(feedback_author_candidates(null)) c where c->>'user_id' = '88888888-8888-8888-8888-888888888888'), 'roster-linked resident (approved only through the roster) is a candidate');
select t_ok((select c->>'author' from jsonb_array_elements(feedback_author_candidates(null)) c where c->>'user_id' = '22222222-2222-2222-2222-222222222222') = 'true'
        and (select c->>'author' from jsonb_array_elements(feedback_author_candidates(null)) c where c->>'user_id' = '11111111-1111-1111-1111-111111111111') = 'false', 'current grant state shown');
select t_ok((select bool_and(c ?& array['user_id','email','name','author','note'] and not (c ? 'approved') and not (c ? 'is_admin')) from jsonb_array_elements(feedback_author_candidates(null)) c), 'minimal fields only');
select t_ok(jsonb_array_length(feedback_author_candidates('plain2')) = 1 and (feedback_author_candidates('PLAIN2')->0->>'email') = 'plain2@example.com', 'search by email, case-insensitive');
select t_ok((feedback_author_candidates('pw.verified')->0->>'name') = 'Password Verified', 'roster name shown (post-academy fixture)');
select t_expect_error($$select feedback_author_candidates(repeat('x', 101))$$, 'INVALID_INPUT');
select t_expect_error($$select feedback_set_author('33333333-3333-3333-3333-333333333333', true, null)$$, 'TARGET_NOT_APPROVED');

-- 10. approval binds to the WHOLE question: a different-field change after submission is STALE_BASE
select t_as('11111111-1111-1111-1111-111111111111');
insert into t_state select 'cor3', (feedback_submit('correction', 'q3', 'explanation', 'עוד תיקון להסבר', 'גרסה ג', 'Miller 10e p. 300', null))->>'id';
insert into t_state select 'h3', t_qh('q3');
reset role;
update public.questions set a = 'alef changed elsewhere' where id = 'q3';
set role authenticated;
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select t_ok((feedback_review((select v::uuid from t_state where k='cor3'))->>'stale') = 'true' and (feedback_review((select v::uuid from t_state where k='cor3'))->>'current_text') = 'גרסה א'
        and (feedback_review((select v::uuid from t_state where k='cor3'))->>'option_a') = 'alef changed elsewhere' and (feedback_review((select v::uuid from t_state where k='cor3'))->>'current_target_hash') = md5('גרסה א'), 'an option change after submission flags the explanation proposal stale even though its target text is unchanged');
select t_ok((select i->>'stale' from jsonb_array_elements(feedback_queue('pending')) i where i->>'id' = (select v from t_state where k='cor3')) = 'true', 'queue flags it');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor3'), t_qh('q3'), null)$$, 'STALE_BASE');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor3'), (select v from t_state where k='h3'), null)$$, 'STALE_BASE');
select t_ok((t_q('q3')).explanation = 'גרסה א' and (t_fb((select v::uuid from t_state where k='cor3'))).status = 'pending' and t_versions('q3') = 1, 'stale medical proposal is not published');
-- rollback of the last explanation version needs the reviewed whole question, which now includes the changed option
insert into t_state select 'vA', (feedback_versions('q3')->0->>'id');
select t_expect_error($$select feedback_rollback((select v::uuid from t_state where k='vA'), (select v from t_state where k='h3'), null)$$, 'STALE_BASE');
select t_ok((t_q('q3')).explanation = 'גרסה א', 'rollback against the pre-change base is refused');
select feedback_rollback((select v::uuid from t_state where k='vA'), t_qh('q3'), 'נבדק מול השאלה הנוכחית');
select t_ok((t_q('q3')).explanation = 'synthetic explanation 3' and (t_q('q3')).a = 'alef changed elsewhere' and t_versions('q3') = 2, 'rollback after exact review restores only the target');
reset role;

-- 11. the hash covers provenance/media too: a source or media change after submission is STALE_BASE,
--     and a metadata change after publication blocks a rollback reviewed against the older record
select t_as('11111111-1111-1111-1111-111111111111');
insert into t_state select 'cor4', (feedback_submit('correction', 'q3', 'explanation', 'תיקון אחרי שינוי מקור', 'גרסה ד', 'Miller 10e p. 400', null))->>'id';
insert into t_state select 'h4', t_qh('q3');
reset role;
update public.questions set source = 'בית חולים ב' where id = 'q3';
set role authenticated;
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select t_ok((feedback_review((select v::uuid from t_state where k='cor4'))->>'stale') = 'true' and (feedback_review((select v::uuid from t_state where k='cor4'))->>'question_source') = 'בית חולים ב'
        and (feedback_review((select v::uuid from t_state where k='cor4'))->>'current_hash') <> (select v from t_state where k='h4'), 'a source change after submission flags the proposal stale and the review shows the new source');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor4'), (select v from t_state where k='h4'), null)$$, 'STALE_BASE');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor4'), t_qh('q3'), null)$$, 'STALE_BASE');
select t_ok((t_q('q3')).explanation = 'synthetic explanation 3' and t_versions('q3') = 2, 'not published after a source change');
reset role;
update public.questions set media_type = 'image', media_link = 'https://example.invalid/q3.png' where id = 'q3';
set role authenticated;
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select t_ok((feedback_review((select v::uuid from t_state where k='cor4'))->>'question_media_link') = 'https://example.invalid/q3.png' and (feedback_review((select v::uuid from t_state where k='cor4'))->>'question_media_type') = 'image'
        and (feedback_review((select v::uuid from t_state where k='cor4'))->>'stale') = 'true', 'a media change is part of the reviewed record');
select t_expect_error($$select feedback_approve((select v::uuid from t_state where k='cor4'), t_qh('q3'), null)$$, 'STALE_BASE');
-- re-proposed against the record the owner now sees → publishes; then a metadata change blocks the stale rollback
select t_as('11111111-1111-1111-1111-111111111111');
insert into t_state select 'cor5', (feedback_submit('correction', 'q3', 'explanation', 'שוב, מול הרשומה הנוכחית', 'גרסה ד', 'Miller 10e p. 400', null))->>'id';
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select feedback_approve((select v::uuid from t_state where k='cor5'), t_qh('q3'), null);
select t_ok((t_q('q3')).explanation = 'גרסה ד' and t_versions('q3') = 3, 'published against the reviewed record');
insert into t_state select 'vD', (feedback_versions('q3')->0->>'id');
insert into t_state select 'hD', t_qh('q3');
reset role;
update public.questions set ref_id = 'q3-renumbered', year = '2025' where id = 'q3';
set role authenticated;
select t_as('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
select t_expect_error($$select feedback_rollback((select v::uuid from t_state where k='vD'), (select v from t_state where k='hD'), null)$$, 'STALE_BASE');
select t_ok((t_q('q3')).explanation = 'גרסה ד' and t_versions('q3') = 3, 'rollback reviewed before the ref_id/year change cannot write');
select t_ok((feedback_review((select v::uuid from t_state where k='cor4'))->>'question_ref_id') = 'q3-renumbered' and (feedback_review((select v::uuid from t_state where k='cor4'))->>'question_year') = '2025', 'review shows the renumbered reference and year');
select feedback_rollback((select v::uuid from t_state where k='vD'), t_qh('q3'), 'נבדק מול הרשומה המלאה');
select t_ok((t_q('q3')).explanation = 'synthetic explanation 3' and (t_q('q3')).ref_id = 'q3-renumbered' and (t_q('q3')).source = 'בית חולים ב' and t_versions('q3') = 4, 'rollback after exact review restores only the target, metadata untouched');
select t_ok(t_snap() = (select v from t_state where k='snap0'), 'frozen attempt snapshots byte-identical after all provenance/media changes');
reset role;
