import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ResultsView from '@/components/views/ResultsView';
import { useApp } from '@/contexts/AppContext';
import { captureLearningBaseline } from '@/lib/sessionInsights';
import { launchQuestion } from './fixtures/launchQuestion';
import type { HistoryEntry, SessionMode } from '@/lib/types';
import { buildSessionReportHtml } from '@/lib/exportPdf';

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/lib/exportPdf', () => ({ buildSessionReportHtml: vi.fn(() => '<html><body>synthetic report</body></html>') }));
const navigate = vi.fn(), resetFilters = vi.fn(), setSourceFilter = vi.fn(), toggleMultiSelect = vi.fn(), toggleUnseenOnly = vi.fn(), startSession = vi.fn();
const bank = Array.from({ length: 60 }, (_, i) => ({ ...launchQuestion(String(i)), question: `שאלת הדגמה ${i}`, topic: i < 30 ? 'נושא אלף' : 'נושא בית' }));
const history: Record<string, HistoryEntry> = { '0': { answered: 1, correct: 0, lastResult: 'wrong', everWrong: true, timestamp: 1 } };
function setup(mode: SessionMode, many = false) {
  vi.mocked(useApp).mockReturnValue({
    session: { quiz: many ? bank : bank.slice(0, 3), answers: many ? bank.map(() => 'A') : ['A', 'B', null], mode, learningBaseline: captureLearningBaseline(history) },
    data: bank, progress: { history }, navigate, resetFilters, setSourceFilter, toggleMultiSelect, toggleUnseenOnly, startSession,
  } as unknown as ReturnType<typeof useApp>);
}

