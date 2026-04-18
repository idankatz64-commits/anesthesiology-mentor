-- Add SM-2 algorithm columns to spaced_repetition table.
-- These columns were added manually to the DB but were missing from migrations.
-- IF NOT EXISTS makes this idempotent — safe to run even if they already exist.

ALTER TABLE public.spaced_repetition
  ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ease_factor   NUMERIC  DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS repetitions   INTEGER DEFAULT 0;

-- Fix default: new rows should start due tomorrow, not today.
-- Starting due today causes all newly-seen questions to pile up in the same day.
ALTER TABLE public.spaced_repetition
  ALTER COLUMN next_review_date SET DEFAULT (CURRENT_DATE + 1);
