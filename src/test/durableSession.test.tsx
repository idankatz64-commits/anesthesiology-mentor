import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import SessionView from '@/components/views/SessionView';
import type { ConfidenceLevel, FeedbackTiming, SessionMode, SessionState } from '@/lib/types';
import { launchQuestion } from './fixtures/launchQuestion';

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => Promise.resolve({ data: [] }) }) } }));
vi.mock('@/components/FormulaCalculatorPanel', () => ({ default: () => null }));
vi.mock('@/components/RichTextEditor', () => ({ default: () => null }));
vi.mock('@/components/ShareQuestionButton', () => ({ default: () => null }));
vi.mock('@/components/ImageGallery', () => ({ default: () => null }));
vi.mock('@/components/views/SessionCommunity', () => ({ GlobalQuestionStats: () => null, CommunityNotes: () => null }));
vi.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => false }));
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const navigate = vi.fn();
const save = vi.fn();
const clear = vi.fn();
const history = vi.fn();
const srs = vi.fn();
const confirm = vi.fn();
const finish = vi.fn();
const abandon = vi.fn();

// Mirrors what AppContext.confirmAnswer does on success: confidence lands only after the server accepted.
function Harness({ mode, timing }: { mode: SessionMode; timing: FeedbackTiming }) {
  const [session, setSession] = useState<SessionState>({
    quiz: [launchQuestion()], index: 0, score: 0, mode, feedbackTiming: timing,
    answers: [null], confidence: [null], flagged: new Set(), skipped: new Set(),
    sourceFilter: 'all', countFilter: 1, unseenOnly: false, attemptId: 'att-1', rootId: 'root-1', questionMs: [0],
  });
  vi.mocked(useApp).mockReturnValue({
    session, progress: { favorites: [], notes: {}, ratings: {}, tags: {} }, navigate,
    setAnswer: (index, answer) => setSession(previous => ({ ...previous, answers: previous.answers.map((value, i) => i === index ? answer : value), confidence: previous.confidence.map((value, i) => i === index && previous.answers[index] !== answer ? null : value) })),
    setConfidence: vi.fn(),
    confirmAnswer: async (index: number, level: ConfidenceLevel, ms: number) => {
      await confirm(index, level, ms);
      setSession(previous => ({ ...previous, confidence: previous.confidence.map((value, i) => i === index ? level : value) }));
    },
    finishAttempt: finish, abandonCurrentAttempt: abandon,
    setSessionIndex: index => setSession(previous => ({ ...previous, index })),
    saveSessionToDb: save, clearSavedSession: clear, updateHistory: history, updateSpacedRepetition: srs,
    skipQuestion: vi.fn(),
  } as unknown as ReturnType<typeof useApp>);
  return <SessionView />;
}

