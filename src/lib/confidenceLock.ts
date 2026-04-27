/**
 * Synchronous per-question lock that prevents double-submit of a confidence
 * selection.
 *
 * The race: `handleConfidenceSelect` calls `setConfidence(...)` (React state,
 * batched/async) and then fires `updateSpacedRepetition(...)` (immediate).
 * The buttons are hidden via the `needsConfidence` flag, but that only flips
 * on the next render. Between two rapid clicks (or `1`+`2` key presses) within
 * the same event-loop tick, both callbacks see `savedConfidence === null` and
 * both fire `updateSpacedRepetition` — producing a duplicate user_answers row
 * and a corrupted SM-2 state (the second call overwrites the first).
 *
 * This module provides a synchronous keyed lock — designed to live inside a
 * `useRef<ConfidenceLockMap>({}).current`. The mutation is INTENTIONAL: refs
 * update synchronously, so the second click reads the locked value before
 * React has a chance to schedule its update. Returning a new immutable map
 * would defeat the purpose — by the time React processes the new map, the
 * second call has already fired.
 */

export type ConfidenceLockMap = Record<string, boolean>;

/**
 * Try to acquire the lock for a question.
 *
 * Returns true if the lock was just acquired (caller may proceed),
 * false if the lock was already held (caller must abort).
 */
export function tryAcquireConfidenceLock(
  serialNumber: string,
  lockMap: ConfidenceLockMap,
): boolean {
  if (lockMap[serialNumber]) return false;
  lockMap[serialNumber] = true;
  return true;
}

/**
 * Release the lock for a question. Use this on SRS write failure so the user
 * can retry; do NOT release on success — once a confidence is recorded for
 * a question in a session, the buttons are unmounted and should not re-fire.
 */
export function releaseConfidenceLock(
  serialNumber: string,
  lockMap: ConfidenceLockMap,
): void {
  lockMap[serialNumber] = false;
}
