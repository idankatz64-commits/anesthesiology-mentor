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

function buildSummary(r: CohortResident, top: TopicStat, weak: TopicStat): string {
  const tier = r.accuracy >= 80 ? "top quartile" : r.accuracy >= 65 ? "mid-cohort range" : "developing range";
  const streak = r.streakDays > 0 ? `, ${r.streakDays}-day streak` : "";
  const closing =
    r.signal === "attention"
      ? "Activity dipped this week — a brief check-in is suggested."
      : "On track for the Stage-1 timeline.";
  return (
    `${r.initials} is performing in the ${tier} (${r.accuracy}% overall accuracy, ${r.coverage}% bank coverage). ` +
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
