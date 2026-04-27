import { describe, it, expect } from 'vitest';
import { confidenceFromCorrectness } from '@/lib/srsConfidence';

// Bug B: exam and simulation modes don't ask the user for a confidence level,
// so we must derive one from correctness for the SM-2 update to be correct:
//   correct  -> 'confident' (full SM-2 progression: 1 → 6 → prev × ease)
//   wrong    -> 'guessed'   (reset: interval=1, reps=0, ease-0.2)
//
// Previously simulation hardcoded 'confident' even for wrong answers — the
// inner SM-2 logic at AppContext.tsx:486 still hits the reset branch via
// `!isCorrect`, so behaviorally it works, but the `confidence` value stored
// in spaced_repetition is misleading and corrupts confidence-based stats.
describe('confidenceFromCorrectness', () => {
  it('maps a correct answer to "confident"', () => {
    expect(confidenceFromCorrectness(true)).toBe('confident');
  });

  it('maps a wrong answer to "guessed" (so SM-2 resets the interval)', () => {
    expect(confidenceFromCorrectness(false)).toBe('guessed');
  });
});
