import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from '@/contexts/AppContext';
import { launchQuestion } from './fixtures/launchQuestion';

const db = vi.hoisted(() => ({
  saved: null as unknown,
  upsert: vi.fn(),
  remove: vi.fn(),
  historyRows: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'synthetic-user' } } } }),
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      queueMicrotask(() => callback('INITIAL_SESSION', { user: { id: 'synthetic-user' } }));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  },
  rpc: async () => ({ data: true, error: null }),
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query,
      range: () => table === 'user_answers' ? db.historyRows() : Promise.resolve({ data: [], error: null }),
      maybeSingle: async () => ({ data: table === 'saved_sessions' ? { session_data: db.saved } : null, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
      upsert: db.upsert,
      delete: () => ({ eq: db.remove }),
    };
    return query;
  },
} }));
vi.mock('@/lib/csvService', () => ({ fetchQuestions: async () => [launchQuestion()], invalidateQuestionsCache: vi.fn(), setQuestionsCacheScope: () => false }));
vi.mock('@/lib/academyRepository', () => ({ claimAcademyMembership: async () => null, fetchMyAttempts: async () => [] }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const draft = (mode: 'practice' | 'exam' = 'practice') => ({
  questionIds: ['demo-question'], index: 0, mode, answers: ['B'], confidence: ['hesitant'], flagged: [], skipped: [],
  timerSeconds: 17, createdAt: '2026-09-07T00:00:00Z',
});

async function load() {
  const hook = renderHook(() => useApp(), { wrapper: AppProvider });
  await waitFor(() => expect(hook.result.current.loadingSavedSession).toBe(false));
  await waitFor(() => expect(hook.result.current.userId).toBe('synthetic-user'));
  return hook;
}

describe('launch draft persistence', () => {
  // Milestone-1 legacy draft path: pinned flag-off so a forced flag-on run does not reinterpret it.
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', ''); db.saved = draft(); db.upsert.mockResolvedValue({ error: null }); db.remove.mockResolvedValue({ error: null }); db.historyRows.mockResolvedValue({ data: [], error: null }); });
  afterEach(cleanup);

  it.each([['practice', 'immediate'], ['exam', 'end']] as const)('resumes legacy %s without deleting its only draft', async (mode, timing) => {
    db.saved = draft(mode);
    const { result } = await load();
    await act(async () => { expect(await result.current.resumeSessionFromDb()).toBe(true); });
    expect(result.current.session).toMatchObject({ mode, feedbackTiming: timing, answers: ['B'], resumedTimerSeconds: 17 });
    expect(db.remove).not.toHaveBeenCalled();
    expect(result.current.savedSessionInfo).not.toBeNull();
  });

  it.each(['immediate', 'end'] as const)('round-trips %s feedback with explicit confidence, answers and elapsed time', async timing => {
    const { result } = await load();
    act(() => result.current.startSession([launchQuestion()], 1, 'exam', { feedbackTiming: timing }));
    act(() => result.current.setAnswer(0, 'A'));
    act(() => result.current.setConfidence(0, 'guessed'));
    await act(async () => result.current.saveSessionToDb(43));
    expect(db.upsert.mock.calls[0][0].session_data).toMatchObject({ mode: 'exam', feedbackTiming: timing, answers: ['A'], confidence: ['guessed'], timerSeconds: 43 });
    await act(async () => result.current.resumeSessionFromDb());
    expect(result.current.session).toMatchObject({ feedbackTiming: timing, answers: ['A'], confidence: ['guessed'], resumedTimerSeconds: 43 });
  });

  it('rejects a failed save and keeps the previous successfully saved draft', async () => {
    const { result } = await load();
    act(() => result.current.startSession([launchQuestion()], 1, 'exam'));
    const previous = result.current.savedSessionInfo;
    db.upsert.mockResolvedValueOnce({ error: new Error('offline') });
    await act(async () => { await expect(result.current.saveSessionToDb()).rejects.toThrow('offline'); });
    expect(result.current.savedSessionInfo).toBe(previous);
    await act(async () => result.current.saveSessionToDb());
    expect(result.current.savedSessionInfo?.mode).toBe('exam');
  });

  it('waits for an in-flight save before deleting, preventing a draft from reappearing', async () => {
    const { result } = await load();
    act(() => result.current.startSession([launchQuestion()], 1, 'exam'));
    let release!: (value: { error: null }) => void;
    db.upsert.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    let pendingSave!: Promise<void>;
    let pendingClear!: Promise<void>;
    act(() => { pendingSave = result.current.saveSessionToDb(); pendingClear = result.current.clearSavedSession(); });
    await waitFor(() => expect(db.upsert).toHaveBeenCalledOnce());
    expect(db.remove).not.toHaveBeenCalled();
    await act(async () => { release({ error: null }); await pendingSave; await pendingClear; });
    expect(db.remove).toHaveBeenCalledOnce();
    expect(result.current.savedSessionInfo).toBeNull();
  });

  it('retains a draft if explicit deletion fails', async () => {
    const { result } = await load();
    db.remove.mockResolvedValueOnce({ error: new Error('offline') });
    await act(async () => { await expect(result.current.clearSavedSession()).rejects.toThrow('offline'); });
    expect(result.current.savedSessionInfo).not.toBeNull();
  });

  it('preserves the pre-session learning snapshot across answers, saves, and resume', async () => {
    const { result } = await load();
    act(() => result.current.updateHistory('demo-question', false, 'Demo'));
    act(() => result.current.startSession([launchQuestion()], 1, 'practice'));
    expect(result.current.session.learningBaseline?.lastResults).toEqual({ 'demo-question': 'wrong' });
    act(() => result.current.updateHistory('demo-question', true, 'Demo'));
    await act(async () => result.current.saveSessionToDb());
    await act(async () => result.current.resumeSessionFromDb());
    expect(result.current.progress.history['demo-question'].lastResult).toBe('correct');
    expect(result.current.session.learningBaseline?.lastResults).toEqual({ 'demo-question': 'wrong' });
  });

  it('never invents a zero baseline while prior history is still loading', async () => {
    let resolveHistory!: (value: unknown) => void;
    db.historyRows.mockReturnValue(new Promise(resolve => { resolveHistory = resolve; }));
    const { result } = await load();
    act(() => result.current.startSession([launchQuestion()], 1, 'practice'));
    expect(result.current.historyLoaded).toBe(false);
    expect(result.current.session.learningBaseline).toBeUndefined();
    await act(async () => { resolveHistory({ data: [{ question_id: 'demo-question', answered_count: 1, correct_count: 0, is_correct: false, ever_wrong: true, updated_at: '2026-09-07' }], error: null }); });
    expect(result.current.historyLoaded).toBe(true);
    expect(result.current.session.learningBaseline).toBeUndefined();
    act(() => result.current.startSession([launchQuestion()], 1, 'practice'));
    expect(result.current.session.learningBaseline?.lastResults['demo-question']).toBe('wrong');
  });

  it('keeps history unavailable after a failed load', async () => {
    db.historyRows.mockResolvedValue({ data: null, error: new Error('offline') });
    const { result } = await load();
    act(() => result.current.startSession([launchQuestion()], 1, 'exam'));
    expect(result.current.historyLoaded).toBe(false);
    expect(result.current.session.learningBaseline).toBeUndefined();
  });
  it('clears confidence only when the answer changes', async () => {
    const { result } = await load();
    act(() => result.current.startSession([launchQuestion()], 1, 'exam', { feedbackTiming: 'end' }));
    act(() => result.current.setAnswer(0, 'A'));
    act(() => result.current.setConfidence(0, 'confident'));
    act(() => result.current.setAnswer(0, 'A'));
    expect(result.current.session.confidence).toEqual(['confident']);
    act(() => result.current.setAnswer(0, 'B'));
    expect(result.current.session.confidence).toEqual([null]);
  });

});
