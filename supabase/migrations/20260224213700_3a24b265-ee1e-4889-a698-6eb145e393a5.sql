
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false;
