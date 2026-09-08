import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  approveFeedback, feedbackErrorMessage, fetchFeedbackQueue, fetchFeedbackReview, fetchMyFeedback, fetchMyFeedbackRole,
  fetchAuthorCandidates, resolveFeedback, rollbackVersion, setExplanationAuthor, submitFeedback, validateFeedbackInput,
} from '@/lib/feedbackRepository';

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: db.rpc } }));

const rawItem = {
  id: 'f1', kind: 'correction', question_id: 'q1', target: 'explanation', status: 'pending', submitted_by: 'u1', created_at: '2026-09-08T10:00:00Z',
  reviewed_by: null, reviewed_at: null, review_note: null, published_version_id: null, page_context: null, body_hidden: false,
  issue_text: 'חסר מנגנון', proposed_text: 'הסבר מתוקן', reference: 'Miller', stale: false, question_exists: true, question_ref_id: 'q1', question_source: 'בית חולים',
};

describe('feedback repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a simple question report with the exact question id and no replacement', async () => {
    db.rpc.mockResolvedValue({ data: { id: 'f9', status: 'pending' }, error: null });
    await expect(submitFeedback({ kind: 'question_report', questionId: 'q-42', issueText: ' התשובה שגויה ', reference: '' })).resolves.toEqual({ id: 'f9', status: 'pending' });
    expect(db.rpc).toHaveBeenCalledWith('feedback_submit', {
      _kind: 'question_report', _question_id: 'q-42', _target: null, _issue_text: 'התשובה שגויה', _proposed_text: null, _reference: null, _page_context: null,
    });
  });

  it('sends a correction with target, replacement and reference', async () => {
    db.rpc.mockResolvedValue({ data: { id: 'f9', status: 'pending' }, error: null });
    await submitFeedback({ kind: 'correction', questionId: 'q1', target: 'correct', issueText: 'המפתח שגוי', proposedText: 'b', reference: 'Miller 10e' });
    expect(db.rpc).toHaveBeenCalledWith('feedback_submit', expect.objectContaining({ _kind: 'correction', _question_id: 'q1', _target: 'correct', _proposed_text: 'b', _reference: 'Miller 10e' }));
  });

  it('sends an app bug with no question id and the page context', async () => {
    db.rpc.mockResolvedValue({ data: { id: 'f9', status: 'pending' }, error: null });
    await submitFeedback({ kind: 'app_bug', questionId: null, issueText: 'הכפתור תקוע', pageContext: '/stats' });
    expect(db.rpc).toHaveBeenCalledWith('feedback_submit', expect.objectContaining({ _kind: 'app_bug', _question_id: null, _page_context: '/stats' }));
  });

  it('refuses a correction without a replacement or a source before any round trip, but not a plain report', async () => {
    expect(validateFeedbackInput({ kind: 'correction', questionId: 'q1', target: 'explanation', issueText: 'x', proposedText: '  ', reference: 'Miller' })).toBe('INVALID_INPUT');
    expect(validateFeedbackInput({ kind: 'correction', questionId: 'q1', target: 'explanation', issueText: 'x', proposedText: 'y' })).toBe('INVALID_INPUT');
    expect(validateFeedbackInput({ kind: 'correction', questionId: 'q1', target: 'explanation', issueText: 'x', proposedText: 'y', reference: '   ' })).toBe('INVALID_INPUT');
    expect(validateFeedbackInput({ kind: 'correction', questionId: 'q1', target: 'explanation', issueText: 'x', proposedText: 'y', reference: ' Miller 10e ' })).toBeNull();
    await expect(submitFeedback({ kind: 'correction', questionId: 'q1', target: 'explanation', issueText: 'x', proposedText: 'y', reference: '' })).rejects.toThrow('INVALID_INPUT');
    expect(db.rpc).not.toHaveBeenCalled();
    expect(validateFeedbackInput({ kind: 'question_report', questionId: 'q1', issueText: 'x' })).toBeNull();
    expect(validateFeedbackInput({ kind: 'question_report', questionId: null, issueText: 'x' })).toBe('INVALID_INPUT');
    await expect(submitFeedback({ kind: 'correction', questionId: 'q1', target: 'explanation', issueText: 'x', proposedText: '' })).rejects.toThrow('INVALID_INPUT');
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('maps server refusals to codes and Hebrew, including the owner and stale-base cases', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'NOT_OWNER' } });
    await expect(fetchFeedbackQueue('pending')).rejects.toThrow('NOT_OWNER');
    db.rpc.mockResolvedValue({ data: null, error: { message: 'STALE_BASE' } });
    await expect(approveFeedback('f1', 'abc', null)).rejects.toThrow('STALE_BASE');
    db.rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchMyFeedback()).rejects.toThrow('FEEDBACK_UNAVAILABLE');
    expect(feedbackErrorMessage(new Error('NOT_OWNER'))).toMatch(/עידן/);
    expect(feedbackErrorMessage(new Error('STALE_BASE'))).toMatch(/השתנה/);
    expect(feedbackErrorMessage(new Error('NOT_AUTHOR'))).toMatch(/הרשאת כתיבה/);
    expect(feedbackErrorMessage(new Error('NOT_ENTITLED'))).toMatch(/הרשאה/);
    expect(feedbackErrorMessage(new Error('FEEDBACK_UNAVAILABLE'))).toMatch(/נסו שוב/);
  });

  it('maps queue and review rows, keeping hidden bodies null', async () => {
    db.rpc.mockResolvedValue({ data: [rawItem, { ...rawItem, id: 'f2', body_hidden: true, issue_text: null, proposed_text: null, stale: true }], error: null });
    const queue = await fetchFeedbackQueue(null);
    expect(db.rpc).toHaveBeenCalledWith('feedback_queue', { _status: null });
    expect(queue[0]).toMatchObject({ id: 'f1', questionId: 'q1', target: 'explanation', issueText: 'חסר מנגנון', proposedText: 'הסבר מתוקן', stale: false, bodyHidden: false });
    expect(queue[1]).toMatchObject({ id: 'f2', bodyHidden: true, issueText: null, proposedText: null, stale: true });
    db.rpc.mockResolvedValue({ data: { ...rawItem, question_text: 'שאלה', option_a: 'א', option_b: 'ב', option_c: 'ג', option_d: 'ד', current_key: 'B', explanation_text: 'ההסבר החי', question_topic: 'נשימה', question_chapter: 12, question_miller: '10e', question_year: '2023', question_kind: 'past', question_media_type: 'image', question_media_link: 'https://example.invalid/1.png', current_text: 'ההסבר החי', current_target_hash: 't1', current_hash: 'h1' }, error: null });
    await expect(fetchFeedbackReview('f1')).resolves.toMatchObject({ currentText: 'ההסבר החי', currentTargetHash: 't1', currentHash: 'h1', questionText: 'שאלה', optionA: 'א', optionD: 'ד', currentKey: 'B', explanationText: 'ההסבר החי', questionTopic: 'נשימה', questionChapter: 12, questionMiller: '10e', questionYear: '2023', questionKind: 'past', questionMediaType: 'image', questionMediaLink: 'https://example.invalid/1.png' });
  });

  it('approves with the reviewed hash, resolves without touching content, and grants through the RPC only', async () => {
    db.rpc.mockResolvedValue({ data: { id: 'f1', status: 'approved', version_id: 'v1' }, error: null });
    await expect(approveFeedback('f1', 'h1', ' ok ')).resolves.toEqual({ id: 'f1', versionId: 'v1' });
    expect(db.rpc).toHaveBeenCalledWith('feedback_approve', { _id: 'f1', _expected_base_hash: 'h1', _note: 'ok' });
    await resolveFeedback('f2', 'rejected', null);
    expect(db.rpc).toHaveBeenCalledWith('feedback_resolve', { _id: 'f2', _status: 'rejected', _note: null });
    await rollbackVersion('v1', 'whole-hash', ' חזרה ');
    expect(db.rpc).toHaveBeenCalledWith('feedback_rollback', { _version_id: 'v1', _expected_hash: 'whole-hash', _note: 'חזרה' });
    db.rpc.mockResolvedValue({ data: { user_id: 'u2', author: true }, error: null });
    await expect(setExplanationAuthor('u2', true, null)).resolves.toEqual({ userId: 'u2', author: true });
    expect(db.rpc).toHaveBeenCalledWith('feedback_set_author', { _user_id: 'u2', _enabled: true, _note: null });
    db.rpc.mockResolvedValue({ data: { owner: false, author: true, approved: true }, error: null });
    await expect(fetchMyFeedbackRole()).resolves.toEqual({ owner: false, author: true, approved: true });
  });

  it('lists author candidates through the owner-only RPC and keeps only the picker fields', async () => {
    db.rpc.mockResolvedValueOnce({ data: [{ user_id: 'u9', email: 'r@example.com', name: null, author: false, note: null, extra: 'dropped' }], error: null });
    await expect(fetchAuthorCandidates('  r ')).resolves.toEqual([{ userId: 'u9', email: 'r@example.com', name: null, author: false, note: null }]);
    expect(db.rpc).toHaveBeenCalledWith('feedback_author_candidates', { _search: 'r' });
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'NOT_OWNER' } });
    await expect(fetchAuthorCandidates(null)).rejects.toThrow('NOT_OWNER');
  });
});
