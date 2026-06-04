// ─────────────────────────────────────────────────────────────
// Resident Progress Report — shared content (single source of truth).
// Both surfaces consume this so they NEVER drift:
//   • ResidentReport.tsx   — in-app glass document view
//   • reportPdf.ts         — printable / "leave-behind" PDF
// Bilingual (EN / HE) so the report's language is a toggle, not a rebuild.
// DEMO MOCKUP: synthetic data; no real residents, no backend.
// ─────────────────────────────────────────────────────────────
import type { CohortResident } from "@/data/cohortMockData";
import { type ResidentDetailData, trendDelta } from "@/lib/cohortDetail";

export type ReportLang = "en" | "he";

export interface ReportStrings {
  dir: "ltr" | "rtl";
  langToggle: string; // label of the OTHER language (for the switch button)
  title: string;
  platform: string;
  generated: string;
  period: string;
  periodValue: string;
  resident: string;
  execSummary: string;
  aiBadge: string;
  accuracy: string;
  coverage: string;
  perWeek: string;
  tasksComplete: string;
  trendLabel: string;
  trendSection: string;
  trendSub: string;
  trendRanges: { week: string; month: string; year: string; all: string };
  strengths: string;
  focusAreas: string;
  millerCh: string;
  adherence: string;
  currentRotation: string;
  recommended: string;
  signature: string;
  date: string;
  footerNote: string;
  back: string;
  exportPdf: string;
  generateReport: string;
  status: Record<"done" | "pending" | "overdue", string>;
}

export const REPORT_STRINGS: Record<ReportLang, ReportStrings> = {
  en: {
    dir: "ltr",
    langToggle: "עברית",
    title: "Resident Progress Report",
    platform: "YouShellNotPass · Anesthesia Stage-1 Simulator",
    generated: "Generated",
    period: "Reporting period",
    periodValue: "Last 30 days",
    resident: "Resident",
    execSummary: "Executive Summary",
    aiBadge: "AI-generated",
    accuracy: "Accuracy",
    coverage: "Bank coverage",
    perWeek: "Questions / week",
    tasksComplete: "Tasks complete",
    trendLabel: "Trend",
    trendSection: "Accuracy Trend",
    trendSub: "Accuracy over the reporting period",
    trendRanges: { week: "Week", month: "Month", year: "Year", all: "All" },
    strengths: "Strengths",
    focusAreas: "Focus Areas",
    millerCh: "Miller Ch.",
    adherence: "Task & Rotation Adherence",
    currentRotation: "Current rotation",
    recommended: "Recommended Focus — Next Period",
    signature: "Reviewing attending",
    date: "Date",
    footerNote: "Sample report · synthetic data · not a real resident",
    back: "Back",
    exportPdf: "Export PDF",
    generateReport: "Generate Report",
    status: { done: "Done", pending: "Pending", overdue: "Overdue" },
  },
  he: {
    dir: "rtl",
    langToggle: "English",
    title: "דוח התקדמות מתמחה",
    platform: "YouShellNotPass · סימולטור שלב א׳ הרדמה",
    generated: "הופק",
    period: "תקופת דיווח",
    periodValue: "30 הימים האחרונים",
    resident: "מתמחה",
    execSummary: "תקציר מנהלים",
    aiBadge: "נוצר ע״י AI",
    accuracy: "דיוק",
    coverage: "כיסוי מאגר",
    perWeek: "שאלות לשבוע",
    tasksComplete: "מטלות הושלמו",
    trendLabel: "מגמה",
    trendSection: "מגמת דיוק",
    trendSub: "דיוק לאורך תקופת הדיווח",
    trendRanges: { week: "שבוע", month: "חודש", year: "שנה", all: "הכל" },
    strengths: "חוזקות",
    focusAreas: "תחומים לחיזוק",
    millerCh: "מילר פרק",
    adherence: "עמידה במטלות ורוטציות",
    currentRotation: "רוטציה נוכחית",
    recommended: "המלצות להמשך — התקופה הבאה",
    signature: "רופא/ה בכיר/ה מעריך/ה",
    date: "תאריך",
    footerNote: "דוח לדוגמה · נתונים סינתטיים · לא מתמחה אמיתי",
    back: "חזרה",
    exportPdf: "ייצוא PDF",
    generateReport: "הפק דוח",
    status: { done: "הושלם", pending: "ממתין", overdue: "באיחור" },
  },
};

