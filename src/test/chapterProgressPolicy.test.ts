import { describe, expect, it } from 'vitest';
import { calculateChapterProgress, managementProgress, type ChapterAnswer } from '@/lib/chapterProgressPolicy';

const ids = Array.from({ length: 100 }, (_, i) => String(i));
const answer = (questionId: string, mode: 'practice' | 'exam', correct = true, answeredAt = 1): ChapterAnswer =>
  ({ questionId, mode, correct, answeredAt });

describe('launch chapter policy', () => {
  it.each([1, 10])('does not turn 100%% coverage green with only %i quiz questions', count => {
    const result = calculateChapterProgress(ids, ids.map((id, i) => answer(id, i < count ? 'exam' : 'practice')));
    expect(result.coveragePercent).toBe(100);
    expect(result.green).toBe(false);
    expect(result.requiredQuizCount).toBe(25);
  });

  it('recognizes 25 practice + 25 quiz questions and 18 correct quiz answers', () => {
    const result = calculateChapterProgress(ids, ids.slice(0, 50).map((id, i) => answer(id, i < 25 ? 'exam' : 'practice', i >= 7)));
    expect(result).toMatchObject({ green: true, coveragePercent: 50, quizSuccessPercent: 72 });
    expect(managementProgress(result)).toEqual({ coveragePercent: 50, successPercent: 72 });
  });

  it('deduplicates coverage and uses the latest quiz answer, not practice corrections', () => {
    const events = ids.slice(0, 50).map(id => answer(id, 'exam'));
    events.push(...ids.slice(0, 20).map(id => answer(id, 'exam', false, 2)));
    events.push(...ids.slice(0, 20).map(id => answer(id, 'practice', true, 3)));
    events.push(answer('outside-this-chapter', 'exam'));
    const result = calculateChapterProgress(ids, events.reverse());
    expect(result).toMatchObject({ coveredCount: 50, quizCount: 50, quizSuccessPercent: 60, green: false });
  });

  it('does not increase the quiz quota when a resident voluntarily practices more', () => {
    const events = ids.map((id, i) => answer(id, i < 25 ? 'exam' : 'practice'));
    expect(calculateChapterProgress(ids, events)).toMatchObject({ green: true, requiredQuizCount: 25 });
  });

  it('rounds required question counts up, never rounds a failing accuracy into a pass', () => {
    expect(calculateChapterProgress(ids.slice(0, 5), [])).toMatchObject({ requiredCoverageCount: 3, requiredQuizCount: 2 });
    const large = Array.from({ length: 1000 }, (_, i) => String(i));
    const events = large.map((id, i) => answer(id, 'exam', i < 699));
    expect(calculateChapterProgress(large, events)).toMatchObject({ green: false, quizSuccessPercent: 69.9 });
  });

  it('keeps missing quiz success explicit and handles an empty bank', () => {
    expect(calculateChapterProgress([], [])).toMatchObject({ green: false, coveragePercent: null, quizSuccessPercent: null });
    expect(calculateChapterProgress(['1', '1'], [answer('1', 'practice')])).toMatchObject({ green: false, coveragePercent: 100, quizSuccessPercent: null });
  });
});
