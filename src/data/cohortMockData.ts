// ─────────────────────────────────────────────────────────────
// MOCK / SYNTHETIC cohort data for the manager-dashboard DEMO.
// NOT real users. Anonymized initials over plausible numbers.
// Dashboard UI is in English (resident-facing app stays Hebrew).
// Real-anonymized numbers can replace these later. Zero production data.
// ─────────────────────────────────────────────────────────────

export interface CohortResident {
  id: string;
  initials: string; // anonymized label, e.g. "A.L."
  year: number; // residency year 1-5
  stageLabel: string; // e.g. "Year 2"
  coverage: number; // % of question bank covered, 0-100
  accuracy: number; // overall accuracy %, 0-100
  trend: number[]; // recent accuracy points (for the trend arrow / quiz history)
  questionsPerWeek: number;
  streakDays: number;
  lastActive: string; // "Today" / "Yesterday" / "4 days ago"
  signal: "active" | "steady" | "attention"; // descriptive only — never "at risk"
  tasksCompleted: number;
  tasksTotal: number;
}

export interface CohortTopic {
  topic: string;
  avgAccuracy: number;
  questionsInBank: number;
  residentsCovered: number;
}

// Catalog of topics → their Miller chapters. Drives the per-resident
// topic drill-down (click a topic → per-chapter accuracy).
export interface TopicCatalogEntry {
  topic: string;
  chapters: { chapter: number; title: string }[];
}

// Miller 10e chapter numbers/titles (verified against src/data/millerChapters.ts).
export const TOPIC_CATALOG: TopicCatalogEntry[] = [
  {
    topic: "Neuromuscular Blockers",
    chapters: [
      { chapter: 11, title: "Neuromuscular Physiology & Pharmacology" },
      { chapter: 24, title: "Neuromuscular Blocking Drugs & Reversal" },
    ],
  },
  {
    topic: "Local Anesthetic Toxicity (LAST)",
    chapters: [
      { chapter: 25, title: "Local Anesthetics" },
      { chapter: 42, title: "Peripheral Nerve Blocks & Regional US" },
    ],
  },
  {
    topic: "Cardiovascular Anesthesia",
    chapters: [
      { chapter: 13, title: "Cardiac Physiology" },
      { chapter: 32, title: "Cardiovascular Monitoring" },
      { chapter: 50, title: "Anesthesia for Cardiac Surgery" },
    ],
  },
  {
    topic: "Airway Management",
    chapters: [{ chapter: 40, title: "Airway Management in the Adult" }],
  },
  {
    topic: "Obstetric Anesthesia",
    chapters: [
      { chapter: 58, title: "Anesthesia for Obstetrics" },
      { chapter: 59, title: "Fetal Surgery & Fetal Therapies" },
    ],
  },
  {
    topic: "Respiratory Physiology",
    chapters: [
      { chapter: 12, title: "Respiratory Physiology & Pathophysiology" },
      { chapter: 37, title: "Respiratory Monitoring" },
    ],
  },
];

