// Client wrappers for the durable-attempt RPCs (migration 20260907000001).
// The server owns validation, scoring and credit; this file only maps shapes
// and error codes. Nothing here writes tables directly.
import { supabase } from '@/integrations/supabase/client';
import { KEYS, type ConfidenceLevel, type FeedbackTiming, type Question } from '@/lib/types';

export type AttemptMode = 'practice' | 'exam';
export type AttemptStart = { attemptId: string; rootId: string; questionOrder: string[] };
export type ConfirmResult = { isCorrect: boolean | null; correctKey: string | null; explanation: string | null; locked: boolean };
export type AttemptResult = {
  attemptId: string; rootId: string; status: 'in_progress' | 'submitted' | 'abandoned';
  correctCount: number | null; scoredCount: number | null; answeredCount: number | null; totalCount: number;
  quarter: string | null; submittedAt: string | null; totalActiveMs: number | null;
  /** 'simulation' = self-run simulation stored as a labelled exam attempt (20260908000002); never an official quiz. */
  kind?: 'simulation' | null;
  recommendationId?: string | null;
  /** Per-question correctness, present on submit results; null = unscored. */
  questions?: { questionId: string; isCorrect: boolean | null }[];
};
export type AttemptQuestion = {
  questionId: string; position: number; snapshot: Record<string, unknown>;
  selected: string | null; confidence: ConfidenceLevel | null; answerMs: number | null; confirmedAt: string | null;
  isCorrect: boolean | null; scored: boolean;
};
export type AttemptRead = Omit<AttemptResult, 'questions'> & {
  mode: AttemptMode; feedbackTiming: FeedbackTiming; startedAt: string; questionOrder: string[]; questions: AttemptQuestion[];
};
export type ArchiveEntry = Omit<AttemptResult, 'questions'> & { mode: AttemptMode; feedbackTiming: FeedbackTiming; latestSubmittedAt: string | null };

// The RPC payloads, snake_case as Postgres returns them. These functions and the
// `attempts` table arrived with migration 20260907000001 and are not in the generated
// Supabase types, so their shapes are declared once here instead of every call site
// falling back to `any`. Everything optional is a field the server may omit.
type AttemptQuestionRow = {
  question_id: string;
  position: number;
  snapshot?: Record<string, unknown> | null;
  selected?: string | null;
  confidence?: ConfidenceLevel | null;
  answer_ms?: number | null;
  confirmed_at?: string | null;
  is_correct?: boolean | null;
  scored?: boolean;
};
type AttemptResultRow = {
  attempt_id: string;
  root_id: string;
  status: AttemptResult['status'];
  correct_count?: number | null;
  scored_count?: number | null;
  answered_count?: number | null;
  total_count: number;
  quarter?: string | null;
  submitted_at?: string | null;
  total_active_ms?: number | null;
  kind?: string | null;
  recommendation_id?: string | null;
  questions?: Pick<AttemptQuestionRow, 'question_id' | 'is_correct'>[];
};
type AttemptStartRow = { attempt_id: string; root_id: string; question_order: string[] };
type ConfirmRow = { is_correct?: boolean | null; correct_key?: string | null; explanation?: string | null; locked?: boolean };
type AttemptReadRow = Omit<AttemptResultRow, 'questions'> & {
  mode: AttemptMode;
  feedback_timing: FeedbackTiming;
  started_at: string;
  question_order: string[];
  questions: AttemptQuestionRow[];
};
/** One `attempts` row as listArchive selects it, with the joined root's latest submission. */
type ArchiveRow = Omit<AttemptResultRow, 'attempt_id'> & {
  id: string;
  mode: AttemptMode;
  feedback_timing: FeedbackTiming;
  attempt_roots?: { latest_submitted_at?: string | null } | null;
};

