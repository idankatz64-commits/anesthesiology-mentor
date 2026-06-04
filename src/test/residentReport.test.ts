import { describe, it, expect } from "vitest";
import { getResidentDetail } from "@/lib/cohortDetail";
import { reportSummary, reportRecommendations } from "@/lib/residentReport";
import { COHORT_RESIDENTS } from "@/data/cohortMockData";

const sample = COHORT_RESIDENTS[0]; // A.L. — active, improving
const declining = COHORT_RESIDENTS.find((r) => r.id === "r06")!; // L.G. — attention, trending down

describe("reportSummary", () => {
  it("English reuses the existing trend-led aiSummary (single source)", () => {
    const detail = getResidentDetail(sample);
    expect(reportSummary(sample, detail, "en")).toBe(detail.aiSummary);
  });

  it("Hebrew differs from English, is non-empty, and carries the key facts", () => {
    const detail = getResidentDetail(sample);
    const he = reportSummary(sample, detail, "he");
    expect(he).not.toBe(detail.aiSummary);
    expect(he.length).toBeGreaterThan(0);
    expect(he).toContain(sample.initials); // resident identity
    expect(he).toContain(`${sample.accuracy}%`); // accuracy fact
    expect(he).toContain("דיוק"); // actually Hebrew, not English
  });

  it("is deterministic for a given resident + language", () => {
    const detail = getResidentDetail(sample);
    expect(reportSummary(sample, detail, "he")).toBe(reportSummary(sample, detail, "he"));
  });
});

describe("reportRecommendations", () => {
  it("always returns at least the two focus-area recommendations", () => {
    const detail = getResidentDetail(sample);
    const recos = reportRecommendations(sample, detail, "en");
    expect(recos.length).toBeGreaterThanOrEqual(2);
    recos.forEach((r) => expect(typeof r).toBe("string"));
    expect(recos.filter((r) => r.includes("Miller Ch.")).length).toBeGreaterThanOrEqual(2);
  });

  it("Hebrew focus-area lines reference Miller chapters in Hebrew", () => {
    const detail = getResidentDetail(sample);
    const recos = reportRecommendations(sample, detail, "he");
    expect(recos.filter((r) => r.includes("מילר")).length).toBeGreaterThanOrEqual(2);
  });

  it("flags a check-in for a declining / attention resident", () => {
    const detail = getResidentDetail(declining);
    const recos = reportRecommendations(declining, detail, "en");
    expect(recos.some((r) => r.toLowerCase().includes("check-in"))).toBe(true);
  });
});
