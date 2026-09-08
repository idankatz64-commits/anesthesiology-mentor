import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import HomeView from '@/components/views/HomeView';
import WeakZoneMapTile from '@/components/stats/WeakZoneMapTile';
import { launchQuestion } from './fixtures/launchQuestion';

// Async starts and resumes on the durable path must surface failures and
// release the UI, never leave an unhandled promise or a stuck spinner.
vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => {
  const q = { select: () => q, eq: () => q, order: () => q, then: (r: (v: unknown) => void) => Promise.resolve({ data: [] }).then(r) };
  return { supabase: { from: () => q } };
});
vi.mock('@/components/stats/HomeStatsSummary', () => ({ default: () => null }));
vi.mock('@/components/stats/HomeTopicHeatmap', () => ({ default: () => null }));
vi.mock('@/components/MatrixCountdown', () => ({ default: () => null }));
vi.mock('@/components/DailyReportModal', () => ({ default: () => null }));
vi.mock('@/components/stats/AnimatedStatsTile', () => ({ default: ({ collapsed, expanded }: { collapsed: React.ReactNode; expanded: React.ReactNode }) => <div>{collapsed}{expanded}</div> }));
vi.mock('@/components/stats/GaugeDial', () => ({ default: () => null }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const startSession = vi.fn();
const resumeSessionFromDb = vi.fn();
const q = launchQuestion('q1');
const app = () => ({
  data: [q], progress: { history: {}, favorites: [], tags: {}, notes: {}, ratings: {} }, navigate: vi.fn(), startSession, resumeSessionFromDb,
  savedSessionInfo: { mode: 'practice', index: 0, questionIds: ['q1'], createdAt: '2026-09-07T00:00:00Z' }, loadingSavedSession: false,
  clearSavedSession: vi.fn(), fetchSrsData: vi.fn(async () => ({})), setSourceFilter: vi.fn(),
  multiSelect: Object.fromEntries(['topic', 'year', 'kind', 'institution', 'confidence', 'usertags'].map(key => [key, new Set(['all'])])),
  session: { sourceFilter: 'all', unseenOnly: false }, getFilteredQuestions: () => [q], resourceLinks: [], historyLoaded: true,
});

describe('durable start/resume error handling', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(useApp).mockReturnValue(app() as unknown as ReturnType<typeof useApp>); });
  afterEach(cleanup);

  it('home resume: a failed resume releases the button again', async () => {
    resumeSessionFromDb.mockRejectedValueOnce(new Error('ATTEMPT_UNAVAILABLE'));
    render(<HomeView />);
    const button = screen.getByRole('button', { name: /המשך סשן/ });
    fireEvent.click(button);
    await waitFor(() => expect(resumeSessionFromDb).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('button', { name: /המשך סשן/ })).not.toBeDisabled());
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('לא נשמר'));
  });

  it('legacy tile start: a rejected server start is reported instead of unhandled', async () => {
    startSession.mockRejectedValueOnce(new Error('NOT_APPROVED'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    render(<WeakZoneMapTile zones={{ deadZone: ['q1'], studiedNotLearned: [], mastered: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: /התחל תרגול/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('לא אושר')));
    await new Promise(resolve => setTimeout(resolve, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  // R1: the simulation card must report a refused start and never open a
  // second attempt on the fallback pool after the first start already failed.
  it('home simulation: a rejected server start is reported once, no second attempt', async () => {
    startSession.mockRejectedValueOnce(new Error('NOT_APPROVED'));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    render(<HomeView />);
    fireEvent.click(screen.getByText('מבחן סימולציה'));
    // Phase 3B: one question for a 120 simulation is a shortage — the user confirms the smaller count.
    fireEvent.click(await screen.findByRole('button', { name: 'התחל עם 1' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('לא אושר')));
    await new Promise(resolve => setTimeout(resolve, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(startSession).toHaveBeenCalledTimes(1);
    expect(startSession).toHaveBeenCalledWith([q], 1, 'simulation');
  });

  // Phase 3B (LAUNCH-IMPLEMENTATION #2): a failed selection keeps the user
  // where they are with a retryable error — never a random fallback session.
  it('home simulation: a failed selection reports a retryable error and does not start', async () => {
    vi.mocked(useApp).mockReturnValue({ ...app(), fetchSrsData: vi.fn(async () => { throw new Error('srs down'); }) } as unknown as ReturnType<typeof useApp>);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<HomeView />);
    fireEvent.click(screen.getByText('מבחן סימולציה'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('לנסות שוב')));
    expect(startSession).not.toHaveBeenCalled();
  });
});
