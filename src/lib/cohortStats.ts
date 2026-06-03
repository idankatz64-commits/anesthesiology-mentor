import type { CohortResident } from "@/data/cohortMockData";

export interface CohortKpis {
  activeResidents: number;
  avgCoverage: number;
  avgAccuracy: number;
  avgQuestionsPerWeek: number;
  attentionCount: number;
}

/**
 * Derive cohort-level KPIs from the resident rows, so the summary numbers
 * can never drift out of sync with the table beneath them.
 */
export function computeCohortKpis(residents: CohortResident[]): CohortKpis {
  const n = residents.length;
  if (n === 0) {
    return {
      activeResidents: 0,
      avgCoverage: 0,
      avgAccuracy: 0,
      avgQuestionsPerWeek: 0,
      attentionCount: 0,
    };
  }
  const sum = (sel: (r: CohortResident) => number) => residents.reduce((acc, r) => acc + sel(r), 0);
  return {
    activeResidents: n,
    avgCoverage: Math.round(sum((r) => r.coverage) / n),
    avgAccuracy: Math.round(sum((r) => r.accuracy) / n),
    avgQuestionsPerWeek: Math.round(sum((r) => r.questionsPerWeek) / n),
    attentionCount: residents.filter((r) => r.signal === "attention").length,
  };
}

/** Accuracy → color (matches the app's green/amber/red convention). */
export function accuracyColor(pct: number): string {
  if (pct >= 80) return "hsl(142 71% 45%)";
  if (pct >= 50) return "hsl(36 96% 50%)";
  return "hsl(0 84% 60%)";
}

/** Accuracy → soft background tint (for heatmap rows). */
export function accuracyBg(pct: number): string {
  if (pct >= 80) return "rgba(34,197,94,0.15)";
  if (pct >= 50) return "rgba(245,159,10,0.15)";
  return "rgba(239,68,68,0.15)";
}
