import { describe, it, expect } from "vitest";
import { parseEmailList } from "@/lib/academyRepository";

describe("parseEmailList", () => {
  it("splits on newlines/commas/whitespace, lowercases, dedupes", () => {
    const { valid, invalid } = parseEmailList("  A@x.com \n b@y.co.il, a@x.com\nnot-an-email\n");
    expect(valid).toEqual(["a@x.com", "b@y.co.il"]);
    expect(invalid).toEqual(["not-an-email"]);
  });

  it("returns empty arrays for empty input", () => {
    expect(parseEmailList("  \n ")).toEqual({ valid: [], invalid: [] });
  });
});
