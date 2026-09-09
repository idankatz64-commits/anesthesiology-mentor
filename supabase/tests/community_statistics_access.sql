-- Run on QA after the migration. No user data is changed; all test state rolls back.
BEGIN;
CREATE TEMP TABLE aggregate_expected ON COMMIT DROP AS
SELECT
 (SELECT id FROM auth.users WHERE public.is_approved(id) ORDER BY id LIMIT 1) AS approved_id,
 (SELECT COALESCE(jsonb_agg(x ORDER BY topic), '[]'::jsonb) FROM (
   SELECT ua.topic, COUNT(DISTINCT ua.user_id) AS total_users,
     ROUND(SUM(ua.correct_count)::numeric / NULLIF(SUM(ua.answered_count),0)*100,1) AS avg_accuracy
   FROM public.user_answers ua WHERE ua.topic IS NOT NULL GROUP BY ua.topic
 ) x) AS topic_result,
 (SELECT COALESCE(jsonb_agg(x ORDER BY day), '[]'::jsonb) FROM (
   SELECT to_char((ah.answered_at AT TIME ZONE 'Asia/Jerusalem')::date,'YYYY-MM-DD') AS day,
     ROUND(AVG(CASE WHEN ah.is_correct THEN 1.0 ELSE 0.0 END)::numeric,4) AS avg_accuracy
   FROM public.answer_history ah WHERE ah.answered_at >= '2020-01-01'::timestamptz
   GROUP BY (ah.answered_at AT TIME ZONE 'Asia/Jerusalem')::date
 ) x) AS daily_result;
GRANT SELECT ON aggregate_expected TO authenticated;
DO $$ BEGIN
 IF (SELECT approved_id IS NULL FROM aggregate_expected) THEN RAISE EXCEPTION 'QA needs approved fixture'; END IF;
 IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('get_global_topic_stats','get_global_daily_accuracy','get_question_success_rate')
   AND has_function_privilege('anon', p.oid, 'EXECUTE')) THEN RAISE EXCEPTION 'anon still has execute'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ DECLARE q text; BEGIN
 FOREACH q IN ARRAY ARRAY['select * from public.get_global_topic_stats()',
   'select * from public.get_global_daily_accuracy(now())',
   'select * from public.get_question_success_rate(''qa-no-question'')'] LOOP
  BEGIN EXECUTE q; RAISE EXCEPTION 'anonymous call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
END $$;
RESET ROLE;
-- A fresh random subject has no approved profile, membership, or admin role.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE q text; BEGIN
 FOREACH q IN ARRAY ARRAY['select * from public.get_global_topic_stats()',
   'select * from public.get_global_daily_accuracy(now())',
   'select * from public.get_question_success_rate(''qa-no-question'')'] LOOP
  BEGIN EXECUTE q; RAISE EXCEPTION 'unapproved call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
   IF SQLERRM <> 'APPROVAL_REQUIRED' THEN RAISE; END IF;
  END;
 END LOOP;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',(SELECT approved_id FROM aggregate_expected),'role','authenticated')::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE actual jsonb; BEGIN
 SELECT COALESCE(jsonb_agg(x ORDER BY topic),'[]'::jsonb) INTO actual FROM public.get_global_topic_stats() x;
 IF actual IS DISTINCT FROM (SELECT topic_result FROM aggregate_expected) THEN RAISE EXCEPTION 'topic aggregate changed'; END IF;
 SELECT COALESCE(jsonb_agg(x ORDER BY day),'[]'::jsonb) INTO actual FROM public.get_global_daily_accuracy('2020-01-01') x;
 IF actual IS DISTINCT FROM (SELECT daily_result FROM aggregate_expected) THEN RAISE EXCEPTION 'daily aggregate changed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.get_question_success_rate('qa-no-question') WHERE total_users=0 AND success_rate IS NULL)
 THEN RAISE EXCEPTION 'small-group suppression changed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: anon denied, unapproved denied, approved aggregates unchanged, small-group suppression preserved; rolled back' AS result;
