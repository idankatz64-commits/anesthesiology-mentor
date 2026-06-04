import { describe, it, expect } from "vitest";
import { COHORT_RESIDENTS, COHORT_TOPICS } from "@/data/cohortMockData";
import { cohortInsights, cohortReportSummary, cohortReportRecommendations } from "@/lib/cohortReport";

describe("cohortInsights", () => {
  const ins = cohortInsights(COHORT_RESIDENTS, COHORT_TOPICS, "en");

  it("reports the full cohort size", () => {
    expect(ins.kpis.activeResidents).toBe(12);
  });

  it("counts trending up / down from each resident's trend", () => {
    expect(ins.trendingUp).toBe(6);
    expect(ins.trendingDown).toBe(1);
  });

  it("flags residents that are attention-signalled or declining", () => {
    expect(ins.attention.length).toBe(3);
  });

  it("bins every resident into exactly one accuracy band", () => {
    const total = ins.bands.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(COHORT_RESIDENTS.length);
  });

  it("surfaces the weakest shared topic first (program teaching target)", () => {
    expect(ins.weakTopics[0].topic).toBe("Local Anesthetic Toxicity (LAST)");
    expect(ins.strongTopics[0].avgAccuracy).toBeGreaterThan(ins.weakTopics[0].avgAccuracy);
  });
});

describe("cohortReportSummary", () => {
  it("English carries cohort size + the shared weak spot", () => {
    const ins = cohortInsights(COHORT_RESIDENTS, COHORT_TOPICS, "en");
    const s = cohortReportSummary(ins, "en");
    expect(s).toContain("12");
    expect(s).toContain(ins.weakTopics[0].topic);
  });

  it("Hebrew differs and is in Hebrew", () => {
    const en = cohortReportSummary(cohortInsights(COHORT_RESIDENTS, COHORT_TOPICS, "en"), "en");
    const he = cohortReportSummary(cohortInsights(COHORT_RESIDENTS, COHORT_TOPICS, "he"), "he");
    expect(he).not.toBe(en);
    expect(he).toContain("מחזור");
  });
});

describe("cohortReportRecommendations", () => {
  it("recommends a program-level review of the weakest topic and a check-in when residents are flagged", () => {
    const ins = cohortInsights(COHORT_RESIDENTS, COHORT_TOPICS, "en");
    const recos = cohortReportRecommendations(ins, "en");
    expect(recos.length).toBeGreaterThanOrEqual(2);
    expect(recos.some((r) => r.includes(ins.weakTopics[0].topic))).toBe(true);
    expect(recos.some((r) => r.toLowerCase().includes("check-in"))).toBe(true);
  });
});
