import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NOT_OWNER_MESSAGE, requireWrittenRows } from '@/components/admin/editorialOwner';
import QuestionEditorTab from '@/components/admin/QuestionEditorTab';
import ImportQuestionsTab from '@/components/admin/ImportQuestionsTab';

const { fetchMyFeedbackRole } = vi.hoisted(() => ({ fetchMyFeedbackRole: vi.fn() }));
vi.mock('@/lib/feedbackRepository', () => ({ fetchMyFeedbackRole }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({ invalidateQuestions: vi.fn(), data: [], userId: 'u' }) }));
vi.mock('@/components/RichTextEditor', () => ({ default: () => null }));

// Chainable, thenable stand-in: every builder call returns itself; awaiting it yields one synthetic row.
const row = { id: 'q-synthetic', ref_id: '1', question: 'שאלה סינתטית לבדיקה', topic: 'Demo', A: 'a', B: 'b', C: 'c', D: 'd', correct: 'A', explanation: '', chapter: 1, name: 'Demo' };
const result = { data: [row], count: 1, error: null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chain = (): any => new Proxy(function () {}, {
  get: (_t, prop) => (prop === 'then' ? (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej) : () => chain()),
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => chain(), rpc: () => chain(), auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) } } }));

describe('owner-only direct publication (questions RLS 20260908000001)', () => {
  beforeEach(vi.clearAllMocks);
  afterEach(cleanup);

  it('requireWrittenRows: zero rows with error=null is a failure, never a success', () => {
    expect(() => requireWrittenRows([], 1, null)).toThrow(NOT_OWNER_MESSAGE);
    expect(() => requireWrittenRows(null, 1, null)).toThrow(NOT_OWNER_MESSAGE);
    expect(() => requireWrittenRows([{ id: 1 }], 2, null)).toThrow(NOT_OWNER_MESSAGE);
    expect(() => requireWrittenRows([{ id: 1 }], 1, { message: 'boom' })).toThrow('boom');
    expect(requireWrittenRows([{ id: 1 }], 1, null)).toEqual([{ id: 1 }]);
  });

  it('a regular editor sees the rows read-only: banner shown, no edit/delete/batch controls', async () => {
    fetchMyFeedbackRole.mockResolvedValue({ owner: false, author: false, approved: true });
    render(<QuestionEditorTab />);
    await screen.findByText('שאלה סינתטית לבדיקה');
    await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent(NOT_OWNER_MESSAGE));
    expect(screen.queryByRole('button', { name: 'עריכת שאלה' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'מחיקת שאלה' })).not.toBeInTheDocument();
  });

  it('the configured editorial owner keeps the direct edit/delete route', async () => {
    fetchMyFeedbackRole.mockResolvedValue({ owner: true, author: true, approved: true });
    render(<QuestionEditorTab />);
    await screen.findByText('שאלה סינתטית לבדיקה');
    await waitFor(() => expect(screen.getByRole('button', { name: 'עריכת שאלה' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'מחיקת שאלה' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('import: create/CSV forms are owner-only; a failed role lookup is treated as non-owner', async () => {
    fetchMyFeedbackRole.mockRejectedValue(new Error('offline'));
    render(<ImportQuestionsTab />);
    await waitFor(() => expect(screen.getByRole('note')).toHaveTextContent(NOT_OWNER_MESSAGE));
    expect(screen.queryByText('יצירת שאלה בודדת')).not.toBeInTheDocument();
    expect(screen.queryByText('ייבוא שאלות מ-CSV')).not.toBeInTheDocument();
    cleanup();
    fetchMyFeedbackRole.mockResolvedValue({ owner: true, author: true, approved: true });
    render(<ImportQuestionsTab />);
    await waitFor(() => expect(screen.getByText('יצירת שאלה בודדת')).toBeInTheDocument());
    expect(screen.getByText('ייבוא שאלות מ-CSV')).toBeInTheDocument();
  });
});
