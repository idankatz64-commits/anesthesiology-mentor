import { describe, expect, it } from 'vitest';
import { resolveResidentGate } from '@/lib/accessGate';
import type { ResidentState } from '@/lib/residentRepository';

// Display-only gate after the approval gate: decides whether an approved user
// sees the app, the onboarding form, or a "not linked" notice. It never grants
// anything — national access is enforced by RLS regardless of what renders.
const member = (over: Partial<NonNullable<ResidentState['member']>> = {}): ResidentState => ({
  linked: true, reason: null,
  member: { id: 'm1', email: 'r@example.com', fullName: null, accessLevel: 'academy', status: 'active', residencyYear: null, examThisYear: false, examDate: null,
    nationalAccess: false, onboardingCompletedAt: null, linkedAt: '2026-09-07T00:00:00Z', ...over },
});
const base = { enabled: true, roleResolved: true, isEditor: false, residentResolved: true, resident: member() };

describe('resolveResidentGate', () => {
  it('is a no-op while the build flag is off', () => {
    expect(resolveResidentGate({ ...base, enabled: false, resident: { linked: false, reason: 'NOT_ON_ROSTER', member: null } })).toBe('app');
    expect(resolveResidentGate({ ...base, enabled: false, roleResolved: false, residentResolved: false, resident: null })).toBe('app');
  });

  it('holds the screen until both the role and the resident state are known', () => {
    expect(resolveResidentGate({ ...base, roleResolved: false })).toBe('loading');
    expect(resolveResidentGate({ ...base, residentResolved: false })).toBe('loading');
  });

  it('lets admins and editors through without a roster row', () => {
    expect(resolveResidentGate({ ...base, isEditor: true, resident: { linked: false, reason: 'NOT_ON_ROSTER', member: null } })).toBe('app');
    expect(resolveResidentGate({ ...base, isEditor: true, residentResolved: false, resident: null })).toBe('app');
  });

  it('sends an unlinked user to the not-linked notice, whatever the reason', () => {
    for (const reason of ['NOT_ON_ROSTER', 'EMAIL_NOT_VERIFIED', 'EMAIL_ALREADY_LINKED', 'NOT_LINKED'] as const) {
      expect(resolveResidentGate({ ...base, resident: { linked: false, reason, member: null } })).toBe('unlinked');
    }
  });

  it('asks a linked resident to onboard exactly until the server has stamped completion', () => {
    expect(resolveResidentGate(base)).toBe('onboarding');
    expect(resolveResidentGate({ ...base, resident: member({ onboardingCompletedAt: '2026-09-07T10:00:00Z' }) })).toBe('app');
  });

  it('self-reported exam intent and national access never change the gate', () => {
    expect(resolveResidentGate({ ...base, resident: member({ examThisYear: true, examDate: '2027-06-01', nationalAccess: true }) })).toBe('onboarding');
  });

  it('fails closed to the unavailable screen when the resident lookup itself failed (never the app)', () => {
    expect(resolveResidentGate({ ...base, resident: null })).toBe('unavailable');
    expect(resolveResidentGate({ ...base, isEditor: true, resident: null })).toBe('app');
    expect(resolveResidentGate({ ...base, enabled: false, resident: null })).toBe('app');
  });
});
