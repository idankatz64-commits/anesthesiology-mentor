import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppBugDialog, ReportQuestionDialog } from '@/components/feedback';
import { submitFeedback } from '@/lib/feedbackRepository';

vi.mock('@/lib/feedbackRepository', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/feedbackRepository')>()), submitFeedback: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const send = () => screen.getByRole('button', { name: /^שליחה$/ });
const sending = () => screen.getByRole('button', { name: /^שולח/ });
const deferred = <T,>() => {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(r => setTimeout(r, 0));
const noOutcome = () => { expect(screen.queryByRole('status')).not.toBeInTheDocument(); expect(screen.queryByRole('alert')).not.toBeInTheDocument(); };

describe('ReportQuestionDialog', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(submitFeedback).mockResolvedValue({ id: 'f1', status: 'pending' }); });
  afterEach(cleanup);

  it('files a plain report for exactly the question on screen, with no replacement required', async () => {
    render(<ReportQuestionDialog open onOpenChange={() => {}} questionId="q-17" userId="u1" questionLabel="17" />);
    expect(screen.getByRole('dialog')).toHaveAttribute('dir', 'rtl');
    expect(send()).toBeDisabled();
    type(/מה הבעיה/, 'התשובה המסומנת לא נכונה');
    expect(send()).toBeEnabled();
    fireEvent.click(send());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/נשלח/));
    expect(submitFeedback).toHaveBeenCalledWith({ kind: 'question_report', questionId: 'q-17', issueText: 'התשובה המסומנת לא נכונה', target: null, proposedText: null, reference: '' });
  });

  it('requires a replacement and a source only in correction mode and sends target, replacement and reference', async () => {
    render(<ReportQuestionDialog open onOpenChange={() => {}} questionId="q-17" userId="u1" />);
    fireEvent.click(screen.getByLabelText(/הצעת תיקון/));
    type(/למה צריך תיקון/, 'ההסבר חסר');
    expect(send()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/מה לתקן/), { target: { value: 'explanation' } });
    type(/הנוסח המוצע/, 'הסבר מתוקן');
    expect(screen.getByLabelText(/מקור/)).toBeRequired();
    expect(send()).toBeDisabled(); // no source, no correction
    type(/מקור/, '   ');
    expect(send()).toBeDisabled();
    type(/מקור/, 'Miller 10e p. 100');
    expect(send()).toBeEnabled();
    fireEvent.click(send());
    await waitFor(() => expect(submitFeedback).toHaveBeenCalledWith(expect.objectContaining({ kind: 'correction', questionId: 'q-17', target: 'explanation', proposedText: 'הסבר מתוקן', reference: 'Miller 10e p. 100' })));
  });

  it('shows the server refusal in Hebrew and keeps the form editable', async () => {
    vi.mocked(submitFeedback).mockRejectedValueOnce(new Error('NOT_AUTHOR'));
    render(<ReportQuestionDialog open onOpenChange={() => {}} questionId="q-17" userId="u1" />);
    type(/מה הבעיה/, 'x');
    fireEvent.click(send());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/הרשאת כתיבה/));
    expect(send()).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('refuses to send without a question or a signed-in user', () => {
    const { unmount } = render(<ReportQuestionDialog open onOpenChange={() => {}} questionId={null} userId="u1" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/לא נבחרה שאלה/);
    type(/מה הבעיה/, 'x');
    expect(send()).toBeDisabled();
    unmount();
    render(<ReportQuestionDialog open onOpenChange={() => {}} questionId="q1" userId={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/להתחבר/);
    expect(send()).toBeDisabled();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it('drops a late answer for the previous question and lets the new question be reported cleanly', async () => {
    const q1 = deferred<{ id: string; status: 'pending' }>();
    vi.mocked(submitFeedback).mockReturnValueOnce(q1.promise);
    const { rerender } = render(<ReportQuestionDialog open onOpenChange={() => {}} questionId="q-1" userId="u1" />);
    type(/מה הבעיה/, 'בעיה בשאלה 1');
    fireEvent.click(send());
    expect(sending()).toBeDisabled();
    rerender(<ReportQuestionDialog open onOpenChange={() => {}} questionId="q-2" userId="u1" />);
    expect(screen.getByLabelText(/מה הבעיה/)).toHaveValue(''); // fresh form, not busy, nothing claimed
    expect(send()).toBeDisabled();
    q1.resolve({ id: 'f-old', status: 'pending' });
    await flush();
    noOutcome(); // the server may well have filed it, but that outcome does not belong to question 2
    type(/מה הבעיה/, 'בעיה בשאלה 2');
    fireEvent.click(send());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/נשלח/));
    expect(submitFeedback).toHaveBeenCalledTimes(2);
    expect(submitFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ questionId: 'q-2', issueText: 'בעיה בשאלה 2' }));
  });

  it('drops a late failure for the previous user or a closed dialog, and never double-submits', async () => {
    const first = deferred<{ id: string; status: 'pending' }>();
    vi.mocked(submitFeedback).mockReturnValueOnce(first.promise);
    const { rerender } = render(<ReportQuestionDialog open onOpenChange={() => {}} questionId="q-1" userId="u1" />);
    type(/מה הבעיה/, 'x');
    fireEvent.click(send());
    fireEvent.click(sending()); // disabled while in flight
    expect(submitFeedback).toHaveBeenCalledTimes(1);
    rerender(<ReportQuestionDialog open onOpenChange={() => {}} questionId="q-1" userId="u2" />);
    first.reject(new Error('NOT_AUTHOR'));
    await flush();
    noOutcome();
    expect(send()).toBeDisabled();
    const second = deferred<{ id: string; status: 'pending' }>();
    vi.mocked(submitFeedback).mockReturnValueOnce(second.promise);
    type(/מה הבעיה/, 'y');
    fireEvent.click(send());
    rerender(<ReportQuestionDialog open={false} onOpenChange={() => {}} questionId="q-1" userId="u2" />);
    rerender(<ReportQuestionDialog open onOpenChange={() => {}} questionId="q-1" userId="u2" />);
    second.resolve({ id: 'f-closed', status: 'pending' });
    await flush();
    noOutcome();
    expect(screen.getByLabelText(/מה הבעיה/)).toHaveValue('');
    expect(submitFeedback).toHaveBeenCalledTimes(2);
  });
});

