import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from '@/contexts/AppContext';
import { resolveGate } from '@/lib/accessGate';
import { resolveResidentGate } from '@/lib/accessGate';
import { residentOnboardingEnabled } from '@/lib/featureFlags';
import { fetchQuestions, setQuestionsCacheScope } from '@/lib/csvService';
import { launchQuestion } from './fixtures/launchQuestion';

// PHASE-2B-RACE: every async producer in AppProvider that writes state (or
// schedules a follow-up request) after an await is started for account A,
// the identity or privilege changes while it is in flight, and the result
// lands afterwards. Nothing of A may reach B's screen, B's state or B's rows.
// Same harness as residentLifecycle.test.tsx: real provider, real gate, only
// the Supabase client and the bank fetch are mocked, auth events fired by hand.

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const defer = <T,>(): Deferred<T> => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const ok = { data: true, error: null };

const db = vi.hoisted(() => ({
  session: { user: { id: 'user-a' } } as unknown,
  saved: null as unknown,
  callback: null as null | ((event: string, session: unknown) => void),
  residentMe: (async () => ({ data: null, error: null })) as () => Promise<unknown>,
  roleLookup: (async () => ({ data: null, error: null })) as () => Promise<unknown>,
  approval: (async () => ({ data: true, error: null })) as () => Promise<unknown>,
  bank: (async (): Promise<unknown[]> => []) as (...args: unknown[]) => Promise<unknown[]>,
  rows: {} as Record<string, unknown[]>,
  attempt: vi.fn(),
  upsert: vi.fn(),
  insert: vi.fn(),
  remove: vi.fn(),
  maybeSingle: vi.fn(),
  range: vi.fn(),
  removeChannel: vi.fn(),
  realtimeCallback: null as null | ((payload: unknown) => Promise<void>),
  channels: 0,
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
  rpc: (name: string, args: unknown) => name === 'resident_me' ? db.residentMe() : name === 'is_approved' ? db.approval() : name.startsWith('attempt_') ? db.attempt(name, args) : Promise.resolve({ data: true, error: null }),
  from: (table: string) => {
    const query = {
      selected: '', select: (selected = '') => { query.selected = selected; return query; }, eq: () => query, in: () => query, lte: () => query, order: () => query, limit: () => query,
      range: () => db.range(table),
      maybeSingle: () => table === 'saved_sessions' ? Promise.resolve({ data: db.saved ? { session_data: db.saved } : null, error: null }) : table === 'admin_users' && query.selected === 'role' ? db.roleLookup() : db.maybeSingle(table),
      then: (resolve: (value: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      upsert: (row: unknown) => db.upsert(table, row),
      insert: (row: unknown) => db.insert(table, row),
      delete: () => { const chain = { eq: () => chain, then: (resolve: (value: unknown) => void, reject?: (e: unknown) => void) => db.remove(table).then(resolve, reject) }; return chain; },
    };
    return query;
  },
  channel: () => { db.channels++; return { on: (_event: string, _filter: unknown, callback: (payload: unknown) => Promise<void>) => { db.realtimeCallback = callback; return { subscribe: () => ({}) }; } }; }, removeChannel: db.removeChannel,
} }));
vi.mock('@/lib/csvService', () => ({
  fetchQuestions: vi.fn((...args: unknown[]) => db.bank(...args)),
  invalidateQuestionsCache: vi.fn(),
  setQuestionsCacheScope: vi.fn((scope: string) => { const changed = !!db.stamp && db.stamp !== scope; db.stamp = scope; return changed; }),
}));
vi.mock('@/lib/academyRepository', () => ({ claimAcademyMembership: async () => null, fetchMyAttempts: async () => [] }));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const A = 'user-a', B = 'user-b';
const member = (email: string, national: boolean) => ({ id: 'm-' + email, email, full_name: null, access_level: 'academy', status: 'active', residency_year: 3, exam_this_year: false, exam_date: null, national_access: national, onboarding_completed_at: '2026-09-07T00:00:00Z', linked_at: 'x' });
const linked = (email: string, national = false) => async () => ({ data: { linked: true, reason: null, member: member(email, national) }, error: null });
const unlinked = async () => ({ data: { linked: false, reason: 'NOT_ON_ROSTER', member: null }, error: null });
const role = (r: string | null) => async () => ({ data: r ? { role: r } : null, error: null });
const bankOf = (...ids: string[]) => async () => ids.map((id) => launchQuestion(id));
const startPayload = (ids: string[]) => ({ attempt_id: 'att-a', root_id: 'root-a', question_order: ids });
const snap = (id: string) => ({ id, question: 'frozen ' + id, a: 'א', b: 'ב', c: 'ג', d: 'ד', topic: 'Demo', chapter: 1, explanation: 'private explanation of ' + id });
const readPayload = (status: string, ids: string[], extra: Record<string, unknown> = {}) => ({
  attempt_id: 'att-a', root_id: 'root-a', status, mode: 'practice', feedback_timing: 'immediate', total_count: ids.length, started_at: 's', question_order: ids,
  questions: ids.map((id, i) => ({ question_id: id, position: i + 1, snapshot: snap(id), selected: null, confidence: null, answer_ms: null, confirmed_at: null, is_correct: null, scored: true })),
  ...extra,
});
const draft = (ids: string[], attemptId?: string) => ({ questionIds: ids, index: 0, mode: 'practice', answers: ids.map(() => null), confidence: ids.map(() => null), flagged: [], skipped: [], createdAt: '2026-09-07T00:00:00Z', ...(attemptId ? { attemptId, rootId: 'root-a' } : {}) });
const attemptCalls = (name: string) => db.attempt.mock.calls.filter(([n]) => n === name).length;
const writesTo = (table: string) => [...db.upsert.mock.calls, ...db.insert.mock.calls].filter(([t]) => t === table).length;
// One deferred response for the next request against `table`; later requests get the default.
const deferNext = <T,>(fn: ReturnType<typeof vi.fn>, table: string, fallback: T) => { const d = defer<T>(); let used = false; fn.mockImplementation((t: string) => (t === table && !used ? ((used = true), d.promise) : Promise.resolve(fallback))); return d; };

let latest: ReturnType<typeof useApp>;
const seen: string[] = [];
function Probe() {
  const app = useApp();
  latest = app;
  const access = resolveGate({ authResolved: app.authResolved, userId: app.userId, approved: app.approved });
  const gate = resolveResidentGate({ enabled: residentOnboardingEnabled(), roleResolved: app.roleResolved, isEditor: app.isEditor, residentResolved: app.residentResolved, resident: app.resident });
  const ids = app.data.map((q) => q.id).join(',');
  const quiz = app.session.quiz.map((q) => q.id + (q.explanation?.includes('private') ? '!' : '')).join(',');
  seen.push(`${access}/${gate}|${ids}|quiz=${quiz}|view=${app.currentView}`);
  if (access !== 'app') return <p>GATE:{access}</p>;
  if (gate !== 'app') return <p>GATE:{gate}</p>;
  return <div data-testid="app"><span data-testid="bank">{ids}</span><span data-testid="quiz">{quiz}</span></div>;
}
const appRenders = () => seen.filter((s) => s.startsWith('app/app|'));
const neverShowedA = () => expect(appRenders().filter((s) => /qa-|nat-|editor-/.test(s))).toEqual([]);
const fire = async (event: string, userId: string | null) => { seen.length = 0; await act(async () => { db.callback!(event, userId ? { user: { id: userId } } : null); }); };
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mountA(ids: string[] = ['qa-1', 'qa-2'], national = false, resident = linked('a@example.com', national)) {
  db.residentMe = resident; db.bank = bankOf(...ids);
  render(<AppProvider><Probe /></AppProvider>);
  await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent(ids.join(',')));
  await waitFor(() => expect(latest.loadingSavedSession).toBe(false));
  await waitFor(() => expect(latest.historyLoaded).toBe(true));
  seen.length = 0;
}
async function switchToB(ids: string[] = ['qb-1']) {
  db.residentMe = linked('b@example.com'); db.bank = bankOf(...ids); db.rows = {};
  await fire('SIGNED_IN', B);
  await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent(ids.join(',')));
  await waitFor(() => expect(latest.loadingSavedSession).toBe(false));
  await waitFor(() => expect(latest.historyLoaded).toBe(true));
}
// Durable session for the current user; the server echoes the requested order.
async function startDurable(mode: 'practice' | 'exam' = 'practice') {
  await act(async () => { await latest.startSession(latest.data, latest.data.length, mode, { feedbackTiming: mode === 'exam' ? 'end' : 'immediate' }); });
  expect(latest.session.attemptId).toBe('att-a');
}

