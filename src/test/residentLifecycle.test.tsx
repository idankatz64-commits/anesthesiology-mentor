import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider, useApp } from '@/contexts/AppContext';
import ResidentOnboardingView from '@/components/views/ResidentOnboardingView';
import Index from '@/pages/Index';
import { resolveResidentGate } from '@/lib/accessGate';
import { residentOnboardingEnabled } from '@/lib/featureFlags';
import { fetchQuestions, setQuestionsCacheScope } from '@/lib/csvService';
import { launchQuestion } from './fixtures/launchQuestion';

// Provider-lifecycle regression for PHASE-2B-REVIEW blockers 1 and 2. Real
// AppProvider, real gate, real onboarding screen; only the Supabase client and
// the bank fetch are mocked, and auth events are fired by hand exactly as
// supabase-js would fire them (no SIGNED_OUT between accounts, TOKEN_REFRESHED
// with a changed entitlement, a lookup that fails, a lookup that resolves late).

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const defer = <T,>(): Deferred<T> => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

const db = vi.hoisted(() => ({
  session: { user: { id: 'user-a' } } as unknown,
  saved: null as unknown,
  role: null as unknown,
  callback: null as null | ((event: string, session: unknown) => void),
  residentMe: (async () => ({ data: null, error: null })) as () => Promise<unknown>,
  bank: (async (): Promise<unknown[]> => []) as (...args: unknown[]) => Promise<unknown[]>,
  stamp: '',
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: db.session } }),
    signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      db.callback = callback;
      queueMicrotask(() => callback('INITIAL_SESSION', db.session));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  },
  rpc: (name: string) => name === 'resident_me' ? db.residentMe() : Promise.resolve({ data: true, error: null }),
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      range: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: async () => ({ data: table === 'saved_sessions' ? { session_data: db.saved } : table === 'admin_users' ? db.role : null, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
      upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }),
    };
    return query;
  },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: vi.fn(),
} }));
// Real stamp semantics (first stamp is free, any later change drops the bank) so
// an account switch or a national flip is detected the way production detects it.
vi.mock('@/lib/csvService', () => ({
  fetchQuestions: vi.fn((...args: unknown[]) => db.bank(...args)),
  invalidateQuestionsCache: vi.fn(),
  setQuestionsCacheScope: vi.fn((scope: string) => { const changed = !!db.stamp && db.stamp !== scope; db.stamp = scope; return changed; }),
}));
vi.mock('@/lib/academyRepository', () => ({ claimAcademyMembership: async () => null, fetchMyAttempts: async () => [] }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn() }) }));

const member = (email: string, national: boolean) => ({ id: 'm-' + email, email, full_name: null, access_level: 'academy', status: 'active', residency_year: 3, exam_this_year: false, exam_date: null, national_access: national, onboarding_completed_at: '2026-09-07T00:00:00Z', linked_at: 'x' });
const linked = (email: string, national = false) => async () => ({ data: { linked: true, reason: null, member: member(email, national) }, error: null });
const failing = async () => ({ data: null, error: { message: 'FetchError: resident_me unreachable', code: 'PGRST000' } });
const bankOf = (...ids: string[]) => async () => ids.map((id) => launchQuestion(id));
const draft = (ids: string[]) => ({ questionIds: ids, index: 0, mode: 'practice', answers: ids.map(() => null), confidence: ids.map(() => null), flagged: [], skipped: [], createdAt: '2026-09-07T00:00:00Z' });

// Mirrors AppContent in src/pages/Index.tsx: same gate function, same "anything
// but app renders the onboarding view" rule, and prints every question id the
// app would hold once it renders. `seen` records every render so a stale bank
// that is visible for even one frame fails the test.
let latest: ReturnType<typeof useApp>;
const seen: string[] = [];
function Probe() {
  const app = useApp();
  latest = app;
  const gate = resolveResidentGate({ enabled: residentOnboardingEnabled(), roleResolved: app.roleResolved, isEditor: app.isEditor, residentResolved: app.residentResolved, resident: app.resident });
  const ids = app.data.map((q) => q.id).join(',');
  seen.push(`${gate}|${ids}|quiz=${app.session.quiz.map((q) => q.id).join(',')}`);
  if (gate === 'loading') return <p>GATE:loading</p>;
  if (gate !== 'app') return <ResidentOnboardingView />;
  return <div data-testid="app"><span data-testid="bank">{ids}</span><span data-testid="quiz">{app.session.quiz.map((q) => q.id).join(',')}</span></div>;
}
const appRenders = () => seen.filter((s) => s.startsWith('app|'));
// Clears the render log first, so every assertion on `seen` covers only what rendered from this event onwards.
const fire = async (event: string, userId: string | null) => { seen.length = 0; await act(async () => { db.callback!(event, userId ? { user: { id: userId } } : null); }); };
async function mountA(ids: string[] = ['qa-1', 'qa-2'], national = false) {
  db.residentMe = linked('a@example.com', national); db.bank = bankOf(...ids);
  render(<AppProvider><Probe /></AppProvider>);
  await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent(ids.join(',')));
  await waitFor(() => expect(latest.loadingSavedSession).toBe(false));
  seen.length = 0;
}