describe('end-of-session learning report', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); HTMLElement.prototype.scrollIntoView = vi.fn(); });
  afterEach(cleanup);

  it.each(['practice', 'exam'] as const)('shows %s insights immediately, with topic context and a usable recommendation', mode => {
    setup(mode); render(<ResultsView />);
    const report = screen.getByRole('region', { name: 'ניתוח התקדמות והמלצות' });
    expect(within(report).getByText('שאלות חדשות שכיסית')).toBeInTheDocument();
    expect(within(report).getByText('טעויות קודמות שתיקנת')).toBeInTheDocument();
    expect(screen.getByText(/1\/60 \(2%\) → 2\/60 \(3%\)/)).toBeInTheDocument();
    expect(screen.getByText(/טעות קודמת תוקנה/)).toBeInTheDocument();
    expect(screen.getByText(/נענו 2 מתוך 3 שאלות/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('last_session_results')!)).toMatchObject({ pct: mode === 'practice' ? 50 : 33, total: mode === 'practice' ? 2 : 3 });
    fireEvent.click(screen.getByRole('button', { name: 'ייצוא PDF' }));
    expect(buildSessionReportHtml).toHaveBeenCalledWith(expect.objectContaining({ pct: mode === 'practice' ? 50 : 33, insights: expect.objectContaining({ baselineAvailable: true }) }));
    expect(screen.getByRole('dialog', { name: 'ייצוא דוח הלמידה המלא' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'חזרה לסיכום' }));
    fireEvent.click(screen.getByRole('button', { name: 'המשך למפגש בנושא נושא אלף' }));
    expect(resetFilters).toHaveBeenCalledOnce();
    expect(toggleMultiSelect).toHaveBeenCalledWith('topic', 'נושא אלף');
    expect(setSourceFilter).toHaveBeenCalledWith('mistakes');
    expect(navigate).toHaveBeenCalledWith('setup-practice');
  });

  it('repeats only the incorrect answered questions, not the whole quiz', () => {
    setup('exam'); render(<ResultsView />);
    fireEvent.click(screen.getByRole('button', { name: 'תרגול חוזר (1 שגיאות)' }));
    expect(startSession).toHaveBeenCalledWith([bank[1]], 1, 'practice');
  });

  it('renders a bounded question list and expands it on demand without losing the report', () => {
    setup('exam', true); render(<ResultsView />);
    expect(screen.queryByText('שאלת הדגמה 59')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /הצג עוד שאלות/ }));
    expect(screen.getByText('שאלת הדגמה 59')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'ניתוח התקדמות והמלצות' })).toBeInTheDocument();
  });

  it('does not classify an unknown answer key as an error or include it in practice accuracy', () => {
    setup('practice');
    const value = useApp();
    vi.mocked(useApp).mockReturnValue({ ...value, session: { ...value.session, quiz: [{ ...bank[0], correct: '?' }], answers: ['A'] } });
    render(<ResultsView />);
    expect(screen.getByText('לא נבדק')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /תרגול חוזר/ })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('last_session_results')!)).toMatchObject({ pct: null, total: 0 });
  });

  it('shows the analysis for simulations too (every result path)', () => {
    setup('simulation'); render(<ResultsView />);
    expect(screen.getByRole('region', { name: 'ניתוח התקדמות והמלצות' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'ניתוח למידה מצטבר' })).toBeInTheDocument();
  });

  it('shows unavailable history instead of a fabricated coverage figure', () => {
    setup('practice');
    const value = useApp();
    vi.mocked(useApp).mockReturnValue({ ...value, historyLoaded: false, session: { ...value.session, learningBaseline: undefined } });
    render(<ResultsView />);
    expect(within(screen.getByRole('region', { name: 'ניתוח התקדמות והמלצות' })).getByRole('note')).toHaveTextContent('היסטוריית הלמידה אינה זמינה');
    expect(screen.queryByText(/2\/60/)).not.toBeInTheDocument();
  });
  it('opens a read-only question explanation from the prominent review action and allows selecting any loaded question', () => {
    setup('exam'); render(<ResultsView />);
    const savedResult = localStorage.getItem('last_session_results');
    const list = screen.getByRole('region', { name: 'רשימת השאלות' });
    list.scrollTop = 400;
    fireEvent.click(screen.getByRole('button', { name: 'עיון בשאלות ובהסברים' }));
    expect(list.scrollTop).toBe(0);
    expect(screen.getByRole('region', { name: 'שאלה 1 והסבר' })).toHaveTextContent('זהו הסבר הדגמה בלבד');
    expect(screen.getByRole('button', { name: 'סגור שאלה 1 והסבר' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'פתח שאלה 3 והסבר' }));
    expect(screen.getByRole('region', { name: 'שאלה 3 והסבר' })).toHaveTextContent('זהו הסבר הדגמה בלבד');
    expect(startSession).not.toHaveBeenCalled();
    expect(localStorage.getItem('last_session_results')).toBe(savedResult);
  });

  it('shows a question stored as HTML as plain text in the collapsed row title', () => {
    setup('exam');
    const value = useApp();
    vi.mocked(useApp).mockReturnValue({ ...value, session: { ...value.session, quiz: [{ ...bank[0], question: '<p>מהו המינון&nbsp;המרבי?</p>' }], answers: ['A'] } });
    render(<ResultsView />);
    const row = screen.getByRole('button', { name: 'פתח שאלה 1 והסבר' });
    expect(row).toHaveTextContent('מהו המינון המרבי?');
    expect(row.textContent).not.toContain('<p>');
    expect(row.textContent).not.toContain('&nbsp;');
  });

  it('renders an HTML question and its options as formatted content, keeps the image, drops unsafe attributes', () => {
    setup('exam');
    const value = useApp();
    vi.mocked(useApp).mockReturnValue({ ...value, session: { ...value.session, answers: ['A'], quiz: [{ ...bank[0],
      question: '<p>מהו <strong>המינון</strong> המרבי?</p><img src="https://example.com/ecg.png" alt="אק״ג" onerror="alert(1)">',
      A: '<p>1 <strong>מ״ג</strong> לק״ג</p>',
    }] } });
    render(<ResultsView />);
    fireEvent.click(screen.getByRole('button', { name: 'פתח שאלה 1 והסבר' }));
    const panel = screen.getByRole('region', { name: 'שאלה 1 והסבר' });
    // Question and option are formatted, not printed as their own markup.
    expect(panel).toHaveTextContent('מהו המינון המרבי?');
    expect(panel.textContent).not.toContain('<p>');
    expect(panel.textContent).not.toContain('<strong>');
    expect(within(panel).getByText('המינון').tagName).toBe('STRONG');
    expect(within(panel).getByText('מ״ג').tagName).toBe('STRONG');
    // A Critical Visual is content and stays; only the event handler is removed.
    const img = panel.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/ecg.png');
    expect(img).toHaveAttribute('alt', 'אק״ג');
    expect(img?.hasAttribute('onerror')).toBe(false);
  });

});
