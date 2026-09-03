-- 3.9.2026 · backfill של confidence ליומן (אישור עידן 12:22 + 12:42, בתנאים):
--   1) כותבים רק לשורות שבהן confidence IS NULL — אף פעם לא דורסים ערך קיים
--   2) הערך מסומן כמוערך: confidence_estimated = true = "המצב האחרון" מ-spaced_repetition,
--      לא הביטחון בזמן-המענה. אימון-FSRS עתידי חייב להבחין (false = נכתב חי ע"י הטריגר)
--   3) רק זוגות שבהם שורת-המצב ושורת-המענה האחרונה נוצרו באותה שעה — 660 זוגות רחוקים יותר
--      (למשל "סמן לחזרה" בלי מענה) דולגו במכוון, לא נוחשו
-- הוכחת ROLLBACK הוצגה לעידן: 80,489 שורות · 32,622 ייכתבו · 0 נדרסות.
-- הוחל על הפרוד 3.9 12:4x דרך MCP (answer_history_confidence_backfill).

alter table public.answer_history
  add column if not exists confidence_estimated boolean not null default false;

comment on column public.answer_history.confidence_estimated is
  'true = confidence הועתק ב-backfill (3.9.2026) ממצב-אחרון ב-spaced_repetition, לא נמדד בזמן המענה. false = נכתב חי.';

with last as (
  select distinct on (user_id, question_id) id, user_id, question_id, answered_at
    from public.answer_history
   order by user_id, question_id, answered_at desc
)
update public.answer_history h
   set confidence = s.confidence,
       confidence_estimated = true
  from last l
  join public.spaced_repetition s on s.user_id = l.user_id and s.question_id = l.question_id
 where h.id = l.id
   and h.confidence is null
   and s.confidence is not null
   and abs(extract(epoch from (s.updated_at - l.answered_at))) <= 3600;
