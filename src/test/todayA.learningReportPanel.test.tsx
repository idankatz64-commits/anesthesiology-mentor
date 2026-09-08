import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import { KEYS, type Question } from '@/lib/types';
import type { AttemptEvidence } from '@/lib/learningInsights';
import LearningReportPanel from '@/components/learning/LearningReportPanel';

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => ({}) } }));
const { fetchLearningEvidence, fetchCurriculumConfig } = vi.hoisted(() => ({ fetchLearningEvidence: vi.fn(), fetchCurriculumConfig: vi.fn() }));
vi.mock('@/lib/learningRepository', () => ({ fetchLearningEvidence }));
vi.mock('@/lib/curriculumRepository', async (orig) => ({ ...(await orig<object>()), fetchCurriculumConfig }));

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const q = (id: string, chapter: number): Question => ({
  [KEYS.ID]: id, [KEYS.REF_ID]: id, [KEYS.QUESTION]: '?', [KEYS.A]: 'a', [KEYS.B]: 'b', [KEYS.C]: 'c', [KEYS.D]: 'd',
  [KEYS.CORRECT]: 'A', [KEYS.EXPLANATION]: '', [KEYS.TOPIC]: `ch${chapter}`, [KEYS.YEAR]: '2024', [KEYS.SOURCE]: 'מבחן', [KEYS.MILLER]: '',
  [KEYS.CHAPTER]: chapter, [KEYS.MEDIA_TYPE]: '', [KEYS.MEDIA_LINK]: '', [KEYS.KIND]: '',
});
const bank = [12, 13, 14].flatMap(ch => Array.from({ length: ch === 12 ? 60 : 20 }, (_, i) => q(`c${ch}-${i}`, ch)));
// Persona A: chapter 12 fully covered, 13 partly, 14 untouched → the engine's deterministic 'unseen-coverage' action on 14.
const personaA: AttemptEvidence[] = [
  ...Array.from({ length: 60 }, (_, i) => ({ questionId: `c12-${i}`, mode: 'practice' as const, feedbackTiming: 'immediate' as const, answeredAt: NOW - (2 + i) * DAY, isCorrect: true, confidence: 'confident' as const })),
  ...Array.from({ length: 5 }, (_, i) => ({ questionId: `c13-${i}`, mode: 'practice' as const, feedbackTiming: 'immediate' as const, answeredAt: NOW - (2 + i) * DAY, isCorrect: true, confidence: 'confident' as const })),
];

const openRecommendation = vi.fn();
const fetchSrsData = vi.fn();
function mockApp(userId: string | null) {
  vi.mocked(useApp).mockReturnValue({
    data: bank, progress: { history: {} }, userId, fetchSrsData, openRecommendation, resident: null,
  } as unknown as ReturnType<typeof useApp>);
}

describe('cumulative learning report panel', () => {
  beforeEach(() => {
    vi.clearAllMocks(); fetchSrsData.mockResolvedValue({});
    fetchCurriculumConfig.mockResolvedValue({ approved: null, draft: { version: 'core-candidate-2026-09-07', status: 'draft', chapters: [] }, canEdit: false, canPublish: false, versions: [] });
  });
  afterEach(cleanup);

  it('renders real evidence and the action button opens Setup with the exact engine filters', async () => {
    fetchLearningEvidence.mockResolvedValue(personaA);
    mockApp('user-a');
    render(<LearningReportPanel />);
    const region = await screen.findByRole('region', { name: 'ניתוח למידה מצטבר' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'פתח הגדרות עם הסינון הזה' })).toBeInTheDocument());
    expect(region).toHaveTextContent('50');
    expect(screen.getByRole('note')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'פתח הגדרות עם הסינון הזה' }));
    expect(openRecommendation).toHaveBeenCalledOnce();
    expect(openRecommendation.mock.calls[0][0].setup).toMatchObject({ chapters: [14], unseenOnly: true, source: 'all', count: 20 });
  });

  it('A→B identity transition refetches and never shows the previous user\'s report', async () => {
    fetchLearningEvidence.mockResolvedValueOnce(personaA).mockResolvedValueOnce([]);
    mockApp('user-a');
    const view = render(<LearningReportPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'פתח הגדרות עם הסינון הזה' })).toBeInTheDocument());
    mockApp('user-b');
    view.rerender(<LearningReportPanel />);
    await waitFor(() => expect(fetchLearningEvidence).toHaveBeenCalledTimes(2));
    // User B has no evidence: the engine's deterministic action is no longer A's chapter-14 gap.
    await waitFor(() => expect(screen.getByRole('button', { name: 'פתח הגדרות עם הסינון הזה' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'פתח הגדרות עם הסינון הזה' }));
    expect(openRecommendation).toHaveBeenCalledOnce();
    expect(openRecommendation.mock.calls[0][0].setup.chapters).not.toEqual([14]);
    expect(screen.getByRole('region', { name: 'ניתוח למידה מצטבר' })).not.toHaveTextContent('c12-');
  });

  it('signed out: no evidence request and a plain unavailable note', () => {
    mockApp(null);
    render(<LearningReportPanel />);
    expect(fetchLearningEvidence).not.toHaveBeenCalled();
    expect(screen.getByRole('note')).toHaveTextContent('הניתוח אינו זמין');
  });

  it('resident plan waits for an approved core config while all study stays open', async () => {
    fetchLearningEvidence.mockResolvedValue([]);
    mockApp('user-a');
    render(<LearningReportPanel withPlan />);
    await waitFor(() => expect(screen.getByText(/ממתינה לאישור רשימת הליבה/)).toBeInTheDocument());
    expect(screen.getByText(/ממתינה לאישור/)).toHaveTextContent('core-candidate-2026-09-07');
    expect(screen.getByText(/ממתינה לאישור/)).toHaveTextContent('פתוח ללימוד');
  });
});
