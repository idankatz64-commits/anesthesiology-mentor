import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

const setAnswer = vi.fn();

function mockSession(quiz: Question[]) {
  vi.mocked(useApp).mockReturnValue({
    session: {
      quiz, index: 0, score: 0, mode: 'practice', feedbackTiming: 'immediate',
      answers: quiz.map(() => null), confidence: quiz.map(() => null),
      flagged: new Set(), skipped: new Set(), sourceFilter: 'all', countFilter: quiz.length, unseenOnly: false,
    },
    progress: { favorites: [], notes: {}, ratings: {}, tags: {} },
    navigate: vi.fn(), setAnswer, setConfidence: vi.fn(), setSessionIndex: vi.fn(),
    toggleFlag: vi.fn(), skipQuestion: vi.fn(), updateHistory: vi.fn(), updateSpacedRepetition: vi.fn(),
    markForReview: vi.fn(), toggleFavorite: vi.fn(), saveNote: vi.fn(), setRating: vi.fn(), addTag: vi.fn(), removeTag: vi.fn(),
    saveSessionToDb: vi.fn().mockResolvedValue(undefined), clearSavedSession: vi.fn().mockResolvedValue(undefined),
    confirmAnswer: vi.fn(), finishAttempt: vi.fn(), recordSessionTime: vi.fn(), abandonCurrentAttempt: vi.fn(),
    invalidateQuestions: vi.fn(), updateQuizQuestion: vi.fn(), isEditor: false,
    registerAttemptedQuestions: vi.fn(), userId: 'user-1',
  } as unknown as ReturnType<typeof useApp>);
}

/** The option `<button>` that carries the given letter badge. */
function optionButton(letter: string): HTMLButtonElement {
  const badge = screen.getByText(letter, { selector: 'span.font-mono' });
  const button = badge.closest('button');
  if (!button) throw new Error(`no option button for ${letter}`);
  return button as HTMLButtonElement;
}

// The question editor stores answer options as HTML, the same way it stores the
// question body. They used to be rendered as a React text node, which prints the
// markup instead of applying it.
describe('SessionView renders answer options stored as HTML', () => {
  beforeEach(() => { vi.clearAllMocks(); HTMLElement.prototype.scrollTo = vi.fn(); });
  afterEach(cleanup);

  it('shows the saved confidence when returning to an answered practice question', () => {
    mockSession([launchQuestion('q-1')]);
    const app = vi.mocked(useApp)();
    app.session.answers[0] = 'A';
    app.session.confidence[0] = 'hesitant';
    const { rerender } = render(<SessionView />);
    expect(screen.getByText('רמת הביטחון שנבחרה: מתלבט')).toBeInTheDocument();
    app.session.confidence[0] = 'confident';
    rerender(<SessionView />);
    expect(screen.getByText('רמת הביטחון שנבחרה: בטוח')).toBeInTheDocument();
    expect(setAnswer).not.toHaveBeenCalled();
    expect(app.setConfidence).not.toHaveBeenCalled();
  });

  it('applies the markup instead of printing the tags', () => {
    mockSession([{ ...launchQuestion('q-1'), A: '<b>נתרן</b> 140' }]);
    render(<SessionView />);

    const button = optionButton('A');
    expect(button.querySelector('b')?.textContent).toBe('נתרן');
    expect(button.textContent).not.toContain('<b>');
  });

  it('keeps a plain-text option as plain text', () => {
    mockSession([launchQuestion('q-1')]);
    render(<SessionView />);
    expect(optionButton('B').textContent).toContain('אפשרות בית');
  });

  it('renders an inline image but strips scripts and event handlers', () => {
    mockSession([
      {
        ...launchQuestion('q-1'),
        A: '<img src="x.png" onerror="alert(1)"><script>alert(2)</script><i>ECG</i>',
      },
    ]);
    render(<SessionView />);

    const button = optionButton('A');
    const img = button.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('onerror')).toBeNull();
    expect(button.querySelector('script')).toBeNull();
    expect(button.innerHTML).not.toContain('alert(2)');
    expect(button.querySelector('i')?.textContent).toBe('ECG');
  });

  it('still selects the option on click, and nests no button inside it', () => {
    mockSession([{ ...launchQuestion('q-1'), A: '<b>נתרן</b> 140' }]);
    render(<SessionView />);

    const button = optionButton('A');
    // A nested <button> — what mounting the full SmartContent (ImageGallery) here
    // would produce — would swallow the option's own click.
    expect(button.querySelector('button')).toBeNull();

    fireEvent.click(button);
    expect(setAnswer).toHaveBeenCalledWith(0, 'A');
  });
});
