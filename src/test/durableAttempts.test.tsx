import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from '@/contexts/AppContext';
import { launchQuestion } from './fixtures/launchQuestion';

const db = vi.hoisted(() => ({ saved: null as unknown, rpc: vi.fn(), upsert: vi.fn(), remove: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'synthetic-user' } } } }),
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      queueMicrotask(() => callback('INITIAL_SESSION', { user: { id: 'synthetic-user' } }));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  },
  rpc: db.rpc,
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, range: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: async () => ({ data: table === 'saved_sessions' ? { session_data: db.saved } : null, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
      upsert: db.upsert, delete: () => ({ eq: db.remove }),
    };
    return query;
  },
} }));
const bank = [launchQuestion('q1'), { ...launchQuestion('qna'), correct: 'N/A' }, launchQuestion('q2')];
vi.mock('@/lib/csvService', () => ({ fetchQuestions: async () => bank, invalidateQuestionsCache: vi.fn(), setQuestionsCacheScope: () => false }));
vi.mock('@/lib/academyRepository', () => ({ claimAcademyMembership: async () => null, fetchMyAttempts: async () => [] }));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const rpcCalls = (name: string) => db.rpc.mock.calls.filter(([n]) => n === name);
const startPayload = { attempt_id: 'att-1', root_id: 'root-1', question_order: ['q1', 'qna', 'q2'] };
const snapshot = (q: ReturnType<typeof launchQuestion>, extra: Record<string, unknown> = {}) => ({ id: q.id, question: q.question, a: q.A, b: q.B, c: q.C, d: q.D, topic: q.topic, chapter: 1, ...extra });
const readPayload = (status: string, overrides: Record<string, unknown> = {}) => ({
  attempt_id: 'att-1', root_id: 'root-1', status, mode: 'exam', feedback_timing: 'end', total_count: 2, started_at: '2026-09-07T08:00:00Z',
  question_order: ['q2', 'q1'],
  questions: [
    { question_id: 'q2', position: 1, snapshot: snapshot(bank[2], { question: 'frozen q2' }), selected: 'C', confidence: 'confident', answer_ms: 4000, confirmed_at: 'x', is_correct: null, scored: true },
    { question_id: 'q1', position: 2, snapshot: snapshot(bank[0]), selected: null, confidence: null, answer_ms: null, confirmed_at: null, is_correct: null, scored: true },
  ],
  ...overrides,
});
async function load() {
  const hook = renderHook(() => useApp(), { wrapper: AppProvider });
  await waitFor(() => expect(hook.result.current.loadingSavedSession).toBe(false));
  await waitFor(() => expect(hook.result.current.userId).toBe('synthetic-user'));
  await waitFor(() => expect(hook.result.current.data.length).toBe(3));
  return hook;
}