describe('durable session view (attempt on the server)', () => {
  beforeEach(() => {
    vi.clearAllMocks(); HTMLElement.prototype.scrollTo = vi.fn();
    save.mockResolvedValue(undefined); clear.mockResolvedValue(undefined); confirm.mockResolvedValue(undefined);
    finish.mockResolvedValue({ status: 'submitted' }); abandon.mockResolvedValue(undefined);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each([['practice', 'immediate'], ['exam', 'immediate'], ['exam', 'end']] as const)('%s/%s: rating confirms on the server with the active time and never writes legacy history', async (mode, timing) => {
    vi.useFakeTimers();
    render(<Harness mode={mode} timing={timing} />);
    await act(async () => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    fireEvent.click(screen.getByRole('button', { name: 'מתלבט' }));
    expect(confirm).toHaveBeenCalledWith(0, 'hesitant', 2000);
    await act(async () => { await Promise.resolve(); });
    if (timing === 'immediate') expect(screen.getByText('זהו הסבר הדגמה בלבד')).toBeInTheDocument();
    else expect(screen.queryByText('זהו הסבר הדגמה בלבד')).not.toBeInTheDocument();
    expect(history).not.toHaveBeenCalled();
    expect(srs).not.toHaveBeenCalled();
  });

  it('keeps the answer unconfirmed and lets the user retry when the server refuses', async () => {
    confirm.mockRejectedValueOnce(new Error('ATTEMPT_UNAVAILABLE'));
    render(<Harness mode="practice" timing="immediate" />);
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    fireEvent.click(screen.getByRole('button', { name: 'מתלבט' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'התשובה לא אושרה בשרת' })));
    expect(screen.queryByText('זהו הסבר הדגמה בלבד')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    await waitFor(() => expect(screen.getByText('זהו הסבר הדגמה בלבד')).toBeInTheDocument());
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it.each(['practice', 'exam'] as const)('%s: finishing submits total active time, then clears the draft and shows results', async mode => {
    vi.useFakeTimers();
    render(<Harness mode={mode} timing="end" />);
    await act(async () => vi.advanceTimersByTime(3000));
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(finish).toHaveBeenCalledWith(3000);
    expect(clear).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('results');
    expect(history).not.toHaveBeenCalled();
    expect(srs).not.toHaveBeenCalled();
  });

  it('does not clear the draft or navigate when submission fails, and retries cleanly', async () => {
    finish.mockRejectedValueOnce(new Error('ATTEMPT_UNAVAILABLE'));
    render(<Harness mode="exam" timing="end" />);
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'ההגשה לא אושרה בשרת' })));
    expect(clear).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    // The submission may have reached the server: answers stay locked until the outcome is known.
    expect(screen.getByRole('button', { name: /אפשרות גימל/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('results'));
    expect(finish).toHaveBeenCalledTimes(2);
  });

  it('submission accepted but results unavailable: says so, keeps answers locked, and the retry proceeds', async () => {
    finish.mockRejectedValueOnce(new Error('RESULTS_READ_FAILED'));
    render(<Harness mode="exam" timing="end" />);
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'ההגשה נשמרה בשרת' })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/לא נשמרה|לא אושרה/) }));
    expect(screen.getByRole('button', { name: /אפשרות גימל/ })).toBeDisabled();
    expect(clear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('results'));
  });

  it('draft cleanup failed after an accepted submission: the retry finishes without a new submission', async () => {
    clear.mockRejectedValueOnce(new Error('offline'));
    render(<Harness mode="exam" timing="end" />);
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'לא הצלחנו לסגור את המפגש השמור' })));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /אפשרות גימל/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('results'));
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it('leaves an attempt the server already closed without touching it', async () => {
    abandon.mockRejectedValueOnce(new Error('ATTEMPT_NOT_OPEN'));
    render(<Harness mode="practice" timing="immediate" />);
    fireEvent.click(screen.getByRole('button', { name: 'יציאה מהמפגש' }));
    fireEvent.click(screen.getByRole('button', { name: /יציאה בלי לשמור|צא בלי לשמור|ללא שמירה/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('home'));
    expect(clear).toHaveBeenCalledOnce();
    expect(toast).not.toHaveBeenCalled();
  });

  it('saves per-question time with the draft', async () => {
    vi.useFakeTimers();
    render(<Harness mode="practice" timing="immediate" />);
    await act(async () => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByRole('button', { name: 'יציאה מהמפגש' }));
    fireEvent.click(screen.getByRole('button', { name: /שמור וצא/ }));
    await act(async () => { await Promise.resolve(); });
    // No simulation countdown any more: the draft carries active seconds and per-question ms only.
    expect(save).toHaveBeenCalledWith(2, undefined, [2000]);
  });

  it('abandons the attempt on the server before discarding the draft', async () => {
    render(<Harness mode="practice" timing="immediate" />);
    fireEvent.click(screen.getByRole('button', { name: 'יציאה מהמפגש' }));
    fireEvent.click(screen.getByRole('button', { name: /יציאה בלי לשמור|צא בלי לשמור|ללא שמירה/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('home'));
    expect(abandon).toHaveBeenCalledOnce();
    expect(abandon.mock.invocationCallOrder[0]).toBeLessThan(clear.mock.invocationCallOrder[0]);
  });

  it('keeps the session open when abandoning fails on the server', async () => {
    abandon.mockRejectedValueOnce(new Error('ATTEMPT_UNAVAILABLE'));
    render(<Harness mode="practice" timing="immediate" />);
    fireEvent.click(screen.getByRole('button', { name: 'יציאה מהמפגש' }));
    fireEvent.click(screen.getByRole('button', { name: /יציאה בלי לשמור|צא בלי לשמור|ללא שמירה/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'לא הצלחנו לסגור את המפגש בשרת' })));
    expect(clear).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
