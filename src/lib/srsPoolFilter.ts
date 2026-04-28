import type { Question, HistoryEntry } from '@/lib/types';
import { KEYS } from '@/lib/types';
import type { SrsRecord } from '@/lib/srsRepository';
import { isInCooldown } from '@/lib/srsCooldown';
import { isFutureScheduled } from '@/lib/srsScheduleFilter';

/**
 * Pre-filters the candidate pool by removing questions that fail either:
 *   - Cool-down: answered within the last 24 hours (with a 6-hour floor).
 *   - Future-scheduled: next_review_date more than 7 days from now.
 *
 * Order of items in the original pool is preserved for items that are kept.
 * Callers are responsible for handling the case where this function returns
 * an empty array (typically by falling back to the unfiltered pool).
 */
export function filterCandidatePool(
  pool: Question[],
  history: Record<string, HistoryEntry>,
  srsData: Record<string, SrsRecord>,
  nowMs: number,
): Question[] {
  return pool.filter(question => {
    const id = question[KEYS.ID];
    if (isInCooldown(id, history, nowMs)) return false;
    if (isFutureScheduled(id, srsData, nowMs)) return false;
    return true;
  });
}
