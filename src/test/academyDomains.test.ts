import { describe, it, expect } from "vitest";
import { ACADEMY_DOMAINS, UNCLASSIFIED_DOMAIN, domainOfChapter } from "@/lib/academyDomains";

describe("academyDomains", () => {
  it("covers every Miller chapter 1..87 exactly once", () => {
    const seen = new Map<number, string>();
    for (const d of ACADEMY_DOMAINS) {
      for (const ch of d.chapters) {
        expect(seen.has(ch), `chapter ${ch} mapped twice`).toBe(false);
        seen.set(ch, d.id);
      }
    }
    for (let ch = 1; ch <= 87; ch++) {
      expect(seen.has(ch), `chapter ${ch} unmapped`).toBe(true);
    }
    expect(seen.size).toBe(87);
  });

  it("maps known chapters to the right domain", () => {
    expect(domainOfChapter(12)).toBe("פיזיולוגיה"); // Respiratory Physiology
    expect(domainOfChapter(22)).toBe("פרמקולוגיה"); // Opioids
    expect(domainOfChapter(40)).toBe("נתיב אוויר והרדמה אזורית"); // Airway
    expect(domainOfChapter(58)).toBe("מיילדות"); // Obstetrics
    expect(domainOfChapter(72)).toBe("ילדים"); // Pediatric
    expect(domainOfChapter(82)).toBe("טיפול נמרץ, החייאה וחירום"); // ACLS
  });

  it("returns unclassified for 0, null, undefined, out-of-range", () => {
    expect(domainOfChapter(0)).toBe(UNCLASSIFIED_DOMAIN);
    expect(domainOfChapter(null)).toBe(UNCLASSIFIED_DOMAIN);
    expect(domainOfChapter(undefined)).toBe(UNCLASSIFIED_DOMAIN);
    expect(domainOfChapter(999)).toBe(UNCLASSIFIED_DOMAIN);
  });
});