export const ATTEMPT_ERROR_CODES = [
  'NOT_AUTHENTICATED', 'NOT_APPROVED', 'INVALID_INPUT', 'EMPTY_QUESTIONS', 'DUPLICATE_QUESTIONS', 'MISSING_QUESTIONS',
  'ATTEMPT_NOT_FOUND', 'ATTEMPT_NOT_OPEN', 'QUESTION_NOT_IN_ATTEMPT', 'CONFIRMED_IMMUTABLE',
  'ROOT_NOT_FOUND', 'NOT_SUBMITTED_YET', 'COOLDOWN_ACTIVE', 'NOT_ENTITLED',
] as const;
/** Client-side: the submission was accepted but the results read failed; retry only re-reads. */
export const RESULTS_READ_FAILED = 'RESULTS_READ_FAILED';
export const REPEAT_COOLDOWN_DAYS = 7;

const HEBREW: Record<string, string> = {
  NOT_AUTHENTICATED: 'יש להתחבר מחדש כדי להמשיך.',
  NOT_APPROVED: 'החשבון עדיין לא אושר לשימוש במפגשים שמורים.',
  COOLDOWN_ACTIVE: 'אפשר לחזור על אותו מבחן רק אחרי 7 ימים מההגשה האחרונה.',
  CONFIRMED_IMMUTABLE: 'התשובה כבר אושרה בשרת ואי אפשר לשנות אותה.',
  ATTEMPT_NOT_OPEN: 'המפגש הזה כבר הוגש או נסגר.',
  RESULTS_READ_FAILED: 'ההגשה נשמרה, אך טעינת התוצאות נכשלה. אפשר לנסות שוב.',
  NOT_SUBMITTED_YET: 'אפשר לחזור רק על מבחן שהוגש.',
  MISSING_QUESTIONS: 'חלק מהשאלות כבר לא קיימות במאגר.',
  NOT_ENTITLED: 'המפגש כולל שאלות ארצי שאינן פתוחות לחשבון שלך כרגע.',
};
export const attemptErrorMessage = (error: unknown): string =>
  HEBREW[error instanceof Error ? error.message : ''] ?? 'המפגש לא נשמר בשרת. בדקו את החיבור ונסו שוב.';

const toError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  const code = ATTEMPT_ERROR_CODES.find(c => message.includes(c));
  return new Error(code ?? 'ATTEMPT_UNAVAILABLE');
};

/** `supabase.rpc` only accepts names the generated types know; these do not appear there. */
type UntypedRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

/** Shared by learningRepository: same error mapping, same client. */
export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    const { data, error } = await (supabase.rpc as UntypedRpc)(name, args);
    if (error) throw error;
    return data as T;
  } catch (error) {
    throw toError(error);
  }
}

const mapResult = (r: AttemptResultRow): AttemptResult => ({
  attemptId: r.attempt_id, rootId: r.root_id, status: r.status,
  correctCount: r.correct_count ?? null, scoredCount: r.scored_count ?? null, answeredCount: r.answered_count ?? null, totalCount: r.total_count,
  quarter: r.quarter ?? null, submittedAt: r.submitted_at ?? null, totalActiveMs: r.total_active_ms ?? null,
  kind: r.kind === 'simulation' ? 'simulation' : null, recommendationId: r.recommendation_id ?? null,
  ...(Array.isArray(r.questions) ? { questions: r.questions.map(q => ({ questionId: q.question_id, isCorrect: q.is_correct ?? null })) } : {}),
});
const mapStart = (r: AttemptStartRow): AttemptStart => ({ attemptId: r.attempt_id, rootId: r.root_id, questionOrder: r.question_order });

export const startAttempt = (mode: AttemptMode, feedbackTiming: FeedbackTiming, questionIds: string[]) =>
  rpc<AttemptStartRow>('attempt_start', { _mode: mode, _feedback_timing: feedbackTiming, _question_ids: questionIds }).then(mapStart);
export const repeatAttempt = (rootId: string, feedbackTiming: FeedbackTiming) =>
  rpc<AttemptStartRow>('attempt_repeat', { _root_id: rootId, _feedback_timing: feedbackTiming }).then(mapStart);
export const confirmAttemptAnswer = (attemptId: string, questionId: string, selected: string, confidence: ConfidenceLevel, answerMs: number) =>
  rpc<ConfirmRow>('attempt_confirm', { _attempt_id: attemptId, _question_id: questionId, _selected: selected, _confidence: confidence, _answer_ms: Math.round(answerMs) })
    .then((r): ConfirmResult => ({ isCorrect: r.is_correct ?? null, correctKey: r.correct_key ?? null, explanation: r.explanation ?? null, locked: !!r.locked }));
