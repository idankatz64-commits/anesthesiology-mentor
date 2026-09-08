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

/**
 * Second, display-only gate for approved users (resident entitlement,
 * 2026-09-07). Decides whether to show the app, the onboarding form or a
 * "your account is not linked" notice. It grants nothing: national questions
 * are filtered by RLS whatever renders here.
 */
export type ResidentGateState = "loading" | "onboarding" | "unlinked" | "unavailable" | "app";

export interface ResidentGateInput {
  /** VITE_RESIDENT_ONBOARDING build flag. */
  enabled: boolean;
  /** Has the admin_users role query come back yet? */
  roleResolved: boolean;
  /** Editors and admins are not residents and bypass the roster. */
  isEditor: boolean;
  /** Has resident_me come back (or failed) yet? */
  residentResolved: boolean;
  /** resident_me result; null when the flag is off, or the lookup failed → "unavailable" (never the app). */
  resident: { linked: boolean; reason?: string | null; member: { onboardingCompletedAt: string | null } | null } | null;
}

export function resolveResidentGate({ enabled, roleResolved, isEditor, residentResolved, resident }: ResidentGateInput): ResidentGateState {
  if (!enabled) return "app";
  if (!roleResolved) return "loading";
  if (isEditor) return "app";
  if (!residentResolved) return "loading";
  // Lookup failed: fail closed. Only a current, successful result opens the app.
  if (!resident) return "unavailable";
  if (!resident.linked) return "unlinked";
  return resident.member?.onboardingCompletedAt ? "app" : "onboarding";
}
