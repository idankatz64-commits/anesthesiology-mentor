import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import SessionView from '@/components/views/SessionView';
import type { ConfidenceLevel, SessionState } from '@/lib/types';
import { launchQuestion } from './fixtures/launchQuestion';

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => Promise.resolve({ data: [] }) }) } }));
vi.mock('@/components/FormulaCalculatorPanel', () => ({ default: () => null }));
vi.mock('@/components/RichTextEditor', () => ({ default: () => null }));
vi.mock('@/components/ShareQuestionButton', () => ({ default: () => null }));
vi.mock('@/components/ImageGallery', () => ({ default: () => null }));
vi.mock('@/components/feedback', () => ({ ReportQuestionDialog: () => null, AppBugDialog: () => null }));
vi.mock('@/components/views/SessionCommunity', () => ({ GlobalQuestionStats: () => null, CommunityNotes: () => null }));
vi.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => false }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const navigate = vi.fn(); const confirm = vi.fn(); const finish = vi.fn(); const recordSessionTime = vi.fn();
const save = vi.fn(); const clear = vi.fn(); const history = vi.fn(); const srs = vi.fn();

function Harness() {
  const [session, setSession] = useState<SessionState>({
    quiz: [launchQuestion()], index: 0, score: 0, mode: 'simulation', feedbackTiming: 'end',
    answers: [null], confidence: [null], flagged: new Set(), skipped: new Set(),
    sourceFilter: 'all', countFilter: 1, unseenOnly: false, attemptId: 'att-sim', rootId: 'root-sim', questionMs: [0],
  });
  vi.mocked(useApp).mockReturnValue({
    session, progress: { favorites: [], notes: {}, ratings: {}, tags: {} }, navigate, userId: 'user-a',
    setAnswer: (index: number, answer: string | null) => setSession(p => ({ ...p, answers: p.answers.map((v, i) => i === index ? answer : v) })),
    setConfidence: vi.fn(),
    confirmAnswer: async (index: number, level: ConfidenceLevel, ms: number) => {
      await confirm(index, level, ms);
      setSession(p => ({ ...p, confidence: p.confidence.map((v, i) => i === index ? level : v) }));
    },
    finishAttempt: finish, recordSessionTime, abandonCurrentAttempt: vi.fn(),
    setSessionIndex: (index: number) => setSession(p => ({ ...p, index })),
    saveSessionToDb: save, clearSavedSession: clear, updateHistory: history, updateSpacedRepetition: srs, skipQuestion: vi.fn(),
  } as unknown as ReturnType<typeof useApp>);
  return <SessionView />;
}

describe('simulation: time is recorded, never limited', () => {
  beforeEach(() => {
    vi.clearAllMocks(); HTMLElement.prototype.scrollTo = vi.fn(); vi.useFakeTimers();
    save.mockResolvedValue(undefined); clear.mockResolvedValue(undefined); confirm.mockResolvedValue(undefined); finish.mockResolvedValue({ status: 'submitted' });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('shows no countdown, asks for explicit confidence, and the active time survives submit', async () => {
    render(<Harness />);
    expect(screen.getByLabelText('זמן למידה פעיל ללא הגבלה')).toBeInTheDocument();
    expect(screen.queryByText(/03:00:00|נותר|ספירה לאחור/)).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(65_000));
    expect(screen.getByLabelText('זמן למידה פעיל ללא הגבלה')).toHaveTextContent('01:05');
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    expect(confirm).toHaveBeenCalledWith(0, 'confident', 65_000);
    await act(async () => { await Promise.resolve(); });
    // simulation never reveals the explanation mid-session
    expect(screen.queryByText('זהו הסבר הדגמה בלבד')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /הגש מבחן/ }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(finish).toHaveBeenCalledWith(65_000);
    expect(recordSessionTime).toHaveBeenCalledWith(65_000);
    expect(navigate).toHaveBeenCalledWith('results');
    expect(history).not.toHaveBeenCalled();
    expect(srs).not.toHaveBeenCalled();
  });

  it('a much longer simulation is never auto-submitted', async () => {
    render(<Harness />);
    await act(async () => vi.advanceTimersByTime(4 * 60 * 60 * 1000));
    expect(finish).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('זמן למידה פעיל ללא הגבלה')).toHaveTextContent('240:00');
  });
});
