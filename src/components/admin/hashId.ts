/**
 * Derives a question id from its text. Used by the single-question form and as
 * the CSV fallback when a row carries no id of its own.
 *
 * This used to end in `.substring(0, 6)`. That truncation collapsed 256
 * distinct hashes onto one id, and the live bank already held a real
 * collision between two entirely unrelated questions:
 *   "Where can Schwann cells be found on the nerve to muscle interaction?"
 *      -> 42671738 -> truncated to 426717
 *   "איזו מהתרופות הבאות לא עוברת REVERSE על ידי FLUMAZENIL? .35"
 *      -> 42671727 -> truncated to 426717
 * Paired with an `upsert`, that silently destroyed one question and reported
 * success. The full hash is kept, and the caller inserts rather than upserts.
 */
export function hashId(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).toUpperCase();
}
