import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import SessionView from '@/components/views/SessionView';
import type { FeedbackTiming, SessionMode, SessionState } from '@/lib/types';
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

function Harness({ mode, timing, count = 1 }: { mode: SessionMode; timing: FeedbackTiming; count?: number }) {
  const [session, setSession] = useState<SessionState>({
    quiz: Array.from({ length: count }, (_, i) => launchQuestion(i ? `question-${i}` : undefined)), index: 0, score: 0, mode, feedbackTiming: timing,
    answers: Array(count).fill(null), confidence: Array(count).fill(null), flagged: new Set(), skipped: new Set(),
    sourceFilter: 'all', countFilter: 1, unseenOnly: false,
  });
  vi.mocked(useApp).mockReturnValue({
    session, progress: { favorites: [], notes: {}, ratings: {}, tags: {} }, navigate,
    setAnswer: (index, answer) => setSession(previous => ({ ...previous, answers: previous.answers.map((value, i) => i === index ? answer : value), confidence: previous.confidence.map((value, i) => i === index && previous.answers[index] !== answer ? null : value) })),
    setConfidence: (index, confidence) => setSession(previous => ({ ...previous, confidence: previous.confidence.map((value, i) => i === index ? confidence : value) })),
    setSessionIndex: index => setSession(previous => ({ ...previous, index })),
    saveSessionToDb: save, clearSavedSession: clear, updateHistory: history, updateSpacedRepetition: srs,
    skipQuestion: vi.fn(),
  } as unknown as ReturnType<typeof useApp>);
  return <SessionView />;
}

describe('launch session behavior', () => {
  beforeEach(() => { vi.clearAllMocks(); HTMLElement.prototype.scrollTo = vi.fn(); save.mockResolvedValue(undefined); clear.mockResolvedValue(undefined); srs.mockResolvedValue(undefined); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each(['practice', 'exam'] as const)('reveals immediate %s feedback only after confirmation, then locks the answer', async mode => {
    render(<Harness mode={mode} timing="immediate" />);
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    expect(screen.queryByText('זהו הסבר הדגמה בלבד')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'מתלבט' }));
    expect(screen.getByText('זהו הסבר הדגמה בלבד')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /אפשרות אלף/ })).toBeDisabled();
    if (mode === 'exam') expect(history).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('results'));
    expect(history).toHaveBeenCalledTimes(1);
    expect(srs).toHaveBeenCalledTimes(1);
    expect(srs).toHaveBeenCalledWith('demo-question', false, 'hesitant', 'Demo');
  });

  it.each(['practice', 'exam'] as const)('does not reveal %s end feedback in colors or explanation before completion', async mode => {
    render(<Harness mode={mode} timing="end" />);
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    expect(screen.queryByText('זהו הסבר הדגמה בלבד')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /אפשרות אלף/ }).className).not.toContain('border-success');
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('results'));
    expect(history).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog and session open after failed save and succeeds on retry', async () => {
    save.mockRejectedValueOnce(new Error('offline'));
    render(<Harness mode="practice" timing="immediate" />);
    fireEvent.click(screen.getByRole('button', { name: 'יציאה מהמפגש' }));
    fireEvent.click(screen.getByRole('button', { name: /שמור וצא/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'השמירה לא הצליחה' })));
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /שמור וצא/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('home'));
  });

  it('does not navigate or clear the draft when exam SRS submission fails', async () => {
    srs.mockRejectedValueOnce(new Error('offline'));
    render(<Harness mode="exam" timing="end" />);
    fireEvent.click(screen.getByRole('button', { name: /אפשרות אלף/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'שמירת SRS חלקית' })));
    expect(clear).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    // Once any part of submission may have been written, retry must use the
    // original answers rather than producing a different displayed score.
    expect(screen.getByRole('button', { name: /אפשרות בית/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('results'));
    expect(history).toHaveBeenCalledTimes(1);
    expect(srs).toHaveBeenLastCalledWith('demo-question', true, 'confident', 'Demo');
  });

  it('counts practice time without a limit and pauses in the exit dialog', async () => {
    vi.useFakeTimers();
    render(<Harness mode="practice" timing="immediate" />);
    await act(async () => vi.advanceTimersByTime(3000));
    expect(screen.getByLabelText('זמן למידה פעיל ללא הגבלה')).toHaveTextContent('00:03');
    fireEvent.click(screen.getByRole('button', { name: 'יציאה מהמפגש' }));
    await act(async () => vi.advanceTimersByTime(3000));
    expect(screen.getByLabelText('זמן למידה פעיל ללא הגבלה')).toHaveTextContent('00:03');
  });

  it('shows submission feedback immediately while preserving the await-before-navigation gate', async () => {
    let complete!: () => void;
    srs.mockReturnValueOnce(new Promise<void>(resolve => { complete = resolve; }));
    render(<Harness mode="exam" timing="end" />);
    fireEvent.click(screen.getByRole('button', { name: /אפשרות אלף/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    expect(screen.getByRole('button', { name: 'מסכם ושומר...' })).toBeDisabled();
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => complete());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('results'));
  });

  it.each(['immediate', 'end'] as const)('keeps every fresh exam question selectable with %s feedback', timing => {
    render(<Harness mode="exam" timing={timing} count={2} />);
    fireEvent.click(screen.getByRole('button', { name: /אפשרות אלף/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    fireEvent.click(screen.getByRole('button', { name: 'הבא' }));
    expect(screen.getByRole('button', { name: /אפשרות בית/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    if (timing === 'immediate') expect(screen.getByRole('button', { name: 'מתלבט' })).toBeInTheDocument();
    else expect(screen.getByRole('button', { name: /אפשרות בית/ }).className).toContain('border-primary');
  });

  it.each(['Enter', ' '])('lets the focused answer button handle %s without navigating past the question', key => {
    render(<Harness mode="exam" timing="end" count={2} />);
    const answer = screen.getByRole('button', { name: /אפשרות בית/ });
    answer.focus();
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    act(() => { answer.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByRole('button', { name: 'הבא' })).toBeInTheDocument();
    // Native button activation follows the key event in a browser.
    fireEvent.click(answer);
    expect(answer.className).toContain('border-primary');
  });
  it.each([['בטוח', 'confident'], ['מתלבט', 'hesitant'], ['ניחוש', 'guessed']] as const)('records the selected exam confidence %s without revealing end feedback', async (label, level) => {
    render(<Harness mode="exam" timing="end" />);
    expect(screen.queryByText('עד כמה אתה בטוח בתשובה?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /אפשרות אלף/ }));
    expect(screen.getByText('עד כמה אתה בטוח בתשובה?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'סיום וסיכום' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.queryByText('זהו הסבר הדגמה בלבד')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /אפשרות אלף/ })).toBeEnabled();
    expect(srs).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('results'));
    expect(srs).toHaveBeenCalledExactlyOnceWith('demo-question', true, level, 'Demo');
  });

  it('asks for fresh confidence when an unrevealed exam answer changes, and submits the new pair', async () => {
    render(<Harness mode="exam" timing="end" />);
    fireEvent.click(screen.getByRole('button', { name: /אפשרות אלף/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    fireEvent.click(screen.getByRole('button', { name: /אפשרות בית/ }));
    expect(screen.getByRole('button', { name: 'סיום וסיכום' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'ניחוש' }));
    fireEvent.click(screen.getByRole('button', { name: 'סיום וסיכום' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('results'));
    expect(srs).toHaveBeenCalledExactlyOnceWith('demo-question', false, 'guessed', 'Demo');
  });

});
