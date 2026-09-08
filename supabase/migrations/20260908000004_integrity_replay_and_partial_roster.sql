-- Integrity fixes from the independent security review (SECURITY-REVIEW.md,
-- 2026-09-08, HEAD 0105221). Forward-only: the five launch migrations were
-- already applied to QA and are NOT edited. Everything here is a
-- `create or replace` of a function those migrations defined, so grants,
-- ownership and search_path pinning survive unchanged; the re-asserted
-- revoke/grant block at the bottom is belt-and-braces, not a change.
--
-- Two defects are closed and one non-defect is documented:
--
--   F-2  attempt_confirm leaked `is_correct` on an idempotent replay when the
--        session had chosen DEFERRED feedback (mode='practice' AND
--        feedback_timing='end' -> _locking true, _reveal false). The
--        first-confirm return already guarded the field; the replay branch did
--        not. Self-leak only, but it silently defeats the feedback contract the
--        resident chose, and would become a real hole the moment deferred
--        feedback is enforced (proctored practice, a graded variant reusing
--        mode='practice'). attempt_read already guards the same field, so the
--        replay branch was the single remaining asymmetry.
--
--   F-3  upsert_resident_roster clobbered `full_name` and `exam_this_year` on a
--        partial re-import (a CSV of e-mails only). `residency_year` was
--        already protected with coalesce, which is what made the asymmetry read
--        as an oversight rather than a decision.
--
--   F-4  no upper bound on attempt size / open attempts: assessed, NOT changed.
--        See the note at the bottom of this file.
--
-- WHY COALESCE ALONE IS NOT THE FIX FOR `exam_this_year` (the trap here):
--   `academy_members.exam_this_year` is `boolean NOT NULL default false`
--   (20260907000002:18), and the row builder maps an ABSENT key on a row that
--   also omits `residency_year` to `false`, not to NULL (20260907000002:223).
--   So on a partial re-import `excluded.exam_this_year` is `false` — a real
--   value, not a null — and `coalesce(excluded.exam_this_year, ...)` would
--   still overwrite a stored `true`. Nor can the absent case be inserted as
--   NULL and coalesced: the column is NOT NULL, so the insert path would fail.
--   "Absent" and "explicitly false" are only distinguishable at the source, so
--   the DO UPDATE consults the staged row's `exam_flag_supplied` bit directly.
--   An explicit `"exam_this_year": false` therefore still updates, which the
--   existing roster-race probe in scripts/entitlement-db/run.sh asserts
--   ("Race B" writes false over true and must win).
--
-- Validation semantics are deliberately UNCHANGED: which rows are rejected, and
-- with which reason, is byte-identical to 20260907000002. In particular a row
-- that supplies `residency_year` while omitting `exam_this_year` is still
-- INVALID_EXAM_FLAG, and a non-boolean flag is still INVALID_EXAM_FLAG. Only
-- what an accepted row WRITES to a pre-existing member changed.