export const COHORT_RESIDENTS: CohortResident[] = [
  {
    id: "r01",
    initials: "A.L.",
    year: 4,
    stageLabel: "Year 4",
    coverage: 82,
    accuracy: 84,
    trend: [78, 80, 82, 84],
    questionsPerWeek: 95,
    streakDays: 12,
    lastActive: "Today",
    signal: "active",
    tasksCompleted: 8,
    tasksTotal: 9,
  },
  {
    id: "r02",
    initials: "R.K.",
    year: 3,
    stageLabel: "Year 3",
    coverage: 71,
    accuracy: 76,
    trend: [74, 75, 76, 76],
    questionsPerWeek: 60,
    streakDays: 5,
    lastActive: "Today",
    signal: "active",
    tasksCompleted: 6,
    tasksTotal: 8,
  },
  {
    id: "r03",
    initials: "M.B.",
    year: 2,
    stageLabel: "Year 2",
    coverage: 64,
    accuracy: 70,
    trend: [66, 68, 70, 71],
    questionsPerWeek: 70,
    streakDays: 8,
    lastActive: "Yesterday",
    signal: "active",
    tasksCompleted: 5,
    tasksTotal: 7,
  },
  {
    id: "r04",
    initials: "N.P.",
    year: 5,
    stageLabel: "Year 5",
    coverage: 88,
    accuracy: 81,
    trend: [80, 81, 81, 82],
    questionsPerWeek: 40,
    streakDays: 3,
    lastActive: "Yesterday",
    signal: "steady",
    tasksCompleted: 7,
    tasksTotal: 8,
  },
  {
    id: "r05",
    initials: "S.D.",
    year: 1,
    stageLabel: "Year 1",
    coverage: 28,
    accuracy: 58,
    trend: [55, 57, 58, 58],
    questionsPerWeek: 35,
    streakDays: 2,
    lastActive: "4 days ago",
    signal: "attention",
    tasksCompleted: 2,
    tasksTotal: 6,
  },
  {
    id: "r06",
    initials: "L.G.",
    year: 3,
    stageLabel: "Year 3",
    coverage: 69,
    accuracy: 73,
    trend: [76, 74, 72, 71],
    questionsPerWeek: 25,
    streakDays: 0,
    lastActive: "6 days ago",
    signal: "attention",
    tasksCompleted: 3,
    tasksTotal: 8,
  },
  {
    id: "r07",
    initials: "D.R.",
    year: 2,
    stageLabel: "Year 2",
    coverage: 55,
    accuracy: 66,
    trend: [62, 64, 65, 66],
    questionsPerWeek: 50,
    streakDays: 4,
    lastActive: "Today",
    signal: "active",
    tasksCompleted: 5,
    tasksTotal: 7,
  },
  {
    id: "r08",
    initials: "O.M.",
    year: 4,
    stageLabel: "Year 4",
    coverage: 79,
    accuracy: 79,
    trend: [78, 79, 79, 79],
    questionsPerWeek: 55,
    streakDays: 6,
    lastActive: "Yesterday",
    signal: "steady",
    tasksCompleted: 6,
    tasksTotal: 9,
  },
  {
    id: "r09",
    initials: "T.S.",
    year: 1,
    stageLabel: "Year 1",
    coverage: 33,
    accuracy: 61,
    trend: [58, 59, 60, 61],
    questionsPerWeek: 45,
    streakDays: 3,
    lastActive: "Today",
    signal: "active",
    tasksCompleted: 4,
    tasksTotal: 6,
  },
  {
    id: "r10",
    initials: "Y.A.",
    year: 5,
    stageLabel: "Year 5",
    coverage: 84,
    accuracy: 86,
    trend: [84, 85, 85, 86],
    questionsPerWeek: 30,
    streakDays: 2,
    lastActive: "2 days ago",
    signal: "steady",
    tasksCompleted: 8,
    tasksTotal: 8,
  },
  {
    id: "r11",
    initials: "H.N.",
    year: 2,
    stageLabel: "Year 2",
    coverage: 47,
    accuracy: 62,
    trend: [64, 63, 62, 62],
    questionsPerWeek: 20,
    streakDays: 0,
    lastActive: "7 days ago",
    signal: "attention",
    tasksCompleted: 2,
    tasksTotal: 7,
  },
  {
    id: "r12",
    initials: "B.K.",
    year: 3,
    stageLabel: "Year 3",
    coverage: 73,
    accuracy: 77,
    trend: [73, 75, 76, 77],
    questionsPerWeek: 65,
    streakDays: 9,
    lastActive: "Today",
    signal: "active",
    tasksCompleted: 7,
    tasksTotal: 8,
  },
];

// Cohort-level topic strength — used by the secondary aggregate view.
export const COHORT_TOPICS: CohortTopic[] = [
  { topic: "Local Anesthetic Toxicity (LAST)", avgAccuracy: 48, questionsInBank: 70, residentsCovered: 9 },
  { topic: "Neuromuscular Blockers", avgAccuracy: 54, questionsInBank: 120, residentsCovered: 12 },
  { topic: "Cardiovascular Anesthesia", avgAccuracy: 58, questionsInBank: 140, residentsCovered: 11 },
  { topic: "Hemodynamic Monitoring", avgAccuracy: 62, questionsInBank: 85, residentsCovered: 12 },
  { topic: "Respiratory Physiology", avgAccuracy: 65, questionsInBank: 110, residentsCovered: 12 },
  { topic: "Obstetric Anesthesia", avgAccuracy: 68, questionsInBank: 95, residentsCovered: 10 },
  { topic: "Airway Management", avgAccuracy: 71, questionsInBank: 130, residentsCovered: 12 },
  { topic: "Opioid Pharmacology", avgAccuracy: 74, questionsInBank: 100, residentsCovered: 12 },
  { topic: "Regional Anesthesia", avgAccuracy: 77, questionsInBank: 105, residentsCovered: 11 },
  { topic: "Fluids & Electrolytes", avgAccuracy: 82, questionsInBank: 80, residentsCovered: 12 },
];
