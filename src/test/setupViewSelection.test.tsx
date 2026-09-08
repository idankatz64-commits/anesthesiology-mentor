import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import SetupView, { MAX_CUSTOM_COUNT } from '@/components/views/SetupView';
import * as selectionSummary from '@/lib/selectionSummary';
import type { Question } from '@/lib/types';
import { launchQuestion } from './fixtures/launchQuestion';

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => Promise.resolve({ data: [] }) }) } }));
vi.mock('@/lib/selectionSummary', async (importOriginal) => {
  const actual = await importOriginal<typeof selectionSummary>();
  return { ...actual, smartRank: vi.fn(actual.smartRank) };
});

const smartRank = vi.mocked(selectionSummary.smartRank);

const bank: Question[] = [
  { ...launchQuestion('q1'), question: 'alpha 1' },
  { ...launchQuestion('q2'), question: 'alpha 2' },
  { ...launchQuestion('q3'), question: 'alpha 3' },
  { ...launchQuestion('q4'), question: 'beta 1' },
];

const progress = { history: {}, favorites: [], notes: {}, ratings: {}, tags: {} };
const confidenceMap = {};

function multiSelectAll() {
  return {
    topic: new Set(['all']), year: new Set(['all']), kind: new Set(['all']),
    institution: new Set(['all']), confidence: new Set(['all']), usertags: new Set(['all']),
  };
}

// Mirrors the real getFilteredQuestions: a stable identity that reads its filters from
// somewhere React cannot see. `chipFilter` stands in for that hidden state.
let chipFilter: (q: Question) => boolean = () => true;
const getFilteredQuestions = vi.fn((serial?: string, textSearch?: string) =>
  bank.filter(q => chipFilter(q) && (!textSearch || q.question.includes(textSearch))),
);

function mockApp(multiSelect = multiSelectAll()) {
  vi.mocked(useApp).mockReturnValue({
    data: bank,
    progress,
    confidenceMap,
    multiSelect,
    session: { sourceFilter: 'all', unseenOnly: false },
    setSourceFilter: vi.fn(), toggleUnseenOnly: vi.fn(), getFilteredQuestions,
    startSession: vi.fn().mockResolvedValue(undefined), navigate: vi.fn(),
    toggleMultiSelect: vi.fn(), fetchSrsData: vi.fn().mockResolvedValue({}),
    resetFilters: vi.fn(), recommendation: null, clearRecommendation: vi.fn(),
  } as unknown as ReturnType<typeof useApp>);
}

/** The "שאלות זמינות" figure, which is `pool.length`. The session-size buttons print
 *  "N שאלות" too, so this reads the one under that specific label. */
function poolSize(): number {
  return Number(screen.getByText('שאלות זמינות').nextElementSibling!.textContent!.trim().split(' ')[0]);
}

describe('SetupView selection preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chipFilter = () => true;
    mockApp();
  });
  afterEach(cleanup);

  it('does not repeat the full-bank ranking pass when only the pool filter changes', async () => {
    render(<SetupView mode="practice" />);
    await waitFor(() => expect(smartRank).toHaveBeenCalledTimes(1));
    expect(poolSize()).toBe(4);

    fireEvent.change(screen.getByPlaceholderText('חפש תרופה, מחלה או מושג...'), { target: { value: 'alpha' } });

    // The filter took effect…
    await waitFor(() => expect(poolSize()).toBe(3));
    // …and the whole-bank + whole-history pass was not rebuilt to do it.
    expect(smartRank).toHaveBeenCalledTimes(1);
  });

  it('does not re-filter the bank on a re-render that changes none of its inputs', async () => {
    const { rerender } = render(<SetupView mode="practice" />);
    await waitFor(() => expect(smartRank).toHaveBeenCalledTimes(1));
    const callsBefore = getFilteredQuestions.mock.calls.length;

    rerender(<SetupView mode="practice" />);

    expect(getFilteredQuestions).toHaveBeenCalledTimes(callsBefore);
    expect(poolSize()).toBe(4);
  });

  it('still reflects a filter change that lives behind the stable callback', async () => {
    const { rerender } = render(<SetupView mode="practice" />);
    await waitFor(() => expect(poolSize()).toBe(4));

    // A chip toggle: the callback keeps its identity, only multiSelect changes.
    chipFilter = q => q.question.startsWith('beta');
    const narrowed = multiSelectAll();
    narrowed.topic = new Set(['Demo']);
    mockApp(narrowed);
    rerender(<SetupView mode="practice" />);

    expect(poolSize()).toBe(1);
  });
});

describe('SetupView custom question count', () => {
  beforeEach(() => { vi.clearAllMocks(); chipFilter = () => true; mockApp(); });
  afterEach(cleanup);

  it('caps the custom count at the ceiling, in the attribute and in the value', () => {
    render(<SetupView mode="practice" />);
    fireEvent.click(screen.getByText('מותאם אישית'));

    const input = screen.getByLabelText('מספר שאלות:') as HTMLInputElement;
    expect(input.getAttribute('max')).toBe(String(MAX_CUSTOM_COUNT));

    // The attribute alone does not stop a pasted value; the handler has to.
    fireEvent.change(input, { target: { value: '99999' } });
    expect(input.value).toBe(String(MAX_CUSTOM_COUNT));

    fireEvent.change(input, { target: { value: '0' } });
    expect(input.value).toBe('1');

    fireEvent.change(input, { target: { value: '42' } });
    expect(input.value).toBe('42');
  });
});
