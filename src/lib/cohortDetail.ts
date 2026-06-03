import type { CohortResident } from "@/data/cohortMockData";
import { TOPIC_CATALOG } from "@/data/cohortMockData";

export interface ChapterStat {
  chapter: number;
  title: string;
  accuracy: number;
}
export interface TopicStat {
  topic: string;
  accuracy: number;
  chapters: ChapterStat[];
}
export interface ResidentTask {
  id: string;
  title: string;
  due: string;
  status: "done" | "pending" | "overdue";
}
export interface QuizScore {
  id: string;
  title: string;
  date: string;
  score: number;
}
export type TrendRange = "week" | "month" | "year" | "all";
export interface TrendPoint {
  label: string;
  score: number;
}
export interface PlanRotation {
  id: string;
  name: string;
  period: string;
  status: "completed" | "current" | "upcoming";
  note?: string;
}
export interface ResidentDetailData {
  topics: TopicStat[];
  strengths: TopicStat[];
  weaknesses: TopicStat[];
  tasks: ResidentTask[];
  quizzes: QuizScore[];
  aiSummary: string;
  plan: PlanRotation[];
}

// Deterministic pseudo-random in [0,1) from a string seed (FNV-1a).
// Deterministic so the mock is stable across reloads and unit-testable.
function seededUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function vary(base: number, key: string, spread: number): number {
  const offset = (seededUnit(key) - 0.5) * 2 * spread;
  return Math.max(28, Math.min(98, Math.round(base + offset)));
}

const TASK_TITLES = [
  "Complete Cardiac Anesthesia module",
  "Weekly quiz — Airway Management",
  "Review LAST protocol",
  "Submit monthly case log",
  "Read Miller Ch. 54 — Cardiac Surgery",
  "Flashcards: Neuromuscular Blockers",
  "Simulation: Obstetric emergencies",
  "Reflective note — last rotation",
  "Pharmacology self-assessment",
];

function buildTasks(r: CohortResident): ResidentTask[] {
  return TASK_TITLES.slice(0, r.tasksTotal).map((title, i) => {
    let status: ResidentTask["status"];
    let due: string;
    if (i < r.tasksCompleted) {
      status = "done";
      due = "Completed";
    } else if (r.signal === "attention" && i === r.tasksCompleted) {
      status = "overdue";
      due = "Overdue";
    } else {
      status = "pending";
      due = `Due in ${i - r.tasksCompleted + 2}d`;
    }
    return { id: `${r.id}-task-${i}`, title, due, status };
  });
}

