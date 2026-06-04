// ─────────────────────────────────────────────────────────────
// Cohort (program-level) Progress Report — shared content.
// The per-resident report answers "how is THIS resident?"; this answers
// "how is the WHOLE cohort?" — the program-director's view (e.g. Prof. Matot).
// Single source of truth for both the in-app glass view (CohortReport.tsx)
// and the printable PDF (reportPdf.ts → exportCohortReport).
// Bilingual EN/HE. DEMO MOCKUP: synthetic data, no backend.
// ─────────────────────────────────────────────────────────────
import type { CohortResident, CohortTopic } from "@/data/cohortMockData";
import { trendDelta } from "@/lib/cohortDetail";
import { computeCohortKpis, type CohortKpis } from "@/lib/cohortStats";

export type ReportLang = "en" | "he";

export interface AccuracyBand {
  label: string;
  min: number;
  count: number;
}
export interface CohortInsights {
  kpis: CohortKpis;
  trendingUp: number;
  trendingDown: number;
  attention: CohortResident[]; // flagged (low activity OR declining) — the actionable list
  bands: AccuracyBand[];
  weakTopics: CohortTopic[]; // weakest shared topics (program teaching targets)
  strongTopics: CohortTopic[];
}

const BAND_DEFS: { en: string; he: string; min: number }[] = [
  { en: "Excellent (85+)", he: "מצוין (85+)", min: 85 },
  { en: "Strong (75–84)", he: "חזק (75–84)", min: 75 },
  { en: "Developing (60–74)", he: "מתפתח (60–74)", min: 60 },
  { en: "Needs support (<60)", he: "זקוק לתמיכה (<60)", min: 0 },
];

/** Pure cohort aggregation — reuses computeCohortKpis + trendDelta so the
 *  report numbers can never drift from the dashboard's. */
export function cohortInsights(residents: CohortResident[], topics: CohortTopic[], lang: ReportLang): CohortInsights {
  const kpis = computeCohortKpis(residents);
  const trendingUp = residents.filter((r) => trendDelta(r) > 2).length;
  const trendingDown = residents.filter((r) => trendDelta(r) < -2).length;
  const attention = residents.filter((r) => r.signal === "attention" || trendDelta(r) < -2);

  const bands: AccuracyBand[] = BAND_DEFS.map((b, i) => {
    const max = i === 0 ? Infinity : BAND_DEFS[i - 1].min;
    return {
      label: lang === "he" ? b.he : b.en,
      min: b.min,
      count: residents.filter((r) => r.accuracy >= b.min && r.accuracy < max).length,
    };
  });

  const byAcc = [...topics].sort((a, b) => a.avgAccuracy - b.avgAccuracy);
  return {
    kpis,
    trendingUp,
    trendingDown,
    attention,
    bands,
    weakTopics: byAcc.slice(0, 3),
    strongTopics: byAcc.slice(-2).reverse(),
  };
}

export interface CohortReportStrings {
  dir: "ltr" | "rtl";
  langToggle: string;
  title: string;
  platform: string;
  program: string;
  generated: string;
  period: string;
  periodValue: string;
  cohortSize: string;
  execSummary: string;
  aiBadge: string;
  residents: string;
  accuracy: string;
  coverage: string;
  perWeek: string;
  watch: string;
  distribution: string;
  needsAttention: string;
  noAttention: string;
  topicFocus: string;
  weakest: string;
  strongest: string;
  roster: string;
  colResident: string;
  colYear: string;
  colAccuracy: string;
  colTrend: string;
  colTasks: string;
  colStatus: string;
  recommended: string;
  signature: string;
  date: string;
  footerNote: string;
  back: string;
  exportPdf: string;
  generateReport: string;
  signal: Record<CohortResident["signal"], string>;
}