-- ---------------------------------------------------------------------------
-- F-2 — attempt_confirm: the replay branch now mirrors the first-confirm return
-- ---------------------------------------------------------------------------
-- Body is the 20260907000002 version verbatim except the marked line.
create or replace function public.attempt_confirm(_attempt_id uuid, _question_id text, _selected text, _confidence text, _answer_ms integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := public.attempt_caller(); _attempt public.attempts; _row public.attempt_questions;
  _locking boolean; _is_correct boolean; _reveal boolean; _explanation text;
begin
  if _selected is null or _selected not in ('A', 'B', 'C', 'D')
     or _confidence is null or _confidence not in ('confident', 'hesitant', 'guessed')
     or _answer_ms is null or _answer_ms < 0 or _answer_ms > 86400000 then
    raise exception 'INVALID_INPUT';
  end if;
  select * into _attempt from public.attempts where id = _attempt_id and user_id = _uid for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  perform public.attempt_check_entitlement(_uid, _attempt_id);
  if _attempt.status <> 'in_progress' then raise exception 'ATTEMPT_NOT_OPEN'; end if;
  select * into _row from public.attempt_questions where attempt_id = _attempt_id and question_id = _question_id;
  if not found then raise exception 'QUESTION_NOT_IN_ATTEMPT'; end if;

  _locking := _attempt.mode = 'practice' or _attempt.feedback_timing = 'immediate';
  _reveal := _attempt.feedback_timing = 'immediate';
  if _reveal then select s.snapshot->>'explanation' into _explanation from public.question_snapshots s where s.content_hash = _row.content_hash; end if;
  if _row.confirmed_at is not null and _locking then
    if _row.selected = _selected and _row.confidence = _confidence then
      -- F-2: `is_correct` is now gated on _reveal exactly as the first-confirm
      -- return below is. A replay of a deferred-feedback confirmation is still
      -- idempotent and still reports `locked: true`; it just no longer answers
      -- a question the session said would be answered at submit.
      return jsonb_build_object('is_correct', case when _reveal then _row.is_correct end, 'correct_key', case when _reveal then _row.correct_key end, 'explanation', _explanation, 'locked', true);
    end if;
    raise exception 'CONFIRMED_IMMUTABLE';
  end if;

  _is_correct := case when _row.correct_key is null then null else _selected = _row.correct_key end;
  update public.attempt_questions
     set selected = _selected, confidence = _confidence, answer_ms = _answer_ms, confirmed_at = now(), is_correct = _is_correct
   where attempt_id = _attempt_id and question_id = _question_id;
  if _attempt.mode = 'practice' and _is_correct is not null and not _row.credited then
    perform public.attempt_apply_credit(_uid, _question_id, (select s.snapshot->>'topic' from public.question_snapshots s where s.content_hash = _row.content_hash), _is_correct, _confidence);
    update public.attempt_questions set credited = true where attempt_id = _attempt_id and question_id = _question_id;
  end if;
  return jsonb_build_object('is_correct', case when _reveal then _is_correct end, 'correct_key', case when _reveal then _row.correct_key end, 'explanation', _explanation, 'locked', _locking);
end $$;

-- ---------------------------------------------------------------------------
-- F-3 — upsert_resident_roster: a partial re-import no longer erases fields
-- ---------------------------------------------------------------------------
-- Body is the 20260907000002 version verbatim except the staged
-- `exam_flag_supplied` column and the three-line `on conflict` set-list.
create or replace function public.upsert_resident_roster(_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _rejected jsonb; _inserted integer; _updated integer;
begin
  if _uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.is_roster_admin(_uid) then raise exception 'NOT_ADMIN'; end if;
  if _rows is null or jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) not between 1 and 500 then raise exception 'INVALID_INPUT'; end if;
  create temp table _roster on commit drop as
    select r.ord as row_number,
           nullif(btrim(r.value->>'name'), '') as full_name,
           nullif(lower(btrim(r.value->>'email')), '') as email,
           nullif(btrim(r.value->>'residency_year'), '') as residency_year_text,
           case when nullif(btrim(r.value->>'residency_year'), '') ~ '^[1-7]$'
                then (r.value->>'residency_year')::smallint end as residency_year,
           case when not (r.value ? 'exam_this_year') and r.value ? 'residency_year' then null
                when not (r.value ? 'exam_this_year') then false
                when jsonb_typeof(r.value->'exam_this_year') = 'boolean' then (r.value->>'exam_this_year')::boolean end as exam_this_year,
           -- F-3: the one bit `excluded` cannot carry. `exam_this_year` is NOT
           -- NULL, so an absent key and an explicit false are the same value by
           -- the time the insert runs; this records which one it was.
           (r.value ? 'exam_this_year') as exam_flag_supplied
      from jsonb_array_elements(_rows) with ordinality r(value, ord);
  select jsonb_agg(jsonb_build_object('row', row_number, 'reason', reason) order by row_number) into _rejected
    from (select row_number, case
            when email is null then 'MISSING_EMAIL'
            when email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(email) > 254 then 'INVALID_EMAIL'
            when length(full_name) > 200 then 'INVALID_NAME'
            when residency_year_text is not null and residency_year is null then 'INVALID_RESIDENCY_YEAR'
            when exam_this_year is null then 'INVALID_EXAM_FLAG'
            when count(*) over (partition by email) > 1 then 'DUPLICATE_IN_BATCH' end as reason
          from _roster) x where reason is not null;
  if _rejected is not null then return jsonb_build_object('applied', false, 'rejected', _rejected); end if;
  -- One statement, arbitrated by the normalized-email unique index: two
  -- concurrent imports of the same new address serialize on the index and the
  -- second becomes an update, instead of both seeing "no row" and one failing.
  -- Deliberately NOT rewritten as a left join onto academy_members: that would
  -- read the existing row before the index arbitrates and reintroduce exactly
  -- the TOCTOU this shape avoids. The set-list below reads only `excluded`,
  -- the locked target row, and the session-local staging table.
  --
  -- A supplied field wins; an OMITTED field leaves the stored value alone.
  -- Omitted or blank `name` -> NULL -> preserved (a name cannot be cleared by
  -- re-import; it never could be cleared deliberately either, since blank and
  -- absent were already indistinguishable). Omitted `residency_year` ->
  -- preserved, unchanged from before. Omitted `exam_this_year` -> preserved;
  -- an explicit true/false still writes.
  -- ponytail: xmax = 0 marks the rows this statement inserted; updated rows carry a locker xid.
  with up as (
    insert into public.academy_members (email, full_name, residency_year, exam_this_year)
    select r.email, r.full_name, r.residency_year, r.exam_this_year from _roster r
    on conflict (lower(btrim(email))) do update
      set full_name = coalesce(excluded.full_name, academy_members.full_name),
          residency_year = coalesce(excluded.residency_year, academy_members.residency_year),
          exam_this_year = case
            when (select r.exam_flag_supplied from _roster r where r.email = excluded.email)
              then excluded.exam_this_year
            else academy_members.exam_this_year end
    returning (xmax = 0) as inserted)
  select count(*) filter (where inserted), count(*) filter (where not inserted) into _inserted, _updated from up;
  return jsonb_build_object('applied', true, 'inserted', _inserted, 'updated', _updated);
end $$;

comment on function public.upsert_resident_roster(jsonb) is
  'Roster import, roster admins only, all-or-nothing. A supplied field wins; an omitted name/residency_year/exam_this_year leaves the stored value alone (a partial e-mail-only re-import is non-destructive). An explicit exam_this_year=false still writes. Never touches access_level, status, national_access, user_id or onboarding_completed_at.';

-- Re-assert the privileges these two functions were created with. `create or
-- replace` already preserves them; this makes the migration self-contained if
-- it is ever replayed onto a rebuilt database.
revoke all on function public.upsert_resident_roster(jsonb) from public, anon;
grant execute on function public.upsert_resident_roster(jsonb) to authenticated;
revoke all on function public.attempt_confirm(uuid, text, text, text, integer) from public, anon;
grant execute on function public.attempt_confirm(uuid, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- F-4 — assessed, deliberately NOT changed. Recorded so it is not re-litigated.
-- ---------------------------------------------------------------------------
-- The review notes that attempt_validate_order bounds the array's emptiness,
-- element length, duplicates and existence, but not its cardinality, and that
-- attempt_start (unlike attempt_repeat) will open an unlimited number of
-- concurrent attempts.
--
-- No concrete defect follows from this at present:
--   * No boundary is crossed. Every path is behind attempt_caller() ->
--     authenticated + approved, and behind entitlement; there is no anonymous
--     amplification and nothing is disclosed.
--   * attempt_start already refuses ids that do not exist in `questions`, so
--     cardinality is capped in practice by the size of the entitled bank.
--     `question_snapshots` is deduplicated by content hash, so repeated calls
--     grow only `attempt_questions`.
--   * A ceiling is a PRODUCT decision (what is the largest legitimate session?
--     how many parallel sessions may a resident keep open?) and the two answers
--     are independent. Inventing a number here would fail real sessions at an
--     arbitrary size, which is a worse outcome than the abuse it prevents from
--     a manually vetted, individually revocable roster.
-- If a ceiling is wanted, it belongs in a migration of its own, with the number
-- set by the product owner:
--   in attempt_validate_order: cardinality(_question_ids) > <max> -> TOO_MANY_QUESTIONS
--   in attempt_start:          count of the caller's in_progress attempts > <max> -> TOO_MANY_OPEN_ATTEMPTS
