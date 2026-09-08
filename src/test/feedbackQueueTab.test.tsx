import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FeedbackQueueTab from '@/components/admin/FeedbackQueueTab';
import {
  approveFeedback, fetchAuthorCandidates, fetchFeedbackQueue, fetchFeedbackReview, fetchMyFeedbackRole, resolveFeedback, setExplanationAuthor,
  type FeedbackQueueItem, type FeedbackReview,
} from '@/lib/feedbackRepository';

vi.mock('@/lib/feedbackRepository', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/feedbackRepository')>()),
  fetchMyFeedbackRole: vi.fn(), fetchFeedbackQueue: vi.fn(), fetchFeedbackReview: vi.fn(), approveFeedback: vi.fn(), resolveFeedback: vi.fn(),
  fetchAuthorCandidates: vi.fn(), setExplanationAuthor: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const item = (over: Partial<FeedbackQueueItem> = {}): FeedbackQueueItem => ({
  id: 'f1', kind: 'correction', questionId: 'q1', target: 'explanation', status: 'pending', submittedBy: 'aaaaaaaa-0000-0000-0000-000000000000',
  createdAt: '2026-09-08T10:00:00Z', reviewedBy: null, reviewedAt: null, reviewNote: null, publishedVersionId: null, pageContext: null,
  bodyHidden: false, issueText: 'חסר מנגנון', proposedText: 'הסבר מתוקן', reference: 'Miller', stale: false, questionExists: true, questionRefId: '17', questionSource: 'בית חולים', ...over,
});
const review = (over: Partial<FeedbackReview> = {}): FeedbackReview => ({
  ...item(), questionText: 'שאלה 17', optionA: 'אופציה א', optionB: 'אופציה ב', optionC: 'אופציה ג', optionD: 'אופציה ד', currentKey: 'B',
  explanationText: 'הסבר חי מלא', questionTopic: 'נשימה', questionChapter: 12, questionMiller: '10e', questionYear: '2023', questionKind: 'past', questionMediaType: 'image', questionMediaLink: 'https://example.invalid/17.png', currentText: 'ההסבר הישן', currentTargetHash: 'target-hash', currentHash: 'hash-live', ...over,
});
const rowOf = (ref: string) => screen.getByText(ref).closest('tr')!;
const panel = () => screen.getByRole('region', { name: 'בדיקת דיווח' });
const deferred = <T,>() => {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flush = () => new Promise(r => setTimeout(r, 0));

describe('FeedbackQueueTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchMyFeedbackRole).mockResolvedValue({ owner: true, author: false, approved: true });
    vi.mocked(fetchFeedbackQueue).mockResolvedValue([item(), item({ id: 'f2', questionRefId: '18', stale: true, issueText: 'ישן' }), item({ id: 'f3', kind: 'question_report', target: null, proposedText: null, questionRefId: '19', issueText: 'דיווח' })]);
    vi.mocked(fetchFeedbackReview).mockImplementation(async (id) => review({ id, stale: id === 'f2', kind: id === 'f3' ? 'question_report' : 'correction', target: id === 'f3' ? null : 'explanation' }));
    vi.mocked(fetchAuthorCandidates).mockResolvedValue([
      { userId: 'bbbbbbbb-0000-0000-0000-000000000000', email: 'dana@example.com', name: 'דנה כהן', author: true, note: null },
      { userId: 'cccccccc-0000-0000-0000-000000000000', email: 'yossi@example.com', name: null, author: false, note: null },
    ]);
    vi.mocked(approveFeedback).mockResolvedValue({ id: 'f1', versionId: 'v1' });
    vi.mocked(resolveFeedback).mockResolvedValue(undefined);
    vi.mocked(setExplanationAuthor).mockResolvedValue({ userId: 'x', author: true });
  });
  afterEach(cleanup);

  it('is closed to anyone who is not the owner, even an admin', async () => {
    vi.mocked(fetchMyFeedbackRole).mockResolvedValue({ owner: false, author: false, approved: true });
    render(<FeedbackQueueTab userId="owner-1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/עידן בלבד/));
    expect(fetchFeedbackQueue).not.toHaveBeenCalled();
  });

  it('shows the pending queue with exact review content and approves with the live hash', async () => {
    render(<FeedbackQueueTab userId="owner-1" />);
    await waitFor(() => expect(rowOf('17')).toBeInTheDocument());
    expect(fetchFeedbackQueue).toHaveBeenCalledWith('pending');
    expect(within(rowOf('18')).getByText(/בסיס השתנה/)).toBeInTheDocument();
    fireEvent.click(within(rowOf('17')).getByRole('button', { name: 'בדיקה' }));
    const panel = await waitFor(() => screen.getByRole('region', { name: 'בדיקת דיווח' }));
    expect(within(panel).getByText('ההסבר הישן')).toBeInTheDocument();
    expect(within(panel).getByText('הסבר מתוקן')).toBeInTheDocument();
    expect(within(panel).getByText('שאלה 17')).toBeInTheDocument();
    // the whole live question is on screen, because approval is bound to a hash of all of it
    expect(within(panel).getByText(/אופציה א/)).toBeInTheDocument();
    expect(within(panel).getByText(/אופציה ב.*✓/)).toBeInTheDocument();
    expect(within(panel).getByText('B')).toBeInTheDocument();
    expect(within(panel).getByText('הסבר חי מלא')).toBeInTheDocument();
    expect(within(panel).getByLabelText('הקשר השאלה')).toHaveTextContent('מזהה: 17 · מקור: בית חולים · נושא: נשימה · פרק: 12 · מילר: 10e · שנה: 2023 · סוג: past · מדיה: image · קישור מדיה: https://example.invalid/17.png');
    fireEvent.change(within(panel).getByLabelText(/הערה/), { target: { value: 'מאושר' } });
    fireEvent.click(within(panel).getByRole('button', { name: /אישור ופרסום/ }));
    await waitFor(() => expect(approveFeedback).toHaveBeenCalledWith('f1', 'hash-live', 'מאושר'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(fetchFeedbackQueue).toHaveBeenCalledTimes(2);
  });

  it('disables approval for a stale proposal and for a plain report, but still allows handled/rejected', async () => {
    render(<FeedbackQueueTab userId="owner-1" />);
    await waitFor(() => expect(rowOf('18')).toBeInTheDocument());
    fireEvent.click(within(rowOf('18')).getByRole('button', { name: 'בדיקה' }));
    let panel = await waitFor(() => screen.getByRole('region', { name: 'בדיקת דיווח' }));
    expect(within(panel).getByRole('button', { name: /אישור ופרסום/ })).toBeDisabled();
    expect(within(panel).getByRole('alert')).toHaveTextContent(/הבסיס השתנה/);
    fireEvent.click(within(panel).getByRole('button', { name: 'דחייה' }));
    await waitFor(() => expect(resolveFeedback).toHaveBeenCalledWith('f2', 'rejected', ''));
    fireEvent.click(within(rowOf('19')).getByRole('button', { name: 'בדיקה' }));
    panel = await waitFor(() => screen.getByRole('region', { name: 'בדיקת דיווח' }));
    expect(within(panel).queryByRole('button', { name: /אישור ופרסום/ })).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'טופל' }));
    await waitFor(() => expect(resolveFeedback).toHaveBeenCalledWith('f3', 'handled', ''));
    expect(approveFeedback).not.toHaveBeenCalled();
  });

  it('shows a server conflict on approve and refreshes the base', async () => {
    vi.mocked(approveFeedback).mockRejectedValueOnce(new Error('STALE_BASE'));
    render(<FeedbackQueueTab userId="owner-1" />);
    await waitFor(() => expect(rowOf('17')).toBeInTheDocument());
    fireEvent.click(within(rowOf('17')).getByRole('button', { name: 'בדיקה' }));
    const panel = await waitFor(() => screen.getByRole('region', { name: 'בדיקת דיווח' }));
    fireEvent.click(within(panel).getByRole('button', { name: /אישור ופרסום/ }));
    await waitFor(() => expect(within(panel).getByRole('alert')).toHaveTextContent(/השתנה/));
    expect(fetchFeedbackReview).toHaveBeenCalledTimes(2);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('switches status tabs and grants/revokes explanation authors from the resident picker, never from a typed id', async () => {
    render(<FeedbackQueueTab userId="owner-1" />);
    await waitFor(() => expect(rowOf('17')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'נדחה' }));
    await waitFor(() => expect(fetchFeedbackQueue).toHaveBeenCalledWith('rejected'));
    const authors = await waitFor(() => screen.getByRole('region', { name: 'הרשאות כתיבת הסברים' }));
    await waitFor(() => expect(within(authors).getByText('דנה כהן')).toBeInTheDocument());
    expect(fetchAuthorCandidates).toHaveBeenCalledWith('');
    expect(within(authors).queryByLabelText(/UUID/)).not.toBeInTheDocument();
    expect(within(authors).queryByText(/bbbbbbbb/)).not.toBeInTheDocument();
    const dana = within(authors).getByRole('switch', { name: 'הרשאת כתיבה עבור דנה כהן' });
    expect(dana).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(dana);
    await waitFor(() => expect(setExplanationAuthor).toHaveBeenCalledWith('bbbbbbbb-0000-0000-0000-000000000000', false, ''));
    const yossi = within(authors).getByRole('switch', { name: 'הרשאת כתיבה עבור yossi@example.com' });
    expect(yossi).toHaveAttribute('aria-checked', 'false');
    fireEvent.change(within(authors).getByLabelText(/הערה/), { target: { value: 'מתמחה שנה ג' } });
    fireEvent.click(yossi);
    await waitFor(() => expect(setExplanationAuthor).toHaveBeenCalledWith('cccccccc-0000-0000-0000-000000000000', true, 'מתמחה שנה ג'));
    fireEvent.change(within(authors).getByLabelText(/חיפוש/), { target: { value: 'yossi' } });
    fireEvent.click(within(authors).getByRole('button', { name: 'חיפוש' }));
    await waitFor(() => expect(fetchAuthorCandidates).toHaveBeenCalledWith('yossi'));
    vi.mocked(setExplanationAuthor).mockRejectedValueOnce(new Error('TARGET_NOT_APPROVED'));
    fireEvent.click(within(authors).getByRole('switch', { name: 'הרשאת כתיבה עבור yossi@example.com' }));
    await waitFor(() => expect(within(authors).getByRole('alert')).toHaveTextContent(/מאושר/));
  });

  it('never lets a slower old search (result or error) replace the newer search in the picker', async () => {
    type Cands = Awaited<ReturnType<typeof fetchAuthorCandidates>>;
    const dana = { userId: 'bbbbbbbb-0000-0000-0000-000000000000', email: 'dana@example.com', name: 'דנה כהן', author: true, note: null };
    const yossi = { userId: 'cccccccc-0000-0000-0000-000000000000', email: 'yossi@example.com', name: null, author: false, note: null };
    render(<FeedbackQueueTab userId="owner-1" />);
    const authors = await waitFor(() => screen.getByRole('region', { name: 'הרשאות כתיבת הסברים' }));
    await waitFor(() => expect(within(authors).getByText('דנה כהן')).toBeInTheDocument());
    const search = (term: string) => { fireEvent.change(within(authors).getByLabelText(/חיפוש/), { target: { value: term } }); fireEvent.click(within(authors).getByRole('button', { name: 'חיפוש' })); };
    const slow = deferred<Cands>(); const fast = deferred<Cands>();
    vi.mocked(fetchAuthorCandidates).mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    search('dan'); search('yos');
    expect(within(authors).getByRole('status')).toHaveTextContent(/מחפש/);
    fast.resolve([yossi]);
    await waitFor(() => expect(within(authors).getByRole('switch', { name: 'הרשאת כתיבה עבור yossi@example.com' })).toBeInTheDocument());
    expect(within(authors).queryByText('דנה כהן')).not.toBeInTheDocument();
    expect(within(authors).queryByRole('status')).not.toBeInTheDocument();
    slow.resolve([dana]);
    await flush();
    expect(within(authors).queryByText('דנה כהן')).not.toBeInTheDocument(); // the old 'dan' answer never lands on the 'yos' screen
    expect(within(authors).getByRole('switch', { name: 'הרשאת כתיבה עבור yossi@example.com' })).toBeInTheDocument();
    const slowErr = deferred<Cands>(); const fast2 = deferred<Cands>();
    vi.mocked(fetchAuthorCandidates).mockReturnValueOnce(slowErr.promise).mockReturnValueOnce(fast2.promise);
    search('a'); search('b');
    fast2.resolve([dana]);
    await waitFor(() => expect(within(authors).getByText('דנה כהן')).toBeInTheDocument());
    slowErr.reject(new Error('FEEDBACK_UNAVAILABLE'));
    await flush();
    expect(within(authors).queryByRole('alert')).not.toBeInTheDocument(); // the old search's failure cannot blank or flag the current list
    expect(within(authors).queryByRole('status')).not.toBeInTheDocument();
    expect(within(authors).getByText('דנה כהן')).toBeInTheDocument();
  });

  it('drops a late grant completion after an identity switch or sign-out: no toast naming the candidate, no reload', async () => {
    const grant = deferred<{ userId: string; author: boolean }>();
    vi.mocked(setExplanationAuthor).mockReturnValueOnce(grant.promise);
    const { rerender } = render(<FeedbackQueueTab userId="owner-1" />);
    const authors = await waitFor(() => screen.getByRole('region', { name: 'הרשאות כתיבת הסברים' }));
    await waitFor(() => expect(within(authors).getByText('דנה כהן')).toBeInTheDocument());
    fireEvent.click(within(authors).getByRole('switch', { name: 'הרשאת כתיבה עבור דנה כהן' }));
    expect(setExplanationAuthor).toHaveBeenCalledTimes(1);
    vi.mocked(fetchMyFeedbackRole).mockResolvedValue({ owner: false, author: false, approved: true });
    rerender(<FeedbackQueueTab userId="resident-2" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    grant.resolve({ userId: 'bbbbbbbb-0000-0000-0000-000000000000', author: false });
    await flush();
    expect(toast.success).not.toHaveBeenCalled();
    expect(fetchAuthorCandidates).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('דנה כהן')).not.toBeInTheDocument();
    // sign-out while a grant is pending
    const grant2 = deferred<{ userId: string; author: boolean }>();
    vi.mocked(setExplanationAuthor).mockReturnValueOnce(grant2.promise);
    vi.mocked(fetchMyFeedbackRole).mockResolvedValue({ owner: true, author: false, approved: true });
    rerender(<FeedbackQueueTab userId="owner-1" />);
    const again = await waitFor(() => screen.getByRole('region', { name: 'הרשאות כתיבת הסברים' }));
    await waitFor(() => expect(within(again).getByText('דנה כהן')).toBeInTheDocument());
    fireEvent.click(within(again).getByRole('switch', { name: 'הרשאת כתיבה עבור דנה כהן' }));
    rerender(<FeedbackQueueTab userId={null} />);
    grant2.reject(new Error('FEEDBACK_UNAVAILABLE'));
    await flush();
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/לעידן בלבד/); // signed-out refusal view
    expect(screen.queryByText(/נסו שוב/)).not.toBeInTheDocument();
    expect(fetchAuthorCandidates).toHaveBeenCalledTimes(2);
  });

  it('shows the picker failure instead of an empty silent list', async () => {
    vi.mocked(fetchAuthorCandidates).mockRejectedValueOnce(new Error('FEEDBACK_UNAVAILABLE'));
    render(<FeedbackQueueTab userId="owner-1" />);
    const authors = await waitFor(() => screen.getByRole('region', { name: 'הרשאות כתיבת הסברים' }));
    await waitFor(() => expect(within(authors).getByRole('alert')).toHaveTextContent(/נסו שוב/));
  });

  it('collapses to the refusal view when the server says NOT_OWNER mid-session (revocation), whichever call says it', async () => {
    vi.mocked(approveFeedback).mockRejectedValueOnce(new Error('NOT_OWNER'));
    const { unmount } = render(<FeedbackQueueTab userId="owner-1" />);
    await waitFor(() => expect(rowOf('17')).toBeInTheDocument());
    fireEvent.click(within(rowOf('17')).getByRole('button', { name: 'בדיקה' }));
    await waitFor(() => panel());
    fireEvent.click(within(panel()).getByRole('button', { name: /אישור ופרסום/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/עידן בלבד/));
    expect(screen.queryByText('17')).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    unmount();
    vi.mocked(fetchAuthorCandidates).mockRejectedValueOnce(new Error('NOT_OWNER'));
    render(<FeedbackQueueTab userId="owner-1" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/עידן בלבד/));
    expect(screen.queryByText('17')).not.toBeInTheDocument();
  });

  it('is signed-out safe: no identity means no role call and the refusal view', async () => {
    render(<FeedbackQueueTab userId={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/עידן בלבד/);
    expect(fetchMyFeedbackRole).not.toHaveBeenCalled();
    expect(fetchFeedbackQueue).not.toHaveBeenCalled();
  });

  it('drops everything the moment the identity changes and ignores the old identity\'s late queue and review answers', async () => {
    const lateQueue = deferred<FeedbackQueueItem[]>();
    const lateReview = deferred<FeedbackReview>();
    const { rerender } = render(<FeedbackQueueTab userId="owner-1" />);
    await waitFor(() => expect(rowOf('17')).toBeInTheDocument());
    vi.mocked(fetchFeedbackReview).mockReturnValueOnce(lateReview.promise);
    fireEvent.click(within(rowOf('17')).getByRole('button', { name: 'בדיקה' }));
    await waitFor(() => expect(fetchFeedbackReview).toHaveBeenCalledWith('f1'));
    vi.mocked(fetchFeedbackQueue).mockReturnValueOnce(lateQueue.promise);
    fireEvent.click(screen.getByRole('button', { name: 'רענון' }));
    await waitFor(() => expect(fetchFeedbackQueue).toHaveBeenCalledTimes(2));
    // the owner signs out and a resident signs in on the same device
    const residentRole = deferred<{ owner: boolean; author: boolean; approved: boolean }>();
    vi.mocked(fetchMyFeedbackRole).mockReturnValueOnce(residentRole.promise);
    rerender(<FeedbackQueueTab userId="resident-2" />);
    expect(screen.getByRole('status')).toHaveTextContent(/בודק הרשאות/); // synchronously: nothing of the owner's screen is left
    expect(screen.queryByText('17')).not.toBeInTheDocument();
    expect(screen.queryByText('חסר מנגנון')).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    lateQueue.resolve([item({ id: 'f9', questionRefId: '77', issueText: 'גוף ישן' })]);
    lateReview.resolve(review({ proposedText: 'הצעה פרטית' }));
    await flush();
    expect(screen.queryByText('77')).not.toBeInTheDocument();
    expect(screen.queryByText('גוף ישן')).not.toBeInTheDocument();
    expect(screen.queryByText('הצעה פרטית')).not.toBeInTheDocument();
    residentRole.resolve({ owner: false, author: true, approved: true });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/עידן בלבד/));
    expect(fetchMyFeedbackRole).toHaveBeenCalledTimes(2);
    expect(fetchFeedbackQueue).toHaveBeenCalledTimes(2); // nothing fetched for the resident
  });

  it('never lets a slower fetch of the previous status tab replace the active tab\'s items', async () => {
    const slowPending = deferred<FeedbackQueueItem[]>();
    vi.mocked(fetchFeedbackQueue).mockImplementation(async status => status === 'pending' ? slowPending.promise : [item({ id: 'h1', status: 'handled', questionRefId: '99', issueText: 'טופל מזמן' })]);
    render(<FeedbackQueueTab userId="owner-1" />);
    await waitFor(() => expect(fetchFeedbackQueue).toHaveBeenCalledWith('pending'));
    fireEvent.click(screen.getByRole('tab', { name: 'טופל' }));
    await waitFor(() => expect(rowOf('99')).toBeInTheDocument());
    slowPending.resolve([item(), item({ id: 'f2', questionRefId: '18' })]);
    await flush();
    expect(rowOf('99')).toBeInTheDocument();
    expect(screen.queryByText('17')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'ממתין' })); // a fresh, legitimate load of that tab still works
    await waitFor(() => expect(rowOf('17')).toBeInTheDocument());
    expect(screen.queryByText('99')).not.toBeInTheDocument();
  });

  it('never lets a slower load of a previously selected review replace the current one, and a finished action closes only its own review', async () => {
    const slowF1 = deferred<FeedbackReview>();
    vi.mocked(fetchFeedbackReview).mockImplementation(async id => id === 'f1' ? slowF1.promise : review({ id: 'f2', questionText: 'שאלה 18', proposedText: 'הצעה 18' }));
    render(<FeedbackQueueTab userId="owner-1" />);
    await waitFor(() => expect(rowOf('17')).toBeInTheDocument());
    fireEvent.click(within(rowOf('17')).getByRole('button', { name: 'בדיקה' }));
    expect(screen.getByRole('status')).toHaveTextContent(/טוען את תוכן הבדיקה/);
    fireEvent.click(within(rowOf('18')).getByRole('button', { name: 'בדיקה' }));
    await waitFor(() => expect(within(panel()).getByText('שאלה 18')).toBeInTheDocument());
    slowF1.resolve(review({ questionText: 'שאלה 17 מאוחרת', proposedText: 'הצעה 17' }));
    await flush();
    expect(within(panel()).getByText('שאלה 18')).toBeInTheDocument();
    expect(screen.queryByText('שאלה 17 מאוחרת')).not.toBeInTheDocument();
    expect(screen.queryByText('הצעה 17')).not.toBeInTheDocument();
    // an action started on 18, then the owner opens 17 before it finishes: 17 stays open, the list refreshes
    const slowResolve = deferred<void>();
    vi.mocked(resolveFeedback).mockReturnValueOnce(slowResolve.promise);
    fireEvent.click(within(panel()).getByRole('button', { name: 'טופל' }));
    await waitFor(() => expect(resolveFeedback).toHaveBeenCalledWith('f2', 'handled', ''));
    fireEvent.click(within(rowOf('17')).getByRole('button', { name: 'בדיקה' }));
    await waitFor(() => expect(within(panel()).getByText('שאלה 17 מאוחרת')).toBeInTheDocument());
    slowResolve.resolve();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('סומן כטופל'));
    await waitFor(() => expect(fetchFeedbackQueue).toHaveBeenCalledTimes(2));
    expect(within(panel()).getByText('שאלה 17 מאוחרת')).toBeInTheDocument();
  });
});
