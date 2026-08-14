-- Academy module (Phase A) hardening round 4: pre-open answer-key extraction
-- and members SELECT hygiene.
-- Design: docs/specs/2026-08-12-academy-module-design.md
-- Applied via Supabase MCP on 2026-08-13; recorded here for source-of-truth.

-- Members must not be able to read a quiz (and its question_ids, which resolve
-- to full question rows including correct answers via the client-side bank)
-- before it opens. Admins remain unrestricted.
DROP POLICY IF EXISTS "Members and admins can read quizzes" ON public.quizzes;
CREATE POLICY "Members and admins can read quizzes"
  ON public.quizzes
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (
      now() >= opens_at
      AND EXISTS (
        SELECT 1 FROM public.academy_members m
        WHERE m.user_id = auth.uid() AND m.status = 'active'
      )
    )
  );

-- Members can read their own membership row either by linked user_id, or by
-- email match restricted to Google-verified sign-ins (was previously any
-- unverified JWT email claim).
DROP POLICY IF EXISTS "Members can read own membership" ON public.academy_members;
CREATE POLICY "Members can read own membership"
  ON public.academy_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
      AND (auth.jwt()->'app_metadata'->'providers') ? 'google'
    )
  );
