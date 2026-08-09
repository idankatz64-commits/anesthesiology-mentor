-- ============================================================================
--  ניקוי מסד ידני — 9.8.2026
--  פרויקט: ksbblqnwcmfylpxygyrj   (לעולם לא agmcauhjhfwksrjllxar)
--
--  הקובץ הזה לא רץ אוטומטית. אתה מריץ אותו, בלוק אחר בלוק, ב-SQL Editor
--  של Supabase. כל בלוק עצמאי — אפשר לעצור בכל שלב.
--
--  ⚠️  זה לא קובץ migration ואסור לשים אותו ב-supabase/migrations/.
--      התיקייה הזאת מתארת מסד אחר; רק 4 מתוך 26 המיגרציות שם הופעלו אי-פעם,
--      והרצה מחדש שלהן הופכת את כל 9 העורכים למנהלים.
--
--  כל מספר כאן נמדד מול המסד החי ב-9.8.2026, לא הועתק ממסמך.
--  הסדר: בטוח → הפיך → בלתי-הפיך. אל תדלג קדימה.
-- ============================================================================


-- ============================================================================
--  בלוק 1 · תיקון טעות הקלדה בשם פרק 71                      [הפיך, שורה אחת]
-- ============================================================================
--  בטבלת categories שם פרק 71 מכיל נקודתיים כפולות: "Environments: : High".
--  אחרי שהחלטת שהמסד קובע את שמות הפרקים, השם הזה מוצג עכשיו למשתמשים
--  במדריך מילר. 5 שאלות משויכות לפרק הזה.

SELECT topic_num, topic_main FROM public.categories WHERE topic_num = 71;
-- צפוי: 'Clinical Care in Extreme Environments: : High Pressure, ...'

UPDATE public.categories
SET    topic_main = replace(topic_main, ': :', ':')
WHERE  topic_num = 71 AND topic_main LIKE '%: :%';
-- צפוי: UPDATE 1

SELECT topic_num, topic_main FROM public.categories WHERE topic_num = 71;


-- ============================================================================
--  בלוק 2 · לאפשר גם ל-9 העורכים ליצור סיכומים            [הפיך, אופציונלי]
-- ============================================================================
--  תיקנתי בקוד את הסיבה שהמודול מעולם לא שמר שורה (embed_url היה NOT NULL
--  והטופס שלח null). אבל מדיניות ה-INSERT דורשת is_admin(), שנכון בדיוק
--  למשתמש אחד מתוך 10. 9 העורכים עדיין לא יוכלו ליצור סיכום.
--
--  הרץ את הבלוק הזה רק אם אתה רוצה שגם עורכים יוכלו. אם רק אתה יוצר
--  סיכומים — דלג.

SELECT policyname, cmd, with_check
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'topic_summaries';

-- ↓ בטל את ההערה כדי להפעיל
-- DROP POLICY IF EXISTS "Admins can insert topic_summaries" ON public.topic_summaries;
-- CREATE POLICY "Admins and editors can insert topic_summaries"
--   ON public.topic_summaries FOR INSERT
--   WITH CHECK (is_admin(auth.uid()) OR is_editor(auth.uid()));


-- ============================================================================
--  בלוק 3 · מילוי מחדש של שמות נושא                    [⚠️ דורס נתוני משתמש]
-- ============================================================================
--  3,685 שורות תשובות נושאות שם נושא שהקטלוג כבר לא משתמש בו — השם נשמר
--  כצילום ברגע המענה, ואז שם הפרק שונה. אפס יתומים: אף שורה לא מיועדת
--  למחיקה, רק לעדכון.
--
--  נמדד: 2,678 ב-answer_history · 1,007 ב-user_answers.
--
--  ⚠️  זה דורס את "לאיזה נושא זה השתייך אז". אין דרך לשחזר בלי גיבוי,
--      ולכן שלב 3א יוצר אחד. אל תדלג עליו.

-- 3א · גיבוי לפני הדריסה. נשאר במסד עד שתמחק אותו בעצמך.
CREATE TABLE IF NOT EXISTS public.topic_backfill_backup_20260809 AS
SELECT 'answer_history' AS src, ah.id, ah.topic AS old_topic, q.topic AS new_topic
FROM   public.answer_history ah JOIN public.questions q ON q.id = ah.question_id
WHERE  ah.topic IS DISTINCT FROM q.topic AND q.topic IS NOT NULL
UNION ALL
SELECT 'user_answers', ua.id, ua.topic, q.topic
FROM   public.user_answers ua JOIN public.questions q ON q.id = ua.question_id
WHERE  ua.topic IS DISTINCT FROM q.topic AND q.topic IS NOT NULL;