export const COHORT_REPORT_STRINGS: Record<ReportLang, CohortReportStrings> = {
  en: {
    dir: "ltr",
    langToggle: "עברית",
    title: "Cohort Progress Report",
    platform: "YouShellNotPass · Anesthesia Stage-1 Simulator",
    program: "Anesthesiology Residency",
    generated: "Generated",
    period: "Reporting period",
    periodValue: "Last 30 days",
    cohortSize: "Residents",
    execSummary: "Executive Summary",
    aiBadge: "AI-generated",
    residents: "Residents",
    accuracy: "Cohort accuracy",
    coverage: "Avg coverage",
    perWeek: "Avg Q / week",
    watch: "Needs attention",
    distribution: "Accuracy Distribution",
    needsAttention: "Residents Needing Attention",
    noAttention: "No residents currently flagged — the cohort is on track.",
    topicFocus: "Cohort Topic Focus",
    weakest: "Shared weak spots",
    strongest: "Cohort strengths",
    roster: "Cohort Roster",
    colResident: "Resident",
    colYear: "Year",
    colAccuracy: "Accuracy",
    colTrend: "Trend",
    colTasks: "Tasks",
    colStatus: "Status",
    recommended: "Recommended Program Focus",
    signature: "Program director",
    date: "Date",
    footerNote: "Sample report · synthetic data · not real residents",
    back: "Back",
    exportPdf: "Export PDF",
    generateReport: "Cohort Report",
    signal: { active: "Active", steady: "Steady", attention: "Attention" },
  },
  he: {
    dir: "rtl",
    langToggle: "English",
    title: "דוח התקדמות מחזור",
    platform: "YouShellNotPass · סימולטור שלב א׳ הרדמה",
    program: "התמחות בהרדמה",
    generated: "הופק",
    period: "תקופת דיווח",
    periodValue: "30 הימים האחרונים",
    cohortSize: "מתמחים",
    execSummary: "תקציר מנהלים",
    aiBadge: "נוצר ע״י AI",
    residents: "מתמחים",
    accuracy: "דיוק המחזור",
    coverage: "כיסוי ממוצע",
    perWeek: "שאלות/שבוע (ממוצע)",
    watch: "דורשים תשומת-לב",
    distribution: "התפלגות דיוק",
    needsAttention: "מתמחים הדורשים תשומת-לב",
    noAttention: "אין מתמחים מסומנים כרגע — המחזור בקצב טוב.",
    topicFocus: "מיקוד נושאים — מחזור",
    weakest: "נקודות-תורפה משותפות",
    strongest: "חוזקות המחזור",
    roster: "רשימת המחזור",
    colResident: "מתמחה",
    colYear: "שנה",
    colAccuracy: "דיוק",
    colTrend: "מגמה",
    colTasks: "מטלות",
    colStatus: "סטטוס",
    recommended: "המלצות מיקוד — תוכנית",
    signature: "מנהל/ת התוכנית",
    date: "תאריך",
    footerNote: "דוח לדוגמה · נתונים סינתטיים · לא מתמחים אמיתיים",
    back: "חזרה",
    exportPdf: "ייצוא PDF",
    generateReport: "דוח מחזור",
    signal: { active: "פעיל", steady: "יציב", attention: "תשומת-לב" },
  },
};

/** Cohort-level narrative summary. */
export function cohortReportSummary(ins: CohortInsights, lang: ReportLang): string {
  const { kpis, trendingUp, trendingDown, attention, weakTopics, strongTopics } = ins;
  const n = kpis.activeResidents;
  const weak = weakTopics[0];
  const strong = strongTopics[0];
  if (lang === "he") {
    return (
      `מחזור של ${n} מתמחי הרדמה. דיוק ממוצע ${kpis.avgAccuracy}% (${kpis.avgCoverage}% כיסוי מאגר). ` +
      `${trendingUp} במגמת עלייה, ${trendingDown} בירידה; ${attention.length} סומנו לצ׳ק-אין. ` +
      `ברמת המחזור, ${strong.topic} הוא החזק ביותר (${strong.avgAccuracy}%), בעוד ${weak.topic} הוא נקודת-התורפה המשותפת (${weak.avgAccuracy}%) — מועמד למפגש הוראה ברמת התוכנית. ` +
      `מעורבות ממוצעת: ${kpis.avgQuestionsPerWeek} שאלות/שבוע.`
    );
  }
  return (
    `Cohort of ${n} anesthesiology residents. Average accuracy ${kpis.avgAccuracy}% (${kpis.avgCoverage}% bank coverage). ` +
    `${trendingUp} trending up, ${trendingDown} trending down; ${attention.length} flagged for a check-in. ` +
    `Cohort-wide, ${strong.topic} is strongest (${strong.avgAccuracy}%), while ${weak.topic} is the shared weak spot (${weak.avgAccuracy}%) — a candidate for a program-level teaching session. ` +
    `Engagement averages ${kpis.avgQuestionsPerWeek} questions/week.`
  );
}

/** Program-level recommended-focus bullets. */
export function cohortReportRecommendations(ins: CohortInsights, lang: ReportLang): string[] {
  const en = lang === "en";
  const out: string[] = [];

  ins.weakTopics.slice(0, 2).forEach((tpc) => {
    out.push(
      en
        ? `Program-level review of ${tpc.topic} — cohort average ${tpc.avgAccuracy}%.`
        : `חזרה ברמת התוכנית על ${tpc.topic} — ממוצע מחזור ${tpc.avgAccuracy}%.`,
    );
  });

  if (ins.attention.length > 0) {
    const names = ins.attention.map((r) => r.initials).join(", ");
    out.push(
      en
        ? `${ins.attention.length} resident${ins.attention.length > 1 ? "s" : ""} would benefit from a brief check-in: ${names}.`
        : `${ins.attention.length} מתמחים זקוקים לצ׳ק-אין קצר: ${names}.`,
    );
  }

  if (ins.trendingUp > 0) {
    out.push(
      en
        ? `Sustain momentum — ${ins.trendingUp} residents are improving; reinforce what's working.`
        : `לשמר את המומנטום — ${ins.trendingUp} מתמחים משתפרים; לחזק את מה שעובד.`,
    );
  }

  return out;
}
