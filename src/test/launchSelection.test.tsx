import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import SetupView from '@/components/views/SetupView';
import HomeView from '@/components/views/HomeView';
import { policyModeFor } from '@/lib/selectionSummary';
import type { HistoryEntry, Question } from '@/lib/types';
import { launchQuestion } from './fixtures/launchQuestion';

// Phase 3B: the three live callers (Setup, quick 15, simulation 120) go through
// selectBounded. What is asserted here is the actual startSession call:
// which questions, which count, which persisted mode — and that a shortage or
// an empty result is shown to the user instead of silently widened.
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
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const HOUR = 60 * 60 * 1000;
const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => launchQuestion(`${prefix}-${i}`));
const ids = (qs: Question[]) => qs.map(q => q.id);
// Mirrors AppContext's user_answers → HistoryEntry mapping.
const seen = (lastResult: 'correct' | 'wrong', hoursAgo = 48): HistoryEntry => ({
  answered: 1, correct: lastResult === 'correct' ? 1 : 0, lastResult, everWrong: lastResult === 'wrong', timestamp: Date.now() - hoursAgo * HOUR,
});
const historyOf = (qs: Question[], lastResult: 'correct' | 'wrong', hoursAgo?: number) =>
  Object.fromEntries(qs.map(q => [q.id, seen(lastResult, hoursAgo)]));

const startSession = vi.fn();
const fetchSrsData = vi.fn();
const navigate = vi.fn();
const resetFilters = vi.fn();
const allSets = Object.fromEntries(['topic', 'year', 'kind', 'institution', 'confidence', 'usertags'].map(key => [key, new Set(['all'])]));

const setupApp = (over: { data: Question[]; pool?: Question[]; history?: Record<string, HistoryEntry>; sourceFilter?: string }) => ({
  data: over.data, progress: { history: over.history ?? {}, tags: {} },
  session: { sourceFilter: over.sourceFilter ?? 'all', unseenOnly: false }, multiSelect: allSets,
  getFilteredQuestions: () => over.pool ?? over.data, fetchSrsData, startSession, navigate, resetFilters,
  setSourceFilter: vi.fn(), toggleUnseenOnly: vi.fn(), toggleMultiSelect: vi.fn(),
});
const homeApp = (over: { data: Question[]; history?: Record<string, HistoryEntry> }) => ({
  data: over.data, progress: { history: over.history ?? {}, favorites: [], tags: {}, notes: {}, ratings: {} },
  navigate, startSession, resumeSessionFromDb: vi.fn(), savedSessionInfo: null, loadingSavedSession: false,
  clearSavedSession: vi.fn(), fetchSrsData, setSourceFilter: vi.fn(), multiSelect: allSets,
  session: { sourceFilter: 'all', unseenOnly: false }, getFilteredQuestions: () => over.data, resourceLinks: [], historyLoaded: true,
});
const mockApp = (app: object) => vi.mocked(useApp).mockReturnValue(app as unknown as ReturnType<typeof useApp>);

const setCustomCount = (n: number) => {
  fireEvent.click(screen.getByRole('button', { name: 'מותאם אישית' }));
  fireEvent.change(screen.getByLabelText('מספר שאלות:'), { target: { value: String(n) } });
};

describe('policyModeFor', () => {
  it('maps every persisted session mode deliberately', () => {
    expect(policyModeFor('practice')).toBe('practice');
    expect(policyModeFor('review')).toBe('practice');
    expect(policyModeFor('exam')).toBe('exam');
    expect(policyModeFor('simulation')).toBe('exam');
  });
});

