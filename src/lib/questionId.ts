/**
 * Deterministic 6-hex-char id derived from a question's text via a 31-multiplier
 * rolling hash. Used as the upsert key for both single-create and bulk CSV import,
 * so the SAME text must always yield the SAME id (re-imports update rather than
 * duplicate). Extracted from ImportQuestionsTab so the contract is unit-testable.
 */
export function hashId(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).substring(0, 6).toUpperCase();
}
