import { describe, it, expect } from "vitest";
import { getResidentDetail } from "@/lib/cohortDetail";
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
