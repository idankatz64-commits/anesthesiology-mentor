import { describe, it, expect } from "vitest";
import { getResidentDetail, getResidentTrendSeries, type TrendRange } from "@/lib/cohortDetail";
import { COHORT_RESIDENTS, TOPIC_CATALOG } from "@/data/cohortMockData";

const sample = COHORT_RESIDENTS[0];

describe("getResidentDetail", () => {
  it("is deterministic — same resident yields identical detail", () => {
    expect(getResidentDetail(sample)).toEqual(getResidentDetail(sample));
  });

  it("produces one topic per catalog entry, each with its chapters", () => {
    const d = getResidentDetail(sample);
    expect(d.topics).toHaveLength(TOPIC_CATALOG.length);
    d.topics.forEach((t, i) => {
      expect(t.chapters).toHaveLength(TOPIC_CATALOG[i].chapters.length);
    });
  });

  it("keeps every accuracy within the clamped 28–98 range", () => {
    const d = getResidentDetail(sample);
    for (const t of d.topics) {
      expect(t.accuracy).toBeGreaterThanOrEqual(28);
      expect(t.accuracy).toBeLessThanOrEqual(98);
      for (const c of t.chapters) {
        expect(c.accuracy).toBeGreaterThanOrEqual(28);
        expect(c.accuracy).toBeLessThanOrEqual(98);
      }
    }
  });

  it("derives strengths above weaknesses", () => {
    const d = getResidentDetail(sample);
    expect(d.strengths[0].accuracy).toBeGreaterThanOrEqual(d.weaknesses[0].accuracy);
  });

  it("marks completed tasks as done and matches the resident's counts", () => {
    const d = getResidentDetail(sample);
    expect(d.tasks).toHaveLength(sample.tasksTotal);
    expect(d.tasks.filter((t) => t.status === "done")).toHaveLength(sample.tasksCompleted);
  });
});

describe("getResidentTrendSeries", () => {
  const expectedLengths: Record<TrendRange, number> = { week: 7, month: 5, year: 12, all: 18 };

  it("is deterministic for the same resident + range", () => {
    expect(getResidentTrendSeries(sample, "month")).toEqual(getResidentTrendSeries(sample, "month"));
  });

  it("returns the expected number of points per range", () => {
    (Object.keys(expectedLengths) as TrendRange[]).forEach((range) => {
      expect(getResidentTrendSeries(sample, range)).toHaveLength(expectedLengths[range]);
    });
  });

  it("ends at the resident's current accuracy", () => {
    (Object.keys(expectedLengths) as TrendRange[]).forEach((range) => {
      const series = getResidentTrendSeries(sample, range);
      expect(series[series.length - 1].score).toBe(sample.accuracy);
    });
  });

  it("keeps every point within the clamped 28–98 range", () => {
    for (const r of COHORT_RESIDENTS) {
      for (const range of ["week", "month", "year", "all"] as TrendRange[]) {
        for (const p of getResidentTrendSeries(r, range)) {
          expect(p.score).toBeGreaterThanOrEqual(28);
          expect(p.score).toBeLessThanOrEqual(98);
        }
      }
    }
  });

  it("reflects net direction — improving residents end above where they start", () => {
    const improving = COHORT_RESIDENTS.find((r) => r.trend[r.trend.length - 1] > r.trend[0])!;
    const series = getResidentTrendSeries(improving, "year");
    expect(series[series.length - 1].score).toBeGreaterThan(series[0].score);
  });
});
