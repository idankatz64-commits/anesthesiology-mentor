import { describe, it, expect } from "vitest";
import { mapImportRow, dedupeById } from "@/lib/importMapping";
import { hashId } from "@/lib/questionId";

describe("mapImportRow", () => {
  it("resolves header aliases and normalizes key case/whitespace", () => {
    const m = mapImportRow({ "  QuestionText ": "Q?", " OptionA ": "x", CorrectAnswer: "b" });
    expect(m?.question).toBe("Q?");
    expect(m?.a).toBe("x");
    expect(m?.correct).toBe("B");
  });

  it("returns null when the question text is missing", () => {
    expect(mapImportRow({ a: "x", b: "y" })).toBeNull();
  });

  it("uppercases correct and defaults to 'A' when absent", () => {
    expect(mapImportRow({ question: "Q", correct: "c" })?.correct).toBe("C");
    expect(mapImportRow({ question: "Q" })?.correct).toBe("A");
  });

  it("falls back to hashId(question) when no id/serial column is present", () => {
    const m = mapImportRow({ question: "Some question" });
    expect(m?.id).toBe(hashId("Some question"));
  });

  it("prefers an explicit id over the hash", () => {
    expect(mapImportRow({ question: "Q", id: "EXPLICIT" })?.id).toBe("EXPLICIT");
  });
});

describe("dedupeById", () => {
  it("keeps the first occurrence of each id", () => {
    const rows = [
      { id: "1", v: "first" },
      { id: "2", v: "x" },
      { id: "1", v: "second" },
    ];
    expect(dedupeById(rows)).toEqual([
      { id: "1", v: "first" },
      { id: "2", v: "x" },
    ]);
  });
});