describe('durable attempts (flag on)', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', 'true'); db.saved = null;
    db.upsert.mockResolvedValue({ error: null }); db.remove.mockResolvedValue({ error: null });
    db.rpc.mockImplementation(async (name: string) => name === 'attempt_start' ? { data: startPayload, error: null } : { data: true, error: null });
  });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

  it('starts on the server, keeps unknown keys unscored, and never invents an answer key', async () => {
    const { result } = await load();
    await act(async () => { await result.current.startSession(bank, 3, 'practice', { feedbackTiming: 'immediate' }); });
    const [, args] = rpcCalls('attempt_start')[0];
    expect(args).toMatchObject({ _mode: 'practice', _feedback_timing: 'immediate' });
    expect([...args._question_ids].sort()).toEqual(['q1', 'q2', 'qna']);
    expect(result.current.session).toMatchObject({ attemptId: 'att-1', rootId: 'root-1', questionMs: [0, 0, 0] });
    expect(result.current.session.quiz.map(q => q.id)).toEqual(['q1', 'qna', 'q2']);
    expect(result.current.session.quiz[1].correct).toBe('N/A');
    expect(result.current.currentView).toBe('session');
  });

  it('shows failure instead of silently falling back to legacy writes', async () => {
    const { result } = await load();
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'NOT_APPROVED' } });
    await act(async () => { await expect(result.current.startSession(bank, 3, 'exam')).rejects.toThrow('NOT_APPROVED'); });
    expect(result.current.session.quiz).toHaveLength(0);
    expect(result.current.session.attemptId).toBeUndefined();
    expect(result.current.currentView).not.toBe('session');
  });

  it('confirms through the server before revealing feedback and mirrors practice credit locally without legacy writes', async () => {
    const { result } = await load();
    await act(async () => { await result.current.startSession(bank, 3, 'practice'); });
    act(() => result.current.setAnswer(0, 'B'));
    db.rpc.mockResolvedValueOnce({ data: { is_correct: false, correct_key: 'A', locked: true }, error: null });
    await act(async () => { await result.current.confirmAnswer(0, 'hesitant', 2500); });
    expect(rpcCalls('attempt_confirm')[0][1]).toEqual({ _attempt_id: 'att-1', _question_id: 'q1', _selected: 'B', _confidence: 'hesitant', _answer_ms: 2500 });
    expect(result.current.session.confidence[0]).toBe('hesitant');
    expect(result.current.session.questionMs?.[0]).toBe(2500);
    expect(result.current.progress.history.q1).toMatchObject({ answered: 1, correct: 0, lastResult: 'wrong' });
    expect(rpcCalls('increment_user_answer')).toHaveLength(0);
    // unscored question: stored, no local credit
    act(() => result.current.setAnswer(1, 'C'));
    db.rpc.mockResolvedValueOnce({ data: { is_correct: null, correct_key: null, locked: true }, error: null });
    await act(async () => { await result.current.confirmAnswer(1, 'guessed', 100); });
    expect(result.current.progress.history.qna).toBeUndefined();
    expect(result.current.session.confidence[1]).toBe('guessed');
  });

  it('keeps the answer unconfirmed when the server refuses', async () => {
    const { result } = await load();
    await act(async () => { await result.current.startSession(bank, 3, 'practice'); });
    act(() => result.current.setAnswer(0, 'A'));
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'FetchError' } });
    await act(async () => { await expect(result.current.confirmAnswer(0, 'confident', 10)).rejects.toThrow('ATTEMPT_UNAVAILABLE'); });
    expect(result.current.session.confidence[0]).toBeNull();
    expect(result.current.progress.history.q1).toBeUndefined();
  });

  it('submits exams on the server and mirrors the returned per-question scoring', async () => {
    const { result } = await load();
    await act(async () => { await result.current.startSession(bank, 3, 'exam'); });
    act(() => result.current.setAnswer(0, 'A'));
    await act(async () => { await result.current.confirmAnswer(0, 'confident', 500); });
    expect(result.current.progress.history.q1).toBeUndefined();
    const submitted = { attempt_id: 'att-1', root_id: 'root-1', status: 'submitted', correct_count: 1, scored_count: 1, answered_count: 2, total_count: 3, quarter: '2026-Q3', submitted_at: 's', total_active_ms: 61000 };
    db.rpc.mockImplementation(async (name: string) => {
      if (name === 'attempt_submit') return { data: { ...submitted, questions: [{ question_id: 'q1', is_correct: true }, { question_id: 'qna', is_correct: null }] }, error: null };
      if (name === 'attempt_read') return { data: { ...submitted, mode: 'exam', feedback_timing: 'end', started_at: 's', question_order: ['q1', 'qna', 'q2'], questions: bank.map((q, i) => ({ question_id: q.id, position: i + 1, snapshot: snapshot(q, { correct: q.correct, explanation: `revealed ${q.id}` }), selected: null, confidence: null, answer_ms: null, confirmed_at: null, is_correct: null, scored: q.id !== 'qna' })) }, error: null };
      return { data: true, error: null };
    });
    await act(async () => { await result.current.finishAttempt(61000); });
    expect(result.current.session.quiz.map(q => q.explanation)).toEqual(['revealed q1', 'revealed qna', 'revealed q2']);
    expect(result.current.session.quiz[1].correct).toBe('N/A');
    expect(rpcCalls('attempt_submit')[0][1]).toEqual({ _attempt_id: 'att-1', _total_active_ms: 61000 });
    expect(result.current.session.attemptResult).toMatchObject({ correctCount: 1, scoredCount: 1, quarter: '2026-Q3' });
    expect(result.current.progress.history.q1).toMatchObject({ answered: 1, correct: 1, lastResult: 'correct' });
    expect(result.current.progress.history.qna).toBeUndefined();
    expect(rpcCalls('increment_user_answer')).toHaveLength(0);
  });

  it('persists attempt identity and per-question time in the draft', async () => {
    const { result } = await load();
    await act(async () => { await result.current.startSession(bank, 3, 'exam'); });
    await act(async () => result.current.saveSessionToDb(43, undefined, [1000, 0, 0]));
    expect(db.upsert.mock.calls[0][0].session_data).toMatchObject({ attemptId: 'att-1', rootId: 'root-1', questionMs: [1000, 0, 0], timerSeconds: 43 });
  });

  it('resumes from the server copy: frozen content wins; on exam/end a changed draft answer replaces the confirmed one and drops its rating', async () => {
    db.saved = { questionIds: ['q2', 'q1'], index: 1, mode: 'exam', feedbackTiming: 'end', answers: ['B', 'D'], confidence: ['guessed', 'hesitant'], flagged: [1], skipped: [], timerSeconds: 90, attemptId: 'att-1', rootId: 'root-1', questionMs: [1500, 700], createdAt: 'c' };
    db.rpc.mockImplementation(async (name: string) => name === 'attempt_read' ? { data: readPayload('in_progress'), error: null } : { data: true, error: null });
    const { result } = await load();
    await act(async () => { expect(await result.current.resumeSessionFromDb()).toBe(true); });
    expect(result.current.session).toMatchObject({ attemptId: 'att-1', rootId: 'root-1', mode: 'exam', feedbackTiming: 'end', index: 1, answers: ['B', 'D'], confidence: [null, 'hesitant'], questionMs: [4000, 700], resumedTimerSeconds: 90 });
    expect(result.current.session.quiz[0].question).toBe('frozen q2');
    expect(result.current.session.flagged.has(1)).toBe(true);
    expect(db.remove).not.toHaveBeenCalled();
  });

  it('refuses to reopen a submitted attempt and discards its stale draft', async () => {
    db.saved = { questionIds: ['q2', 'q1'], index: 0, mode: 'exam', answers: [null, null], confidence: [null, null], flagged: [], skipped: [], attemptId: 'att-1', rootId: 'root-1', createdAt: 'c' };
    db.rpc.mockImplementation(async (name: string) => name === 'attempt_read' ? { data: readPayload('submitted'), error: null } : { data: true, error: null });
    const { result } = await load();
    await act(async () => { expect(await result.current.resumeSessionFromDb()).toBe(false); });
    expect(db.remove).toHaveBeenCalledOnce();
    expect(result.current.savedSessionInfo).toBeNull();
    expect(toast.error).toHaveBeenCalled();
    expect(result.current.currentView).not.toBe('session');
  });

  it('abandons the open attempt on the server when the user leaves without saving', async () => {
    const { result } = await load();
    await act(async () => { await result.current.startSession(bank, 3, 'practice'); });
    await act(async () => { await result.current.abandonCurrentAttempt(); });
    expect(rpcCalls('attempt_abandon')[0][1]).toEqual({ _attempt_id: 'att-1' });
  });

  it('repeats an archived exam with the chosen feedback timing and opens the server-shuffled attempt', async () => {
    db.rpc.mockImplementation(async (name: string) => {
      if (name === 'attempt_repeat') return { data: { attempt_id: 'att-2', root_id: 'root-1', question_order: ['q2', 'q1'] }, error: null };
      if (name === 'attempt_read') return { data: readPayload('in_progress', { attempt_id: 'att-2', feedback_timing: 'immediate', questions: readPayload('in_progress').questions.map(q => ({ ...q, selected: null, confidence: null, answer_ms: null, confirmed_at: null })) }), error: null };
      return { data: true, error: null };
    });
    const { result } = await load();
    await act(async () => { await result.current.startRepeat('root-1', 'immediate'); });
    expect(rpcCalls('attempt_repeat')[0][1]).toEqual({ _root_id: 'root-1', _feedback_timing: 'immediate' });
    expect(result.current.session).toMatchObject({ attemptId: 'att-2', rootId: 'root-1', mode: 'exam', feedbackTiming: 'immediate', answers: [null, null], questionMs: [0, 0] });
    expect(result.current.session.quiz.map(q => q.id)).toEqual(['q2', 'q1']);
    expect(result.current.session.learningBaseline).toBeUndefined();
    expect(result.current.currentView).toBe('session');
  });

  it('reveals the frozen key and explanation after confirming on a resumed immediate attempt, and never for end feedback', async () => {
    db.saved = { questionIds: ['q2', 'q1'], index: 1, mode: 'practice', answers: [null, null], confidence: [null, null], flagged: [], skipped: [], attemptId: 'att-1', rootId: 'root-1', createdAt: 'c' };
    db.rpc.mockImplementation(async (name: string) => name === 'attempt_read' ? { data: readPayload('in_progress', { mode: 'practice', feedback_timing: 'immediate' }), error: null } : { data: true, error: null });
    const { result } = await load();
    await act(async () => { await result.current.resumeSessionFromDb(); });
    expect(result.current.session.quiz[1]).toMatchObject({ correct: '', explanation: '' });
    act(() => result.current.setAnswer(1, 'A'));
    db.rpc.mockResolvedValueOnce({ data: { is_correct: true, correct_key: 'A', explanation: 'frozen explanation q1', locked: true }, error: null });
    await act(async () => { await result.current.confirmAnswer(1, 'confident', 900); });
    expect(result.current.session.quiz[1]).toMatchObject({ correct: 'A', explanation: 'frozen explanation q1' });

    db.rpc.mockImplementation(async (name: string) => name === 'attempt_read' ? { data: readPayload('in_progress'), error: null } : { data: true, error: null });
    await act(async () => { await result.current.resumeSessionFromDb(); });
    act(() => result.current.setAnswer(1, 'A'));
    db.rpc.mockResolvedValueOnce({ data: { is_correct: null, correct_key: null, explanation: null, locked: false }, error: null });
    await act(async () => { await result.current.confirmAnswer(1, 'confident', 900); });
    expect(result.current.session.quiz[1]).toMatchObject({ correct: '', explanation: '' });
  });

  it('mirrors confirmed confidence into the confidence filter', async () => {
    const { result } = await load();
    await act(async () => { await result.current.startSession(bank, 3, 'practice'); });
    act(() => result.current.setAnswer(0, 'A'));
    db.rpc.mockResolvedValueOnce({ data: { is_correct: true, correct_key: 'A', locked: true }, error: null });
    await act(async () => { await result.current.confirmAnswer(0, 'hesitant', 10); });
    act(() => result.current.toggleMultiSelect('confidence', 'hesitant'));
    expect(result.current.getFilteredQuestions().map(q => q.id)).toEqual(['q1']);
  });

  const submitted = { attempt_id: 'att-1', root_id: 'root-1', status: 'submitted', correct_count: 1, scored_count: 1, answered_count: 2, total_count: 3, quarter: '2026-Q3', submitted_at: 's', total_active_ms: 61000 };
  const revealedRead = { ...submitted, mode: 'exam', feedback_timing: 'end', started_at: 's', question_order: ['q1', 'qna', 'q2'], questions: bank.map((q, i) => ({ question_id: q.id, position: i + 1, snapshot: snapshot(q, { correct: q.correct, explanation: `revealed ${q.id}` }), selected: q.id === 'q1' ? 'A' : null, confidence: q.id === 'q1' ? 'confident' : null, answer_ms: null, confirmed_at: null, is_correct: q.id === 'q1' ? true : null, scored: q.id !== 'qna' })) };

  it('submit accepted but results read failed: keeps the accepted result, credits local history once, and the retry only re-reads', async () => {
    const { result } = await load();
    await act(async () => { await result.current.startSession(bank, 3, 'exam'); });
    act(() => result.current.setAnswer(0, 'A'));
    await act(async () => { await result.current.confirmAnswer(0, 'confident', 500); });
    db.rpc.mockImplementation(async (name: string) => {
      if (name === 'attempt_submit') return { data: { ...submitted, questions: [{ question_id: 'q1', is_correct: true }] }, error: null };
      if (name === 'attempt_read') return { data: null, error: { message: 'FetchError' } };
      return { data: true, error: null };
    });
    await act(async () => { await expect(result.current.finishAttempt(61000)).rejects.toThrow('RESULTS_READ_FAILED'); });
    expect(result.current.session.attemptResult).toMatchObject({ status: 'submitted', correctCount: 1 });
    expect(result.current.progress.history.q1).toMatchObject({ answered: 1, correct: 1 });
    db.rpc.mockImplementation(async (name: string) => name === 'attempt_read' ? { data: revealedRead, error: null } : { data: true, error: null });
    await act(async () => { await result.current.finishAttempt(61000); });
    expect(rpcCalls('attempt_submit')).toHaveLength(1);
    expect(result.current.progress.history.q1).toMatchObject({ answered: 1, correct: 1 });
    expect(result.current.session.quiz[0].explanation).toBe('revealed q1');
  });

  it('uncertain submit: when the server says the attempt is already closed, the stored result is used and nothing is re-credited twice', async () => {
    const { result } = await load();
    await act(async () => { await result.current.startSession(bank, 3, 'exam'); });
    db.rpc.mockImplementation(async (name: string) => {
      if (name === 'attempt_submit') return { data: null, error: { message: 'ATTEMPT_NOT_OPEN' } };
      if (name === 'attempt_read') return { data: revealedRead, error: null };
      return { data: true, error: null };
    });
    let outcome: unknown;
    await act(async () => { outcome = await result.current.finishAttempt(61000); });
    expect(outcome).toMatchObject({ status: 'submitted', correctCount: 1, quarter: '2026-Q3' });
    expect(result.current.session.attemptResult).toMatchObject({ status: 'submitted', correctCount: 1 });
    expect(result.current.progress.history.q1).toMatchObject({ answered: 1, correct: 1 });
    await act(async () => { await result.current.finishAttempt(61000); });
    expect(result.current.progress.history.q1).toMatchObject({ answered: 1, correct: 1 });
    expect(rpcCalls('attempt_submit')).toHaveLength(1);
  });

  it('repeat created but read failed: retrying reopens the same open attempt instead of leaving the root stuck', async () => {
    let reads = 0;
    db.rpc.mockImplementation(async (name: string) => {
      if (name === 'attempt_repeat') return { data: { attempt_id: 'att-2', root_id: 'root-1', question_order: ['q2', 'q1'] }, error: null };
      if (name === 'attempt_read') return ++reads === 1 ? { data: null, error: { message: 'FetchError' } } : { data: readPayload('in_progress', { attempt_id: 'att-2' }), error: null };
      return { data: true, error: null };
    });
    const { result } = await load();
    await act(async () => { await expect(result.current.startRepeat('root-1', 'end')).rejects.toThrow('ATTEMPT_UNAVAILABLE'); });
    expect(result.current.currentView).not.toBe('session');
    await act(async () => { await result.current.startRepeat('root-1', 'end'); });
    expect(result.current.session.attemptId).toBe('att-2');
    expect(result.current.currentView).toBe('session');
  });

  it('opens an orphaned in-progress attempt directly (no draft needed)', async () => {
    db.rpc.mockImplementation(async (name: string) => name === 'attempt_read' ? { data: readPayload('in_progress', { attempt_id: 'att-9' }), error: null } : { data: true, error: null });
    const { result } = await load();
    await act(async () => { expect(await result.current.openAttempt('att-9')).toBe(true); });
    expect(result.current.session).toMatchObject({ attemptId: 'att-9', answers: ['C', null] });
    expect(result.current.currentView).toBe('session');
  });

});

describe('durable attempts (flag off)', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', ''); db.saved = null; db.rpc.mockResolvedValue({ data: true, error: null }); });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
  it('uses the legacy synchronous path and no attempt RPCs', async () => {
    const { result } = await load();
    act(() => { result.current.startSession(bank, 3, 'practice'); });
    expect(result.current.session.attemptId).toBeUndefined();
    expect(result.current.session.quiz).toHaveLength(3);
    expect(rpcCalls('attempt_start')).toHaveLength(0);
  });
});
