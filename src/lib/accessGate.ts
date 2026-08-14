/**
 * What a visitor is allowed to see.
 *
 * The real security boundary is the database (RLS + the is_approved() function
 * added 2026-08-14) — an unapproved account gets zero rows no matter what the
 * UI renders. This decides what to PUT ON SCREEN, so an unapproved visitor sees
 * a clear message instead of an empty, broken-looking app.
 */
export type GateState = "loading" | "signin" | "pending" | "app";

export interface GateInput {
  /** Has the initial Supabase auth check come back yet? */
  authResolved: boolean;
  /** Logged-in user id, or null when signed out. */
  userId: string | null;
  /** Result of is_approved() — null while the round trip is still in flight. */
  approved: boolean | null;
}

export function resolveGate({ authResolved, userId, approved }: GateInput): GateState {
  if (!authResolved) return "loading";
  if (!userId) return "signin";
  if (approved === null) return "loading";
  return approved ? "app" : "pending";
}
