-- ============================================================================
--  ניקוי מסד ידני — בוצע 9.8.2026
--  פרויקט: ksbblqnwcmfylpxygyrj
--
--  ⚠️  הקובץ הזה הוא **רשומה של מה שכבר רץ**, לא רשימת מטלות. אל תריץ אותו
--      שוב. הוא נשמר כתיעוד ובגלל מלכודת אחת שחשוב לזכור (בלוק 5).
--
--  ⚠️  לא migration. אסור להעביר ל-supabase/migrations/ — התיקייה ההיא מתארת
--      מסד אחר, ורק 4 מתוך 26 המיגרציות שם הופעלו אי-פעם.
-- ============================================================================


-- ─── 1 · טעות הקלדה בשם פרק 71 ─────────────────────────────── בוצע ✔ 1 שורה
--  'Environments: : High' → 'Environments: High'.
--  קובץ המקור בקוד (millerChapters.ts) כבר החזיק נקודתיים בודדות, גם ב-70
--  וגם ב-71, ולכן זה יישר את המסד לקוד ולא להפך.
UPDATE public.categories SET topic_main = replace(topic_main, ': :', ':')
WHERE  topic_num = 71 AND topic_main LIKE '%: :%';


-- ─── 2 · עורכים יכולים ליצור ולערוך סיכומים ─────────────────── בוצע ✔
--  היו 1 מנהל ו-9 עורכים; כל שלוש פעולות הכתיבה דרשו is_admin.
--  מחיקה נשארה למנהל בלבד בכוונה.
DROP POLICY IF EXISTS "Admins can insert topic_summaries" ON public.topic_summaries;
CREATE POLICY "Admins and editors can insert topic_summaries"
  ON public.topic_summaries FOR INSERT
  WITH CHECK (is_admin(auth.uid()) OR is_editor(auth.uid()));
DROP POLICY IF EXISTS "Admins can update topic_summaries" ON public.topic_summaries;
CREATE POLICY "Admins and editors can update topic_summaries"
  ON public.topic_summaries FOR UPDATE
  USING (is_admin(auth.uid()) OR is_editor(auth.uid()));


-- ─── 3 · השלמת הקטלוג ל-87 פרקי מילר ────────────────────── בוצע ✔ 14 שורות
--  חסרו 1–7, 26, 48, 63, 64, 84, 85, 87. ארבעה מהם החזיקו 7 שאלות שהיו
--  תלויות באוויר בלי רשומת קטגוריה.
INSERT INTO public.categories (topic_num, topic_main) VALUES
  (1,'The Scope of Modern Anesthetic Practice'),(2,'Anesthesia and Global Health Equity'),
  (3,'Perioperative Medicine'),(4,'Informatics in Perioperative Medicine'),
  (5,'Quality Improvement in Anesthesia Practice and Patient Safety'),
  (6,'Human Behavior and Simulation in Anesthesia'),(7,'Ethical Aspects of Anesthesia Care'),
  (26,'Immune Implications of Anesthesia Care and Practice'),(48,'Palliative Medicine'),
  (63,'Prehospital Care for Medical Emergencies and Trauma'),
  (64,'Biologic, Natural, and Human-Induced Disasters: The Role of the Anesthesiologist'),
  (84,'Occupational Safety, Infection Control, and Substance Use Disorders'),
  (85,'Emergency Preparedness in Health Care'),(87,'Interpreting the Medical Literature')
ON CONFLICT DO NOTHING;

-- 3ב · שלוש שאלות שנשארו בלי שם נושא אחרי שהקטלוג הושלם.
UPDATE public.questions q SET topic = c.topic_main
FROM   public.categories c
WHERE  c.topic_num = q.chapter AND q.topic IS DISTINCT FROM c.topic_main;


-- ─── 4 · גיבוי לפני המילוי מחדש ──────────────────── בוצע ✔ 3,715 שורות
--  נוצר עם RLS מופעל וללא מדיניות: לא נגיש דרך ה-API, נגיש לבעלים.
--  ⚠️ עדיין קיים. למחיקה כשברור שהכל תקין:
--     DROP TABLE public.topic_backfill_backup_20260809;
CREATE TABLE public.topic_backfill_backup_20260809 AS
SELECT 'answer_history' AS src, ah.id, ah.topic AS old_topic, q.topic AS new_topic
FROM   public.answer_history ah JOIN public.questions q ON q.id = ah.question_id
WHERE  ah.topic IS DISTINCT FROM q.topic AND q.topic IS NOT NULL
UNION ALL
SELECT 'user_answers', ua.id, ua.topic, q.topic
FROM   public.user_answers ua JOIN public.questions q ON q.id = ua.question_id
WHERE  ua.topic IS DISTINCT FROM q.topic AND q.topic IS NOT NULL;
--  הורץ פעמיים: הפעם השנייה השלימה 112 שורות שנכנסו לקבוצה רק אחרי 3ב.


