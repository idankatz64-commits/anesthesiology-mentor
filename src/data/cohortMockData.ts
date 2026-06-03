// ─────────────────────────────────────────────────────────────
// MOCK / SYNTHETIC cohort data for the manager-dashboard DEMO.
// NOT real users. Anonymized fake initials over plausible numbers.
// For the pitch, real-anonymized numbers can replace these later
// (computed once, offline, read-only from dev). Zero production data.
// ─────────────────────────────────────────────────────────────

export interface CohortResident {
  id: string;
  initials: string; // anonymized display label, e.g. "א. ל."
  year: number; // residency year 1-5
  stageLabel: string; // e.g. "שנה 2"
  coverage: number; // % of question bank covered, 0-100
  accuracy: number; // overall accuracy %, 0-100
  trend: number[]; // recent accuracy points (for the trend arrow)
  questionsPerWeek: number;
  streakDays: number;
  lastActive: string; // human label, e.g. "היום" / "אתמול" / "לפני 4 ימים"
  signal: "active" | "steady" | "attention"; // descriptive only — never "at risk"
}

export interface CohortTopic {
  topic: string;
  avgAccuracy: number; // cohort-average accuracy on this topic, 0-100
  questionsInBank: number;
  residentsCovered: number;
}

export const COHORT_RESIDENTS: CohortResident[] = [
  {
    id: "r01",
    initials: "א. ל.",
    year: 4,
    stageLabel: "שנה 4",
    coverage: 82,
    accuracy: 84,
    trend: [78, 80, 82, 84],
    questionsPerWeek: 95,
    streakDays: 12,
    lastActive: "היום",
    signal: "active",
  },
  {
    id: "r02",
    initials: "ר. כ.",
    year: 3,
    stageLabel: "שנה 3",
    coverage: 71,
    accuracy: 76,
    trend: [74, 75, 76, 76],
    questionsPerWeek: 60,
    streakDays: 5,
    lastActive: "היום",
    signal: "active",
  },
  {
    id: "r03",
    initials: "מ. ב.",
    year: 2,
    stageLabel: "שנה 2",
    coverage: 64,
    accuracy: 70,
    trend: [66, 68, 70, 71],
    questionsPerWeek: 70,
    streakDays: 8,
    lastActive: "אתמול",
    signal: "active",
  },
  {
    id: "r04",
    initials: "נ. פ.",
    year: 5,
    stageLabel: "שנה 5",
    coverage: 88,
    accuracy: 81,
    trend: [80, 81, 81, 82],
    questionsPerWeek: 40,
    streakDays: 3,
    lastActive: "אתמול",
    signal: "steady",
  },
  {
    id: "r05",
    initials: "ש. ד.",
    year: 1,
    stageLabel: "שנה 1",
    coverage: 28,
    accuracy: 58,
    trend: [55, 57, 58, 58],
    questionsPerWeek: 35,
    streakDays: 2,
    lastActive: "לפני 4 ימים",
    signal: "attention",
  },
  {
    id: "r06",
    initials: "ל. ג.",
    year: 3,
    stageLabel: "שנה 3",
    coverage: 69,
    accuracy: 73,
    trend: [76, 74, 72, 71],
    questionsPerWeek: 25,
    streakDays: 0,
    lastActive: "לפני 6 ימים",
    signal: "attention",
  },
  {
    id: "r07",
    initials: "ד. ר.",
    year: 2,
    stageLabel: "שנה 2",
    coverage: 55,
    accuracy: 66,
    trend: [62, 64, 65, 66],
    questionsPerWeek: 50,
    streakDays: 4,
    lastActive: "היום",
    signal: "active",
  },
  {
    id: "r08",
    initials: "ע. מ.",
    year: 4,
    stageLabel: "שנה 4",
    coverage: 79,
    accuracy: 79,
    trend: [78, 79, 79, 79],
    questionsPerWeek: 55,
    streakDays: 6,
    lastActive: "אתמול",
    signal: "steady",
  },
  {
    id: "r09",
    initials: "ת. ש.",
    year: 1,
    stageLabel: "שנה 1",
    coverage: 33,
    accuracy: 61,
    trend: [58, 59, 60, 61],
    questionsPerWeek: 45,
    streakDays: 3,
    lastActive: "היום",
    signal: "active",
  },
  {
    id: "r10",
    initials: "י. א.",
    year: 5,
    stageLabel: "שנה 5",
    coverage: 84,
    accuracy: 86,
    trend: [84, 85, 85, 86],
    questionsPerWeek: 30,
    streakDays: 2,
    lastActive: "לפני יומיים",
    signal: "steady",
  },
  {
    id: "r11",
    initials: "ח. נ.",
    year: 2,
    stageLabel: "שנה 2",
    coverage: 47,
    accuracy: 62,
    trend: [64, 63, 62, 62],
    questionsPerWeek: 20,
    streakDays: 0,
    lastActive: "לפני 7 ימים",
    signal: "attention",
  },
  {
    id: "r12",
    initials: "ב. כ.",
    year: 3,
    stageLabel: "שנה 3",
    coverage: 73,
    accuracy: 77,
    trend: [73, 75, 76, 77],
    questionsPerWeek: 65,
    streakDays: 9,
    lastActive: "היום",
    signal: "active",
  },
];

// Cohort-level topic strength — the "secret weapon": where the WHOLE cohort
// is weak (→ candidates for a department-wide teaching session).
export const COHORT_TOPICS: CohortTopic[] = [
  { topic: "רעלנות מהרדמה מקומית (LAST)", avgAccuracy: 48, questionsInBank: 70, residentsCovered: 9 },
  { topic: "חסמים נוירומוסקולריים", avgAccuracy: 54, questionsInBank: 120, residentsCovered: 12 },
  { topic: "הרדמה קרדיווסקולרית", avgAccuracy: 58, questionsInBank: 140, residentsCovered: 11 },
  { topic: "ניטור המודינמי", avgAccuracy: 62, questionsInBank: 85, residentsCovered: 12 },
  { topic: "פיזיולוגיה נשימתית", avgAccuracy: 65, questionsInBank: 110, residentsCovered: 12 },
  { topic: "הרדמה מיילדותית", avgAccuracy: 68, questionsInBank: 95, residentsCovered: 10 },
  { topic: "ניהול נתיב אוויר", avgAccuracy: 71, questionsInBank: 130, residentsCovered: 12 },
  { topic: "פרמקולוגיה של אופיואידים", avgAccuracy: 74, questionsInBank: 100, residentsCovered: 12 },
  { topic: "הרדמה אזורית", avgAccuracy: 77, questionsInBank: 105, residentsCovered: 11 },
  { topic: "נוזלים ואלקטרוליטים", avgAccuracy: 82, questionsInBank: 80, residentsCovered: 12 },
];
