-- FICTIONAL synthetic owner for the local harness only. The UUID is a visible
-- pattern, not a real account. Production/staging set their own single row by
-- hand — see the header of 20260908000001_feedback_editorial.sql.
-- No auth.users row: the predecessor suites count those rows exactly.
insert into public.profiles (id, approved, is_admin, is_editor) values ('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f', true, false, false);
insert into public.editorial_owner (id, label) values ('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f', 'FICTIONAL harness owner');
