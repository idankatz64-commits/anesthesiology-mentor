/**
 * Uniform Fisher-Yates shuffle. Returns a NEW array; does not mutate the input.
 *
 * Replaces the biased `arr.sort(() => Math.random() - 0.5)` idiom, which does
 * NOT produce a uniform permutation — a sort comparator must return a stable
 * ordering, and a random one violates that, so the engine's distribution is
 * skewed (some positions are far more likely than others).
 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