/**
 * Executive summary in the chosen language. English reuses the existing
 * trend-led `detail.aiSummary` (single source); Hebrew mirrors its structure.
 * Medical topic names stay in English — standard in Israeli clinical Hebrew.
 */
export function reportSummary(r: CohortResident, detail: ResidentDetailData, lang: ReportLang): string {
  if (lang === "en") return detail.aiSummary;

  const top = detail.strengths[0];
  const weak = detail.weaknesses[0];
  const delta = trendDelta(r);
  const tier = r.accuracy >= 80 ? "ברבעון העליון" : r.accuracy >= 65 ? "בטווח הממוצע של המחזור" : "בטווח מתפתח";
  const trendLead =
    delta > 2
      ? `📈 במגמת עלייה — הדיוק עלה ב-${delta} נק׳ לאחרונה. `
      : delta < -2
        ? `📉 במגמת ירידה — הדיוק ירד ב-${Math.abs(delta)} נק׳; כדאי לשים לב. `
        : `➡️ יציב לאחרונה. `;
  const streak = r.streakDays > 0 ? `, רצף של ${r.streakDays} ימים` : "";
  const closing =
    r.signal === "attention" ? "הפעילות ירדה לאחרונה — מומלץ צ׳ק-אין קצר." : "בקצב לעמידה בלו״ז של שלב א׳.";
  return (
    `${trendLead}${r.initials} מתפקד/ת ${tier} (${r.accuracy}% דיוק כולל, ${r.coverage}% כיסוי מאגר). ` +
    `חזק/ה ביותר ב-${top.topic} (${top.accuracy}%); יפיק/תפיק תועלת מחזרה ממוקדת על ${weak.topic} (${weak.accuracy}%). ` +
    `מעורבות: ${r.questionsPerWeek} שאלות/שבוע${streak}. ${closing}`
  );
}

/**
 * 2–4 recommended-focus bullets for the next period, derived from the weakest
 * topics, outstanding tasks, and trend/activity signal. Localized.
 */
export function reportRecommendations(r: CohortResident, detail: ResidentDetailData, lang: ReportLang): string[] {
  const en = lang === "en";
  const out: string[] = [];

  for (const w of detail.weaknesses) {
    const chs = w.chapters.map((c) => c.chapter).join(", ");
    out.push(
      en
        ? `Focused review of ${w.topic} (currently ${w.accuracy}%) — Miller Ch. ${chs}.`
        : `חזרה ממוקדת על ${w.topic} (${w.accuracy}% כעת) — מילר פרק ${chs}.`,
    );
  }

  const pending = detail.tasks.filter((t) => t.status !== "done");
  if (pending.length > 0) {
    const overdue = detail.tasks.filter((t) => t.status === "overdue");
    const first = (overdue[0] ?? pending[0]).title;
    out.push(
      en
        ? `Complete ${pending.length} outstanding task${pending.length > 1 ? "s" : ""}, starting with “${first}”.`
        : `להשלים ${pending.length} מטלות פתוחות, החל מ-״${first}״.`,
    );
  }

  if (trendDelta(r) < -2 || r.signal === "attention") {
    out.push(
      en
        ? "Re-establish a steady weekly practice cadence; a brief check-in is suggested."
        : "לחזור לקצב תרגול שבועי יציב; מומלץ צ׳ק-אין קצר.",
    );
  }

  return out;
}
