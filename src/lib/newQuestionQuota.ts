export const NEW_QUESTION_QUOTA_RATIO = 0.30;

export interface ScoredCandidate<T> {
  item: T;
  isNew: boolean; // true if user has never answered this question
  score: number;
}

/**
 * Picks `n` items from a scored pool, reserving `ceil(n * quotaRatio)` slots
 * for items where `isNew === true`. Within each sub-pool (new and seen),
 * items are ranked by descending score.
 *
 * Fallback behaviour: if either sub-pool is empty, slots are filled from the
 * other sub-pool. This guarantees the function returns up to `n` items
 * whenever `scored.length >= n`.
 */
export function pickWithNewQuota<T>(
  scored: ScoredCandidate<T>[],
  n: number,
  quotaRatio: number = NEW_QUESTION_QUOTA_RATIO,
): T[] {
  if (n <= 0 || scored.length === 0) return [];
  if (scored.length <= n) {
    return [...scored]
      .sort((a, b) => b.score - a.score)
      .map(s => s.item);
  }

  const newPool = scored
    .filter(s => s.isNew)
    .sort((a, b) => b.score - a.score);
  const seenPool = scored
    .filter(s => !s.isNew)
    .sort((a, b) => b.score - a.score);

  const newSlots = Math.min(Math.ceil(n * quotaRatio), newPool.length);
  const seenSlots = Math.min(n - newSlots, seenPool.length);

  const picked = [
    ...newPool.slice(0, newSlots),
    ...seenPool.slice(0, seenSlots),
  ];

  // If we couldn't fill `n` (one pool exhausted before quota), top up from
  // whichever pool still has items.
  if (picked.length < n) {
    const remaining = n - picked.length;
    if (newSlots < newPool.length) {
      picked.push(...newPool.slice(newSlots, newSlots + remaining));
    } else if (seenSlots < seenPool.length) {
      picked.push(...seenPool.slice(seenSlots, seenSlots + remaining));
    }
  }

  return picked.map(s => s.item);
}
