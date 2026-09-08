/** Build-time flag for milestone-2 durable attempts. Default OFF: only the literal string "true" enables it. */
export const durableAttemptsEnabled = (): boolean => import.meta.env.VITE_DURABLE_ATTEMPTS === 'true';
/** Build-time flag for the resident onboarding gate (migration 20260907000002). Default OFF so the client can deploy before the migration is applied. */
export const residentOnboardingEnabled = (): boolean => import.meta.env.VITE_RESIDENT_ONBOARDING === 'true';
