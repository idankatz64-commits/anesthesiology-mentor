// Builds the in-memory SessionState for a durable attempt from the server copy
// (frozen snapshots + confirmed answers). A saved draft only contributes what the
// server does not hold: position, flags, skips, timers and unconfirmed answers.
import { snapshotToQuestion, type AttemptRead } from '@/lib/attemptsRepository';
import type { ConfidenceLevel, SessionState } from '@/lib/types';

export type AttemptDraft = {
  questionIds: string[]; index: number; answers: (string | null)[]; confidence: (ConfidenceLevel | null)[];
  flagged: number[]; skipped: number[]; timerSeconds?: number; questionMs?: number[];
};

export function sessionFromAttempt(read: AttemptRead, draft?: AttemptDraft): SessionState {
  const byId = new Map(draft?.questionIds.map((id, i) => [id, i]) ?? []);
  const fromDraft = <T,>(list: T[] | undefined, id: string, fallback: T): T => {
    const i = byId.get(id);
    return i == null ? fallback : (list?.[i] ?? fallback);
  };
  const questions = read.questions;
  // Locked modes: a confirmed server answer is final. Exam/end: the user may
  // still change it, so a draft that differs wins and the old rating is dropped
  // (never pair a stale confidence with a new answer).
  const locked = read.mode === 'practice' || read.feedbackTiming === 'immediate';
  const resolved = questions.map(q => {
    const draftAnswer = fromDraft(draft?.answers, q.questionId, null);
    const draftConfidence = fromDraft(draft?.confidence, q.questionId, null);
    if (!q.selected) return { answer: draftAnswer, confidence: draftConfidence };
    if (!locked && draftAnswer && draftAnswer !== q.selected) return { answer: draftAnswer, confidence: null };
    return { answer: q.selected, confidence: q.confidence };
  });
  return {
    quiz: questions.map(q => snapshotToQuestion({ id: q.questionId, ...q.snapshot })),
    index: Math.min(draft?.index ?? 0, Math.max(0, questions.length - 1)),
    score: 0,
    mode: read.kind === 'simulation' ? 'simulation' : read.mode,
    feedbackTiming: read.feedbackTiming,
    learningBaseline: undefined,
    answers: resolved.map(r => r.answer),
    confidence: resolved.map(r => r.confidence),
    flagged: new Set(draft?.flagged ?? []),
    skipped: new Set(draft?.skipped ?? []),
    sourceFilter: 'all',
    countFilter: questions.length,
    unseenOnly: false,
    attemptId: read.attemptId,
    rootId: read.rootId,
    questionMs: questions.map(q => q.answerMs ?? fromDraft(draft?.questionMs, q.questionId, 0)),
    resumedTimerSeconds: draft?.timerSeconds,
    attemptResult: read.status === 'submitted' ? read : undefined,
  };
}
