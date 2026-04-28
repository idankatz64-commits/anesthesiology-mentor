-- ─────────────────────────────────────────────────────────────────────
-- PR #3 v2 — Production Verification Queries
-- Run 7 days after deploy via Supabase MCP.
-- Project: ksbblqnwcmfylpxygyrj
--
-- READ-ONLY: every statement is SELECT. No INSERT / UPDATE / DELETE / DDL.
-- Safe to run against production.
--
-- Schema notes (verified against supabase/migrations/ on 2026-04-28):
--   answer_history(user_id uuid, question_id text, topic text,
--                  is_correct bool, answered_at timestamptz)
--   spaced_repetition(user_id uuid, question_id text,
--                     next_review_date date, interval_days int,
--                     ease_factor numeric, repetitions int,
--                     confidence text, last_correct bool)
-- ─────────────────────────────────────────────────────────────────────


-- ── QUERY 1: Cool-down violations (per user, per question) ──────────
-- Find any (user_id, question_id) that appears more than once within a
-- 24-hour window in the last 7 days. The new 24h cool-down filter should
-- prevent this entirely.
--
-- Pass criterion:   0 rows  (or near-zero — a handful from edge cases is OK).
-- Fail signal  :    > 0 rows with closest_repeat_hours < 24.
WITH paired AS (
  SELECT
    a.question_id,
    a.user_id,
    a.answered_at AS first_at,
    b.answered_at AS second_at,
    EXTRACT(EPOCH FROM (b.answered_at - a.answered_at)) / 3600 AS hours_apart
  FROM answer_history a
  JOIN answer_history b
    ON a.question_id = b.question_id
   AND a.user_id     = b.user_id
   AND b.answered_at >  a.answered_at
   AND b.answered_at <= a.answered_at + INTERVAL '24 hours'
  WHERE a.answered_at >= NOW() - INTERVAL '7 days'
)
SELECT
  question_id,
  user_id,
  COUNT(*)            AS within_24h_repeats,
  MIN(hours_apart)    AS closest_repeat_hours
FROM paired
GROUP BY question_id, user_id
ORDER BY within_24h_repeats DESC, closest_repeat_hours ASC
LIMIT 20;


-- ── QUERY 2: Future-schedule violations ─────────────────────────────
-- Questions answered in the last 7 days where the SRS schedule had them
-- due MORE than 7 days in the future at answer time. The new schedule
-- filter should prevent this — such questions should have been excluded
-- from the candidate pool.
--
-- Pass criterion:   0 rows.
-- Fail signal  :    rows with days_in_future > 7  →  filter is bypassed.
SELECT
  ah.question_id,
  ah.user_id,
  ah.answered_at,
  sr.next_review_date,
  (sr.next_review_date - ah.answered_at::date) AS days_in_future
FROM answer_history ah
JOIN spaced_repetition sr
  ON sr.question_id = ah.question_id
 AND sr.user_id     = ah.user_id
WHERE ah.answered_at  >= NOW() - INTERVAL '7 days'
  AND sr.next_review_date > (ah.answered_at::date + 7)
ORDER BY days_in_future DESC
LIMIT 20;


-- ── QUERY 3: Q6C275F regression check ───────────────────────────────
-- The specific question that triggered this fix. Cross-user view: if it
-- shows up at all in the last 7 days for any user, drill in to the
-- (user_id, days_in_future_at_answer) pair to confirm it was legitimate
-- (i.e., the user's schedule had it due ≤ 7 days out).
--
-- Pass criterion:   either 0 rows, OR every row has
--                   days_in_future_at_answer ≤ 7.
-- Fail signal  :    a row with days_in_future_at_answer > 7  →  the
--                   exact bug recurred.
SELECT
  ah.user_id,
  ah.answered_at,
  sr.next_review_date,
  (sr.next_review_date - ah.answered_at::date) AS days_in_future_at_answer
FROM answer_history ah
LEFT JOIN spaced_repetition sr
  ON sr.question_id = ah.question_id
 AND sr.user_id     = ah.user_id
WHERE ah.question_id = 'Q6C275F'
  AND ah.answered_at >= NOW() - INTERVAL '7 days'
ORDER BY ah.answered_at DESC;


-- ── QUERY 4: New-question quota proof ───────────────────────────────
-- For sessions of ≥ 20 questions in the last 7 days (proxy: hour buckets
-- per user), measure the % of questions never seen by that user before
-- the session bucket. The new 30% quota should push this materially
-- above pre-fix levels.
--
-- Pass criterion:   pct_new ≥ 25 across most rows (target 30, allow
--                   variance — small users with mostly-seen pools may sit
--                   below).
-- Fail signal  :    pct_new ≈ 0 across the board  →  quota is not firing.
WITH session_starts AS (
  SELECT
    user_id,
    DATE_TRUNC('hour', answered_at) AS session_hour,
    ARRAY_AGG(question_id)          AS qids
  FROM answer_history
  WHERE answered_at >= NOW() - INTERVAL '7 days'
  GROUP BY user_id, DATE_TRUNC('hour', answered_at)
  HAVING COUNT(*) >= 20  -- only sessions with ≥ 20 questions
)
SELECT
  ss.user_id,
  ss.session_hour,
  ARRAY_LENGTH(ss.qids, 1) AS session_size,
  COUNT(*) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM answer_history prior
      WHERE prior.user_id     = ss.user_id
        AND prior.question_id = ANY(ss.qids)
        AND prior.answered_at < ss.session_hour
    )
  ) AS never_seen_before,
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM answer_history prior
        WHERE prior.user_id     = ss.user_id
          AND prior.question_id = ANY(ss.qids)
          AND prior.answered_at < ss.session_hour
      )
    ) / NULLIF(ARRAY_LENGTH(ss.qids, 1), 0),
    1
  ) AS pct_new
FROM session_starts ss
ORDER BY session_hour DESC
LIMIT 20;
