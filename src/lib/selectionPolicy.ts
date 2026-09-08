// Bounded selection foundations (Phase 3A). Pure: no I/O, no Date.now(), no
// Math.random() unless the caller leaves `random` unset. Callers keep using
// selectSmartQuestions until integration; nothing here is wired yet.
//
// Contract (SRS-IMPLEMENTATION-HANDOFF + PHASE-3A-HANDOFF):
//   - the caller's pool is authoritative — never widened, result ⊆ pool
//   - practice: unrestricted (every eligible question, shuffled)
//   - exam: unseen first, then mistakes, then due, then repeated, then unknown
//   - mistakesOnly never falls back to other buckets
//   - cooldown / future-schedule are never bypassed to fill a count; the only
//     exception is explicit manual practice (`manual`), which lifts both filters
//     because the user asked for repeats — never in exam mode
//   - `rank` orders inside a tier (exam) or across the eligible set (practice);
//     it never moves a question across tiers, and ties keep the shuffled order
//   - no arbitrary cap: count is limited only by the eligible pool
//   - every shortfall is disclosed, never guessed away
import type { HistoryEntry, Question } from '@/lib/types';
import { KEYS } from '@/lib/types';
import type { SrsRecord } from '@/lib/srsRepository';
import { isInCooldown } from '@/lib/srsCooldown';
import { isFutureScheduled } from '@/lib/srsScheduleFilter';

export type SelectionMode = 'practice' | 'exam';

export type QuestionBucket = 'new' | 'mistake' | 'due' | 'repeated' | 'unknown';

/** Exam tier order. `unknown` (ambiguous history) is the last resort, never a mistake. */
export const EXAM_TIER_ORDER: readonly QuestionBucket[] = ['new', 'mistake', 'due', 'repeated', 'unknown'];

export type SelectionComposition = Record<QuestionBucket, number>;

export type ShortageReason = 'none' | 'invalid-count' | 'empty-pool' | 'no-eligible-mistakes' | 'pool-exhausted';

export type SelectionShortage = {
  requested: number;
  selected: number;
  missing: number;
  reason: ShortageReason;
  /** Why pool entries were not eligible. Counts, so the UI can explain instead of silently widening. */
  excluded: { duplicate: number; cooldown: number; futureScheduled: number; notMistake: number };
};

export type SelectionOptions = {
  mode: SelectionMode;
  count: number;
  mistakesOnly?: boolean;
  /**
   * Explicit user intent (Setup practice / review / mistakes-only): repeats are wanted, so the
   * adaptive cooldown and future-schedule filters are lifted. Honoured in practice mode only;
   * exam filtering is never switched off. Dedupe, pool, and mistakesOnly still apply.
   */
  manual?: boolean;
  /** Higher ranks first within the approved tiers; ties keep the shuffled order. */
  rank?: (question: Question) => number;
  /** Frozen clock for tests; defaults to Date.now(). */
  nowMs?: number;
  /** Injectable RNG in [0, 1); defaults to Math.random. */
  random?: () => number;
};

export type SelectionResult = {
  questions: Question[];
  composition: SelectionComposition;
  shortage: SelectionShortage;
};

/**
 * Bucket a question from the persisted history shape (`user_answers` → HistoryEntry).
 *
 * - no history or SRS row → 'new'
 * - SRS row without history → 'unknown' (persisted evidence conflicts with the missing history read)
 * - row with answered 0 or lastResult null → 'unknown' (unscored / ambiguous: never a mistake, never new)
 * - lastResult 'wrong' → 'mistake' (last scored answer defines it; beats 'due')
 * - lastResult 'correct' and next_review_date ≤ now → 'due' (a later correct answer removes the mistake)
 * - otherwise → 'repeated'
 */
export function classifyQuestion(
  questionId: string,
  history: Record<string, HistoryEntry>,
  srsData: Record<string, SrsRecord>,
  nowMs: number,
): QuestionBucket {
  const entry = history[questionId];
  if (!entry) return srsData[questionId] ? 'unknown' : 'new';
  if (entry.answered === 0 || entry.lastResult === null) return 'unknown';
  if (entry.lastResult === 'wrong') return 'mistake';
  const nextReview = srsData[questionId]?.next_review_date;
  const reviewMs = nextReview ? Date.parse(nextReview) : Number.NaN;
  // ponytail: date-only next_review_date parses as UTC midnight; same convention as srsScheduleFilter.
  if (!Number.isNaN(reviewMs) && reviewMs <= nowMs) return 'due';
  return 'repeated';
}

const emptyComposition = (): SelectionComposition => ({ new: 0, mistake: 0, due: 0, repeated: 0, unknown: 0 });

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  // Fisher–Yates on a copy; the input is never mutated.
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Tagged = { question: Question; bucket: QuestionBucket };

export function selectBounded(
  pool: readonly Question[],
  history: Record<string, HistoryEntry>,
  srsData: Record<string, SrsRecord>,
  options: SelectionOptions,
): SelectionResult {
  const { mode, count, mistakesOnly = false, manual = false, rank } = options;
  const adaptive = !(manual && mode === 'practice');
  const nowMs = options.nowMs ?? Date.now();
  const random = options.random ?? Math.random;
  const excluded = { duplicate: 0, cooldown: 0, futureScheduled: 0, notMistake: 0 };
  const done = (questions: Question[], reason: ShortageReason): SelectionResult => {
    const composition = emptyComposition();
    for (const q of questions) composition[classifyQuestion(q[KEYS.ID], history, srsData, nowMs)] += 1;
    const requested = Number.isInteger(count) && count > 0 ? count : 0;
    return {
      questions,
      composition,
      shortage: { requested, selected: questions.length, missing: requested - questions.length, reason, excluded },
    };
  };

  if (!Number.isInteger(count) || count <= 0) return done([], 'invalid-count');
  if (pool.length === 0) return done([], 'empty-pool');

  // Eligibility: dedupe by id (keep first), then the two SRS filters (lifted only for manual practice).
  const seen = new Set<string>();
  const eligible: Tagged[] = [];
  for (const question of pool) {
    const id = question[KEYS.ID];
    if (seen.has(id)) { excluded.duplicate += 1; continue; }
    seen.add(id);
    if (adaptive && isInCooldown(id, history, nowMs)) { excluded.cooldown += 1; continue; }
    if (adaptive && isFutureScheduled(id, srsData, nowMs)) { excluded.futureScheduled += 1; continue; }
    const bucket = classifyQuestion(id, history, srsData, nowMs);
    if (mistakesOnly && bucket !== 'mistake') { excluded.notMistake += 1; continue; }
    eligible.push({ question, bucket });
  }

  if (mistakesOnly && eligible.length === 0) return done([], 'no-eligible-mistakes');

  // Shuffle first, then a stable sort by rank: equal ranks (or no rank) keep the random order.
  const order = (items: Tagged[]): Tagged[] => {
    const shuffled = shuffle(items, random);
    if (!rank) return shuffled;
    return shuffled.map(t => ({ t, score: rank(t.question) })).sort((a, b) => b.score - a.score).map(x => x.t);
  };
  const ordered = mode === 'exam'
    ? EXAM_TIER_ORDER.flatMap(tier => order(eligible.filter(t => t.bucket === tier)))
    : order(eligible);

  const picked = ordered.slice(0, count).map(t => t.question);
  return done(picked, picked.length < count ? 'pool-exhausted' : 'none');
}
