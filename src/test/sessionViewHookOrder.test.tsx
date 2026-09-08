import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import SessionView from '@/components/views/SessionView';
import type { Question } from '@/lib/types';
import { launchQuestion } from './fixtures/launchQuestion';

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => Promise.resolve({ data: [] }) }) } }));
vi.mock('@/components/FormulaCalculatorPanel', () => ({ default: () => null }));
vi.mock('@/components/RichTextEditor', () => ({ default: () => null }));
vi.mock('@/components/ShareQuestionButton', () => ({ default: () => null }));
vi.mock('@/components/ImageGallery', () => ({ default: () => null }));
vi.mock('@/components/views/SessionCommunity', () => ({ GlobalQuestionStats: () => null, CommunityNotes: () => null }));
vi.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => false }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const toggleFavorite = vi.fn();

// The view is mounted by Index on currentView==='session'; the quiz it reads is a
// separate piece of AppContext state. Both transitions below are ones the app can
// produce without unmounting the view: an attempt that opens before its questions
// resolve, and a session that empties in place.
function mockSession(quiz: Question[]) {
  vi.mocked(useApp).mockReturnValue({
    session: {
      quiz, index: 0, score: 0, mode: 'practice', feedbackTiming: 'immediate',
      answers: quiz.map(() => null), confidence: quiz.map(() => null),
      flagged: new Set(), skipped: new Set(), sourceFilter: 'all', countFilter: quiz.length, unseenOnly: false,
    },
    progress: { favorites: [], notes: {}, ratings: {}, tags: {} },
    navigate: vi.fn(), setAnswer: vi.fn(), setConfidence: vi.fn(), setSessionIndex: vi.fn(),
    toggleFlag: vi.fn(), skipQuestion: vi.fn(), updateHistory: vi.fn(), updateSpacedRepetition: vi.fn(),
    markForReview: vi.fn(), toggleFavorite, saveNote: vi.fn(), setRating: vi.fn(), addTag: vi.fn(), removeTag: vi.fn(),
    saveSessionToDb: vi.fn().mockResolvedValue(undefined), clearSavedSession: vi.fn().mockResolvedValue(undefined),
    confirmAnswer: vi.fn(), finishAttempt: vi.fn(), recordSessionTime: vi.fn(), abandonCurrentAttempt: vi.fn(),
    invalidateQuestions: vi.fn(), updateQuizQuestion: vi.fn(), isEditor: false,
    registerAttemptedQuestions: vi.fn(), userId: 'user-1',
  } as unknown as ReturnType<typeof useApp>);
}

describe('SessionView survives the quiz emptying and refilling in place', () => {
  beforeEach(() => { vi.clearAllMocks(); HTMLElement.prototype.scrollTo = vi.fn(); });
  afterEach(cleanup);

  it('renders nothing instead of crashing when the quiz empties mid-session', () => {
    mockSession([launchQuestion('q-1'), launchQuestion('q-2')]);
    const { container, rerender } = render(<SessionView />);
    expect(container).not.toBeEmptyDOMElement();

    mockSession([]);
    expect(() => rerender(<SessionView />)).not.toThrow();
    expect(container).toBeEmptyDOMElement();

    fireEvent.keyDown(document.body, { key: 'f' });
    expect(toggleFavorite).not.toHaveBeenCalled();
  });

  it('binds the keyboard shortcuts when questions arrive after the view is already mounted', () => {
    mockSession([]);
    const { rerender } = render(<SessionView />);

    mockSession([launchQuestion('q-1')]);
    expect(() => rerender(<SessionView />)).not.toThrow();

    fireEvent.keyDown(document.body, { key: 'f' });
    expect(toggleFavorite).toHaveBeenCalledWith('q-1');
  });
});
