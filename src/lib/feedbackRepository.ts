// Client wrappers for the feedback + editorial-approval RPCs
// (migration 20260908000001). The server owns entitlement, the owner check,
// the base-version binding and every publication; this file only maps shapes
// and error codes. It never touches questions, feedback_items or the grant
// tables directly.
import { supabase } from '@/integrations/supabase/client';

export type FeedbackKind = 'app_bug' | 'question_report' | 'correction';
export type FeedbackTarget = 'question' | 'a' | 'b' | 'c' | 'd' | 'correct' | 'explanation';
export type FeedbackStatus = 'pending' | 'approved' | 'handled' | 'rejected';
export const FEEDBACK_TARGETS: readonly FeedbackTarget[] = ['question', 'a', 'b', 'c', 'd', 'correct', 'explanation'];
export const FEEDBACK_STATUSES: readonly FeedbackStatus[] = ['pending', 'approved', 'handled', 'rejected'];

export type FeedbackRole = { owner: boolean; author: boolean; approved: boolean };
export type FeedbackItem = {
  id: string; kind: FeedbackKind; questionId: string | null; target: FeedbackTarget | null; status: FeedbackStatus;
  submittedBy: string; createdAt: string; reviewedBy: string | null; reviewedAt: string | null; reviewNote: string | null;
  publishedVersionId: string | null; pageContext: string | null;
  /** True when the caller may no longer read the question's source; bodies are then null. */
  bodyHidden: boolean; issueText: string | null; proposedText: string | null; reference: string | null;
};
export type FeedbackQueueItem = FeedbackItem & { stale: boolean; questionExists: boolean; questionRefId: string | null; questionSource: string | null };
export type FeedbackReview = FeedbackQueueItem & {
  /** The whole live question (stem, options, key, explanation): approval is bound to all of it, so the owner must see all of it. */
  questionText: string | null; optionA: string | null; optionB: string | null; optionC: string | null; optionD: string | null;
  currentKey: string | null; explanationText: string | null;
  /** Live text of the target column right now and its own hash (history only). */
  currentText: string | null; currentTargetHash: string | null;
  /** Provenance/media fields that are part of the hashed record (durable-snapshot shape); shown so the owner reviews what is bound. */
  questionTopic: string | null; questionChapter: number | null; questionMiller: string | null; questionYear: string | null;
  questionKind: string | null; questionMediaType: string | null; questionMediaLink: string | null;
  /** Hash of the whole live question record; send it back on approve/rollback. Null when the question is gone. */
  currentHash: string | null;
};
export type ContentVersion = {
  id: string; questionId: string; target: FeedbackTarget; oldText: string | null; newText: string | null; oldHash: string; newHash: string;
  /** Whole-question hashes just before and just after this publication. */
  baseQuestionHash: string; questionHash: string;
  feedbackId: string | null; rollbackOf: string | null; authorId: string | null; reviewerId: string; publishedAt: string;
};
export type ExplanationAuthor = { userId: string; grantedBy: string; grantedAt: string; revokedBy: string | null; revokedAt: string | null; note: string | null; active: boolean };
export type SubmitFeedbackInput = {
  kind: FeedbackKind; questionId: string | null; target?: FeedbackTarget | null; issueText: string;
  proposedText?: string | null; reference?: string | null; pageContext?: string | null;
};

export const FEEDBACK_ERROR_CODES = [
  'NOT_AUTHENTICATED', 'NOT_APPROVED', 'NOT_ENTITLED', 'NOT_OWNER', 'NOT_AUTHOR', 'INVALID_INPUT', 'RATE_LIMITED',
  'QUESTION_NOT_FOUND', 'FEEDBACK_NOT_FOUND', 'NOT_PENDING', 'NOT_PUBLISHABLE', 'STALE_BASE', 'VERSION_NOT_FOUND', 'NOT_LATEST', 'TARGET_NOT_APPROVED',
] as const;
const HEBREW: Record<string, string> = {
  NOT_AUTHENTICATED: 'יש להתחבר מחדש כדי להמשיך.',
  NOT_APPROVED: 'החשבון עדיין לא אושר לשימוש באפליקציה.',
  NOT_ENTITLED: 'אין לך הרשאה לשאלה הזו, ולכן אי אפשר לדווח עליה.',
  NOT_OWNER: 'הפעולה הזו שמורה לעידן בלבד.',
  NOT_AUTHOR: 'הוספת הסבר חסר דורשת הרשאת כתיבה מעידן. אפשר עדיין לדווח על הבעיה.',
  INVALID_INPUT: 'הנתונים שהוזנו אינם תקינים.',
  RATE_LIMITED: 'נשלחו יותר מדי דיווחים בשעה האחרונה. נסו שוב מאוחר יותר.',
  QUESTION_NOT_FOUND: 'השאלה לא נמצאה במאגר.',
  FEEDBACK_NOT_FOUND: 'הדיווח לא נמצא.',
  NOT_PENDING: 'הדיווח כבר טופל.',
  NOT_PUBLISHABLE: 'רק הצעת תיקון אפשר לפרסם. דיווח רגיל מסמנים כטופל.',
  STALE_BASE: 'התוכן השתנה מאז שההצעה נכתבה. יש לבקש הצעה חדשה על הגרסה הנוכחית.',
  VERSION_NOT_FOUND: 'הגרסה לא נמצאה.',
  NOT_LATEST: 'אפשר להחזיר רק את הגרסה האחרונה שפורסמה.',
  TARGET_NOT_APPROVED: 'אפשר להעניק הרשאת כתיבה רק למשתמש מאושר.',
};
export const feedbackErrorMessage = (error: unknown): string =>
  HEBREW[error instanceof Error ? error.message : ''] ?? 'הפעולה לא הושלמה בשרת. בדקו את החיבור ונסו שוב.';