describe('resident lifecycle: identity, token and entitlement changes (flag ON)', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', ''); vi.stubEnv('VITE_RESIDENT_ONBOARDING', 'true');
    db.session = { user: { id: 'user-a' } }; db.saved = null; db.role = null; db.stamp = ''; db.callback = null; seen.length = 0;
  });
  afterEach(cleanup);

  it('A -> B with no SIGNED_OUT: A\'s bank, session and draft vanish at once and B never sees a question before B\'s scoped fetch', async () => {
    db.saved = draft(['qa-1']);
    await mountA();
    await act(async () => { expect(await latest.resumeSessionFromDb()).toBe(true); });
    expect(screen.getByTestId('quiz')).toHaveTextContent('qa-1');

    const residentB = defer<unknown>(); const bankB = defer<unknown[]>();
    db.residentMe = () => residentB.promise; db.bank = () => bankB.promise; db.saved = null;
    await fire('SIGNED_IN', 'user-b');
    // Synchronously after the event: nothing of A is left anywhere.
    expect(screen.queryByTestId('app')).toBeNull();
    expect(latest.data).toEqual([]);
    expect(latest.session.quiz).toEqual([]);
    expect(latest.savedSessionInfo).toBeNull();
    expect(latest.resident).toBeNull();

    await act(async () => { residentB.resolve({ data: { linked: true, reason: null, member: member('b@example.com', true) }, error: null }); });
    expect(appRenders().every((s) => !s.includes('qa-'))).toBe(true);
    expect(setQuestionsCacheScope).toHaveBeenLastCalledWith('user-b:national');
    await act(async () => { bankB.resolve([launchQuestion('qb-1')]); });
    await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent('qb-1'));
    expect(appRenders().every((s) => !s.includes('qa-'))).toBe(true);
    expect(latest.resident?.member?.email).toBe('b@example.com');
  });

  it('A\'s resident and bank resolving after B signed in cannot rehydrate A\'s privilege or questions', async () => {
    const residentA = defer<unknown>(); const bankA = defer<unknown[]>();
    db.residentMe = () => residentA.promise; db.bank = () => bankA.promise;
    render(<AppProvider><Probe /></AppProvider>);
    await waitFor(() => expect(db.callback).not.toBeNull());
    await waitFor(() => expect(latest.userId).toBe('user-a'));

    db.residentMe = linked('b@example.com', false); db.bank = bankOf('qb-1');
    await fire('SIGNED_IN', 'user-b');
    await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent('qb-1'));

    await act(async () => { residentA.resolve({ data: { linked: true, reason: null, member: member('a@example.com', true) }, error: null }); bankA.resolve([launchQuestion('qa-national')]); });
    await act(async () => { await Promise.resolve(); });
    expect(latest.resident?.member?.email).toBe('b@example.com');
    expect(latest.resident?.member?.nationalAccess).toBe(false);
    expect(screen.getByTestId('bank')).toHaveTextContent('qb-1');
    expect(seen.every((s) => !s.includes('qa-national'))).toBe(true);
    expect(vi.mocked(setQuestionsCacheScope).mock.calls.map((c) => c[0])).not.toContain('user-a:national');
  });

  it('TOKEN_REFRESHED with national true -> false closes the gate immediately and shows only the re-fetched open bank', async () => {
    db.saved = draft(['nat-1']);
    await mountA(['nat-1', 'open-1'], true);
    await act(async () => { expect(await latest.resumeSessionFromDb()).toBe(true); });

    const bankOpen = defer<unknown[]>();
    db.residentMe = linked('a@example.com', false); db.bank = () => bankOpen.promise;
    await fire('TOKEN_REFRESHED', 'user-a');
    expect(appRenders().every((s) => !s.includes('nat-1'))).toBe(true);
    expect(latest.data).toEqual([]);
    expect(latest.session.quiz).toEqual([]);
    expect(setQuestionsCacheScope).toHaveBeenLastCalledWith('user-a:open');
    expect(fetchQuestions).toHaveBeenLastCalledWith(3, true);

    await act(async () => { bankOpen.resolve([launchQuestion('open-1')]); });
    await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent('open-1'));
    expect(appRenders().every((s) => !s.includes('nat-1'))).toBe(true);
  });

  it('resident_me failure at sign-in fails closed: Hebrew RTL unavailable screen with retry + sign-out, no app, no questions; retry recovers', async () => {
    db.residentMe = failing; db.bank = bankOf('qa-1');
    render(<AppProvider><Probe /></AppProvider>);
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/בדקו את החיבור/);
    expect(status.closest('[dir="rtl"]')).not.toBeNull();
    expect(screen.queryByTestId('app')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(appRenders()).toEqual([]);
    expect(latest.resident).toBeNull();
    expect(latest.residentResolved).toBe(true);

    db.residentMe = linked('a@example.com');
    fireEvent.click(screen.getByRole('button', { name: /נסה שוב/ }));
    await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent('qa-1'));
  });

  it('the real Index page renders no app chrome when resident_me fails', async () => {
    db.residentMe = failing; db.bank = bankOf('qa-1');
    const { container } = render(<MemoryRouter><Index /></MemoryRouter>);
    await screen.findByRole('status');
    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelector('nav')).toBeNull();
    expect(screen.getByRole('button', { name: /התנתקות/ })).toBeInTheDocument();
  });

  it('a rejected refresh on TOKEN_REFRESHED drops the previous privilege and stays closed', async () => {
    await mountA(['nat-1'], true);
    db.residentMe = failing;
    await fire('TOKEN_REFRESHED', 'user-a');
    expect(await screen.findByRole('status')).toHaveTextContent(/בדקו את החיבור/);
    expect(screen.queryByTestId('app')).toBeNull();
    expect(latest.resident).toBeNull();
    expect(appRenders().every((s) => !s.includes('nat-1'))).toBe(true);
  });

  it('a same-user SIGNED_IN re-emit keeps the in-memory session and does not refetch the bank', async () => {
    db.saved = draft(['qa-1']);
    await mountA();
    await act(async () => { expect(await latest.resumeSessionFromDb()).toBe(true); });
    const fetches = vi.mocked(fetchQuestions).mock.calls.length;
    await fire('SIGNED_IN', 'user-a');
    await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent('qa-1,qa-2'));
    expect(screen.getByTestId('quiz')).toHaveTextContent('qa-1');
    expect(vi.mocked(fetchQuestions).mock.calls.length).toBe(fetches);
  });
});

