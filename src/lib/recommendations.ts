import { YIELD_TIER_MAP } from '@/lib/smartSelection';

/**
 * Stats V2 recommendation scoring.
 * Contract & rationale: .planning/phase-1/RESEARCH.md §Recommendation Logic.
 * Tests: src/lib/recommendations.test.ts
 */

export interface RecommendationInput {
  topic: string;
  /** Accuracy on this topic in [0, 1] (e.g. 0.42 = 42 % correct). */
  accuracy: number;
  /** Days since the user last practiced this topic. */
  daysSinceLastReview: number;
  /** Days past SRS due date (0 if not overdue). */
  daysOverdue: number;
  /** Total questions the user has answered in this topic. */
  questionsSeen: number;
}

export interface RecommendationFactors {
  yield: number;
  weakness: number;
  overdue: number;
  recency: number;
  confidenceDamp: number;
}

export interface Recommendation {
  topic: string;
  score: number;
  factors: RecommendationFactors;
  /** Hebrew-language rationale, user-facing. Always contains the topic name. */
  reason: string;
}

const UNKNOWN_TOPIC_YIELD = 0.4;
const CONFIDENCE_THRESHOLD = 5;
const CONFIDENCE_DAMP = 0.3;
const OVERDUE_CAP_DAYS = 21;
const RECENCY_CAP_DAYS = 30;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

function resolveYield(topic: string): number {
  return YIELD_TIER_MAP[topic] ?? UNKNOWN_TOPIC_YIELD;
}

function buildReason(topic: string, f: RecommendationFactors): string {
  const parts: string[] = [];
  if (f.weakness >= 0.5) parts.push('חולשה גבוהה');
  else if (f.weakness >= 0.3) parts.push('חולשה בינונית');
  if (f.overdue >= 1) parts.push('באיחור לחזרה');
  if (f.yield >= 0.9) parts.push('נושא בעל תשואה גבוהה');
  if (f.confidenceDamp < 1) parts.push('מדגם קטן');

  const suffix = parts.length > 0 ? ` — ${parts.join(', ')}` : '';
  return `${topic}${suffix}`;
}

export function scoreRecommendation(input: RecommendationInput): Recommendation {
  const yieldW = resolveYield(input.topic);
  const weakness = clamp(1 - input.accuracy, 0, 1);
  const overdue = clamp(input.daysOverdue / 7, 0, OVERDUE_CAP_DAYS / 7);
  const recency = Math.min(input.daysSinceLastReview, RECENCY_CAP_DAYS) / RECENCY_CAP_DAYS;
  const confidenceDamp = input.questionsSeen >= CONFIDENCE_THRESHOLD ? 1 : CONFIDENCE_DAMP;

  const score =
    yieldW * weakness * (1 + overdue) * (0.5 + recency) * confidenceDamp;

  const factors: RecommendationFactors = {
    yield: yieldW,
    weakness,
    overdue,
    recency,
    confidenceDamp,
  };

  return {
    topic: input.topic,
    score,
    factors,
    reason: buildReason(input.topic, factors),
  };
}