const toError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  const code = FEEDBACK_ERROR_CODES.find(c => message.includes(c));
  return new Error(code ?? 'FEEDBACK_UNAVAILABLE');
};

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(name, args);
    if (error) throw error;
    return data as T;
  } catch (error) {
    throw toError(error);
  }
}

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const toItem = (r: Raw): FeedbackItem => ({
  id: String(r.id), kind: r.kind as FeedbackKind, questionId: str(r.question_id), target: (str(r.target) as FeedbackTarget | null),
  status: r.status as FeedbackStatus, submittedBy: String(r.submitted_by), createdAt: String(r.created_at), reviewedBy: str(r.reviewed_by),
  reviewedAt: str(r.reviewed_at), reviewNote: str(r.review_note), publishedVersionId: str(r.published_version_id), pageContext: str(r.page_context),
  bodyHidden: r.body_hidden === true, issueText: str(r.issue_text), proposedText: str(r.proposed_text), reference: str(r.reference),
});
const toQueueItem = (r: Raw): FeedbackQueueItem => ({
  ...toItem(r), stale: r.stale === true, questionExists: r.question_exists === true, questionRefId: str(r.question_ref_id), questionSource: str(r.question_source),
});
const toReview = (r: Raw): FeedbackReview => ({
  ...toQueueItem(r), questionText: str(r.question_text), optionA: str(r.option_a), optionB: str(r.option_b), optionC: str(r.option_c), optionD: str(r.option_d),
  currentKey: str(r.current_key), explanationText: str(r.explanation_text),
  questionTopic: str(r.question_topic), questionChapter: typeof r.question_chapter === 'number' ? r.question_chapter : null,
  questionMiller: str(r.question_miller), questionYear: str(r.question_year), questionKind: str(r.question_kind),
  questionMediaType: str(r.question_media_type), questionMediaLink: str(r.question_media_link),
  currentText: str(r.current_text), currentTargetHash: str(r.current_target_hash), currentHash: str(r.current_hash),
});
const toVersion = (r: Raw): ContentVersion => ({
  id: String(r.id), questionId: String(r.question_id), target: r.target as FeedbackTarget, oldText: str(r.old_text), newText: str(r.new_text),
  oldHash: String(r.old_hash), newHash: String(r.new_hash), baseQuestionHash: String(r.base_question_hash), questionHash: String(r.question_hash),
  feedbackId: str(r.feedback_id), rollbackOf: str(r.rollback_of),
  authorId: str(r.author_id), reviewerId: String(r.reviewer_id), publishedAt: String(r.published_at),
});
const toAuthor = (r: Raw): ExplanationAuthor => ({
  userId: String(r.user_id), grantedBy: String(r.granted_by), grantedAt: String(r.granted_at), revokedBy: str(r.revoked_by),
  revokedAt: str(r.revoked_at), note: str(r.note), active: r.active === true,
});

// ---- resident side -----------------------------------------------------------
export const fetchMyFeedbackRole = async (): Promise<FeedbackRole> => {
  const r = await rpc<Raw>('feedback_my_role', {});
  return { owner: r?.owner === true, author: r?.author === true, approved: r?.approved === true };
};

