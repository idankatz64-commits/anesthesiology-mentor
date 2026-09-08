-- Learning/curriculum harness fixture. Loaded AFTER 20260908000002 on the
-- isolated test cluster only. Everything here is synthetic; no real person.
-- Senior resident persona (year 5, real exam date) on the roster row that the
-- entitlement suite never links, so both suites keep their own counts.
update public.academy_members set residency_year = 5, exam_this_year = true, exam_date = date '2026-11-15'
 where lower(email) = 'roster.only@example.com';
-- Two open (non-national) questions in core chapter 12 for the management aggregate.
insert into public.questions (id, ref_id, question, a, b, c, d, correct, explanation, topic, chapter, source, kind) values
  ('o1', 'o1', 'open synthetic 1', 'alef', 'bet', 'gimel', 'dalet', 'A', 'open explanation 1', 'Respiratory', 12, 'מועד א 2020', 'test'),
  ('o2', 'o2', 'open synthetic 2', 'alef', 'bet', 'gimel', 'dalet', 'B', 'open explanation 2', 'Respiratory', 12, 'מועד ב 2020', 'test');
