-- Academy module (Phase A) hardening round 3: restrict quiz deletion when
-- attempts exist, at the database level.
-- Design: docs/specs/2026-08-12-academy-module-design.md
-- Applied via Supabase MCP on 2026-08-13; recorded here for source-of-truth.

-- Quiz deletion must never cascade away submitted attempts (immutable records).
-- The admin UI blocks deletion client-side when attempts exist; this makes the
-- database enforce it regardless of stale client state.
ALTER TABLE public.quiz_attempts
  DROP CONSTRAINT quiz_attempts_quiz_id_fkey;
ALTER TABLE public.quiz_attempts
  ADD CONSTRAINT quiz_attempts_quiz_id_fkey
  FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE RESTRICT;
