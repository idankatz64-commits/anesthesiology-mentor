/**
 * Wrap a fire-and-forget call to an SRS write so promise rejections
 * surface to a caller-supplied handler instead of becoming an
 * UnhandledPromiseRejection.
 *
 * Bug D: previously, `updateSpacedRepetition(...)` was called without
 * `await` and without `.catch()` from React event handlers, so any
 * Supabase error was silently swallowed. The user clicked a confidence
 * button, saw no feedback, and assumed the SRS state was saved.
 *
 * Use this at every call site that intentionally does not await the
 * SRS write (typical pattern: practice-mode confidence selection,
 * where we don't want to block the UI on Supabase round-trip).
 */
export function fireAndCatchSrs(
  result: void | Promise<unknown>,
  onError: (error: unknown) => void,
): void {
  Promise.resolve(result).catch(onError);
}
