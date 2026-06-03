import { describe, it, expect } from "vitest";
import { hashId } from "@/lib/questionId";

describe("hashId", () => {
  it("is deterministic — same text yields the same id", () => {
    expect(hashId("What is the MAC of sevoflurane?")).toBe(hashId("What is the MAC of sevoflurane?"));
  });

  it("produces a 1-6 char uppercase hex string", () => {
    for (const s of ["A", "AB", "a long question text with spaces", "שאלה בעברית"]) {
      expect(hashId(s)).toMatch(/^[0-9A-F]{1,6}$/);
    }
  });

  it("is stable on known inputs (locks the algorithm against accidental change)", () => {
    expect(hashId("A")).toBe("41");
    expect(hashId("AB")).toBe("821");
  });

  it("diverges for trivially different inputs", () => {
    expect(hashId("question one")).not.toBe(hashId("question two"));
  });
});