describe('setup selection', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', ''); fetchSrsData.mockResolvedValue({}); });
  afterEach(cleanup);

  it('practice: starts the user mode with the chosen count, only from the filtered pool (denied source absent)', async () => {
    const pool = many('ok', 10);
    const denied = launchQuestion('denied-source');
    mockApp(setupApp({ data: [...pool, denied], pool }));
    render(<SetupView mode="practice" />);
    setCustomCount(4);
    expect(await screen.findByText('חדשות 4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'התחל תרגול' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    const [questions, count, mode, options] = startSession.mock.calls[0];
    expect(questions).toHaveLength(4);
    expect(ids(questions)).not.toContain('denied-source');
    expect(ids(questions).every(id => ids(pool).includes(id))).toBe(true);
    expect([count, mode, options]).toEqual([4, 'practice', { feedbackTiming: 'immediate' }]);
    expect(fetchSrsData).toHaveBeenCalledOnce();
  });

  it('exam: unseen first, persisted mode stays exam', async () => {
    const fresh = many('new', 3);
    const repeated = many('rep', 3);
    mockApp(setupApp({ data: [...repeated, ...fresh], history: historyOf(repeated, 'correct') }));
    render(<SetupView mode="exam" />);
    setCustomCount(3);
    expect(await screen.findByText('חדשות 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'התחל בחינה' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    const [questions, count, mode, options] = startSession.mock.calls[0];
    expect(ids(questions).sort()).toEqual(ids(fresh).sort());
    expect([count, mode, options]).toEqual([3, 'exam', { feedbackTiming: 'end' }]);
  });

  it('exam cooldown leaves none: no start, a reason and explicit options — never the unfiltered pool', async () => {
    const pool = many('recent', 5);
    mockApp(setupApp({ data: pool, history: historyOf(pool, 'correct', 1) }));
    render(<SetupView mode="exam" />);
    expect(await screen.findByText(/אין כרגע שאלות זמינות/)).toBeInTheDocument();
    expect(screen.getByText(/5 נענו לאחרונה/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'התחל בחינה' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'דף הבית' }));
    expect(navigate).toHaveBeenCalledWith('home');
    fireEvent.click(screen.getByRole('button', { name: 'נקה סינון' }));
    expect(resetFilters).toHaveBeenCalledOnce();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('manual practice: questions answered an hour ago may be repeated, counted as learning', async () => {
    const pool = many('recent', 5);
    mockApp(setupApp({ data: pool, history: historyOf(pool, 'wrong', 1) }));
    render(<SetupView mode="practice" />);
    setCustomCount(5);
    expect(await screen.findByText('טעויות 5')).toBeInTheDocument();
    expect(screen.getByText(/מותר לחזור/)).toBeInTheDocument();
    expect(screen.queryByText(/נענו לאחרונה/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'התחל תרגול' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    expect(ids(startSession.mock.calls[0][0]).sort()).toEqual(ids(pool).sort());
    expect(startSession.mock.calls[0].slice(1, 3)).toEqual([5, 'practice']);
  });

  it('mistakes only: never widens — no new question enters, shortage is disclosed', async () => {
    const wrong = many('wrong', 2);
    const stray = launchQuestion('stray-new');
    mockApp(setupApp({ data: [...wrong, stray], history: historyOf(wrong, 'wrong'), sourceFilter: 'mistakes' }));
    render(<SetupView mode="practice" />);
    setCustomCount(5);
    expect(await screen.findByText('טעויות 2')).toBeInTheDocument();
    expect(screen.queryByText(/חדשות \d/)).not.toBeInTheDocument();
    expect(screen.getByText(/נמצאו 2 מתוך 5/)).toBeInTheDocument();
    expect(screen.getByText(/1 אינן טעויות/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'התחל תרגול' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    expect(ids(startSession.mock.calls[0][0]).sort()).toEqual(ids(wrong).sort());
    expect(startSession.mock.calls[0][1]).toBe(2);
  });

  it('mistakes only with zero mistakes: no session at all', async () => {
    const solved = many('solved', 3);
    mockApp(setupApp({ data: solved, history: historyOf(solved, 'correct'), sourceFilter: 'mistakes' }));
    render(<SetupView mode="practice" />);
    expect(await screen.findByText(/אין כרגע טעויות זמינות/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'התחל תרגול' })).toBeDisabled();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('shortage: shows found N of M before start and starts with N only on the user click', async () => {
    const pool = many('few', 4);
    mockApp(setupApp({ data: pool }));
    render(<SetupView mode="practice" />);
    setCustomCount(10);
    expect(await screen.findByText(/נמצאו 4 מתוך 10/)).toBeInTheDocument();
    expect(startSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'התחל תרגול' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    expect(startSession.mock.calls[0][0]).toHaveLength(4);
    expect(startSession.mock.calls[0][1]).toBe(4);
  });
});

describe('home quick actions', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', ''); fetchSrsData.mockResolvedValue({}); });
  afterEach(cleanup);

  it('quick tile: 15 from the entitled bank as practice, composition announced', async () => {
    mockApp(homeApp({ data: many('bank', 40) }));
    render(<HomeView />);
    fireEvent.click(screen.getByText('Smart Practice'));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    const [questions, count, mode] = startSession.mock.calls[0];
    expect(questions).toHaveLength(15);
    expect([count, mode]).toEqual([15, 'practice']);
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('חדשות 15'));
  });

  it('simulation card: persisted mode stays simulation, unseen preferred like an exam', async () => {
    const fresh = many('new', 130);
    const repeated = many('rep', 20);
    mockApp(homeApp({ data: [...repeated, ...fresh], history: historyOf(repeated, 'correct') }));
    render(<HomeView />);
    fireEvent.click(screen.getByText('מבחן סימולציה'));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    const [questions, count, mode] = startSession.mock.calls[0];
    expect(questions).toHaveLength(120);
    expect(ids(questions).some(id => id.startsWith('rep-'))).toBe(false);
    expect([count, mode]).toEqual([120, 'simulation']);
  });

  it('quick tile shortage: nothing starts until the user accepts the smaller count', async () => {
    mockApp(homeApp({ data: many('bank', 3) }));
    render(<HomeView />);
    fireEvent.click(screen.getByText('Smart Practice'));
    expect(await screen.findByText(/נמצאו 3 מתוך 15/)).toBeInTheDocument();
    expect(startSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'התחל עם 3' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledWith(expect.any(Array), 3, 'practice'));
    expect(startSession.mock.calls[0][0]).toHaveLength(3);
  });

  it('quick tile zero eligible: reason and options, no empty session', async () => {
    const bank = many('bank', 3);
    mockApp(homeApp({ data: bank, history: historyOf(bank, 'correct', 1) }));
    render(<HomeView />);
    fireEvent.click(screen.getByText('Smart Practice'));
    expect(await screen.findByText(/אין כרגע שאלות זמינות/)).toBeInTheDocument();
    expect(screen.getByText(/3 נענו לאחרונה/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /התחל עם/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'הגדרות מותאמות' }));
    expect(navigate).toHaveBeenCalledWith('setup-practice');
    expect(startSession).not.toHaveBeenCalled();
  });

  it('weighted quick tile: a weak topic is preferred over a strong one', async () => {
    const topical = (prefix: string, n: number, topic: string) => many(prefix, n).map(q => ({ ...q, topic }));
    const weakSeen = topical('weak-seen', 10, 'Weak');
    const strongSeen = topical('strong-seen', 10, 'Strong');
    const history = {
      ...Object.fromEntries(weakSeen.map((q, i) => [q.id, seen(i < 2 ? 'correct' : 'wrong')])),
      ...historyOf(strongSeen, 'correct'),
    };
    const data = [...strongSeen, ...topical('strong-new', 20, 'Strong'), ...weakSeen, ...topical('weak-new', 20, 'Weak')];
    mockApp(homeApp({ data, history }));
    render(<HomeView />);
    fireEvent.click(screen.getByText('Smart Practice'));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    const questions: Question[] = startSession.mock.calls[0][0];
    expect(questions).toHaveLength(15);
    expect(questions.every(q => q.topic === 'Weak')).toBe(true);
  });

  it('srs fetch failure: retryable error, no random fallback start', async () => {
    fetchSrsData.mockRejectedValueOnce(new Error('srs down'));
    mockApp(homeApp({ data: many('bank', 130) }));
    render(<HomeView />);
    fireEvent.click(screen.getByText('מבחן סימולציה'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('לנסות שוב')));
    expect(startSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('מבחן סימולציה'));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
  });
});

// PHASE-3B-FIX §1: quickStart awaits the SRS fetch; the bank, user or history may
// change underneath it (sign-out, entitlement re-projection, quarantine). The
// stale closure must never start a session — and a stale pending panel must go.
describe('home quick actions — context guard across the SRS await', () => {
  let resolveSrs: (v: Record<string, never>) => void = () => {};
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_DURABLE_ATTEMPTS', '');
    fetchSrsData.mockReturnValueOnce(new Promise(r => { resolveSrs = r; })).mockResolvedValue({});
  });
  afterEach(cleanup);

  it('bank changed during the await: no start from the old bank, retry toast, next click uses the new bank', async () => {
    const before = many('before', 40);
    const after = many('after', 40);
    mockApp(homeApp({ data: before, history: {} }));
    const { rerender } = render(<HomeView />);
    fireEvent.click(screen.getByText('Smart Practice'));
    mockApp(homeApp({ data: after, history: {} }));
    rerender(<HomeView />);
    resolveSrs({});
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('לנסות שוב')));
    expect(startSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Smart Practice'));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    expect(ids(startSession.mock.calls[0][0]).every(id => id.startsWith('after-'))).toBe(true);
  });

  it('user changed during the await: nothing starts', async () => {
    const bank = many('bank', 40);
    mockApp({ ...homeApp({ data: bank }), userId: 'user-a' });
    const { rerender } = render(<HomeView />);
    fireEvent.click(screen.getByText('Smart Practice'));
    mockApp({ ...homeApp({ data: bank }), userId: 'user-b' });
    rerender(<HomeView />);
    resolveSrs({});
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
    expect(startSession).not.toHaveBeenCalled();
  });

  it('shortage panel: bank changes before the click → panel gone, nothing starts', async () => {
    mockApp(homeApp({ data: many('bank', 3) }));
    const { rerender } = render(<HomeView />);
    fireEvent.click(screen.getByText('Smart Practice'));
    resolveSrs({});
    expect(await screen.findByRole('button', { name: 'התחל עם 3' })).toBeInTheDocument();
    mockApp(homeApp({ data: many('other', 3) }));
    rerender(<HomeView />);
    expect(screen.queryByRole('button', { name: /התחל עם/ })).not.toBeInTheDocument();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('shortage panel: history changes before the click → panel gone, nothing starts', async () => {
    const bank = many('bank', 3);
    mockApp(homeApp({ data: bank }));
    const { rerender } = render(<HomeView />);
    fireEvent.click(screen.getByText('Smart Practice'));
    resolveSrs({});
    expect(await screen.findByRole('button', { name: 'התחל עם 3' })).toBeInTheDocument();
    mockApp(homeApp({ data: bank, history: historyOf(bank, 'wrong', 1) }));
    rerender(<HomeView />);
    expect(screen.queryByRole('button', { name: /התחל עם/ })).not.toBeInTheDocument();
    expect(startSession).not.toHaveBeenCalled();
  });

  it('unmounted during the await: nothing starts, no toast', async () => {
    mockApp(homeApp({ data: many('bank', 40) }));
    const { unmount } = render(<HomeView />);
    fireEvent.click(screen.getByText('Smart Practice'));
    unmount();
    resolveSrs({});
    await new Promise(r => setTimeout(r, 0));
    expect(startSession).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
