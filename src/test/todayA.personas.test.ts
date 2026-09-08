import { describe, expect, it } from 'vitest';
import { KEYS, type Question } from '@/lib/types';
import { buildLearningReport, MAX_RECOMMENDATIONS, MIN_SIGNAL_SAMPLE, type AttemptEvidence } from '@/lib/learningInsights';

const NOW = new Date('2026-09-07T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const q = (id: string, chapter: number, source = 'מבחן'): Question => ({
  [KEYS.ID]: id, [KEYS.REF_ID]: id, [KEYS.QUESTION]: '?', [KEYS.A]: 'a', [KEYS.B]: 'b', [KEYS.C]: 'c', [KEYS.D]: 'd',
  [KEYS.CORRECT]: 'A', [KEYS.EXPLANATION]: '', [KEYS.TOPIC]: `ch${chapter}`, [KEYS.YEAR]: '2024', [KEYS.SOURCE]: source, [KEYS.MILLER]: '',
  [KEYS.CHAPTER]: chapter, [KEYS.MEDIA_TYPE]: '', [KEYS.MEDIA_LINK]: '', [KEYS.KIND]: '',
});
const bank = [...Array.from({ length: 40 }, (_, i) => q(`c12-${i}`, 12)), ...Array.from({ length: 40 }, (_, i) => q(`c13-${i}`, 13)), q('nat-1', 12, 'ארצי')];
const ev = (questionId: string, isCorrect: boolean | null, daysAgo: number, extra: Partial<AttemptEvidence> = {}): AttemptEvidence =>
  ({ questionId, mode: 'exam', feedbackTiming: 'end', answeredAt: NOW - daysAgo * DAY, isCorrect, confidence: 'confident', ...extra });
const build = (evidence: AttemptEvidence[], legacyHistory?: Parameters<typeof buildLearningReport>[0]['legacyHistory']) =>
  buildLearningReport({ bank, evidence, legacyHistory, nowMs: NOW });

describe('synthetic personas through the real evidence engine', () => {
  it('new resident with no history: nothing is claimed, at most three actions, no trend', () => {
    const r = build([]);
    expect(r.overall.seenCount).toBe(0);
    expect(r.overall.policy.green).toBe(false);
    expect(r.signals.interpretation).toBe('insufficient-sample');
    expect(r.trend.direction).toBe('unknown');
    expect(r.recommendations.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
    expect(r.strengths).toEqual([]);
  });

  it('unscored item is documented as unscored, never counted as a mistake', () => {
    const r = build([ev('c12-0', null, 3), ev('c12-1', true, 3)]);
    expect(r.overall.unscoredCount).toBe(1);
    expect(r.overall.mistakeCount).toBe(0);
    expect(r.uncertainty.unscoredCount).toBe(1);
  });

  it('repeat right after the explanation is a rehearsal, excluded from independent signals', () => {
    const first = ev('c12-2', false, 2);
    const again = { ...first, answeredAt: first.answeredAt + 30 * 60 * 1000, isCorrect: true, attemptId: 'later' };
    const r = build([first, again]);
    expect(r.uncertainty.rehearsalCount).toBe(1);
    expect(r.overall.mistakeCount).toBe(0);
  });

  it('sparse confidence sample stays below the signal threshold', () => {
    const r = build(Array.from({ length: MIN_SIGNAL_SAMPLE - 1 }, (_, i) => ev(`c12-${i}`, true, 5)));
    expect(r.signals.sample).toBeLessThan(MIN_SIGNAL_SAMPLE);
    expect(r.signals.interpretation).toBe('insufficient-sample');
  });

  it('senior resident: broad graded evidence yields comparable trend inputs and bounded actions', () => {
    const evidence = [
      ...Array.from({ length: 40 }, (_, i) => ev(`c12-${i}`, i % 5 !== 0, 20 - (i % 10))),
      ...Array.from({ length: 30 }, (_, i) => ev(`c13-${i}`, i % 4 !== 0, 6 - (i % 6))),
    ];
    const r = build(evidence);
    expect(r.overall.seenCount).toBe(70);
    expect(r.chapters.find(c => c.chapter === 12)?.seenCount).toBe(40);
    expect(r.signals.interpretation).toBe('available');
    expect(r.recommendations.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS);
    for (const rec of r.recommendations) expect(rec.setup.chapters.length).toBeGreaterThan(0);
  });

  it('national question is counted outside every core denominator even after access is revoked', () => {
    const r = build([ev('nat-1', true, 1)]);
    expect(r.bank.national).toBe(1);
    expect(r.nationalSeenCount).toBe(1);
    expect(r.overall.total).toBe(80);
    expect(r.overall.seenCount).toBe(0);
  });

  it('legacy history without a mode is shown as legacy-only, never as a scored durable answer', () => {
    const r = build([], { 'c13-3': { answered: 2, correct: 1, lastResult: 'wrong', everWrong: true, timestamp: NOW - DAY } });
    expect(r.overall.legacyOnlyCount).toBe(1);
    expect(r.overall.mistakeCount).toBe(0);
    expect(r.overall.legacyMistakeCount).toBe(1);
  });

  it('follow-up after a recommendation is recorded without a causal claim', () => {
    const r = build([ev('c12-7', true, 1, { recommendationId: 'rec-abc' }), ev('c12-8', false, 1, { recommendationId: 'rec-abc' })]);
    expect(r.followUp).toHaveLength(1);
    expect(r.followUp[0]).toMatchObject({ recommendationId: 'rec-abc', responses: 2, causal: false });
  });
});
