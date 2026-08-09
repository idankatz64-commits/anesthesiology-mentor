/**
 * Narrow a caught value to a displayable message.
 *
 * A `catch` binding can only be annotated `any` or `unknown` — TypeScript
 * forbids anything else — so the type has to be narrowed at the use site.
 * Everything these tabs throw is an `Error`: `PostgrestError` and the
 * `FunctionsError` family both extend it.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
