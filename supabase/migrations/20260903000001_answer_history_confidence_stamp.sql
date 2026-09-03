-- 3.9.2026 · confidence → answer_history
-- answer_history.confidence היה NULL בכל 80,489 השורות: ה-RPC increment_user_answer כותב
-- user_answers (→ טריגר → answer_history) בלי confidence, וה-confidence נכתב רק על שורת
-- המצב ב-spaced_repetition, שנדרסת בכל חזרה. בלי יומן-confidence אין על מה לאמן FSRS.
--
-- הפתרון: חותמת. כל כתיבה ל-spaced_repetition מעדכנת את שורת ה-answer_history האחרונה
-- של אותו (user, question) — רק אם היא עדיין בלי confidence ונוצרה ב-10 הדקות האחרונות.
-- ponytail: fail-safe — אם כתיבת ה-SRS נחתה לפני שורת-היומן (מרוץ נדיר), נשאר NULL, לא ערך שגוי.
-- לא נוגע בשורות היסטוריות (backfill = החלטה נפרדת).

create or replace function public.stamp_answer_history_confidence()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.confidence is null then
    return new;
  end if;
  update public.answer_history h
     set confidence = new.confidence
   where h.id = (
     select id
       from public.answer_history
      where user_id = new.user_id
        and question_id = new.question_id
        and confidence is null
        and answered_at >= now() - interval '10 minutes'
      order by answered_at desc
      limit 1
   );
  return new;
end;
$$;

drop trigger if exists trg_stamp_answer_history_confidence on public.spaced_repetition;
create trigger trg_stamp_answer_history_confidence
  after insert or update of confidence, updated_at on public.spaced_repetition
  for each row
  execute function public.stamp_answer_history_confidence();

-- האינדקס שהחיפוש בטריגר צריך (user, question, זמן)
create index if not exists answer_history_user_question_time_idx
  on public.answer_history (user_id, question_id, answered_at desc);