export const submitAttempt = (attemptId: string, totalActiveMs: number) =>
  rpc<AttemptResultRow>('attempt_submit', { _attempt_id: attemptId, _total_active_ms: Math.round(totalActiveMs) }).then(mapResult);
/** Self-run simulation: exam scoring at the end, labelled kind='simulation' server-side (never written to quiz_attempts). */
export const startSimulationAttempt = (questionIds: string[]) =>
  rpc<AttemptStartRow>('attempt_start_simulation', { _question_ids: questionIds }).then(mapStart);
export const abandonAttempt = (attemptId: string) => rpc<void>('attempt_abandon', { _attempt_id: attemptId });
export const readAttempt = (attemptId: string) => rpc<AttemptReadRow>('attempt_read', { _attempt_id: attemptId }).then((r): AttemptRead => ({
  ...mapResult(r), mode: r.mode, feedbackTiming: r.feedback_timing, startedAt: r.started_at, questionOrder: r.question_order,
  questions: r.questions.map(q => ({
    questionId: q.question_id, position: q.position, snapshot: q.snapshot ?? {}, selected: q.selected ?? null, confidence: q.confidence ?? null,
    answerMs: q.answer_ms ?? null, confirmedAt: q.confirmed_at ?? null, isCorrect: q.is_correct ?? null, scored: !!q.scored,
  })),
}));

export async function listArchive(): Promise<ArchiveEntry[]> {
  // Same reason as UntypedRpc: `attempts` is not in the generated types, so the
  // builder is described by the three calls this query actually makes.
  type ArchiveQuery = {
    select(columns: string): {
      in(column: string, values: string[]): {
        order(column: string, opts: { ascending: boolean; nullsFirst: boolean }): PromiseLike<{ data: ArchiveRow[] | null; error: unknown }>;
      };
    };
  };
  const { data, error } = await (supabase.from('attempts' as never) as ArchiveQuery)
    .select('id, root_id, mode, kind, feedback_timing, status, submitted_at, quarter, total_count, correct_count, scored_count, answered_count, total_active_ms, attempt_roots(latest_submitted_at)')
    .in('status', ['submitted', 'in_progress']).order('submitted_at', { ascending: false, nullsFirst: true });
  if (error) throw toError(error);
  return data.map(r => ({
    ...mapResult({ ...r, attempt_id: r.id }), mode: r.mode, feedbackTiming: r.feedback_timing, latestSubmittedAt: r.attempt_roots?.latest_submitted_at ?? null,
  }));
}

export const repeatAvailableAt = (entry: Pick<ArchiveEntry, 'latestSubmittedAt' | 'submittedAt'>): Date =>
  new Date(new Date(entry.latestSubmittedAt ?? entry.submittedAt ?? 0).getTime() + REPEAT_COOLDOWN_DAYS * 86_400_000);

/** Rebuilds a Question from a frozen snapshot. Hidden or missing fields become empty strings. */
export function snapshotToQuestion(snapshot: Record<string, unknown>): Question {
  const s = (key: string) => (snapshot[key] == null ? '' : String(snapshot[key]));
  return {
    [KEYS.ID]: s('id'), [KEYS.REF_ID]: s('ref_id') || s('id'), [KEYS.QUESTION]: s('question'),
    [KEYS.A]: s('a'), [KEYS.B]: s('b'), [KEYS.C]: s('c'), [KEYS.D]: s('d'),
    [KEYS.CORRECT]: s('correct'), [KEYS.EXPLANATION]: s('explanation'), [KEYS.TOPIC]: s('topic'),
    [KEYS.YEAR]: s('year'), [KEYS.SOURCE]: s('source'), [KEYS.MILLER]: s('miller'),
    [KEYS.CHAPTER]: Number(snapshot.chapter ?? 0) || 0, [KEYS.MEDIA_TYPE]: s('media_type'), [KEYS.MEDIA_LINK]: s('media_link'), [KEYS.KIND]: s('kind'),
  };
}