describe('AppBugDialog', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(submitFeedback).mockResolvedValue({ id: 'f2', status: 'pending' }); });
  afterEach(cleanup);

  it('files an app bug with no question id and the page context, then shows success', async () => {
    render(<AppBugDialog open onOpenChange={() => {}} userId="u1" pageContext="stats" />);
    expect(send()).toBeDisabled();
    type(/תיאור התקלה/, 'הגרף לא נטען');
    fireEvent.click(send());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/נשלח/));
    expect(submitFeedback).toHaveBeenCalledWith({ kind: 'app_bug', questionId: null, issueText: 'הגרף לא נטען', pageContext: 'stats' });
  });

  it('surfaces a network failure visibly', async () => {
    vi.mocked(submitFeedback).mockRejectedValueOnce(new Error('FEEDBACK_UNAVAILABLE'));
    render(<AppBugDialog open onOpenChange={() => {}} userId="u1" />);
    type(/תיאור התקלה/, 'x');
    fireEvent.click(send());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/נסו שוב/));
  });

  it('drops a late answer after close/reopen, a page change or a user change, and still sends the new report', async () => {
    const stale = deferred<{ id: string; status: 'pending' }>();
    vi.mocked(submitFeedback).mockReturnValueOnce(stale.promise);
    const { rerender } = render(<AppBugDialog open onOpenChange={() => {}} userId="u1" pageContext="stats" />);
    type(/תיאור התקלה/, 'ישן');
    fireEvent.click(send());
    expect(sending()).toBeDisabled();
    rerender(<AppBugDialog open={false} onOpenChange={() => {}} userId="u1" pageContext="stats" />);
    rerender(<AppBugDialog open onOpenChange={() => {}} userId="u1" pageContext="stats" />);
    stale.resolve({ id: 'f-old', status: 'pending' });
    await flush();
    noOutcome();
    expect(screen.getByLabelText(/תיאור התקלה/)).toHaveValue('');
    const staleErr = deferred<{ id: string; status: 'pending' }>();
    vi.mocked(submitFeedback).mockReturnValueOnce(staleErr.promise);
    type(/תיאור התקלה/, 'עוד ישן');
    fireEvent.click(send());
    rerender(<AppBugDialog open onOpenChange={() => {}} userId="u2" pageContext="home" />);
    expect(screen.getByLabelText(/תיאור התקלה/)).toHaveValue(''); // private text of the previous user is gone
    staleErr.reject(new Error('FEEDBACK_UNAVAILABLE'));
    await flush();
    noOutcome();
    type(/תיאור התקלה/, 'חדש');
    fireEvent.click(send());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/נשלח/));
    expect(submitFeedback).toHaveBeenLastCalledWith({ kind: 'app_bug', questionId: null, issueText: 'חדש', pageContext: 'home' });
    expect(submitFeedback).toHaveBeenCalledTimes(3);
  });
});
