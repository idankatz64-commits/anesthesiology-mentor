import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PersonalStudyPanel from '@/components/learning/PersonalStudyPanel';
import { useApp } from '@/contexts/AppContext';
import { fetchCurriculumConfig } from '@/lib/curriculumRepository';
import { readStudyPreferences, saveStudyPreferences } from '@/lib/studyPreferencesRepository';
import { useLearningReport } from '@/components/learning/useLearningReport';
import { calculateChapterProgress } from '@/lib/chapterProgressPolicy';
vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/lib/curriculumRepository', () => ({ fetchCurriculumConfig: vi.fn() }));
vi.mock('@/lib/studyPreferencesRepository', () => ({ readStudyPreferences: vi.fn(), saveStudyPreferences: vi.fn() }));
vi.mock('@/components/learning/useLearningReport', () => ({ useLearningReport: vi.fn() }));
const open = vi.fn();
function identity(id: string) { vi.mocked(useApp).mockReturnValue({ userId: id, resident: { member: null }, openRecommendation: open } as unknown as ReturnType<typeof useApp>); }
beforeEach(() => {
  vi.clearAllMocks(); identity('a');
  vi.mocked(fetchCurriculumConfig).mockResolvedValue({ approved: { status: 'approved', version: 'test', contentHash: 'h', chapters: [{ id: 12, title: 'נשימה' }] }, draft: null, versions: [], canEdit: false, canPublish: false });
  vi.mocked(readStudyPreferences).mockResolvedValue(null);
  vi.mocked(useLearningReport).mockReturnValue({ status: 'ready', report: { chapters: [] } } as unknown as ReturnType<typeof useLearningReport>);
});
afterEach(cleanup);
describe('personal home plan', () => {
  it('requires explicit start date, saves chosen values and leaves empty random scope explicit', async () => {
    vi.mocked(saveStudyPreferences).mockImplementation(async p => p);
    render(<PersonalStudyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת תכנית הלמידה המלאה' }));
    const date = await screen.findByLabelText('תאריך תחילת הלמידה שלי');
    expect(date).toHaveValue('');
    fireEvent.change(date, { target: { value: '2026-01-31' } });
    fireEvent.change(screen.getByLabelText('מסלול למידה'), { target: { value: 'random' } });
    fireEvent.click(screen.getByRole('button', { name: 'שמירת התכנית' }));
    await waitFor(() => expect(saveStudyPreferences).toHaveBeenCalledWith({ startDate: '2026-01-31', mode: 'random', chapters: [] }));
    await screen.findByText('התכנית נשמרה לחשבון שלך.');
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת תרגול עם הבחירה' }));
    expect(open.mock.calls[0][0]).toMatchObject({ kind: 'study-plan', setup: { chapters: [], mode: 'practice' } });
  });
  it('never substitutes zeros for unavailable evidence', async () => {
    vi.mocked(useLearningReport).mockReturnValue({ status: 'unavailable', message: 'אין חיבור לנתונים' });
    render(<PersonalStudyPanel />);
    expect(screen.getByRole('alert')).toHaveTextContent('אין חיבור לנתונים');
    expect(screen.queryByText(/נפח כללי:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת תכנית הלמידה המלאה' }));
    await screen.findByLabelText('תאריך תחילת הלמידה שלי');
  });
  it('shows three distinct actual metrics alongside targets, including no exam success evidence', async () => {
    const ids = ['a', 'b', 'c', 'd'];
    const policy = calculateChapterProgress(ids, [{ questionId: 'a', mode: 'practice', correct: true, answeredAt: 1 }]);
    vi.mocked(useLearningReport).mockReturnValue({ status: 'ready', report: { chapters: [{ chapter: 12, total: 4, seenCount: 1, policy }] } } as unknown as ReturnType<typeof useLearningReport>);
    render(<PersonalStudyPanel />);
    expect(screen.getByText('נפח כללי: 25% / יעד 50% (1/4)')).toBeInTheDocument();
    expect(screen.getByText('נפח בחינה: 0% / יעד 25% (0/4)')).toBeInTheDocument();
    expect(screen.getByText('הצלחה בבחינה: אין נתון / יעד 70%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת תכנית הלמידה המלאה' }));
    await screen.findByLabelText('תאריך תחילת הלמידה שלי');
  });
  it('cannot start a cleared recommended plan, and unsaved changes do not replace active cards', async () => {
    vi.mocked(readStudyPreferences).mockResolvedValue({ startDate: '2026-01-31', mode: 'quarterly', chapters: [12] });
    render(<PersonalStudyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת תכנית הלמידה המלאה' }));
    await screen.findByLabelText('תאריך תחילת הלמידה שלי');
    fireEvent.click(screen.getByText('בחירת פרקים ידנית (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'ניקוי הבחירה' }));
    expect(screen.getByRole('button', { name: 'פתיחת תרגול עם הבחירה' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'פתיחת בחינה עם הבחירה' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByText(/12 — נשימה: אין כרגע נתוני/)).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps the home compact: no legacy-only chapters and at most three active cards', async () => {
    const chapter = (id: number, active: boolean) => ({ chapter: id, total: 10, seenCount: 10, policy: calculateChapterProgress(['a','b','c','d'], active ? [{ questionId: 'a', mode: 'practice' as const, correct: true, answeredAt: 1 }] : []) });
    vi.mocked(useLearningReport).mockReturnValue({ status: 'ready', report: { chapters: Array.from({ length: 43 }, (_, i) => chapter(i + 1, i < 5)) } } as unknown as ReturnType<typeof useLearningReport>);
    render(<PersonalStudyPanel />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.queryByLabelText('תאריך תחילת הלמידה שלי')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchCurriculumConfig).toHaveBeenCalledOnce());
  });

  it('discards a late load from the previous identity', async () => {
    let finish!: (p: null) => void;
    vi.mocked(readStudyPreferences).mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce({ startDate: '2025-03-15', mode: 'random', chapters: [12] });
    const view = render(<PersonalStudyPanel />);
    identity('b'); view.rerender(<PersonalStudyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'פתיחת תכנית הלמידה המלאה' }));
    await waitFor(() => expect(screen.getByLabelText('תאריך תחילת הלמידה שלי')).toHaveValue('2025-03-15'));
    await act(async () => finish(null));
    expect(screen.getByLabelText('תאריך תחילת הלמידה שלי')).toHaveValue('2025-03-15');
  });
});