-- ─── 5 · מילוי מחדש של שמות הנושא ───────────── בוצע ✔ 2,699 + 1,016 שורות
--
--  ⚠️⚠️  המלכודת שבגללה הקובץ הזה נשמר.
--
--  על user_answers יושב הטריגר trg_sync_answer_history, והוא מוגדר
--  AFTER INSERT **OR UPDATE**. הוא מוסיף שורה ל-answer_history בכל הפעלה.
--  UPDATE תמים על 1,016 שורות היה יוצר 1,016 שורות תשובה מזויפות ומזהם כל
--  סטטיסטיקה במערכת, בלי שום שגיאה.
--
--  לכן: answer_history (בלי טריגרים) עודכנה ישירות, ו-user_answers עודכנה
--  בנפרד עם השבתה זמנית בתוך טרנזקציה. אם תצטרך לעשות את זה שוב — ככה.

UPDATE public.answer_history ah SET topic = q.topic
FROM   public.questions q
WHERE  q.id = ah.question_id AND ah.topic IS DISTINCT FROM q.topic
  AND  q.topic IS NOT NULL;

BEGIN;
ALTER TABLE public.user_answers DISABLE TRIGGER trg_sync_answer_history;
UPDATE public.user_answers ua SET topic = q.topic
FROM   public.questions q
WHERE  q.id = ua.question_id AND ua.topic IS DISTINCT FROM q.topic
  AND  q.topic IS NOT NULL;
ALTER TABLE public.user_answers ENABLE TRIGGER trg_sync_answer_history;
COMMIT;

--  אומת אחרי: הטריגר פעיל · answer_history 80,485 ללא שינוי ·
--  user_answers 33,522 ללא שינוי · 0 שורות עם שם ישן · 0 עם שם ריק.
--
--  לשחזור:
--    UPDATE public.answer_history ah SET topic = b.old_topic
--    FROM public.topic_backfill_backup_20260809 b
--    WHERE b.src = 'answer_history' AND b.id = ah.id;
--    (ואותו דבר עם 'user_answers' — עם אותה השבתת טריגר)


-- ─── 6 · מחיקת ה-cron היומי ───────────────────── בוצע ✔ 1 job, 146 שורות
--  146 הרצות, 0 הצלחות, מאז 17.3.2026 — pg_net לא מותקן.
--  היומן נמחק גם כדי לסלק 146 עותקים של מפתח service_role בטקסט גלוי.
--  הייצוא הידני בממשק הניהול לא הושפע.
SELECT cron.unschedule(jobid) FROM cron.job;
DELETE FROM cron.job_run_details;


-- ─── 7 · טבלאות מתות ───────────────────────────────────────── בוצע ✔
--  ideas — נמחקה בלוח הבקרה תוך כדי העבודה. 8 הרעיונות מ-26-27.3 ירדו איתה
--  ולא יוצאו קודם. שחזור אפשרי רק דרך PITR.
--  user_weekly_plans — 0 שורות, WeeklyPlanView לא קיים כקובץ.
DROP TABLE IF EXISTS public.user_weekly_plans;


-- ─── 8 · 11 עמודות ריקות ב-questions ──────────────────────── בוצע ✔
--  הביקורת אמרה 12; הספירה בפועל נתנה 11. לכל אחת תאומה מודרנית בשימוש.
--  אומת לפני: 0 ערכים לא-ריקים ב-3,923 השורות, אף קורא בקוד, אף פונקציה
--  במסד, והטריגר על הטבלה לא נוגע בהן.
ALTER TABLE public.questions
  DROP COLUMN IF EXISTS correct_answer, DROP COLUMN IF EXISTS institution,
  DROP COLUMN IF EXISTS media_kind,     DROP COLUMN IF EXISTS miller_page,
  DROP COLUMN IF EXISTS option_a,       DROP COLUMN IF EXISTS option_b,
  DROP COLUMN IF EXISTS option_c,       DROP COLUMN IF EXISTS option_d,
  DROP COLUMN IF EXISTS question_id,    DROP COLUMN IF EXISTS question_text,
  DROP COLUMN IF EXISTS serial_number;


-- ============================================================================
--  לא בוצע, בכוונה
-- ============================================================================
--  user_answers.confidence ו-user_answers.topic_num — ריקות ב-33,522 השורות,
--  אבל ל-confidence יש קורא חי: get_question_ids_by_confidence, פונקציה
--  SECURITY DEFINER שנכשלת בכל קריאה (42804) ואין לה אף משתמש. צריך לסגור
--  אותה קודם.
--
--  sync-questions כותבת עמודה synced_at שלא קיימת ב-questions. הפונקציה
--  שבורה מהסיבה הזאת. תיקון קוד נפרד.
-- ============================================================================
