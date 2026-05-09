-- Fix B3 HIGH: public bucket `question-images` allowed clients to LIST all
-- files via the broad SELECT policy. The bucket is public=true, so direct
-- URL access (`/storage/v1/object/public/question-images/<key>`) continues
-- to work without any SELECT policy. We drop the listing-enabling policy.
--
-- Verified: src/components/RichTextEditor.tsx uses only `.upload()` and
-- `.getPublicUrl()` — no `.list()` calls anywhere in the codebase.
--
-- Applied via Supabase MCP on 2026-05-09; recorded here for source-of-truth.

DROP POLICY IF EXISTS "Allow all reads question-images" ON storage.objects;
