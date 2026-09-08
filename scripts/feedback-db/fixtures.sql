-- Feedback/editorial harness fixture. Loaded AFTER the entitlement migration
-- and BEFORE 20260908000001_feedback_editorial.sql, so the migration is
-- exercised against the production-like legacy state it has to replace.
-- Test cluster only (127.0.0.1:55439). Never run against production.

-- production shape: authenticated holds table privileges on questions and the
-- legacy is_admin write policies from 20260224211718 (editors included).
grant insert, update, delete on public.questions to authenticated;
create policy "Admins can insert questions" on public.questions for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "Admins can update questions" on public.questions for update to authenticated using (public.is_admin(auth.uid()));
create policy "Admins can delete questions" on public.questions for delete to authenticated using (public.is_admin(auth.uid()));

-- production shape: question_audit_log trigger (20260307160902) fires on every
-- questions UPDATE; the harness keeps a minimal copy so approvals prove they
-- coexist with it.
create table public.question_audit_log (
  id uuid primary key default gen_random_uuid(),
  question_id text, changed_by uuid, changed_at timestamptz default now(),
  old_explanation text, new_explanation text, old_correct text, new_correct text
);
create or replace function public.log_question_changes() returns trigger language plpgsql security definer as $$
begin
  if old.explanation is distinct from new.explanation or old.correct is distinct from new.correct then
    insert into public.question_audit_log (question_id, changed_by, old_explanation, new_explanation, old_correct, new_correct)
    values (new.id, auth.uid(), old.explanation, new.explanation, old.correct, new.correct);
  end if;
  return new;
end $$;
create trigger trg_question_audit after update on public.questions for each row execute function public.log_question_changes();

-- a question with a MISSING explanation (author-grant path) and an approved
-- resident 8888 linked to the roster with national access (revocation path).
insert into public.questions (id, ref_id, question, a, b, c, d, correct, explanation, topic, chapter, source, kind) values
  ('noexp', 'noexp', 'synthetic question without explanation', 'alef', 'bet', 'gimel', 'dalet', 'B', '', 'Demo topic', 1, 'בית חולים סינתטי', 'test');
update public.academy_members set user_id = '88888888-8888-8888-8888-888888888888', linked_at = now(), national_access = true
 where lower(email) = 'pw.verified@example.com';
