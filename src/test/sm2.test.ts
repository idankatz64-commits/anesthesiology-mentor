import { describe, it, expect } from "vitest";
import { computeNextSrsState, DEFAULT_SRS_STATE } from "@/lib/sm2";

describe("computeNextSrsState (SM-2 progression)", () => {
  it("first correct+confident: reps 0 -> interval 1, reps 1, ease +0.1", () => {
    const s = computeNextSrsState(null, true, "confident");
    expect(s.interval_days).toBe(1);
    expect(s.repetitions).toBe(1);
    expect(s.ease_factor).toBeCloseTo(2.6, 5);
  });

  it("second correct+confident: reps 1 -> interval 6, reps 2", () => {
    const s = computeNextSrsState({ interval_days: 1, ease_factor: 2.6, repetitions: 1 }, true, "confident");
    expect(s.interval_days).toBe(6);
    expect(s.repetitions).toBe(2);
    expect(s.ease_factor).toBeCloseTo(2.7, 5);
  });

  it("third correct+confident: interval = round(prev * ease)", () => {
    const s = computeNextSrsState({ interval_days: 6, ease_factor: 2.7, repetitions: 2 }, true, "confident");
    expect(s.interval_days).toBe(16); // round(6 * 2.7) = round(16.2) = 16
    expect(s.repetitions).toBe(3);
    expect(s.ease_factor).toBeCloseTo(2.8, 5);
  });

  it("wrong answer resets: interval 1, reps 0, ease -0.2", () => {
    const s = computeNextSrsState({ interval_days: 16, ease_factor: 2.8, repetitions: 3 }, false, "confident");
    expect(s.interval_days).toBe(1);
    expect(s.repetitions).toBe(0);
    expect(s.ease_factor).toBeCloseTo(2.6, 5);
  });

  it("guessed counts as a reset even when isCorrect is true", () => {
    const s = computeNextSrsState({ interval_days: 20, ease_factor: 2.5, repetitions: 4 }, true, "guessed");
    expect(s.interval_days).toBe(1);
    expect(s.repetitions).toBe(0);
    expect(s.ease_factor).toBeCloseTo(2.3, 5);
  });

  it("hesitant ramp: reps 0->1, reps 1->3, reps>=2 -> round(interval*1.2)", () => {
    const a = computeNextSrsState(null, true, "hesitant");
    expect(a.interval_days).toBe(1);
    expect(a.repetitions).toBe(1);
    expect(a.ease_factor).toBeCloseTo(2.45, 5);
    const b = computeNextSrsState({ interval_days: 1, ease_factor: 2.45, repetitions: 1 }, true, "hesitant");
    expect(b.interval_days).toBe(3);
    expect(b.repetitions).toBe(2);
    const c = computeNextSrsState({ interval_days: 3, ease_factor: 2.4, repetitions: 2 }, true, "hesitant");
    expect(c.interval_days).toBe(4); // round(3 * 1.2) = round(3.6) = 4
  });

  it("clamps interval to a 365-day maximum", () => {
    const s = computeNextSrsState({ interval_days: 300, ease_factor: 2.5, repetitions: 5 }, true, "confident");
    expect(s.interval_days).toBe(365); // min(365, round(300 * 2.5))
  });

  it("clamps ease_factor to [1.3, 4.0]", () => {
    const floor = computeNextSrsState({ interval_days: 1, ease_factor: 1.3, repetitions: 0 }, false, "confident");
    expect(floor.ease_factor).toBe(1.3);
    const cap = computeNextSrsState({ interval_days: 1, ease_factor: 4.0, repetitions: 0 }, true, "confident");
    expect(cap.ease_factor).toBe(4.0);
  });

  it("falls back to default state when prev is missing", () => {
    expect(DEFAULT_SRS_STATE).toEqual({ interval_days: 1, ease_factor: 2.5, repetitions: 0 });
    const s = computeNextSrsState(undefined, true, "confident");
    expect(s.interval_days).toBe(1);
    expect(s.repetitions).toBe(1);
  });
});
