import { describe, expect, it } from 'vitest';
import { buildSessionInsights, captureLearningBaseline } from '@/lib/sessionInsights';
import type { HistoryEntry } from '@/lib/types';
import { launchQuestion } from './fixtures/launchQuestion';

const bank = Array.from({ length: 8 }, (_, i) => ({ ...launchQuestion(String(i)), topic: i < 4 ? 'Topic A' : 'Topic B' }));
const entry = (lastResult: HistoryEntry['lastResult'], answered = 1): HistoryEntry => ({ answered, correct: 0, lastResult, everWrong: true, timestamp: 1 });

describe('session learning insights', () => {
  it('captures a compact baseline without changing it as live progress changes', () => {
    const history = { '0': entry('wrong'), '1': entry('correct'), untouched: entry(null, 0) };
    const baseline = captureLearningBaseline(history);
    history['0'].lastResult = 'correct';
    expect(baseline.lastResults).toEqual({ '0': 'wrong', '1': 'correct' });
  });

  it('relates new coverage and repaired/repeated errors to overall and topic progress', () => {
    const baseline = captureLearningBaseline({ '0': entry('wrong'), '1': entry('wrong'), '4': entry('correct') });
    const result = buildSessionInsights({ bank, quiz: [bank[0], bank[1], bank[2], bank[4]], answers: ['A', 'B', 'A', 'B'], baseline, history: {} });
    expect(result.overall).toMatchObject({ total: 8, coveredBefore: 3, coveredAfter: 4, newCount: 1, correctedCount: 1 });
    expect(result.questions.map(q => q.change)).toEqual(['corrected', 'repeated-error', 'new', 'needs-refresh']);
    expect(result.topics[0]).toMatchObject({ topic: 'Topic A', total: 4, coveredBefore: 2, coveredAfter: 3, answered: 3, correct: 2, latestCorrectBefore: 0, latestCorrectAfter: 2 });
    expect(result.recommendations.some(r => r.kind === 'review' && r.topic === 'Topic A')).toBe(true);
  });

  it('does not count a repeated question or an unanswered question as new coverage', () => {
    const result = buildSessionInsights({ bank, quiz: [bank[0], bank[0], bank[1]], answers: ['A', 'A', null], baseline: captureLearningBaseline({}), history: {} });
    expect(result.overall).toMatchObject({ coveredAfter: 1, newCount: 1, answered: 1, skipped: 1 });
    expect(result.topics[0]).toMatchObject({ coveredAfter: 1, answered: 1 });
  });

  it('does not invent a before-state for a legacy draft or include inaccessible history', () => {
    const result = buildSessionInsights({ bank, quiz: [bank[0], bank[1]], answers: ['A', null], history: { '0': entry('correct'), '2': entry('wrong'), deleted: entry('correct') } });
    expect(result.overall).toMatchObject({ coveredBefore: null, coveredAfter: 2, newCount: null, correctedCount: null });
    expect(result.questions[0].change).toBe('unknown');
    expect(result.baselineAvailable).toBe(false);
  });

  it('keeps unknown answer keys out of accuracy, handles empty inputs, and never produces NaN', () => {
    const unknown = { ...bank[0], correct: 'N/A' };
    const result = buildSessionInsights({ bank: [unknown], quiz: [unknown], answers: ['A'], baseline: captureLearningBaseline({}), history: {} });
    expect(result.overall).toMatchObject({ coveredAfter: 1, answered: 1, scored: 0, accuracy: null });
    expect(result.questions[0].isCorrect).toBeNull();
    const empty = buildSessionInsights({ bank: [], quiz: [], answers: [], history: {} });
    expect(empty.overall.accuracy).toBeNull();
    expect(empty.overall.coverageAfter).toBeNull();
  });

  it('uses question-weighted success and prioritizes repeated errors over new content', () => {
    const result = buildSessionInsights({ bank, quiz: bank, answers: ['B', 'B', 'B', 'B', 'A', 'A', 'A', 'A'], baseline: captureLearningBaseline({ '0': entry('wrong') }), history: {} });
    expect(result.overall.accuracy).toBe(50);
    expect(result.recommendations[0]).toMatchObject({ topic: 'Topic A', kind: 'review' });
  });

  it('suggests new questions after success, without declaring mastery from a small sample', () => {
    const result = buildSessionInsights({ bank, quiz: [bank[0]], answers: ['A'], baseline: captureLearningBaseline({}), history: {} });
    expect(result.recommendations[0]).toMatchObject({ topic: 'Topic A', kind: 'explore' });
    expect(result.topics[0].answered).toBe(1);
    expect(JSON.stringify(result)).not.toContain('green');
  });
});
