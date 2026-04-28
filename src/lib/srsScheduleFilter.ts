import type { SrsRecord } from '@/lib/srsRepository';

export const FUTURE_SCHEDULE_FILTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns true if the question's next_review_date is more than `daysAhead`
 * days in the future from `nowMs`. Used as a hard filter to exclude questions
 * the user shouldn't see again yet under SM-2.
 *
 * Returns false when:
 *   - The question has no SRS record (never answered).
 *   - next_review_date is today, in the past, or within the window.
 *   - next_review_date string fails to parse.
 */
export function isFutureScheduled(
  questionId: string,
  srsData: Record<string, SrsRecord>,
  nowMs: number,
  daysAhead: number = FUTURE_SCHEDULE_FILTER_DAYS,
): boolean {
  const record = srsData[questionId];
  if (!record || !record.next_review_date) return false;

  const reviewMs = Date.parse(record.next_review_date);
  if (Number.isNaN(reviewMs)) return false;

  const cutoffMs = nowMs + daysAhead * DAY_MS;
  return reviewMs > cutoffMs;
}
