import { describe, expect, it } from 'vitest';
import { reconcileSavedQuestions } from '@/lib/savedSessionReconcile';
import { launchQuestion } from './fixtures/launchQuestion';

// A legacy draft stores question ids only. After a revoke (or a deletion) some
// ids no longer resolve. An exam must not quietly continue and score the
// remainder as if it were the original paper.
const bank = new Map([launchQuestion('q1'), launchQuestion('q2'), launchQuestion('q3')].map(q => [q.id, q]));

describe('reconcileSavedQuestions', () => {
  it('resumes untouched when every saved question still resolves', () => {
    const r = reconcileSavedQuestions(['q3', 'q1'], bank, 'exam');
    expect(r.ok).toBe(true); expect(r.missing).toBe(0); expect(r.message).toBeNull();
    expect(r.quiz.map(q => q.id)).toEqual(['q3', 'q1']);
  });

  it('refuses to resume an exam that lost questions and says how many', () => {
    const r = reconcileSavedQuestions(['q1', 'gone', 'q2', 'gone-2'], bank, 'exam');
    expect(r.ok).toBe(false); expect(r.missing).toBe(2);
    expect(r.message).toMatch(/2 מתוך 4/); expect(r.message).toMatch(/הבוחן המקורי/);
  });

  it('continues a practice draft with what is left and reports the loss', () => {
    const r = reconcileSavedQuestions(['q1', 'gone', 'q2'], bank, 'practice');
    expect(r.ok).toBe(true); expect(r.missing).toBe(1);
    expect(r.quiz.map(q => q.id)).toEqual(['q1', 'q2']);
    expect(r.message).toMatch(/1 שאלות/); expect(r.message).toMatch(/2 שנותרו/);
  });

  it('refuses when nothing is left, in either mode', () => {
    for (const mode of ['practice', 'exam'] as const) {
      const r = reconcileSavedQuestions(['gone'], bank, mode);
      expect(r.ok).toBe(false); expect(r.quiz).toEqual([]); expect(r.message).toMatch(/אף שאלה/);
    }
  });
});
