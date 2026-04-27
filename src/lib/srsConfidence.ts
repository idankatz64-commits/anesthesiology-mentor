import type { ConfidenceLevel } from './types';

/**
 * Bug B: exam and simulation modes don't ask the user for a confidence level.
 * They only know whether the answer matched. This helper provides the
 * canonical mapping used at every non-practice call site of
 * `updateSpacedRepetition`:
 *
 *   true  -> 'confident'  (full SM-2: 1 -> 6 -> prev * ease, ease+0.1)
 *   false -> 'guessed'    (reset: interval=1, reps=0, ease-0.2)
 *
 * Storing 'guessed' (rather than the previously hardcoded 'confident') keeps
 * the confidence column in spaced_repetition honest and avoids corrupting
 * downstream confidence-bucketed stats.
 */
export function confidenceFromCorrectness(isCorrect: boolean): ConfidenceLevel {
  return isCorrect ? 'confident' : 'guessed';
}
