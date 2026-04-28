import { describe, it, expect } from 'vitest';
import {
  isFutureScheduled,
  FUTURE_SCHEDULE_FILTER_DAYS,
} from '@/lib/srsScheduleFilter';
import type { SrsRecord } from '@/lib/srsRepository';

// 2026-04-27 12:00:00 UTC
const NOW = new Date('2026-04-27T12:00:00Z').getTime();

// SrsRecord has 6 fields only — NO user_id / question_id (those live on
// SrsUpsertPayload). confidence must be ConfidenceLevel | null
// ('confident' | 'hesitant' | 'guessed' | null). Using `null` here keeps the
// fixture orthogonal to anything PR #3 cares about.
function rec(nextReview: string): SrsRecord {
  return {
    next_review_date: nextReview,
    interval_days: 10,
    ease_factor: 2.5,
    repetitions: 3,
    confidence: null,
    last_correct: true,
  };
}

describe('srsScheduleFilter', () => {
  it('exports default filter window of 7 days', () => {
    expect(FUTURE_SCHEDULE_FILTER_DAYS).toBe(7);
  });

  it('returns false when question has no SRS record', () => {
    expect(isFutureScheduled('q1', {}, NOW)).toBe(false);
  });

  it('returns false when next_review_date is in the past', () => {
    const srs = { q1: rec('2026-04-20') };
    expect(isFutureScheduled('q1', srs, NOW)).toBe(false);
  });

  it('returns false when next_review_date is today', () => {
    const srs = { q1: rec('2026-04-27') };
    expect(isFutureScheduled('q1', srs, NOW)).toBe(false);
  });

  it('returns false when next_review_date is exactly 7 days out (boundary)', () => {
    const srs = { q1: rec('2026-05-04') };
    expect(isFutureScheduled('q1', srs, NOW)).toBe(false);
  });

  it('returns true when next_review_date is 8 days out', () => {
    const srs = { q1: rec('2026-05-05') };
    expect(isFutureScheduled('q1', srs, NOW)).toBe(true);
  });

  it('returns true for the production Q6C275F case (105 days out)', () => {
    const srs = { q1: rec('2026-08-10') };
    expect(isFutureScheduled('q1', srs, NOW)).toBe(true);
  });

  it('honours custom daysAhead override (3 days)', () => {
    const srs = { q1: rec('2026-05-01') }; // 4 days out
    expect(isFutureScheduled('q1', srs, NOW, 3)).toBe(true);
  });

  it('returns false when next_review_date string is malformed', () => {
    const srs = { q1: rec('not-a-date') };
    expect(isFutureScheduled('q1', srs, NOW)).toBe(false);
  });

  // Defensive branch: SrsRecord types next_review_date as `string`, but
  // production rows can drift (legacy nullables, empty writes). The
  // `!record.next_review_date` short-circuit at srsScheduleFilter.ts:24 is
  // distinct from the Date.parse NaN guard at line 27 — empty string never
  // reaches Date.parse. Pin both branches so a refactor that collapses them
  // can't silently change behavior.
  it('returns false when next_review_date is empty string (defensive)', () => {
    const srs = { q1: rec('') };
    expect(isFutureScheduled('q1', srs, NOW)).toBe(false);
  });

  it('returns false when next_review_date is null (defensive — type drift)', () => {
    // Cast: the type says `string`, but real DB rows have produced null.
    // Defensive code by definition handles type-system violations.
    const srs = { q1: { ...rec('placeholder'), next_review_date: null as unknown as string } };
    expect(isFutureScheduled('q1', srs, NOW)).toBe(false);
  });
});
