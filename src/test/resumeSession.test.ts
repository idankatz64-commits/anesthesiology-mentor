import { describe, it, expect } from "vitest";
import { rebuildResumedQuiz } from "@/lib/resumeSession";
import { KEYS, type Question } from "@/lib/types";

const q = (id: string): Question => ({ [KEYS.ID]: id }) as Question;
const mapOf = (...ids: string[]) => new Map(ids.map((id) => [id, q(id)]));

describe("rebuildResumedQuiz", () => {
  it("happy path: answers/confidence align by ID", () => {
    const saved = {
      questionIds: ["a", "b", "c"],
      answers: ["A", "B", "C"],
      confidence: ["confident", "hesitant", "guessed"],
      index: 1,
    };
    const out = rebuildResumedQuiz(saved, mapOf("a", "b", "c"));
    expect(out.quiz.map((x) => x[KEYS.ID])).toEqual(["a", "b", "c"]);
    expect(out.answers).toEqual(["A", "B", "C"]);
    expect(out.confidence).toEqual(["confident", "hesitant", "guessed"]);
    expect(out.validIndex).toBe(1);
  });

  it("keeps answers aligned when a middle question was deleted (no index shift)", () => {
    const saved = {
      questionIds: ["a", "b", "c"],
      answers: ["A", "B", "C"],
      confidence: [null, null, null],
      index: 2,
    };
    const out = rebuildResumedQuiz(saved, mapOf("a", "c")); // b deleted from DB
    expect(out.quiz.map((x) => x[KEYS.ID])).toEqual(["a", "c"]);
    expect(out.answers).toEqual(["A", "C"]); // C stays with c, NOT shifted into b's old slot
    expect(out.validIndex).toBe(1); // min(2, 1)
  });

  it("returns an empty quiz when every saved question was deleted", () => {
    const saved = { questionIds: ["a", "b"], answers: ["A", "B"], confidence: [null, null], index: 1 };
    const out = rebuildResumedQuiz(saved, mapOf("x", "y"));
    expect(out.quiz).toEqual([]);
    expect(out.answers).toEqual([]);
    expect(out.validIndex).toBe(0);
  });

  it("clamps a saved index that is past the surviving quiz length", () => {
    const saved = {
      questionIds: ["a", "b", "c"],
      answers: [null, null, null],
      confidence: [null, null, null],
      index: 5,
    };
    const out = rebuildResumedQuiz(saved, mapOf("a")); // only a survives
    expect(out.quiz.map((x) => x[KEYS.ID])).toEqual(["a"]);
    expect(out.validIndex).toBe(0); // min(5, 0)
  });

  it("fills missing answer/confidence entries with null", () => {
    const saved = { questionIds: ["a", "b"], answers: ["A"], confidence: [], index: 0 };
    const out = rebuildResumedQuiz(saved, mapOf("a", "b"));
    expect(out.answers).toEqual(["A", null]);
    expect(out.confidence).toEqual([null, null]);
  });
});
