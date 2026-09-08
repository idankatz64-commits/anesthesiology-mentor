-- RED. Asserts the two defects are PRESENT on the pre-fix build. If this file
-- passes, the fixture reproduces SECURITY-REVIEW.md F-2 and F-3 exactly; if it
-- fails, tests.sql would be proving nothing and the run stops here.
\i scripts/integrity-db/helpers.sql
set role authenticated;

-- F-2 present: practice + deferred, the replay hands back the real verdict
-- that the first confirmation correctly withheld.
select t_as('11111111-1111-1111-1111-111111111111');
create temp table pre (k text primary key, v jsonb);
insert into pre select 'f2', t_deferred_replay('practice', 'end');
select t_ok((select v->'first'->>'is_correct' from pre where k='f2') is null,
  'PRE F-2: first confirm withholds is_correct under deferred feedback');
select t_ok((select v->'replay'->>'is_correct' from pre where k='f2') = 'true',
  'PRE F-2: the replay LEAKS is_correct (defect reproduced)');

-- F-3 present: an e-mail-only re-import erases full_name and exam_this_year,
-- while residency_year survives — the asymmetry the review points at.
select t_as('44444444-4444-4444-4444-444444444444');
select upsert_resident_roster('[{"name":"Dr Ploni","email":"partial@example.org","residency_year":3,"exam_this_year":true}]');
select upsert_resident_roster('[{"email":"partial@example.org"}]');
select t_ok((select full_name from t_member('partial@example.org')) is null,
  'PRE F-3: partial re-import NULLs full_name (defect reproduced)');
select t_ok((select exam_this_year from t_member('partial@example.org')) = false,
  'PRE F-3: partial re-import flips exam_this_year true -> false (defect reproduced)');
select t_ok((select residency_year from t_member('partial@example.org')) = 3,
  'PRE F-3: residency_year survives — the protected field, for contrast');
reset role;
