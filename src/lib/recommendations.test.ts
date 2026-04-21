import { describe, expect, it } from 'vitest';

import {
  scoreRecommendation,
  type RecommendationInput,
} from '@/lib/recommendations';

// ──────────────────────────────────────────────────────────────────────────
// W0.3 — RED tests for `scoreRecommendation`
// These tests MUST fail until W0.6 implements the function.
//
// Contract (from .planning/phase-1/RESEARCH.md §Recommendation Logic):
//   score = yieldTier * weakness * (1 + overdue) * (0.5 + recency) * confidenceDamp
//
//   yieldTier: 1.0 Tier1 / 0.6 Tier2 / 0.2 Tier3 / 0.4 unknown
//   weakness: clamp(1 - accuracy, 0, 1)
//   overdue:  clamp(daysOverdue / 7, 0, 3)
//   recency:  min(daysSinceLastReview, 30) / 30
//   confidenceDamp: 1 when questionsSeen >= 5, else 0.3
// ──────────────────────────────────────────────────────────────────────────

/** Tier-1 topic from YIELD_TIER_MAP (smartSelection.ts line 17). */
const TIER_1_TOPIC = 'Cardiac Physiology';
/** Tier-3 topic from YIELD_TIER_MAP (smartSelection.ts line 58). */
const TIER_3_TOPIC = 'Thoracic Surgery';
/** A topic name that is NOT present in YIELD_TIER_MAP. */
const UNKNOWN_TOPIC = 'Totally Fake Topic — Not In Map';

function makeInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    topic: TIER_1_TOPIC,
    accuracy: 0.5,
    daysSinceLastReview: 7,
    daysOverdue: 0,
    questionsSeen: 10,
    ...overrides,
  };
}

describe('scoreRecommendation', () => {
  it('(a) ranks high-yield × weak × overdue above low-yield × fresh', () => {
    const strong = scoreRecommendation(
      makeInput({
        topic: TIER_1_TOPIC,
        accuracy: 0.3,       // weakness = 0.7
        daysOverdue: 14,     // overdue = 2
        daysSinceLastReview: 20,
        questionsSeen: 50,
      })
    );

    const fresh = scoreRecommendation(
      makeInput({
        topic: TIER_3_TOPIC,
        accuracy: 0.9,       // weakness = 0.1
        daysOverdue: 0,
        daysSinceLastReview: 1,
        questionsSeen: 50,
      })
    );

    expect(strong.score).toBeGreaterThan(fresh.score);
  });

  it('(b) applies confidenceDamp (0.3x) when questionsSeen < 5', () => {
    const under = scoreRecommendation(
      makeInput({ accuracy: 0.4, daysOverdue: 7, questionsSeen: 3 })
    );
    const over = scoreRecommendation(
      makeInput({ accuracy: 0.4, daysOverdue: 7, questionsSeen: 20 })
    );

    expect(under.score).toBeLessThan(over.score);
    // damp is 0.3x vs 1x, so ratio should be ~0.3 (allow float slack).
    expect(under.score / over.score).toBeCloseTo(0.3, 2);
  });

  it('(c) unknown topic defaults yieldW = 0.4', () => {
    const r = scoreRecommendation(makeInput({ topic: UNKNOWN_TOPIC }));
    expect(r.factors.yield).toBe(0.4);
  });

  it('(d) recency is capped at 30 days', () => {
    const thirty = scoreRecommendation(makeInput({ daysSinceLastReview: 30 }));
    const ninety = scoreRecommendation(makeInput({ daysSinceLastReview: 90 }));
    expect(thirty.score).toBe(ninety.score);
    // recency factor itself should hit its ceiling (1.0) at >= 30 days.
    expect(thirty.factors.recency).toBe(1);
    expect(ninety.factors.recency).toBe(1);
  });

  it('(e) Hebrew reason string contains the topic name', () => {
    const r = scoreRecommendation(makeInput({ topic: TIER_1_TOPIC }));
    expect(r.reason).toContain(TIER_1_TOPIC);
    // sanity: reason should not be empty / placeholder
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it('(bonus) overdue is clamped at 3 (21 days = cap)', () => {
    const cap = scoreRecommendation(makeInput({ daysOverdue: 21 }));
    const past = scoreRecommendation(makeInput({ daysOverdue: 365 }));
    expect(cap.factors.overdue).toBe(3);
    expect(past.factors.overdue).toBe(3);
    expect(cap.score).toBe(past.score);
  });
});
