import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import SessionView from '@/components/views/SessionView';
import type { ConfidenceLevel, SessionState } from '@/lib/types';
import { launchQuestion } from './fixtures/launchQuestion';

const { submitQuizAttempt, toast, rpc } = vi.hoisted(() => ({ submitQuizAttempt: vi.fn(), toast: vi.fn(), rpc: vi.fn() }));
vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => Promise.resolve({ data: [] }) }), rpc } }));
vi.mock('@/components/FormulaCalculatorPanel', () => ({ default: () => null }));
vi.mock('@/components/RichTextEditor', () => ({ default: () => null }));
vi.mock('@/components/ShareQuestionButton', () => ({ default: () => null }));
vi.mock('@/components/ImageGallery', () => ({ default: () => null }));
vi.mock('@/components/feedback', () => ({ ReportQuestionDialog: () => null, AppBugDialog: () => null }));
vi.mock('@/components/views/SessionCommunity', () => ({ GlobalQuestionStats: () => null, CommunityNotes: () => null }));
vi.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => false }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/lib/academyRepository', async (orig) => ({ ...(await orig<object>()), submitQuizAttempt }));

const navigate = vi.fn(); const finish = vi.fn(); const registerAttemptedQuestions = vi.fn();

function Harness() {
  const [session, setSession] = useState<SessionState>({
    quiz: [launchQuestion()], index: 0, score: 0, mode: 'simulation', feedbackTiming: 'end', quizId: 'quiz-1',
    answers: [null], confidence: [null], flagged: new Set(), skipped: new Set(),
    sourceFilter: 'all', countFilter: 1, unseenOnly: false, attemptId: 'att-quiz', rootId: 'root-quiz', questionMs: [0],
  } as SessionState);
  vi.mocked(useApp).mockReturnValue({
    session, progress: { favorites: [], notes: {}, ratings: {}, tags: {} }, navigate, userId: 'user-a', registerAttemptedQuestions,
    setAnswer: (index: number, answer: string | null) => setSession(p => ({ ...p, answers: p.answers.map((v, i) => i === index ? answer : v) })),
    setConfidence: vi.fn(),
    confirmAnswer: async (index: number, level: ConfidenceLevel) => setSession(p => ({ ...p, confidence: p.confidence.map((v, i) => i === index ? level : v) })),
    finishAttempt: finish, recordSessionTime: vi.fn(), abandonCurrentAttempt: vi.fn(),
    setSessionIndex: (index: number) => setSession(p => ({ ...p, index })),
    saveSessionToDb: vi.fn().mockResolvedValue(undefined), clearSavedSession: vi.fn().mockResolvedValue(undefined), updateHistory: vi.fn(), updateSpacedRepetition: vi.fn(), skipQuestion: vi.fn(),
  } as unknown as ReturnType<typeof useApp>);
  return <SessionView />;
}

async function answerAndSubmit() {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
  fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
  await act(async () => { await Promise.resolve(); });
  fireEvent.click(screen.getByRole('button', { name: /הגש מבחן/ }));
  await act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });
}

describe('academy quiz submit — the timing fallback is an explicit outcome, never silent', () => {
  beforeEach(() => { vi.clearAllMocks(); HTMLElement.prototype.scrollTo = vi.fn(); finish.mockResolvedValue({ status: 'submitted' }); });
  afterEach(cleanup);

  it('repository: PGRST202 falls back to the 3-arg submit once and reports timingPersisted=false', async () => {
    const { submitQuizAttempt: real } = await vi.importActual<typeof import('@/lib/academyRepository')>('@/lib/academyRepository');
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
      .mockResolvedValueOnce({ data: [{ score: 1, total: 1 }], error: null });
    const outcome = await real('quiz-1', ['q1'], ['A'], { totalActiveMs: 1000, answerMs: [1000], confidence: ['confident'] });
    expect(outcome).toEqual({ score: 1, total: 1, timingPersisted: false });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toEqual({ _quiz_id: 'quiz-1', _question_ids: ['q1'], _answers: ['A'] });
    rpc.mockResolvedValueOnce({ data: [{ score: 1, total: 1 }], error: null });
    expect(await real('quiz-1', ['q1'], ['A'], { totalActiveMs: 1000, answerMs: [1000], confidence: ['confident'] })).toEqual({ score: 1, total: 1, timingPersisted: true });
  });

  it('session UI: a fallback submit still completes but tells the resident that time and confidence were not saved', async () => {
    submitQuizAttempt.mockResolvedValue({ score: 1, total: 1, timingPersisted: false });
    await answerAndSubmit();
    expect(submitQuizAttempt).toHaveBeenCalledTimes(1);
    expect(submitQuizAttempt.mock.calls[0][3]).toMatchObject({ confidence: ['confident'] });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'הבוחן נקלט, אבל זמן וביטחון לא נשמרו' }));
    expect(registerAttemptedQuestions).toHaveBeenCalledWith([expect.any(String)]);
    expect(navigate).toHaveBeenCalledWith('results');
  });

  it('session UI: a full submit shows no timing warning', async () => {
    submitQuizAttempt.mockResolvedValue({ score: 1, total: 1, timingPersisted: true });
    await answerAndSubmit();
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'הבוחן נקלט, אבל זמן וביטחון לא נשמרו' }));
    expect(navigate).toHaveBeenCalledWith('results');
  });
});