function resetDb() {
  vi.clearAllMocks();
  db.session = { user: { id: A } }; db.saved = null; db.stamp = ''; db.callback = null; db.rows = {}; seen.length = 0;
  db.roleLookup = role(null); db.residentMe = linked('a@example.com'); db.approval = async () => ({ data: true, error: null }); db.realtimeCallback = null; db.channels = 0;
  db.attempt.mockImplementation(async (name: string, args: { _question_ids?: string[] }) => name === 'attempt_start' ? { data: startPayload(args._question_ids ?? []), error: null } : ok);
  db.upsert.mockResolvedValue({ error: null }); db.insert.mockResolvedValue({ error: null }); db.remove.mockResolvedValue({ error: null });
  db.maybeSingle.mockResolvedValue({ data: null, error: null });
  db.range.mockImplementation(async (table: string) => ({ data: db.rows[table] ?? [], error: null }));
}

describe('identity race: durable attempts, drafts and answer callbacks (both flags ON)', () => {
  beforeEach(() => { resetDb(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', 'true'); vi.stubEnv('VITE_RESIDENT_ONBOARDING', 'true'); });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

  it('invalidateQuestions: A\'s forced refetch landing after A -> B never replaces B\'s bank', async () => {
    await mountA();
    const stale = defer<unknown[]>(); db.bank = () => stale.promise;
    let p!: Promise<void>;
    act(() => { p = latest.invalidateQuestions(); });
    await switchToB();
    await act(async () => { stale.resolve([launchQuestion('qa-stale')]); await p.catch(() => undefined); });
    await flush();
    expect(latest.data.map((q) => q.id)).toEqual(['qb-1']);
    expect(screen.getByTestId('bank')).toHaveTextContent('qb-1');
    neverShowedA();
  });

  it('startSession (durable): attempt_start resolving after A -> B opens nothing and rejects', async () => {
    await mountA();
    const start = defer<unknown>();
    db.attempt.mockImplementation((name: string) => name === 'attempt_start' ? start.promise : Promise.resolve(ok));
    let p!: Promise<void>;
    act(() => { p = latest.startSession(latest.data, 2, 'practice', { feedbackTiming: 'immediate' }) as Promise<void>; });
    await switchToB();
    await act(async () => { start.resolve({ data: startPayload(['qa-1', 'qa-2']), error: null }); await expect(p).rejects.toThrow('IDENTITY_CHANGED'); });
    expect(latest.session.quiz).toEqual([]);
    expect(latest.currentView).toBe('home');
    neverShowedA();
  });

  it('confirmAnswer: A\'s confirmation landing in B\'s own session writes no key, explanation, confidence or history', async () => {
    await mountA(); await startDurable();
    act(() => latest.setAnswer(0, 'A'));
    const confirm = defer<unknown>();
    db.attempt.mockImplementation((name: string, args: { _question_ids?: string[] }) => name === 'attempt_confirm' ? confirm.promise : name === 'attempt_start' ? Promise.resolve({ data: startPayload(args._question_ids ?? []), error: null }) : Promise.resolve(ok));
    let p!: Promise<void>;
    act(() => { p = latest.confirmAnswer(0, 'confident', 1200); });
    await switchToB(); await startDurable();
    await act(async () => { confirm.resolve({ data: { is_correct: true, correct_key: 'A', explanation: 'private explanation of qa-1', locked: true }, error: null }); await expect(p).rejects.toThrow('IDENTITY_CHANGED'); });
    expect(latest.session.confidence).toEqual([null]);
    expect(latest.session.quiz[0].explanation).not.toContain('private');
    expect(latest.progress.history['qa-1']).toBeUndefined();
    expect(screen.getByTestId('quiz')).toHaveTextContent('qb-1');
    neverShowedA();
  });

  it('finishAttempt: a submit answered after A -> B credits nothing locally and sends no results read with B\'s token', async () => {
    await mountA(); await startDurable('exam');
    const submit = defer<unknown>();
    db.attempt.mockImplementation((name: string) => name === 'attempt_submit' ? submit.promise : name === 'attempt_read' ? Promise.resolve({ data: readPayload('submitted', ['qa-1', 'qa-2']), error: null }) : Promise.resolve(ok));
    let p!: Promise<unknown>;
    act(() => { p = latest.finishAttempt(5000); });
    await switchToB();
    const reads = attemptCalls('attempt_read');
    await act(async () => {
      submit.resolve({ data: { attempt_id: 'att-a', root_id: 'root-a', status: 'submitted', total_count: 2, correct_count: 2, scored_count: 2, answered_count: 2, questions: [{ question_id: 'qa-1', is_correct: true }, { question_id: 'qa-2', is_correct: false }] }, error: null });
      await expect(p).rejects.toThrow('IDENTITY_CHANGED');
    });
    expect(attemptCalls('attempt_read')).toBe(reads);
    expect(latest.progress.history['qa-1']).toBeUndefined();
    expect(latest.session.attemptResult).toBeUndefined();
    neverShowedA();
  });

  it('finishAttempt: the revealed results read landing after A -> B never puts A\'s keys or explanations into B\'s quiz', async () => {
    await mountA(); await startDurable('exam');
    const read = defer<unknown>();
    db.attempt.mockImplementation((name: string, args: { _question_ids?: string[] }) => name === 'attempt_read' ? read.promise : name === 'attempt_submit' ? Promise.resolve({ data: { attempt_id: 'att-a', root_id: 'root-a', status: 'submitted', total_count: 2 }, error: null }) : name === 'attempt_start' ? Promise.resolve({ data: startPayload(args._question_ids ?? []), error: null }) : Promise.resolve(ok));
    let p!: Promise<unknown>;
    act(() => { p = latest.finishAttempt(5000); });
    await waitFor(() => expect(latest.session.attemptResult?.status).toBe('submitted'));
    await switchToB(); await startDurable();
    await act(async () => { read.resolve({ data: readPayload('submitted', ['qa-1', 'qa-2']), error: null }); await expect(p).rejects.toThrow('IDENTITY_CHANGED'); });
    expect(latest.session.quiz.map((q) => q.id)).toEqual(['qb-1']);
    expect(latest.session.quiz[0].explanation).not.toContain('private');
    expect(seen.some((s) => s.includes('!'))).toBe(false);
    neverShowedA();
  });

  it('openAttempt: a read resolving after SIGNED_OUT opens nothing and rejects instead of returning false', async () => {
    await mountA();
    const read = defer<unknown>();
    db.attempt.mockImplementation((name: string) => name === 'attempt_read' ? read.promise : Promise.resolve(ok));
    let p!: Promise<boolean>;
    act(() => { p = latest.openAttempt('att-a'); });
    await fire('SIGNED_OUT', null);
    await act(async () => { read.resolve({ data: readPayload('in_progress', ['qa-1']), error: null }); await expect(p).rejects.toThrow('IDENTITY_CHANGED'); });
    expect(latest.session.quiz).toEqual([]);
    expect(latest.currentView).toBe('home');
    expect(seen.some((s) => s.includes('view=session'))).toBe(false);
  });

  it('resumeSessionFromDb: A\'s stale draft read landing after A -> B neither opens A\'s quiz nor deletes B\'s draft', async () => {
    db.saved = draft(['qa-1'], 'att-a');
    await mountA();
    const read = defer<unknown>();
    db.attempt.mockImplementation((name: string) => name === 'attempt_read' ? read.promise : Promise.resolve(ok));
    let p!: Promise<boolean>;
    act(() => { p = latest.resumeSessionFromDb(); });
    db.saved = draft(['qb-1'], 'att-b');
    await switchToB();
    expect(latest.savedSessionInfo?.attemptId).toBe('att-b');
    await act(async () => { read.resolve({ data: readPayload('submitted', ['qa-1']), error: null }); await expect(p).rejects.toThrow('IDENTITY_CHANGED'); });
    await flush();
    expect(db.remove).not.toHaveBeenCalledWith('saved_sessions');
    expect(latest.savedSessionInfo?.attemptId).toBe('att-b');
    expect(latest.session.quiz).toEqual([]);
    neverShowedA();
  });

  it('startRepeat: a repeat created for A after A -> B is never followed by a read under B\'s token', async () => {
    await mountA();
    const repeat = defer<unknown>();
    db.attempt.mockImplementation((name: string) => name === 'attempt_repeat' ? repeat.promise : name === 'attempt_read' ? Promise.resolve({ data: readPayload('in_progress', ['qa-1']), error: null }) : Promise.resolve(ok));
    let p!: Promise<void>;
    act(() => { p = latest.startRepeat('root-a', 'immediate'); });
    await switchToB();
    const reads = attemptCalls('attempt_read');
    await act(async () => { repeat.resolve({ data: startPayload(['qa-1']), error: null }); await expect(p).rejects.toThrow('IDENTITY_CHANGED'); });
    expect(attemptCalls('attempt_read')).toBe(reads);
    expect(latest.session.quiz).toEqual([]);
    neverShowedA();
  });

  it.each([['SIGNED_OUT', null], ['SIGNED_IN', B]] as const)('saveSessionToDb: a queued draft save is never sent after %s and the landed one writes no local draft', async (event, uid) => {
    await mountA(); await startDurable();
    const first = defer<{ error: null }>();
    db.upsert.mockImplementationOnce(() => first.promise);
    let p1!: Promise<void>; let p2!: Promise<void>;
    act(() => { p1 = latest.saveSessionToDb(10); p2 = latest.saveSessionToDb(20); });
    await waitFor(() => expect(writesTo('saved_sessions')).toBe(1));
    if (uid) await switchToB(); else await fire(event, null);
    await act(async () => { first.resolve({ error: null }); await expect(p1).rejects.toThrow('IDENTITY_CHANGED'); await expect(p2).rejects.toThrow('IDENTITY_CHANGED'); });
    await flush();
    expect(writesTo('saved_sessions')).toBe(1);
    expect(latest.savedSessionInfo).toBeNull();
  });

  it('clearSavedSession: a delete queued behind A\'s save is never sent with B\'s token, so B\'s draft survives', async () => {
    db.saved = draft(['qa-1']);
    await mountA(); await startDurable();
    const first = defer<{ error: null }>();
    db.upsert.mockImplementationOnce(() => first.promise);
    let ps!: Promise<void>; let pc!: Promise<void>;
    act(() => { ps = latest.saveSessionToDb(); pc = latest.clearSavedSession(); });
    await waitFor(() => expect(writesTo('saved_sessions')).toBe(1));
    db.saved = draft(['qb-1'], 'att-b');
    await switchToB();
    await act(async () => { first.resolve({ error: null }); await expect(ps).rejects.toThrow('IDENTITY_CHANGED'); await expect(pc).rejects.toThrow('IDENTITY_CHANGED'); });
    await flush();
    expect(db.remove).not.toHaveBeenCalled();
    expect(latest.savedSessionInfo?.attemptId).toBe('att-b');
  });

  it('updateSpacedRepetition: the SM-2 read landing after A -> B sends no SRS row and resolves quietly', async () => {
    await mountA();
    const read = deferNext(db.maybeSingle, 'spaced_repetition', { data: null, error: null });
    let p!: Promise<void>;
    act(() => { p = latest.updateSpacedRepetition('qa-1', true, 'confident', 'Demo') as unknown as Promise<void>; });
    await switchToB();
    await act(async () => { read.resolve({ data: { interval_days: 6, ease_factor: 2.5, repetitions: 2 }, error: null }); await p; });
    expect(writesTo('spaced_repetition')).toBe(0);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('markForReview: the SRS reset landing after A -> B sends no SRS row and shows no success', async () => {
    await mountA();
    const read = deferNext(db.maybeSingle, 'spaced_repetition', { data: null, error: null });
    let p!: Promise<void>;
    act(() => { p = latest.markForReview('qa-1', 'Demo'); });
    await switchToB();
    await act(async () => { read.resolve({ data: { ease_factor: 2.5 }, error: null }); await p; });
    expect(writesTo('spaced_repetition')).toBe(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('optimistic rollback: A\'s failed favourite landing after A -> B does not restore A\'s favourites into B\'s progress', async () => {
    db.rows = { user_favorites: [{ question_id: 'qa-fav' }] };
    await mountA();
    expect(latest.progress.favorites).toEqual(['qa-fav']);
    const insert = defer<{ error: { message: string } }>();
    db.insert.mockImplementationOnce(() => insert.promise);
    act(() => latest.toggleFavorite('qa-new'));
    await switchToB();
    expect(latest.progress.favorites).toEqual([]);
    await act(async () => { insert.resolve({ error: { message: 'RLS' } }); });
    await flush();
    expect(latest.progress.favorites).toEqual([]);
  });

  it('importData: a restore interrupted by A -> B sends no further rows with B\'s token and rejects', async () => {
    await mountA();
    const first = defer<{ error: null }>();
    db.upsert.mockImplementationOnce(() => first.promise);
    let p!: Promise<void>;
    act(() => { p = latest.importData({ history: { 'qa-1': { answered: 1, correct: 1, lastResult: 'correct', everWrong: false, timestamp: 1 } }, favorites: ['qa-1'], notes: { 'qa-1': 'n' }, ratings: {}, tags: {} }) as unknown as Promise<void>; });
    await waitFor(() => expect(writesTo('user_answers')).toBe(1));
    await switchToB();
    await act(async () => { first.resolve({ error: null }); await expect(p).rejects.toThrow(); });
    expect(writesTo('user_favorites')).toBe(0);
    expect(writesTo('user_notes')).toBe(0);
  });

  it('getDueQuestions / fetchSrsData: A\'s SRS rows landing after A -> B select nothing from B\'s bank', async () => {
    await mountA();
    const due = defer<{ data: unknown[]; error: null }>();
    const srs = defer<{ data: unknown[]; error: null }>();
    let calls = 0;
    db.range.mockImplementation(async (table: string) => table === 'spaced_repetition' ? (calls++ === 0 ? due.promise : srs.promise) : { data: db.rows[table] ?? [], error: null });
    let pDue!: Promise<unknown[]>; let pSrs!: Promise<Record<string, unknown>>;
    act(() => { pDue = latest.getDueQuestions(); pSrs = latest.fetchSrsData(); });
    await switchToB();
    await act(async () => {
      due.resolve({ data: [{ question_id: 'qb-1', next_review_date: '2020-01-01' }], error: null });
      srs.resolve({ data: [{ question_id: 'qb-1', next_review_date: '2020-01-01', interval_days: 1, ease_factor: 2.5, repetitions: 1, confidence: 'guessed', last_correct: false }], error: null });
      expect(await pDue).toEqual([]);
      expect(await pSrs).toEqual({});
    });
  });

  it('admin realtime channel is torn down on A -> B, not only on sign-out', async () => {
    db.roleLookup = role('admin');
    await mountA();
    db.roleLookup = role(null);
    await switchToB();
    expect(db.removeChannel).toHaveBeenCalled();
  });

  it('an admin realtime payload that began for A cannot toast A question or editor details after A -> B', async () => {
    db.roleLookup = role('admin');
    await mountA();
    const editor = defer<{ data: { email: string }; error: null }>();
    const question = defer<{ data: { topic: string }; error: null }>();
    db.maybeSingle.mockImplementation((table: string) => table === 'admin_users' ? editor.promise : table === 'questions' ? question.promise : Promise.resolve({ data: null, error: null }));
    const payload = db.realtimeCallback!({ new: { editor_id: 'a-secret-editor', question_id: 'qa-secret-question' } });
    await switchToB();
    await act(async () => {
      editor.resolve({ data: { email: 'a-secret@example.com' }, error: null });
      question.resolve({ data: { topic: 'A private topic' }, error: null });
      await payload;
    });
    expect(toast).not.toHaveBeenCalled();
  });

  // PHASE-2B-NOTIFICATION / PHASE-2B-CHANNEL: the admin channel is gone, and
  // every callback it ever started is dead, from the first instant of ANY
  // same-user re-verification — TOKEN_REFRESHED and the SIGNED_IN re-emit
  // supabase-js fires for the already-signed-in user on every tab focus. A
  // payload delivered while approval or role is still pending can never toast
  // — whichever of the payload's lookups and the denial finishes first — and
  // the channel is not recreated. The identity epoch is untouched, so the
  // authorized durable quiz survives a re-verification that re-confirms the
  // same admin, and exactly one live channel comes back.
  const secret = { new: { editor_id: 'a-secret-editor', question_id: 'qa-secret-question' } };
  const deferLookups = () => {
    const editor = defer<{ data: { email: string }; error: null }>();
    const question = defer<{ data: { topic: string }; error: null }>();
    db.maybeSingle.mockImplementation((table: string) => table === 'admin_users' ? editor.promise : table === 'questions' ? question.promise : Promise.resolve({ data: null, error: null }));
    return (payload: Promise<void>) => act(async () => {
      editor.resolve({ data: { email: 'a-secret@example.com' }, error: null });
      question.resolve({ data: { topic: 'A private topic' }, error: null });
      await payload;
    });
  };
  const liveLookups = () => db.maybeSingle.mockImplementation(async (table: string) => ({ data: table === 'admin_users' ? { email: 'a-secret@example.com' } : table === 'questions' ? { topic: 'A private topic' } : null, error: null }));
  const denials = {
    'approval false': (d: Deferred<unknown>) => d.resolve({ data: false, error: null }),
    'approval error': (d: Deferred<unknown>) => d.reject(new Error('is_approved unavailable')),
    'role demotion': (d: Deferred<unknown>) => d.resolve({ data: null, error: null }),
  };
  // Every same-user event that re-verifies approval and role.
  const reverify = ['SIGNED_IN', 'TOKEN_REFRESHED'] as const;
  const matrix = reverify.flatMap((event) => (Object.keys(denials) as (keyof typeof denials)[]).flatMap((denial) => (['lookups before denial', 'denial before lookups'] as const).map((order) => [event, denial, order] as const)));

  it.each(matrix)('a realtime payload delivered while same-user %s is pending on %s cannot toast (%s)', async (event, denial, order) => {
    db.roleLookup = role('admin');
    await mountA(); await startDurable();
    await waitFor(() => expect(db.channels).toBe(1));
    const pending = defer<unknown>();
    if (denial === 'role demotion') db.roleLookup = () => pending.promise; else db.approval = () => pending.promise;
    const landLookups = deferLookups();
    const stale = db.realtimeCallback!;
    await fire(event, A);
    // The channel is removed before any lookup, and the app tree is hidden.
    expect(db.removeChannel).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('app')).toBeNull();
    const payload = stale(secret);
    const deny = () => act(async () => { denials[denial](pending); await flush(); });
    if (order === 'lookups before denial') { await landLookups(payload); await deny(); } else { await deny(); await landLookups(payload); }
    await waitFor(() => expect(denial === 'role demotion' ? latest.roleResolved : latest.approved === false).toBe(true));
    expect(toast).not.toHaveBeenCalled();
    expect(latest.isAdmin).toBe(false);
    expect(db.channels).toBe(1);
    // A denied approval keeps the tree hidden; a demoted admin is still an
    // approved resident and legitimately gets their own (non-admin) app back.
    if (denial !== 'role demotion') { expect(screen.queryByTestId('app')).toBeNull(); neverShowedA(); }
  });

  it.each(reverify)('a payload already in flight when same-user %s starts a demotion cannot toast once its lookups land', async (event) => {
    db.roleLookup = role('admin');
    await mountA(); await startDurable();
    await waitFor(() => expect(db.channels).toBe(1));
    const landLookups = deferLookups();
    const payload = db.realtimeCallback!(secret);
    const pending = defer<unknown>(); db.roleLookup = () => pending.promise;
    await fire(event, A);
    await landLookups(payload);
    expect(toast).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ data: null, error: null }); });
    await waitFor(() => expect(latest.roleResolved).toBe(true));
    expect(latest.isAdmin).toBe(false);
    expect(toast).not.toHaveBeenCalled();
    expect(db.channels).toBe(1);
  });

  it.each(reverify)('a same-user %s that re-confirms the same approved admin drops the channel first, restores exactly one, and keeps the durable quiz', async (event) => {
    db.roleLookup = role('admin');
    await mountA(); await startDurable();
    await waitFor(() => expect(db.channels).toBe(1));
    const stale = db.realtimeCallback!;
    await fire(event, A);
    expect(db.removeChannel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(latest.approved === true && latest.roleResolved && latest.isAdmin).toBe(true));
    await waitFor(() => expect(db.channels).toBe(2));
    await flush();
    expect(db.channels).toBe(2);
    expect(db.removeChannel).toHaveBeenCalledTimes(1);
    expect(latest.session.attemptId).toBe('att-a');
    expect(screen.getByTestId('quiz')).toHaveTextContent('qa-');
    // The old channel's callback is dead; the new one is live.
    liveLookups();
    await act(async () => { await stale(secret); });
    expect(toast).not.toHaveBeenCalled();
    await act(async () => { await db.realtimeCallback!(secret); });
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('unmounting the provider removes the channel and kills a payload already in flight; a late delivery to the dead channel toasts nothing', async () => {
    db.roleLookup = role('admin');
    await mountA();
    await waitFor(() => expect(db.channels).toBe(1));
    const landLookups = deferLookups();
    const stale = db.realtimeCallback!;
    const payload = stale(secret);
    cleanup();
    expect(db.removeChannel).toHaveBeenCalledTimes(1);
    await landLookups(payload);
    expect(toast).not.toHaveBeenCalled();
    liveLookups();
    await act(async () => { await stale(secret); });
    expect(toast).not.toHaveBeenCalled();
    expect(db.channels).toBe(1);
  });
});

describe('identity race: privilege changes on TOKEN_REFRESHED (resident flag ON)', () => {
  beforeEach(() => { resetDb(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', ''); vi.stubEnv('VITE_RESIDENT_ONBOARDING', 'true'); });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

  it('editor -> non-editor with a delayed role lookup: the bypass closes before the lookup and the editor bank and quiz never reappear', async () => {
    db.roleLookup = role('editor');
    await mountA(['editor-1', 'editor-2'], false, unlinked);
    act(() => latest.startSession(latest.data, 1, 'practice'));
    expect(screen.getByTestId('quiz')).toHaveTextContent('editor-');
    const lookup = defer<unknown>(); db.roleLookup = () => lookup.promise; db.bank = bankOf('open-1');
    await fire('TOKEN_REFRESHED', A);
    expect(latest.roleResolved).toBe(false);
    expect(screen.queryByTestId('app')).toBeNull();
    expect(appRenders()).toEqual([]);
    await act(async () => { lookup.resolve({ data: null, error: null }); });
    await waitFor(() => expect(latest.roleResolved).toBe(true));
    expect(latest.isEditor).toBe(false);
    expect(screen.queryByTestId('app')).toBeNull();
    expect(appRenders()).toEqual([]);
    expect(latest.session.quiz).toEqual([]);
    await waitFor(() => expect(fetchQuestions).toHaveBeenLastCalledWith(3, true));
    await waitFor(() => expect(latest.data.map((q) => q.id)).toEqual(['open-1']));
  });

  it('a rejected role lookup on TOKEN_REFRESHED clears the editor bypass and fails closed', async () => {
    db.roleLookup = role('editor');
    await mountA(['editor-1'], false, unlinked);
    db.roleLookup = async () => { throw new Error('admin_users unreachable'); }; db.bank = bankOf('open-1');
    await fire('TOKEN_REFRESHED', A);
    await waitFor(() => expect(latest.roleResolved).toBe(true));
    expect(latest.isEditor).toBe(false);
    expect(latest.isAdmin).toBe(false);
    expect(screen.queryByTestId('app')).toBeNull();
    expect(appRenders()).toEqual([]);
    expect(latest.data.map((q) => q.id)).not.toContain('editor-1');
  });

  it('editor -> resident with the same national flag still quarantines and reloads the bank (content privilege is part of the scope)', async () => {
    db.roleLookup = role('editor');
    await mountA(['editor-1', 'nat-1'], true);
    act(() => latest.startSession(latest.data, 1, 'practice'));
    const before = vi.mocked(setQuestionsCacheScope).mock.lastCall?.[0];
    db.roleLookup = role(null); db.bank = bankOf('nat-1');
    await fire('TOKEN_REFRESHED', A);
    await waitFor(() => expect(latest.roleResolved).toBe(true));
    await waitFor(() => expect(latest.residentResolved).toBe(true));
    expect(vi.mocked(setQuestionsCacheScope).mock.lastCall?.[0]).not.toBe(before);
    expect(latest.session.quiz).toEqual([]);
    await waitFor(() => expect(fetchQuestions).toHaveBeenLastCalledWith(3, true));
    await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent('nat-1'));
    expect(appRenders().filter((s) => s.includes('editor-'))).toEqual([]);
  });

  it.each([['editor', true], [null, false]] as const)('a routine refresh that verifies the same privilege (role=%s) keeps the running quiz and does not refetch', async (r, national) => {
    db.roleLookup = role(r);
    await mountA(['qa-1', 'qa-2'], national);
    act(() => latest.startSession(latest.data, 1, 'practice'));
    const fetches = vi.mocked(fetchQuestions).mock.calls.length;
    await fire('TOKEN_REFRESHED', A);
    await waitFor(() => expect(latest.roleResolved && latest.residentResolved).toBe(true));
    await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent('qa-1,qa-2'));
    expect(screen.getByTestId('quiz')).toHaveTextContent('qa-');
    expect(vi.mocked(fetchQuestions).mock.calls.length).toBe(fetches);
    expect(latest.isEditor).toBe(r === 'editor');
  });
});

describe('identity race with the resident flag OFF', () => {
  beforeEach(() => { resetDb(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', ''); vi.stubEnv('VITE_RESIDENT_ONBOARDING', ''); });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

  it('editor -> non-editor on TOKEN_REFRESHED still drops the editor bank and quiz (RLS scopes by content privilege regardless of the flag)', async () => {
    db.roleLookup = role('editor');
    await mountA(['editor-1']);
    act(() => latest.startSession(latest.data, 1, 'practice'));
    db.roleLookup = role(null); db.bank = bankOf('open-1');
    await fire('TOKEN_REFRESHED', A);
    await waitFor(() => expect(latest.roleResolved).toBe(true));
    await waitFor(() => expect(latest.isEditor).toBe(false));
    expect(latest.session.quiz).toEqual([]);
    await waitFor(() => expect(screen.getByTestId('bank')).toHaveTextContent('open-1'));
    expect(appRenders().filter((s) => s.includes('editor-') && s.includes('quiz=editor'))).toEqual([]);
  });

  it('a same-privilege refresh with the flag off is still a no-op for the bank and the quiz', async () => {
    await mountA();
    act(() => latest.startSession(latest.data, 1, 'practice'));
    const fetches = vi.mocked(fetchQuestions).mock.calls.length;
    await fire('TOKEN_REFRESHED', A);
    await waitFor(() => expect(latest.roleResolved).toBe(true));
    expect(screen.getByTestId('quiz')).toHaveTextContent('qa-');
    expect(vi.mocked(fetchQuestions).mock.calls.length).toBe(fetches);
  });

  it.each(['false approval', 'rejected approval'] as const)('TOKEN_REFRESHED closes the approval gate and clears private state on %s', async (outcome) => {
    db.saved = draft(['qa-1'], 'att-a');
    await mountA();
    act(() => latest.startSession(latest.data, 1, 'practice'));
    const approval = defer<{ data: boolean; error: null }>();
    db.approval = () => approval.promise;
    await fire('TOKEN_REFRESHED', A);
    expect(latest.approved).toBeNull();
    expect(screen.queryByTestId('app')).toBeNull();
    if (outcome === 'false approval') {
      await act(async () => { approval.resolve({ data: false, error: null }); });
    } else {
      await act(async () => { approval.reject(new Error('is_approved unavailable')); });
    }
    await waitFor(() => expect(latest.approved).toBe(false));
    expect(screen.queryByTestId('app')).toBeNull();
    expect(latest.data).toEqual([]);
    expect(latest.session.quiz).toEqual([]);
    expect(latest.savedSessionInfo).toBeNull();
    expect(latest.progress).toEqual({ history: {}, notes: {}, favorites: [], ratings: {}, tags: {} });
    neverShowedA();
  });
});