SELECT src, count(*) FROM public.topic_backfill_backup_20260809 GROUP BY src;
-- צפוי בערך: answer_history 2678 · user_answers 1007
-- אם קיבלת 0 — עצור. משהו לא כמו שמדדתי.

-- 3ב · הדריסה עצמה.
--  התנאי q.topic IS NOT NULL חשוב: ל-2 שאלות מתוך 3,923 אין נושא בכלל,
--  ובלעדיו היינו מוחקים את השם הקיים ומחליפים אותו בריק.
UPDATE public.answer_history ah
SET    topic = q.topic
FROM   public.questions q
WHERE  q.id = ah.question_id
  AND  ah.topic IS DISTINCT FROM q.topic
  AND  q.topic IS NOT NULL;

UPDATE public.user_answers ua
SET    topic = q.topic
FROM   public.questions q
WHERE  q.id = ua.question_id
  AND  ua.topic IS DISTINCT FROM q.topic
  AND  q.topic IS NOT NULL;

-- 3ג · אימות. שתי השורות צריכות להחזיר 0 (או 2 השאלות חסרות-הנושא).
SELECT count(*) AS still_drifted_answer_history
FROM   public.answer_history ah JOIN public.questions q ON q.id = ah.question_id
WHERE  ah.topic IS DISTINCT FROM q.topic AND q.topic IS NOT NULL;

SELECT count(*) AS still_drifted_user_answers
FROM   public.user_answers ua JOIN public.questions q ON q.id = ua.question_id
WHERE  ua.topic IS DISTINCT FROM q.topic AND q.topic IS NOT NULL;

--  לשחזור, אם משהו נראה לא נכון:
--    UPDATE public.answer_history ah SET topic = b.old_topic
--    FROM public.topic_backfill_backup_20260809 b
--    WHERE b.src = 'answer_history' AND b.id = ah.id;
--  (ואותו דבר עם 'user_answers' ו-public.user_answers)


-- ============================================================================
--  בלוק 4 · מחיקת ה-cron היומי                              [בלתי-הפיך בקלות]
-- ============================================================================
--  ה-job היחיד במערכת. נמדד: 146 הרצות, 0 הצלחות, מאז 17.3.2026.
--  הסיבה: התוסף pg_net לא מותקן, ולכן 'schema net does not exist' כל בוקר.
--  יש לך כפתור ידני בממשק הניהול שעושה את אותו ייצוא ועובד.
--
--  בונוס: הפקודה של ה-job מכילה מפתח service_role בטקסט גלוי, והוא יושב
--  בכל גיבוי מאז פברואר. המחיקה מסלקת גם אותו.

SELECT jobid, schedule, jobname, active FROM cron.job;
SELECT count(*) AS runs, count(*) FILTER (WHERE status='succeeded') AS ok
FROM   cron.job_run_details;
-- צפוי: 1 job · 146 הרצות · 0 הצלחות

SELECT cron.unschedule(jobid) FROM cron.job;

-- מנקה גם את ההיסטוריה, כי היא זו שמחזיקה את המפתח ב-146 שורות
DELETE FROM cron.job_run_details;

SELECT count(*) AS jobs_left FROM cron.job;   -- צפוי: 0


-- ============================================================================
--  בלוק 5 · שמירת הרעיונות מטלגרם לפני מחיקה                        [קריאה]
-- ============================================================================
--  8 רעיונות שכתבת ב-26-27.3.2026. הפונקציות כבר נמחקו; נשארה הטבלה.
--  הרץ את זה, העתק את התוצאה לאיפה שנוח לך, ורק אז תמשיך לבלוק 6.

SELECT created_at, source, status, content, plan, notes
FROM   public.ideas ORDER BY created_at;
-- צפוי: 8 שורות


-- ============================================================================
--  בלוק 6 · מחיקת טבלאות מתות                                   [בלתי-הפיך]
-- ============================================================================
--  ⚠️  אל תריץ את זה לפני שהעתקת את התוצאה של בלוק 5.

