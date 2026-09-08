import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ArchiveView from '@/components/views/ArchiveView';
import { useApp } from '@/contexts/AppContext';
import { listArchive, readAttempt, type ArchiveEntry, type AttemptRead } from '@/lib/attemptsRepository';
import { launchQuestion } from './fixtures/launchQuestion';

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/lib/exportPdf', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/exportPdf')>()), buildSessionReportHtml: vi.fn(() => '<html></html>') }));
vi.mock('@/lib/attemptsRepository', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/attemptsRepository')>()), listArchive: vi.fn(), readAttempt: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const startRepeat = vi.fn();
const openAttempt = vi.fn();
const entry = (over: Partial<ArchiveEntry> = {}): ArchiveEntry => ({
  attemptId: 'att-1', rootId: 'root-1', status: 'submitted', mode: 'exam', feedbackTiming: 'end', totalCount: 3, correctCount: 2, scoredCount: 2, answeredCount: 3,
  quarter: '2026-Q3', submittedAt: '2026-08-20T10:00:00Z', latestSubmittedAt: '2026-08-20T10:00:00Z', totalActiveMs: 60000, ...over,
});
const q = launchQuestion();
const read: AttemptRead = {
  attemptId: 'att-1', rootId: 'root-1', status: 'submitted', mode: 'exam', feedbackTiming: 'end', totalCount: 1, correctCount: 1, scoredCount: 1, answeredCount: 1,
  quarter: '2026-Q3', submittedAt: '2026-08-20T10:00:00Z', totalActiveMs: 60000, startedAt: '2026-08-20T09:00:00Z', questionOrder: ['demo-question'],
  questions: [{ questionId: 'demo-question', position: 1, snapshot: { id: q.id, question: 'frozen wording', a: q.A, b: q.B, c: q.C, d: q.D, correct: 'A', explanation: q.explanation, topic: q.topic, chapter: 0 }, selected: 'B', confidence: 'confident', answerMs: 4000, confirmedAt: 'x', isCorrect: false, scored: true }],
};

describe('archive of submitted attempts', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers({ now: new Date('2026-09-07T12:00:00Z'), toFake: ['Date'] });
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.mocked(useApp).mockReturnValue({ startRepeat, openAttempt, navigate: vi.fn(), data: [q], progress: { history: {} }, historyLoaded: true, resetFilters: vi.fn(), setSourceFilter: vi.fn(), toggleMultiSelect: vi.fn(), toggleUnseenOnly: vi.fn(), startSession: vi.fn() } as unknown as ReturnType<typeof useApp>);
    vi.mocked(listArchive).mockResolvedValue([entry(), entry({ attemptId: 'att-2', rootId: 'root-2', mode: 'practice', feedbackTiming: 'immediate', quarter: '2026-Q2', submittedAt: '2026-05-01T10:00:00Z', latestSubmittedAt: '2026-09-05T10:00:00Z', correctCount: 4, scoredCount: 5, totalCount: 6 })]);
    vi.mocked(readAttempt).mockResolvedValue(read);
    startRepeat.mockResolvedValue(undefined);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('groups submitted attempts by quarter with server scores and Israel dates', async () => {
    render(<ArchiveView />);
    const q3 = await screen.findByRole('region', { name: 'רבעון 2026-Q3' });
    expect(within(q3).getByText('בוחן • משוב בסוף')).toBeInTheDocument();
    expect(within(q3).getByText(/הוגש 20\.8\.2026 • 2\/3 נכונות/)).toBeInTheDocument();
    const q2 = screen.getByRole('region', { name: 'רבעון 2026-Q2' });
    expect(within(q2).getByText('תרגול • משוב מיידי')).toBeInTheDocument();
    expect(within(q2).getByText(/4\/5 נכונות/)).toBeInTheDocument();
  });

  it('offers a repeat only after 7 days from the latest submission, with the chosen feedback timing', async () => {
    render(<ArchiveView />);
    const q3 = await screen.findByRole('region', { name: 'רבעון 2026-Q3' });
    const q2 = screen.getByRole('region', { name: 'רבעון 2026-Q2' });
    expect(within(q2).getByRole('button', { name: /חזרה על המפגש/ })).toBeDisabled();
    expect(within(q2).getByText(/חזרה זמינה מ־12\.9\.2026/)).toBeInTheDocument();
    fireEvent.change(within(q3).getByRole('combobox'), { target: { value: 'immediate' } });
    fireEvent.click(within(q3).getByRole('button', { name: /חזרה על המפגש/ }));
    await waitFor(() => expect(startRepeat).toHaveBeenCalledWith('root-1', 'immediate'));
  });

  it('shows the server refusal when a repeat is rejected', async () => {
    startRepeat.mockRejectedValueOnce(new Error('COOLDOWN_ACTIVE'));
    render(<ArchiveView />);
    const q3 = await screen.findByRole('region', { name: 'רבעון 2026-Q3' });
    fireEvent.click(within(q3).getByRole('button', { name: /חזרה על המפגש/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('7 ימים')));
  });

  it('shows a NOT_ENTITLED refusal inline on the entry, for review and for repeat', async () => {
    vi.mocked(readAttempt).mockRejectedValueOnce(new Error('NOT_ENTITLED'));
    render(<ArchiveView />);
    const q3 = await screen.findByRole('region', { name: 'רבעון 2026-Q3' });
    fireEvent.click(within(q3).getByRole('button', { name: /עיון/ }));
    const notice = await within(q3).findByRole('note');
    expect(notice).toHaveTextContent('שאלות ארצי שאינן פתוחות לחשבון שלך');
    expect(toast.error).not.toHaveBeenCalled();
    expect(within(q3).getByRole('button', { name: /עיון/ })).toBeEnabled();
    startRepeat.mockRejectedValueOnce(new Error('NOT_ENTITLED'));
    fireEvent.click(within(q3).getByRole('button', { name: /חזרה על המפגש/ }));
    await waitFor(() => expect(startRepeat).toHaveBeenCalled());
    expect(within(q3).getAllByRole('note')).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reviews a submitted attempt read-only with frozen content and server totals, then returns to the list', async () => {
    render(<ArchiveView />);
    const q3 = await screen.findByRole('region', { name: 'רבעון 2026-Q3' });
    fireEvent.click(within(q3).getByRole('button', { name: /עיון/ }));
    expect(await screen.findByText('frozen wording')).toBeInTheDocument();
    expect(screen.getByText(/רבעון 2026-Q3 • הוגש 20\.8\.2026/)).toBeInTheDocument();
    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /תרגול חוזר/ })).not.toBeInTheDocument();
    expect(localStorage.getItem('last_session_results')).toBeNull();
    expect(readAttempt).toHaveBeenCalledWith('att-1');
    expect(startRepeat).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /חזרה לארכיון/ }));
    expect(await screen.findByRole('region', { name: 'רבעון 2026-Q3' })).toBeInTheDocument();
  });

  it('lists an open attempt without a draft and resumes it on request', async () => {
    vi.mocked(listArchive).mockResolvedValueOnce([entry({ attemptId: 'att-open', rootId: 'root-9', status: 'in_progress', quarter: null, submittedAt: null, correctCount: null, scoredCount: null, answeredCount: null })]);
    openAttempt.mockResolvedValue(true);
    render(<ArchiveView />);
    const open = await screen.findByRole('region', { name: 'מפגשים פתוחים' });
    expect(within(open).queryByRole('button', { name: /חזרה על המפגש|עיון/ })).not.toBeInTheDocument();
    fireEvent.click(within(open).getByRole('button', { name: /המשך מפגש/ }));
    await waitFor(() => expect(openAttempt).toHaveBeenCalledWith('att-open'));
  });

  it('shows an empty state and a retryable load error', async () => {
    vi.mocked(listArchive).mockResolvedValueOnce([]);
    render(<ArchiveView />);
    expect(await screen.findByText('עדיין אין מפגשים שהוגשו.')).toBeInTheDocument();
    cleanup();
    vi.mocked(listArchive).mockRejectedValueOnce(new Error('NOT_APPROVED'));
    render(<ArchiveView />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('החשבון עדיין לא אושר');
    fireEvent.click(within(alert).getByRole('button', { name: 'נסו שוב' }));
    expect(await screen.findByRole('region', { name: 'רבעון 2026-Q3' })).toBeInTheDocument();
  });
});