/** Client-side shape check mirrors the server's INVALID_INPUT rules so mistakes are caught before a round trip. */
export function validateFeedbackInput(input: SubmitFeedbackInput): string | null {
  if (!input.issueText.trim()) return 'INVALID_INPUT';
  if (input.kind === 'app_bug') return input.questionId ? 'INVALID_INPUT' : null;
  if (!input.questionId) return 'INVALID_INPUT';
  if (input.kind === 'correction') {
    if (!input.target || !FEEDBACK_TARGETS.includes(input.target)) return 'INVALID_INPUT';
    if (!input.proposedText?.trim()) return 'INVALID_INPUT';
    if (!input.reference?.trim()) return 'INVALID_INPUT'; // a correction must cite its source; plain reports need not
  }
  return null;
}

export async function submitFeedback(input: SubmitFeedbackInput): Promise<{ id: string; status: FeedbackStatus }> {
  const invalid = validateFeedbackInput(input);
  if (invalid) throw new Error(invalid);
  const correction = input.kind === 'correction';
  const r = await rpc<Raw>('feedback_submit', {
    _kind: input.kind, _question_id: input.kind === 'app_bug' ? null : input.questionId, _target: correction ? input.target : null,
    _issue_text: input.issueText.trim(), _proposed_text: correction ? input.proposedText!.trim() : null,
    _reference: input.reference?.trim() || null, _page_context: input.pageContext?.trim() || null,
  });
  return { id: String(r.id), status: r.status as FeedbackStatus };
}

export const fetchMyFeedback = async (): Promise<FeedbackItem[]> => ((await rpc<Raw[]>('feedback_mine', {})) ?? []).map(toItem);

// ---- owner side ----------------------------------------------------------------
export const fetchFeedbackQueue = async (status: FeedbackStatus | null): Promise<FeedbackQueueItem[]> =>
  ((await rpc<Raw[]>('feedback_queue', { _status: status })) ?? []).map(toQueueItem);

export const fetchFeedbackReview = async (id: string): Promise<FeedbackReview> => toReview(await rpc<Raw>('feedback_review', { _id: id }));

/** Publishes the proposal only if the whole live question still matches `expectedBaseHash` (currentHash from fetchFeedbackReview). */
export async function approveFeedback(id: string, expectedBaseHash: string, note: string | null): Promise<{ id: string; versionId: string }> {
  const r = await rpc<Raw>('feedback_approve', { _id: id, _expected_base_hash: expectedBaseHash, _note: note?.trim() || null });
  return { id: String(r.id), versionId: String(r.version_id) };
}

export const resolveFeedback = (id: string, status: 'handled' | 'rejected', note: string | null): Promise<unknown> =>
  rpc('feedback_resolve', { _id: id, _status: status, _note: note?.trim() || null });

export const fetchQuestionVersions = async (questionId: string): Promise<ContentVersion[]> =>
  ((await rpc<Raw[]>('feedback_versions', { _question_id: questionId })) ?? []).map(toVersion);

/** Restores the base of the latest version of a target, only against the exact whole question the owner reviewed (`expectedHash` = currentHash). */
export const rollbackVersion = (versionId: string, expectedHash: string, note: string | null): Promise<unknown> =>
  rpc('feedback_rollback', { _version_id: versionId, _expected_hash: expectedHash, _note: note?.trim() || null });

/** Owner-only picker rows: approved users only, minimal fields, current grant state. */
export type AuthorCandidate = { userId: string; email: string; name: string | null; author: boolean; note: string | null };
const toCandidate = (r: Raw): AuthorCandidate => ({ userId: String(r.user_id), email: String(r.email ?? ''), name: str(r.name), author: r.author === true, note: str(r.note) });
export const fetchAuthorCandidates = async (search: string | null): Promise<AuthorCandidate[]> =>
  ((await rpc<Raw[]>('feedback_author_candidates', { _search: search?.trim() || null })) ?? []).map(toCandidate);

export const fetchExplanationAuthors = async (): Promise<ExplanationAuthor[]> => ((await rpc<Raw[]>('feedback_authors', {})) ?? []).map(toAuthor);

export async function setExplanationAuthor(userId: string, enabled: boolean, note: string | null): Promise<{ userId: string; author: boolean }> {
  const r = await rpc<Raw>('feedback_set_author', { _user_id: userId, _enabled: enabled, _note: note?.trim() || null });
  return { userId: String(r.user_id), author: r.author === true };
}

export const FEEDBACK_TARGET_LABEL: Record<FeedbackTarget, string> = {
  question: 'נוסח השאלה', a: 'תשובה א', b: 'תשובה ב', c: 'תשובה ג', d: 'תשובה ד', correct: 'התשובה הנכונה', explanation: 'ההסבר',
};
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = { pending: 'ממתין', approved: 'אושר ופורסם', handled: 'טופל', rejected: 'נדחה' };
export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = { app_bug: 'תקלה באפליקציה', question_report: 'בעיה בשאלה', correction: 'הצעת תיקון' };