--  ideas — 8 שורות, כל צרכניה נמחקו
DROP TABLE IF EXISTS public.ideas;

--  user_weekly_plans — 0 שורות, הטבלה היחידה במסד שמעולם לא נסרקה על ידי
--  אינדקס. הרכיב שאמור להשתמש בה, WeeklyPlanView, לא קיים כקובץ בכלל.
SELECT count(*) AS rows_before_drop FROM public.user_weekly_plans;  -- צפוי: 0
DROP TABLE IF EXISTS public.user_weekly_plans;


-- ============================================================================
--  בלוק 7 · מחיקת 11 עמודות ריקות מ-questions                   [בלתי-הפיך]
-- ============================================================================
--  הביקורת אמרה 12. ספרתי בעצמי: 11. אלה העמודות שבהן אין ולו ערך אחד
--  לא-ריק ב-3,923 השורות. לכל אחת יש "תאומה" מודרנית שכן בשימוש
--  (question_text↔question · correct_answer↔correct · option_a-d↔a,b,c,d ·
--  question_id↔ref_id · miller_page↔miller · media_kind↔media_type).
--
--  אימתתי לפני שכתבתי את זה:
--    · אף קובץ ב-src/ או ב-supabase/functions/ לא קורא אף אחת מהן
--    · הטריגר log_question_changes על הטבלה לא נוגע באף אחת מהן
--    · אף פונקציה במסד לא מזכירה אותן
--    · questions.question_id נושאת אילוץ UNIQUE שיירד יחד איתה. הוא מעולם
--      לא הגביל כלום — ב-Postgres ערכי NULL לא מתנגשים זה עם זה.
--
--  ⚠️  DROP COLUMN לא ניתן לביטול. אין שחזור בלי גיבוי מלא של המסד.
--      אם אתה מהסס — דלג. הן ריקות, הן לא מזיקות, הן רק מבלבלות.

-- אימות אחרון: כל השורות חייבות להחזיר 0 לפני שאתה ממשיך
SELECT count(correct_answer) AS correct_answer, count(institution) AS institution,
       count(media_kind)     AS media_kind,     count(miller_page) AS miller_page,
       count(option_a) AS option_a, count(option_b) AS option_b,
       count(option_c) AS option_c, count(option_d) AS option_d,
       count(question_id)    AS question_id,    count(question_text) AS question_text,
       count(serial_number)  AS serial_number
FROM   public.questions;
-- כל 11 חייבות להיות 0. אם אחת מהן לא — עצור ותגיד לי.

ALTER TABLE public.questions
  DROP COLUMN IF EXISTS correct_answer,
  DROP COLUMN IF EXISTS institution,
  DROP COLUMN IF EXISTS media_kind,
  DROP COLUMN IF EXISTS miller_page,
  DROP COLUMN IF EXISTS option_a,
  DROP COLUMN IF EXISTS option_b,
  DROP COLUMN IF EXISTS option_c,
  DROP COLUMN IF EXISTS option_d,
  DROP COLUMN IF EXISTS question_id,
  DROP COLUMN IF EXISTS question_text,
  DROP COLUMN IF EXISTS serial_number;


-- ============================================================================
--  אחרי שסיימת
-- ============================================================================
--  1. תגיד לי, ואני מרענן את src/integrations/supabase/types.ts מול המסד
--     החדש. בלי זה TypeScript עדיין יחשוב שהעמודות והטבלאות קיימות.
--
--  2. הגיבוי מבלוק 3 נשאר במסד בשם topic_backfill_backup_20260809.
--     כשאתה בטוח שהכל תקין — DROP TABLE public.topic_backfill_backup_20260809;
--
--  3. לא נכלל כאן בכוונה, למרות שהביקורת הציעה:
--     user_answers.confidence ו-user_answers.topic_num. שתיהן ריקות ב-33,522
--     השורות, אבל ל-confidence יש קורא חי — הפונקציה
--     get_question_ids_by_confidence, שנכשלת בכל קריאה ואין לה משתמשים.
--     צריך לסגור אותה קודם. החלטת לדחות, וזה נכון.
--
--  4. sync-questions כותבת עמודה בשם synced_at שלא קיימת ב-questions.
--     הפונקציה שבורה היום מהסיבה הזאת. לא נגעתי — זה תיקון קוד נפרד.
