import type { ConfidenceLevel } from './types';

/**
 * Canonical correctness → confidence mapping for non-practice modes.
 *
 * Exam and simulation modes never ask the user "how confident were you?" —
 * they only know whether the answer matched. Every non-practice call site of
 * `updateSpacedRepetition` must funnel through this helper so the SM-2 state
 * is computed consistently:
 *
 *   true  -> 'confident'  (full SM-2: 1 -> 6 -> prev * ease, ease+0.1)
 *   false -> 'guessed'    (reset: interval=1, reps=0, ease-0.2)
 *
 * Storing 'guessed' (rather than hardcoding 'confident' for both branches)
 * keeps the confidence column in spaced_repetition honest and avoids
 * corrupting downstream confidence-bucketed stats.
 */
export function confidenceFromCorrectness(isCorrect: boolean): ConfidenceLevel {
  return isCorrect ? 'confident' : 'guessed';
}
