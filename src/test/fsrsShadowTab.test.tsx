import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FsrsShadowTab from '@/components/admin/FsrsShadowTab';

const api = vi.hoisted(() => ({ fetchSummary: vi.fn(), process: vi.fn(), retry: vi.fn() }));
const notices = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => notices.success(...args) } }));
vi.mock('@/lib/fsrsShadowRepository', () => ({
  fetchFsrsShadowSummary: (...args: unknown[]) => api.fetchSummary(...args),
  processFsrsShadow: (...args: unknown[]) => api.process(...args),
  retryFailedFsrsEvents: (...args: unknown[]) => api.retry(...args),
  fsrsShadowErrorMessage: (error: unknown) => error instanceof Error && error.message === 'NOT_OWNER' ? 'השוואת FSRS שמורה לעידן בלבד.' : 'שגיאה',
}));
afterEach(() => { cleanup(); api.fetchSummary.mockReset(); api.process.mockReset(); api.retry.mockReset(); notices.success.mockReset(); });

const summary = {
  activeScheduler: 'sm2' as const, shadowAlgorithm: 'ts-fsrs@5.4.2', parameterVersion: 'default-r0.90-v1',
  events: { total: 3, eligible: 2, excluded: 1, unscored: 1, missingConfidence: 0, estimatedConfidence: 0, lateOutOfOrder: 0, afterPriorFeedback: 1, national: 0, firstConfirmedAt: null, lastConfirmedAt: null },
  processing: { pending: 0, processing: 0, processed: 3, failed: 0 },
  comparison: { fsrsCards: 2, cardsWithSm2: 2, fsrsEarlier: 1, sameDate: 0, fsrsLater: 1, meanDeltaDays: 1.5 },
  limitations: ['Shadow only'],
};

describe('FSRS shadow admin tab', () => {
  it('labels SM2 as active and FSRS as experimental', async () => {
    api.fetchSummary.mockResolvedValue(summary);
    render(<FsrsShadowTab userId="owner" />);
    expect(await screen.findByText(/SM2 ממשיך לקבוע בפועל/)).toBeInTheDocument();
    expect(screen.getByText(/תחזית ניסיונית בלבד/)).toBeInTheDocument();
    expect(screen.getAllByText('3')).toHaveLength(2);
  });

  it('clears the old identity before a late response resolves', async () => {
    let resolveFirst!: (value: typeof summary) => void;
    api.fetchSummary.mockImplementationOnce(() => new Promise<typeof summary>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ ...summary, events: { ...summary.events, total: 8 } });
    const view = render(<FsrsShadowTab userId="first" />);
    view.rerender(<FsrsShadowTab userId="second" />);
    expect(await screen.findByText('8')).toBeInTheDocument();
    resolveFirst({ ...summary, events: { ...summary.events, total: 99 } });
    await waitFor(() => expect(screen.queryByText('99')).not.toBeInTheDocument());
  });

  it('invalidates a processing completion before toast or reload after identity change', async () => {
    let resolveProcess!: (value: { claimed: number; applied: number; excluded: number; failed: number }) => void;
    api.fetchSummary.mockResolvedValue(summary);
    api.process.mockImplementationOnce(() => new Promise((resolve) => { resolveProcess = resolve; }));
    const view = render(<FsrsShadowTab userId="first" />);
    fireEvent.click(await screen.findByRole('button', { name: 'עבד עד 25 אירועים' }));
    view.rerender(<FsrsShadowTab userId="second" />);
    await screen.findByText(/SM2 ממשיך לקבוע בפועל/);
    await act(async () => { resolveProcess({ claimed: 1, applied: 1, excluded: 0, failed: 0 }); });
    expect(notices.success).not.toHaveBeenCalled();
    expect(api.fetchSummary).toHaveBeenCalledTimes(2);
  });

  it('does not start processing after a retry resolves following sign-out', async () => {
    let resolveRetry!: (value: number) => void;
    api.fetchSummary.mockResolvedValue({ ...summary, processing: { ...summary.processing, failed: 1 } });
    api.retry.mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }));
    const view = render(<FsrsShadowTab userId="first" />);
    fireEvent.click(await screen.findByRole('button', { name: 'החזר כשלים לתור' }));
    view.rerender(<FsrsShadowTab userId={null} />);
    expect(await screen.findByText('יש להתחבר כדי לצפות בהשוואה.')).toBeInTheDocument();
    await act(async () => { resolveRetry(1); });
    expect(api.process).not.toHaveBeenCalled();
    expect(notices.success).not.toHaveBeenCalled();
  });
});
