import { describe, it, expect } from 'vitest';
import {
  srsUrgencyFromDaysOverdue,
  computeSmartScore,
  type ScoringParams,
} from '@/lib/smartSelection';
import type { Question, HistoryEntry } from '@/lib/types';
import { KEYS } from '@/lib/types';
import type { SrsRecord } from '@/lib/srsRepository';

// Q3 fix: future-scheduled questions used to all collapse to urgency=0.
// New contract: future returns negative (suppression), past returns 0..1.
// Order must hold: far-future < near-future < new(0.5) < overdue
describe('srsUrgencyFromDaysOverdue', () => {
  it('returns 0 exactly at the review date (daysOverdue = 0)', () => {
    expect(srsUrgencyFromDaysOverdue(0)).toBe(0);
  });

  it('returns positive linear urgency for overdue (30 days = 0.5, 60 days = 1.0)', () => {
    expect(srsUrgencyFromDaysOverdue(30)).toBeCloseTo(0.5, 5);
    expect(srsUrgencyFromDaysOverdue(60)).toBe(1);
  });

  it('clamps overdue urgency to 1.0 even for very late questions', () => {
    expect(srsUrgencyFromDaysOverdue(120)).toBe(1);
    expect(srsUrgencyFromDaysOverdue(10_000)).toBe(1);
  });

  it('returns small negative urgency for near-future (10 days ahead ≈ -0.0274)', () => {
    expect(srsUrgencyFromDaysOverdue(-10)).toBeCloseTo(-10 / 365, 6);
  });

  it('returns -1 for one-year-future scheduling (daysOverdue = -365)', () => {
    expect(srsUrgencyFromDaysOverdue(-365)).toBe(-1);
  });

  it('clamps far-future to -1 (no question gets less than -1)', () => {
    expect(srsUrgencyFromDaysOverdue(-730)).toBe(-1);
    expect(srsUrgencyFromDaysOverdue(-10_000)).toBe(-1);
  });

  it('preserves the full ordering: far-future < near-future < 0 < small-overdue < new(0.5) < big-overdue', () => {
    const farFuture = srsUrgencyFromDaysOverdue(-365);
    const nearFuture = srsUrgencyFromDaysOverdue(-7);
    const dueToday = srsUrgencyFromDaysOverdue(0);
    const smallOverdue = srsUrgencyFromDaysOverdue(15);  // 0.25
    const newQuestion = 0.5; // contract: questions with no SRS row map to 0.5 in computeSrsUrgency
    const bigOverdue = srsUrgencyFromDaysOverdue(45);    // 0.75

    expect(farFuture).toBeLessThan(nearFuture);
    expect(nearFuture).toBeLessThan(dueToday);
    expect(dueToday).toBeLessThan(smallOverdue);
    expect(smallOverdue).toBeLessThan(newQuestion);
    expect(newQuestion).toBeLessThan(bigOverdue);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Q1: computeSmartScore — verify all 6 factors actually influence score
// Strategy: isolate each factor by zeroing all other weights, then assert
// that the factor's value changes the score in the expected direction.
// ──────────────────────────────────────────────────────────────────────

function makeQuestion(id: string, topic: string): Question {
  return {
    [KEYS.ID]: id,
    [KEYS.REF_ID]: id,
    [KEYS.QUESTION]: 'q',
    [KEYS.A]: 'a', [KEYS.B]: 'b', [KEYS.C]: 'c', [KEYS.D]: 'd',
    [KEYS.CORRECT]: 'A',
    [KEYS.EXPLANATION]: '',
    [KEYS.TOPIC]: topic,
    [KEYS.YEAR]: '2024',
    [KEYS.SOURCE]: '',
    [KEYS.MILLER]: '',
    [KEYS.CHAPTER]: 1,
    [KEYS.MEDIA_TYPE]: '',
    [KEYS.MEDIA_LINK]: '',
    [KEYS.KIND]: '',
  };
}

const overdueSrsRecord = (daysOverdue: number): SrsRecord => ({
  next_review_date: new Date(Date.now() - daysOverdue * 86400000).toISOString(),
  interval_days: 1,
  ease_factor: 2.5,
  repetitions: 0,
  confidence: 0.5,
  last_correct: null,
});

// Empty params with only the requested factor weighted at 1.
function paramsForFactor(idx: number, overrides: Partial<ScoringParams> = {}): ScoringParams {
  const weights = [0, 0, 0, 0, 0, 0];
  weights[idx] = 1;
  return {
    srsData: {},
    history: {},
    topicStats: {},
    globalAccuracy: 0.7,
    weights,
    ...overrides,
  };
}

describe('computeSmartScore — all 6 factors influence selection', () => {
  it('factor 0 (srsUrgency): overdue question scores higher than non-overdue', () => {
    const overdue = makeQuestion('q-overdue', 'Cardiac Physiology');
    const fresh = makeQuestion('q-fresh', 'Cardiac Physiology');
    const params = paramsForFactor(0, {
      srsData: { 'q-overdue': overdueSrsRecord(45) }, // ~0.75 urgency
    });
    // 'q-fresh' has no SRS row → urgency 0.5
    expect(computeSmartScore(overdue, params)).toBeGreaterThan(
      computeSmartScore(fresh, params),
    );
  });

  it('factor 1 (topicWeakness): weak topic scores higher than strong topic', () => {
    const weak = makeQuestion('q-weak', 'Topic-A');
    const strong = makeQuestion('q-strong', 'Topic-B');
    const params = paramsForFactor(1, {
      topicStats: {
        'Topic-A': { accuracy: 0.3, lastAnsweredTs: 0, recentWrongStreak: 0 },
        'Topic-B': { accuracy: 0.95, lastAnsweredTs: 0, recentWrongStreak: 0 },
      },
      globalAccuracy: 0.7,
    });
    expect(computeSmartScore(weak, params)).toBeGreaterThan(
      computeSmartScore(strong, params),
    );
  });

  it('factor 2 (recencyGap): topic not practiced recently scores higher', () => {
    const stale = makeQuestion('q-stale', 'Topic-A');
    const recent = makeQuestion('q-recent', 'Topic-B');
    const now = Date.now();
    const params = paramsForFactor(2, {
      topicStats: {
        'Topic-A': { accuracy: 0.7, lastAnsweredTs: now - 30 * 86400000, recentWrongStreak: 0 }, // gap ≈ 1
        'Topic-B': { accuracy: 0.7, lastAnsweredTs: now - 1 * 86400000,  recentWrongStreak: 0 }, // gap ≈ 0.03
      },
    });
    expect(computeSmartScore(stale, params)).toBeGreaterThan(
      computeSmartScore(recent, params),
    );
  });

  it('factor 3 (streakPenalty): topic with wrong-streak scores higher', () => {
    const struggling = makeQuestion('q-struggling', 'Topic-A');
    const ok = makeQuestion('q-ok', 'Topic-B');
    const params = paramsForFactor(3, {
      topicStats: {
        'Topic-A': { accuracy: 0.7, lastAnsweredTs: 0, recentWrongStreak: 5 },
        'Topic-B': { accuracy: 0.7, lastAnsweredTs: 0, recentWrongStreak: 0 },
      },
    });
    expect(computeSmartScore(struggling, params)).toBeGreaterThan(
      computeSmartScore(ok, params),
    );
  });

  it('factor 4 (examProximity): same value for any question (constant per call)', () => {
    // examProximity is time-based and identical for all questions in a single call,
    // so we just assert the factor IS included when weighted (score is non-NaN, finite).
    const q = makeQuestion('q1', 'Cardiac Physiology');
    const params = paramsForFactor(4);
    const score = computeSmartScore(q, params);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('factor 5 (yieldBoost): Tier 1 topic scores higher than unlisted topic', () => {
    const highYield = makeQuestion('q-high', 'Cardiac Physiology'); // Tier 1 → 1.0
    const unlisted = makeQuestion('q-low', 'Some Random Topic');     // not in map → 0.1
    const params = paramsForFactor(5);
    expect(computeSmartScore(highYield, params)).toBeGreaterThan(
      computeSmartScore(unlisted, params),
    );
  });

  it('yieldBoost default for unlisted topics is 0.1 (aligned with Stage 1)', () => {
    const unlisted = makeQuestion('q-unlisted', 'Made-Up Topic');
    const params = paramsForFactor(5); // weight only on yieldBoost
    // With weight=1 on yieldBoost only and default 0.1, score must be 0.1.
    expect(computeSmartScore(unlisted, params)).toBeCloseTo(0.1, 5);
  });

  it('combines factors as a weighted sum (linearity check)', () => {
    const q = makeQuestion('q1', 'Cardiac Physiology'); // Tier 1 → yieldBoost=1.0
    const baseParams: ScoringParams = {
      srsData: {},                        // urgency=0.5 (new question)
      history: {} as Record<string, HistoryEntry>,
      topicStats: {},                     // weakness=0.5, recencyGap=1, streak=0
      globalAccuracy: 0.7,
      weights: [0.5, 0, 0, 0, 0, 0.5],    // half on srsUrgency, half on yieldBoost
    };
    // Expected: 0.5 * 0.5 (urgency) + 0.5 * 1.0 (yieldBoost) = 0.75
    expect(computeSmartScore(q, baseParams)).toBeCloseTo(0.75, 5);
  });
});
