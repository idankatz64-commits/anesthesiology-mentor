import { describe, it, expect } from "vitest";
import { sanitizeImport } from "@/lib/importValidation";

describe("sanitizeImport", () => {
  it("passes valid progress through unchanged", () => {
    const valid = {
      history: { q1: { answered: 3, correct: 2, lastResult: "correct", everWrong: true, timestamp: 1700000000000 } },
      notes: { q1: "a note" },
      favorites: ["q1", "q2"],
      ratings: { q1: "easy" },
      tags: { q1: ["hard-topic"] },
    };
    expect(sanitizeImport(valid)).toEqual(valid);
  });

  it("returns an empty UserProgress for null/garbage input", () => {
    const empty = { history: {}, notes: {}, favorites: [], ratings: {}, tags: {} };
    expect(sanitizeImport(null)).toEqual(empty);
    expect(sanitizeImport("nonsense")).toEqual(empty);
    expect(sanitizeImport(42)).toEqual(empty);
  });

  it("drops history entries whose counts are not non-negative integers", () => {
    const out = sanitizeImport({
      history: {
        good: { answered: 1, correct: 1, lastResult: "correct", everWrong: false, timestamp: 1 },
        stringCount: { answered: "5", correct: 0, lastResult: null, everWrong: false, timestamp: 1 },
        negative: { answered: -2, correct: 0, lastResult: null, everWrong: false, timestamp: 1 },
        missing: { correct: 0 },
      },
    });
    expect(Object.keys(out.history)).toEqual(["good"]);
  });

  it("clamps correct to never exceed answered", () => {
    const out = sanitizeImport({
      history: { q: { answered: 2, correct: 9, lastResult: "correct", everWrong: false, timestamp: 0 } },
    });
    expect(out.history.q.correct).toBe(2);
  });

  it("coerces an out-of-enum lastResult to null and a bad timestamp to 0 without dropping the entry", () => {
    const out = sanitizeImport({
      history: { q: { answered: 1, correct: 0, lastResult: "skipped", everWrong: "yes", timestamp: "oops" } },
    });
    expect(out.history.q).toEqual({ answered: 1, correct: 0, lastResult: null, everWrong: false, timestamp: 0 });
  });

  it("keeps only easy/medium/hard ratings", () => {
    const out = sanitizeImport({ ratings: { a: "easy", b: "extreme", c: "hard", d: 5 } });
    expect(out.ratings).toEqual({ a: "easy", c: "hard" });
  });

  it("caps note length and drops non-string notes", () => {
    const out = sanitizeImport({ notes: { a: "x".repeat(9000), b: 123 } });
    expect(out.notes.a.length).toBe(5000);
    expect(out.notes.b).toBeUndefined();
  });

  it("filters non-string tags, caps tag length, and drops empty tag arrays", () => {
    const out = sanitizeImport({
      tags: { a: ["ok", 7, "", "y".repeat(200)], b: ["only-numbers", 1, 2], c: [3, 4], d: "notarray" },
    });
    expect(out.tags.a).toEqual(["ok", "y".repeat(100)]);
    expect(out.tags.b).toEqual(["only-numbers"]);
    expect(out.tags.c).toBeUndefined();
    expect(out.tags.d).toBeUndefined();
  });

  it("drops non-string favorites", () => {
    const out = sanitizeImport({ favorites: ["q1", 2, null, "q2", ""] });
    expect(out.favorites).toEqual(["q1", "q2"]);
  });
});
