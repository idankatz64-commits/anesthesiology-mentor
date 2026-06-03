import { describe, it, expect } from "vitest";
import { computeCohortKpis, accuracyColor } from "@/lib/cohortStats";
import type { CohortResident } from "@/data/cohortMockData";

const mk = (over: Partial<CohortResident>): CohortResident => ({
  id: "x",
  initials: "X",
  year: 1,
  stageLabel: "שנה 1",
  coverage: 50,
  accuracy: 50,
  trend: [50],
  questionsPerWeek: 10,
  streakDays: 0,
  lastActive: "היום",
  signal: "steady",
  tasksCompleted: 0,
  tasksTotal: 0,
  ...over,
});

describe("computeCohortKpis", () => {
  it("returns zeros for an empty cohort", () => {
    expect(computeCohortKpis([])).toEqual({
      activeResidents: 0,
      avgCoverage: 0,
      avgAccuracy: 0,
      avgQuestionsPerWeek: 0,
      attentionCount: 0,
    });
  });

  it("averages and rounds across residents", () => {
    const r = computeCohortKpis([
      mk({ coverage: 40, accuracy: 60, questionsPerWeek: 20 }),
      mk({ coverage: 60, accuracy: 71, questionsPerWeek: 30 }),
    ]);
    expect(r.activeResidents).toBe(2);
    expect(r.avgCoverage).toBe(50);
    expect(r.avgAccuracy).toBe(66); // (60 + 71) / 2 = 65.5 → 66
    expect(r.avgQuestionsPerWeek).toBe(25);
  });

  it("counts only residents flagged for attention", () => {
    const r = computeCohortKpis([mk({ signal: "attention" }), mk({ signal: "active" }), mk({ signal: "attention" })]);
    expect(r.attentionCount).toBe(2);
  });
});

describe("accuracyColor", () => {
  it("maps accuracy to the green/amber/red thresholds", () => {
    expect(accuracyColor(85)).toContain("142"); // green
    expect(accuracyColor(60)).toContain("36"); // amber
    expect(accuracyColor(40)).toContain("0 84%"); // red
  });
});