function buildQuizzes(r: CohortResident): QuizScore[] {
  return r.trend.map((score, i) => ({
    id: `${r.id}-quiz-${i}`,
    title: `Weekly Quiz ${i + 1}`,
    date: `Week ${i + 1}`,
    score,
  }));
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Per-range shape: number of points, how far back the arc starts (vs current),
// and the x-axis label for each point.
const RANGE_META: Record<TrendRange, { n: number; span: number; label: (i: number) => string }> = {
  week: { n: 7, span: 6, label: (i) => WEEKDAYS[i] ?? `D${i + 1}` },
  month: { n: 5, span: 14, label: (i) => `Wk ${i + 1}` },
  year: { n: 12, span: 30, label: (i) => MONTHS[i] ?? `M${i + 1}` },
  all: { n: 18, span: 44, label: (i) => `M${i + 1}` },
};

/**
 * Deterministic per-resident accuracy time-series for a given range.
 * Longer ranges show a bigger improvement (or decline) arc; the final point
 * always equals the resident's current accuracy. Pure + seeded (no Date/random),
 * so the demo is stable across reloads and unit-testable.
 */
export function getResidentTrendSeries(r: CohortResident, range: TrendRange): TrendPoint[] {
  const m = RANGE_META[range];
  const end = r.accuracy;
  const declining = r.trend[r.trend.length - 1] < r.trend[0];
  const dir = declining ? -1 : 1;
  const start = Math.max(28, Math.min(98, end - dir * m.span));
  return Array.from({ length: m.n }, (_, i) => {
    if (i === m.n - 1) return { label: m.label(i), score: end };
    const t = i / (m.n - 1);
    const base = start + (end - start) * t;
    const noise = (seededUnit(`${r.id}:${range}:${i}`) - 0.5) * 2 * 3.5;
    return { label: m.label(i), score: Math.max(28, Math.min(98, Math.round(base + noise))) };
  });
}

/** Net accuracy change across the resident's recent trend (used to flag up/down). */
export function trendDelta(r: CohortResident): number {
  return r.trend[r.trend.length - 1] - r.trend[0];
}

function buildSummary(r: CohortResident, top: TopicStat, weak: TopicStat): string {
  const tier = r.accuracy >= 80 ? "top quartile" : r.accuracy >= 65 ? "mid-cohort range" : "developing range";
  const streak = r.streakDays > 0 ? `, ${r.streakDays}-day streak` : "";
  const delta = trendDelta(r);
  // Lead with the trend direction — the signal the manager cares about most.
  const trendLead =
    delta > 2
      ? `📈 Trending UP — accuracy climbed ${delta} pts recently. `
      : delta < -2
        ? `📉 Trending DOWN — accuracy slipped ${Math.abs(delta)} pts recently; worth a look. `
        : `➡️ Holding steady recently. `;
  const closing =
    r.signal === "attention"
      ? "Activity dipped this week — a brief check-in is suggested."
      : "On track for the Stage-1 timeline.";
  return (
    `${trendLead}${r.initials} is performing in the ${tier} (${r.accuracy}% overall accuracy, ${r.coverage}% bank coverage). ` +
    `Strongest in ${top.topic} (${top.accuracy}%); would benefit from focused review of ${weak.topic} (${weak.accuracy}%). ` +
    `Engagement: ${r.questionsPerWeek} questions/week${streak}. ${closing}`
  );
}

const ROTATIONS = [
  "Neuro OR",
  "Regional / Blocks",
  "Cardiac & Thoracic",
  "Pediatric Anesthesia",
  "Obstetric Anesthesia",
  "ICU",
  "Pain Clinic",
  "Elective",
];

function buildPlan(r: CohortResident): PlanRotation[] {
  // Show a 6-rotation window; status reflects the resident's progress.
  const completedCount = Math.min(ROTATIONS.length - 1, Math.max(1, r.year));
  return ROTATIONS.slice(0, 6).map((name, i) => {
    let status: PlanRotation["status"];
    if (i < completedCount - 1) status = "completed";
    else if (i === completedCount - 1) status = "current";
    else status = "upcoming";
    // Illustrate the "reserve duty shifted a rotation" scenario on one resident.
    const note = r.id === "r06" && i === completedCount ? "Shifted after 3-month reserve duty" : undefined;
    return { id: `${r.id}-rot-${i}`, name, period: `Q${i + 1}`, status, note };
  });
}

/**
 * Build a stable, plausible per-resident detail from the resident's base stats.
 * Pure + deterministic (no Math.random) so the demo is consistent and testable.
 */
export function getResidentDetail(r: CohortResident): ResidentDetailData {
  const topics: TopicStat[] = TOPIC_CATALOG.map((t) => {
    const accuracy = vary(r.accuracy, `${r.id}:${t.topic}`, 16);
    return {
      topic: t.topic,
      accuracy,
      chapters: t.chapters.map((c) => ({
        chapter: c.chapter,
        title: c.title,
        accuracy: vary(accuracy, `${r.id}:${t.topic}:${c.chapter}`, 12),
      })),
    };
  });
  const ranked = [...topics].sort((a, b) => b.accuracy - a.accuracy);
  const strengths = ranked.slice(0, 2);
  const weaknesses = ranked.slice(-2).reverse();

  return {
    topics,
    strengths,
    weaknesses,
    tasks: buildTasks(r),
    quizzes: buildQuizzes(r),
    aiSummary: buildSummary(r, strengths[0], weaknesses[0]),
    plan: buildPlan(r),
  };
}
