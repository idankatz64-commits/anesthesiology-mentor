import type { ConfidenceLevel } from "./types";

export type SrsState = {
  interval_days: number;
  ease_factor: number;
  repetitions: number;
};

export const DEFAULT_SRS_STATE: SrsState = {
  interval_days: 1,
  ease_factor: 2.5,
  repetitions: 0,
};

/**
 * Pure SM-2 progression. Given the prior scheduling state and how the user
 * answered (correctness + confidence), returns the next
 * {interval_days, ease_factor, repetitions}. Interval is clamped to [1, 365]
 * and ease to [1.3, 4.0]. Extracted verbatim from updateSpacedRepetition so the
 * core review-scheduling math is unit-testable.
 */
export function computeNextSrsState(
  prev: Partial<SrsState> | null | undefined,
  isCorrect: boolean,
  confidence: ConfidenceLevel,
): SrsState {
  let interval = prev?.interval_days ?? DEFAULT_SRS_STATE.interval_days;
  let ease = prev?.ease_factor ?? DEFAULT_SRS_STATE.ease_factor;
  let reps = prev?.repetitions ?? DEFAULT_SRS_STATE.repetitions;

  if (!isCorrect || confidence === "guessed") {
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
    reps = 0;
  } else if (confidence === "hesitant") {
    // SM-2 ramp with penalty: guesses/hesitations come back sooner
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 3;
    else interval = Math.max(1, Math.min(365, Math.round(interval * 1.2)));
    ease = Math.max(1.3, ease - 0.05);
    reps++;
  } else {
    // Confident: standard SM-2 progression (1 → 6 → prev×ease)
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.max(1, Math.min(365, Math.round(interval * ease)));
    ease = Math.min(4.0, ease + 0.1);
    reps++;
  }

  return { interval_days: interval, ease_factor: ease, repetitions: reps };
}
