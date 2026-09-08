import { describe, expect, it } from 'vitest';
import { sessionFromAttempt } from '@/lib/attemptSession';
import type { AttemptRead } from '@/lib/attemptsRepository';

// Resume rule: the server holds confirmed answers; a draft may hold a newer,
// not-yet-confirmed answer for exam/end questions. A changed draft answer wins
// and needs a fresh rating; a locked answer (practice or immediate) always wins.
const read = (mode: AttemptRead['mode'], feedbackTiming: AttemptRead['feedbackTiming']): AttemptRead => ({
  attemptId: 'att-1', rootId: 'root-1', status: 'in_progress', mode, feedbackTiming, totalCount: 2, correctCount: null, scoredCount: null, answeredCount: null,
  quarter: null, submittedAt: null, totalActiveMs: null, startedAt: 's', questionOrder: ['q2', 'q1'],
  questions: [
    { questionId: 'q2', position: 1, snapshot: { id: 'q2' }, selected: 'C', confidence: 'confident', answerMs: 4000, confirmedAt: 'x', isCorrect: null, scored: true },
    { questionId: 'q1', position: 2, snapshot: { id: 'q1' }, selected: null, confidence: null, answerMs: null, confirmedAt: null, isCorrect: null, scored: true },
  ],
});
const draft = (answer: string | null, confidence: 'confident' | 'hesitant' | 'guessed' | null) =>
  ({ questionIds: ['q2', 'q1'], index: 0, answers: [answer, null], confidence: [confidence, null], flagged: [], skipped: [] });

describe('sessionFromAttempt: resume with a pending draft', () => {
  it('exam/end: a changed draft answer replaces the confirmed one and requires a fresh rating', () => {
    const s = sessionFromAttempt(read('exam', 'end'), draft('A', 'guessed'));
    expect(s.answers).toEqual(['A', null]);
    expect(s.confidence).toEqual([null, null]);
  });

  it('exam/end: an unchanged answer keeps the confirmed rating, not a stale draft rating', () => {
    const s = sessionFromAttempt(read('exam', 'end'), draft('C', 'guessed'));
    expect(s.answers).toEqual(['C', null]);
    expect(s.confidence).toEqual(['confident', null]);
  });

  it('exam/end: a draft without an answer never clears a confirmed answer', () => {
    const s = sessionFromAttempt(read('exam', 'end'), draft(null, null));
    expect(s.answers).toEqual(['C', null]);
    expect(s.confidence).toEqual(['confident', null]);
  });

  it.each([['practice', 'immediate'], ['exam', 'immediate']] as const)('%s/%s: the locked server answer wins over any draft', (mode, timing) => {
    const s = sessionFromAttempt(read(mode, timing), draft('A', 'guessed'));
    expect(s.answers).toEqual(['C', null]);
    expect(s.confidence).toEqual(['confident', null]);
  });
});
