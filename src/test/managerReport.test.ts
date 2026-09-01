import { describe, it, expect } from "vitest";
import {
  accuracyPct,
  trendDelta,
  residentStatus,
  chapterWeaknesses,
  buildResidentSummary,
  type OverviewRow,
  type MemberChapterRow,
} from "@/lib/managerReport";

const base: OverviewRow = {
  user_id: "u1",
  display_name: "דנה",
  residency_year: 2,
  is_academy_member: true,
  answered_total: 500,
  coverage: 400,
  current_correct: 300,
  qs_last30: 100,
  correct_last30: 80,
  qs_prev30: 100,
  correct_prev30: 70,
  last_active: new Date().toISOString(),
};

describe("accuracyPct / trendDelta", () => {
  it("computes current-state accuracy", () => {
    expect(accuracyPct(300, 400)).toBe(75);
    expect(accuracyPct(0, 0)).toBeNull();
  });

  it("trend = last30 accuracy minus prev30 accuracy, null without data", () => {
    expect(trendDelta(base)).toBe(10);
    expect(trendDelta({ ...base, qs_prev30: 0, correct_prev30: 0 })).toBeNull();
    expect(trendDelta({ ...base, qs_last30: 0, correct_last30: 0 })).toBeNull();
  });
});

describe("residentStatus", () => {
  it("active recently with non-negative trend → פעיל", () => {
    expect(residentStatus(base, new Date())).toBe("active");
  });

  it("dropping trend → attention", () => {
    expect(residentStatus({ ...base, correct_last30: 60 }, new Date())).toBe("attention");
  });

  it("inactive 14+ days → attention", () => {
    const old = new Date(Date.now() - 15 * 86400000).toISOString();
    expect(residentStatus({ ...base, last_active: old, qs_last30: 0, correct_last30: 0 }, new Date())).toBe(
      "attention",
    );
  });

  it("no recent answers but seen within 14d → steady", () => {
    const recent = new Date(Date.now() - 5 * 86400000).toISOString();
    expect(residentStatus({ ...base, last_active: recent, qs_last30: 0, correct_last30: 0 }, new Date())).toBe(
      "steady",
    );
  });
});

describe("chapterWeaknesses — the approved rule: first-exposure <70% on ≥20 exposures", () => {
  const ch = (over: Partial<MemberChapterRow>): MemberChapterRow => ({
    chapter: 13,
    topic: "Cardiac Physiology",
    seen: 50,
    current_correct: 30,
    answered_total: 80,
    first_seen: 30,
    first_correct: 15,
    ...over,
  });

  it("flags a chapter below threshold with enough exposures", () => {
    expect(chapterWeaknesses([ch({})]).map((c) => c.chapter)).toEqual([13]);
  });

  it("ignores chapters with <20 first exposures even when weak", () => {
    expect(chapterWeaknesses([ch({ first_seen: 10, first_correct: 2 })])).toEqual([]);
  });

  it("ignores strong chapters", () => {
    expect(chapterWeaknesses([ch({ first_correct: 25 })])).toEqual([]);
  });

  it("sorts weakest first", () => {
    const rows = [ch({ chapter: 1, first_correct: 20 }), ch({ chapter: 2, first_correct: 10 })];
    expect(chapterWeaknesses(rows).map((c) => c.chapter)).toEqual([2, 1]);
  });
});

describe("buildResidentSummary", () => {
  const chapters: MemberChapterRow[] = [
    {
      chapter: 43,
      topic: "Fluids",
      seen: 40,
      current_correct: 36,
      answered_total: 60,
      first_seen: 40,
      first_correct: 34,
    },
    {
      chapter: 25,
      topic: "Local Anesthetics",
      seen: 30,
      current_correct: 12,
      answered_total: 40,
      first_seen: 30,
      first_correct: 12,
    },
  ];

  it("Hebrew summary names strongest and weakest chapters and overall accuracy", () => {
    const s = buildResidentSummary(base, chapters, 4263, "he");
    expect(s).toContain("75%");
    expect(s).toContain("Fluids");
    expect(s).toContain("Local Anesthetics");
  });

  it("English summary is produced for the export", () => {
    const s = buildResidentSummary(base, chapters, 4263, "en");
    expect(s).toMatch(/accuracy/i);
    expect(s).toContain("Fluids");
  });

  it("handles a resident with no chapter data", () => {
    const s = buildResidentSummary({ ...base, coverage: 0, current_correct: 0 }, [], 4263, "he");
    expect(s.length).toBeGreaterThan(10);
  });
});
