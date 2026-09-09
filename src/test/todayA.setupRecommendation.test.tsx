import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import { readStudyPreferences } from '@/lib/studyPreferencesRepository';
import SetupView from '@/components/views/SetupView';
import { launchQuestion } from './fixtures/launchQuestion';

vi.mock('@/lib/studyPreferencesRepository', () => ({ readStudyPreferences: vi.fn() }));
vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}) } }));

const startSession = vi.fn();
const fetchSrsData = vi.fn();
const clearRecommendation = vi.fn();
const setSourceFilter = vi.fn();
const toggleUnseenOnly = vi.fn();
const pool = [12, 13].flatMap(ch => Array.from({ length: 40 }, (_, i) => ({ ...launchQuestion(`c${ch}-${i}`), chapter: ch })));
const rec = (overrides: object = {}) => ({
  id: 'rec-1', kind: 'unseen-coverage', priority: 1, title: 'פרק 12 לא נלמד', rationale: '', caveats: [], countIsSuggestion: true,
  evidence: {}, provenance: {}, setup: { mode: 'exam', chapters: [12], source: 'all', count: 7, unseenOnly: false }, ...overrides,
});
function mockApp(recommendation: object | null, session: object = { sourceFilter: 'all', unseenOnly: false }) {
  vi.mocked(useApp).mockReturnValue({
    userId: 'learner-a', data: pool, progress: { history: {}, tags: {} }, session,
    multiSelect: Object.fromEntries(['topic', 'year', 'kind', 'institution', 'confidence', 'usertags'].map(key => [key, new Set(['all'])])),
    getFilteredQuestions: () => pool, fetchSrsData, startSession, recommendation, clearRecommendation, setSourceFilter, toggleUnseenOnly,
  } as unknown as ReturnType<typeof useApp>);
}

describe('setup honours an opened recommendation exactly', () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', ''); fetchSrsData.mockResolvedValue({}); vi.mocked(readStudyPreferences).mockResolvedValue(null); });

  it('starts with the recommended count and only the recommended chapters, then clears the recommendation', async () => {
    mockApp(rec());
    render(<SetupView mode="exam" />);
    expect(screen.getByRole('status', { name: 'המלצה פעילה' })).toHaveTextContent('פרק 12 לא נלמד');
    await waitFor(() => expect(screen.getByRole('button', { name: 'התחל בחינה' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'התחל בחינה' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    const [questions, count, mode] = startSession.mock.calls[0];
    expect(count).toBe(7);
    expect(mode).toBe('exam');
    expect(questions).toHaveLength(7);
    expect(questions.every((q: { chapter: number }) => q.chapter === 12)).toBe(true);
    expect(clearRecommendation).toHaveBeenCalledOnce();
  });

  it('an empty personal-plan selection uses the current entitled pool; ordinary recommendations remain bounded', async () => {
    mockApp(rec({ kind: 'study-plan', setup: { mode: 'exam', chapters: [], source: 'all', count: 7, unseenOnly: false } }));
    render(<SetupView mode="exam" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'התחל בחינה' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'התחל בחינה' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    expect(startSession.mock.calls[0][0]).toHaveLength(7);
    expect(startSession.mock.calls[0][0].every((q: { id: string }) => pool.some(p => p.id === q.id))).toBe(true);
    cleanup(); startSession.mockClear();
    mockApp(rec({ setup: { mode: 'exam', chapters: [], source: 'all', count: 7, unseenOnly: false } }));
    render(<SetupView mode="exam" />);
    expect(screen.getByRole('button', { name: 'התחל בחינה' })).toBeDisabled();
  });

  it('syncs source/unseen filters to the recommendation and restricts to explicit question ids without widening', async () => {
    mockApp(rec({ setup: { mode: 'exam', chapters: [12], source: 'mistakes', count: 3, unseenOnly: true, questionIds: ['c12-1', 'c12-2'] } }));
    render(<SetupView mode="exam" />);
    expect(setSourceFilter).toHaveBeenCalledWith('mistakes');
    expect(toggleUnseenOnly).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole('button', { name: 'התחל בחינה' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'התחל בחינה' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    const ids = startSession.mock.calls[0][0].map((q: { id: string }) => q.id).sort();
    expect(ids).toEqual(['c12-1', 'c12-2']);
  });

  it('ordinary exam entry obeys the saved active chapters without needing a recommendation', async () => {
    vi.mocked(readStudyPreferences).mockResolvedValue({ startDate: '2026-01-01', mode: 'quarterly', chapters: [13] });
    mockApp(null);
    render(<SetupView mode="exam" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'התחל בחינה' })).not.toBeDisabled());
    expect(screen.getByRole('region', { name: 'סינון לפי התכנית' })).toHaveTextContent('13');
    fireEvent.click(screen.getByRole('button', { name: 'התחל בחינה' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    expect(startSession.mock.calls[0][0].every((q: { chapter: number }) => q.chapter === 13)).toBe(true);
  });

  it('random mode explicitly warns the learner and load failures block starting', async () => {
    vi.mocked(readStudyPreferences).mockResolvedValue({ startDate: '2026-01-01', mode: 'random', chapters: [] });
    mockApp(null); render(<SetupView mode="exam" />);
    expect(await screen.findByRole('note')).toHaveTextContent('באחריותכם לוודא');
    cleanup(); vi.mocked(readStudyPreferences).mockRejectedValue(new Error('offline'));
    render(<SetupView mode="exam" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('לא ניתן לטעון את התכנית');
    expect(screen.getByRole('button', { name: 'התחל בחינה' })).toBeDisabled();
  });

  it('cancel button drops the recommendation; a recommendation for another mode is ignored', () => {
    mockApp(rec());
    render(<SetupView mode="exam" />);
    fireEvent.click(screen.getByRole('button', { name: 'בטל המלצה' }));
    expect(clearRecommendation).toHaveBeenCalledOnce();
    cleanup();
    mockApp(rec({ setup: { mode: 'practice', chapters: [12], source: 'all', count: 7, unseenOnly: false } }));
    render(<SetupView mode="exam" />);
    expect(screen.queryByRole('status', { name: 'המלצה פעילה' })).not.toBeInTheDocument();
    expect(setSourceFilter).not.toHaveBeenCalled();
  });
});
