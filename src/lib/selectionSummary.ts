import type { HistoryEntry, Question, SessionMode } from '@/lib/types';
import type { SrsRecord } from '@/lib/srsRepository';
import { computeSmartScore, computeTopicStats, getExamProximityPhase } from '@/lib/smartSelection';
import { EXAM_TIER_ORDER, type SelectionComposition, type SelectionMode, type SelectionShortage } from '@/lib/selectionPolicy';

/** Persisted session mode → selection policy. Practice/review never becomes an exam; exam/simulation prefer unseen. */
export function policyModeFor(mode: SessionMode): SelectionMode {
  return mode === 'exam' || mode === 'simulation' ? 'exam' : 'practice';
}

const BUCKET_LABEL = { new: 'חדשות', mistake: 'טעויות', due: 'לחזרה', repeated: 'חזרות', unknown: 'לא ידוע' } as const;

/** "חדשות 12 · טעויות 3" — non-zero buckets only, exam tier order. */
export function compositionText(composition: SelectionComposition): string {
  return EXAM_TIER_ORDER.filter(b => composition[b] > 0).map(b => `${BUCKET_LABEL[b]} ${composition[b]}`).join(' · ');
}

const ZERO_REASON: Record<SelectionShortage['reason'], string> = {
  none: '',
  'invalid-count': 'מספר השאלות חייב להיות מספר שלם חיובי',
  'empty-pool': 'הסינון הנוכחי לא מחזיר שאלות',
  'no-eligible-mistakes': 'אין כרגע טעויות זמינות לתרגול',
  'pool-exhausted': 'אין כרגע שאלות זמינות בסינון הזה',
};

/** '' when the request was met in full; otherwise the shortage and why entries were excluded. */
export function shortageText(shortage: SelectionShortage): string {
  if (shortage.reason === 'none') return '';
  const { requested, selected, excluded } = shortage;
  const head = selected === 0 ? ZERO_REASON[shortage.reason] : `נמצאו ${selected} מתוך ${requested} שהתבקשו`;
  const why = [
    [excluded.cooldown, 'נענו לאחרונה'],
    [excluded.futureScheduled, 'מתוזמנות לעוד יותר משבוע'],
    [excluded.notMistake, 'אינן טעויות'],
    [excluded.duplicate, 'כפילויות'],
  ].filter(([n]) => (n as number) > 0).map(([n, label]) => `${n} ${label}`).join(', ');
  return why ? `${head} — ${why}` : head;
}

/** mulberry32: a seed reproduces the same shuffle, so a preview equals the started set. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weight profiles for computeSmartScore, factor order
// [srsUrgency, topicWeakness, recencyGap, streakPenalty, examProximity, yieldBoost].
// ponytail: duplicated from smartSelection.ts WEIGHT_PROFILES / PHASE_OVERRIDES — they are not
// exported and that file is out of scope this phase. Export them there and delete these copies.
const RANK_WEIGHTS: Record<'quick' | 'regular' | 'long', number[]> = {
  quick: [0.40, 0.30, 0.15, 0.05, 0.00, 0.10],
  regular: [0.30, 0.25, 0.20, 0.10, 0.05, 0.10],
  long: [0.25, 0.25, 0.20, 0.10, 0.10, 0.10],
};
const PHASE_WEIGHTS: Record<'approaching' | 'imminent', { topicWeakness: number; examProximity: number }> = {
  approaching: { topicWeakness: 0.30, examProximity: 0.10 },
  imminent: { topicWeakness: 0.35, examProximity: 0.20 },
};

/**
 * The existing smartScore prioritisation (SRS urgency, topic weakness, recency, wrong streak,
 * exam proximity, topic yield) as a `rank` for selectBounded: it orders inside the approved
 * tiers, so unseen-first is preserved and no per-topic quota is reintroduced.
 * Topic stats come from the whole visible bank, not the filtered pool, so a topic filter
 * does not erase the learner's history in other topics.
 */
export function smartRank(
  bank: Question[],
  history: Record<string, HistoryEntry>,
  srsData: Record<string, SrsRecord>,
  count: number,
): (question: Question) => number {
  const weights = [...RANK_WEIGHTS[count <= 15 ? 'quick' : count <= 40 ? 'regular' : 'long']];
  const phase = getExamProximityPhase();
  if (phase !== 'early') {
    weights[1] = PHASE_WEIGHTS[phase].topicWeakness;
    weights[4] = PHASE_WEIGHTS[phase].examProximity;
  }
  const { topicStats, globalAccuracy } = computeTopicStats(history, bank);
  const params = { srsData, history, topicStats, globalAccuracy, weights };
  return question => computeSmartScore(question, params);
}