describe('resident lifecycle with the flag OFF (backward compatibility)', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', ''); vi.stubEnv('VITE_RESIDENT_ONBOARDING', '');
    db.session = { user: { id: 'user-a' } }; db.saved = null; db.role = null; db.stamp = ''; db.callback = null; seen.length = 0;
  });
  afterEach(cleanup);

  it('never calls resident_me, still quarantines A\'s bank on a direct switch to B, and scopes the cache by user only', async () => {
    const rpcSpy = vi.spyOn(db, 'residentMe');
    db.saved = draft(['qa-1']);
    await mountA();
    await act(async () => { expect(await latest.resumeSessionFromDb()).toBe(true); });

    const bankB = defer<unknown[]>();
    db.bank = () => bankB.promise;
    await fire('SIGNED_IN', 'user-b');
    expect(latest.data).toEqual([]);
    expect(latest.session.quiz).toEqual([]);
    expect(appRenders().every((s) => !s.includes('qa-'))).toBe(true);
    expect(setQuestionsCacheScope).toHaveBeenLastCalledWith('user-b');
    await act(async () => { bankB.resolve([launchQuestion('qb-1')]); });
    await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent('qb-1'));
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('TOKEN_REFRESHED is a no-op for the bank and the gate', async () => {
    await mountA();
    const fetches = vi.mocked(fetchQuestions).mock.calls.length;
    await fire('TOKEN_REFRESHED', 'user-a');
    expect(screen.getByTestId('bank')).toHaveTextContent('qa-1,qa-2');
    expect(vi.mocked(fetchQuestions).mock.calls.length).toBe(fetches);
  });
});
