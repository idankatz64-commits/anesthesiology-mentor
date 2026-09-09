import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from '@/contexts/AppContext';
import { fetchQuestions, setQuestionsCacheScope } from '@/lib/csvService';
import { launchQuestion } from './fixtures/launchQuestion';

// Context-level regression: resident state is fetched once the user is known,
// the question cache is re-scoped to (user, entitlement), and a legacy draft
// that lost questions is not silently resumed as the original exam.
const db = vi.hoisted(() => ({ saved: null as unknown, rpc: vi.fn(), session: { user: { id: 'user-a' } } as unknown, role: null as unknown }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: db.session } }),
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      queueMicrotask(() => callback('INITIAL_SESSION', db.session));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  },
  rpc: (name: string, args: unknown) => db.rpc(name, args),
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query,
      range: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: async () => ({ data: table === 'saved_sessions' ? { session_data: db.saved } : table === 'admin_users' ? db.role : null, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
      upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }),
    };
    return query;
  },
} }));
vi.mock('@/lib/csvService', () => ({ fetchQuestions: vi.fn(async () => [launchQuestion()]), invalidateQuestionsCache: vi.fn(), setQuestionsCacheScope: vi.fn(() => false) }));
const academy = vi.hoisted(() => ({ claim: vi.fn() }));
vi.mock('@/lib/academyRepository', () => ({ claimAcademyMembership: () => academy.claim(), fetchMyAttempts: async () => [] }));
const toast = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const memberRow = { id: 'm1', email: 'a@example.com', full_name: null, access_level: 'academy', status: 'active', residency_year: 3, exam_this_year: true, exam_date: null, national_access: false, onboarding_completed_at: 'x', linked_at: 'x' };
const draft = (mode: 'practice' | 'exam', questionIds: string[]) => ({ questionIds, index: 1, mode, answers: ['B', null], confidence: ['hesitant', null], flagged: [], skipped: [], createdAt: '2026-09-07T00:00:00Z' });

async function load() {
  const hook = renderHook(() => useApp(), { wrapper: AppProvider });
  await waitFor(() => expect(hook.result.current.loadingSavedSession).toBe(false));
  await waitFor(() => expect(hook.result.current.residentResolved).toBe(true));
  return hook;
}

describe('resident state and cache scope in AppContext', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', ''); vi.stubEnv('VITE_RESIDENT_ONBOARDING', 'true');
    db.saved = null; db.role = null; db.session = { user: { id: 'user-a' } };
    academy.claim.mockResolvedValue(null);
    db.rpc.mockImplementation(async (name: string) => name === 'resident_me' ? { data: { linked: true, reason: null, member: memberRow }, error: null } : { data: true, error: null });
  });
  afterEach(cleanup);

  it('gives an active linked resident the home/exam navigation and the server-scoped bank before any academy quiz', async () => {
    academy.claim.mockResolvedValue({ access_level: 'academy', status: 'active' });
    const { result } = await load();
    await waitFor(() => expect(result.current.membershipResolved).toBe(true));
    expect(result.current.academyOnly).toBe(false);
    expect(result.current.data.map(q => q.id)).toEqual(['demo-question']);
    act(() => result.current.navigate('setup-exam'));
    expect(result.current.currentView).toBe('setup-exam');
    expect(setQuestionsCacheScope).toHaveBeenCalledWith('user-a:open');
    act(() => { result.current.startSession(result.current.data, 1, 'exam'); });
    expect(result.current.currentView).toBe('session');
    expect(result.current.session.quiz.map(q => q.id)).toEqual(['demo-question']);
  });

  it('retains the quiz-only restriction for a suspended membership', async () => {
    academy.claim.mockResolvedValue({ access_level: 'academy', status: 'suspended' });
    db.rpc.mockImplementation(async (name: string) => name === 'resident_me' ? { data: { linked: true, reason: null, member: { ...memberRow, status: 'suspended' } }, error: null } : { data: true, error: null });
    const { result } = await load();
    expect(result.current.academyOnly).toBe(true);
    expect(result.current.data).toEqual([]);
  });

  it('retains the legacy quiz-only pool when resident onboarding is disabled', async () => {
    vi.stubEnv('VITE_RESIDENT_ONBOARDING', '');
    academy.claim.mockResolvedValue({ access_level: 'academy', status: 'active' });
    const { result } = await load();
    expect(result.current.academyOnly).toBe(true);
    expect(result.current.data).toEqual([]);
  });

  it('fetches resident_me after sign-in and scopes the cache to user + entitlement', async () => {
    const { result } = await load();
    expect(result.current.resident?.member?.residencyYear).toBe(3);
    expect(result.current.roleResolved).toBe(true);
    expect(db.rpc).toHaveBeenCalledWith('resident_me', {});
    await waitFor(() => expect(setQuestionsCacheScope).toHaveBeenCalledWith('user-a:open'));
    expect(fetchQuestions).toHaveBeenCalledTimes(1);
  });

  it('drops and refetches the bank when the scope changed (revoke, grant or account switch)', async () => {
    vi.mocked(setQuestionsCacheScope).mockReturnValueOnce(true);
    db.rpc.mockImplementation(async (name: string) => name === 'resident_me' ? { data: { linked: true, reason: null, member: { ...memberRow, national_access: true } }, error: null } : { data: true, error: null });
    await load();
    await waitFor(() => expect(setQuestionsCacheScope).toHaveBeenCalledWith('user-a:national'));
    await waitFor(() => expect(fetchQuestions).toHaveBeenCalledWith(3, true));
  });

  it('exposes the unlinked reason and lets the screen refresh it', async () => {
    db.rpc.mockImplementation(async (name: string) => name === 'resident_me' ? { data: { linked: false, reason: 'EMAIL_NOT_VERIFIED', member: null }, error: null } : { data: true, error: null });
    const { result } = await load();
    expect(result.current.resident).toEqual({ linked: false, reason: 'EMAIL_NOT_VERIFIED', member: null });
    db.rpc.mockImplementation(async (name: string) => name === 'resident_me' ? { data: { linked: true, reason: null, member: memberRow }, error: null } : { data: true, error: null });
    await act(async () => { await result.current.refreshResident(); });
    expect(result.current.resident?.linked).toBe(true);
  });

  it('never calls resident_me while the flag is off, and scopes the cache by user only', async () => {
    vi.stubEnv('VITE_RESIDENT_ONBOARDING', '');
    const { result } = await load();
    expect(result.current.resident).toBeNull();
    expect(db.rpc).not.toHaveBeenCalledWith('resident_me', expect.anything());
    await waitFor(() => expect(setQuestionsCacheScope).toHaveBeenCalledWith('user-a'));
  });

  it('refuses to resume an exam draft that lost questions and keeps the draft for an explicit discard', async () => {
    db.saved = draft('exam', ['demo-question', 'gone']);
    const { result } = await load();
    await act(async () => { expect(await result.current.resumeSessionFromDb()).toBe(false); });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('הבוחן המקורי'));
    expect(result.current.session.quiz).toHaveLength(0);
    expect(result.current.savedSessionInfo).not.toBeNull();
  });

  it('resumes a practice draft with the remaining questions and says what was dropped', async () => {
    db.saved = draft('practice', ['demo-question', 'gone']);
    const { result } = await load();
    await act(async () => { expect(await result.current.resumeSessionFromDb()).toBe(true); });
    expect(result.current.session.quiz.map(q => q.id)).toEqual(['demo-question']);
    expect(result.current.session.answers).toEqual(['B']);
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('1 שאלות'));
  });
});
