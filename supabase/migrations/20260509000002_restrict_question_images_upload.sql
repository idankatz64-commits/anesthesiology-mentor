-- Fix: bucket `question-images` allowed ANY user (incl. anonymous) to INSERT
-- via "Allow all uploads question-images" policy. Anonymous attackers could
-- script unrestricted uploads → Storage bill bloat + legal liability for
-- arbitrary content.
--
-- Sole legitimate caller: src/components/RichTextEditor.tsx (admin/editor
-- question editor, gated behind admin route in the frontend). Restrict to
-- authenticated users with admin or editor role.
--
-- Applied via Supabase MCP on 2026-05-09; recorded here for source-of-truth.

DROP POLICY IF EXISTS "Allow all uploads question-images" ON storage.objects;

CREATE POLICY "Admin/editor upload to question-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'question-images'
    AND (public.is_admin(auth.uid()) OR public.is_editor(auth.uid()))
  );
