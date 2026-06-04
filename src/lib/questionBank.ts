// ─────────────────────────────────────────────────────────────
// Question Bank authoring — DEMO MOCKUP logic.
// Demonstrates how new questions enter the platform: a manual authoring form
// PLUS an "AI draft" button that stands in for the real pipeline (per-chapter
// NotebookLM → Anthropic generation, wired for real in P3). Frontend-only,
// synthetic; nothing is written to Supabase (not even dev).
// ─────────────────────────────────────────────────────────────

export type AnswerKey = "a" | "b" | "c" | "d";
export type ReviewStatus = "draft" | "review" | "approved";

export interface DraftQuestion {
  question: string;
  a: string;
  b: string;
  c: string;
  d: string;
  correct: AnswerKey;
  explanation: string;
  topic: string;
  chapter: number;
}

export interface BankQuestion extends DraftQuestion {
  id: string;
  status: ReviewStatus;
  author: string;
  source: "manual" | "ai";
}

// Canned "AI" drafts — what the NBLM/Anthropic pipeline would return, mocked.
// English board-style vignettes (Step-1 convention); the form lets an expert
// edit before submitting. Keyed by the demo's TOPIC_CATALOG topics.
const DRAFTS: Record<string, DraftQuestion> = {
  "Neuromuscular Blockers": {
    question:
      "A 62-year-old undergoes general anesthesia with rocuronium. At the end of surgery, train-of-four monitoring shows a TOF ratio of 0.4. Which agent provides the most rapid and reliable reversal?",
    a: "Neostigmine 50 mcg/kg",
    b: "Sugammadex 2 mg/kg",
    c: "Edrophonium 1 mg/kg",
    d: "Await spontaneous recovery",
    correct: "b",
    explanation:
      "Sugammadex encapsulates aminosteroid NMBAs (rocuronium, vecuronium) and reliably reverses moderate-to-deep block faster than acetylcholinesterase inhibitors, which plateau at a ceiling effect.",
    topic: "Neuromuscular Blockers",
    chapter: 24,
  },
  "Local Anesthetic Toxicity (LAST)": {
    question:
      "During an interscalene block a patient develops perioral numbness, then a generalized seizure and a wide-complex bradycardia. After airway management, what is the immediate priority?",
    a: "20% lipid emulsion 1.5 mL/kg bolus",
    b: "Epinephrine 1 mg IV",
    c: "Flumazenil 0.2 mg IV",
    d: "Synchronized cardioversion",
    correct: "a",
    explanation:
      "Local Anesthetic Systemic Toxicity (LAST) is treated with 20% lipid emulsion (1.5 mL/kg bolus, then infusion). If epinephrine is used, doses should be reduced to <1 mcg/kg.",
    topic: "Local Anesthetic Toxicity (LAST)",
    chapter: 25,
  },
  "Cardiovascular Anesthesia": {
    question:
      "Immediately after initiation of cardiopulmonary bypass with a non-pulsatile pump, which hemodynamic change is expected?",
    a: "Rise in pulse pressure",
    b: "Loss of arterial pulsatility with a target MAP of 50–80 mmHg",
    c: "Obligatory hypertension requiring nitroprusside",
    d: "Increase in measured cardiac output by thermodilution",
    correct: "b",
    explanation:
      "On full CPB the native ejection is bypassed, so arterial pulsatility is lost and perfusion is managed to a mean arterial pressure target (commonly 50–80 mmHg), not a pulse pressure.",
    topic: "Cardiovascular Anesthesia",
    chapter: 50,
  },
};

const FALLBACK = (topic: string, chapter: number): DraftQuestion => ({
  question: `Single-best-answer question on ${topic} — AI draft. Review and edit the stem, options, and explanation before submitting.`,
  a: "Option A",
  b: "Option B",
  c: "Option C",
  d: "Option D",
  correct: "a",
  explanation: `Explanation for the ${topic} item. The real pipeline grounds this in the chapter's NotebookLM notebook.`,
  topic,
  chapter,
});

/** Mocked AI draft for a topic. Returns a canned vignette when available,
 *  otherwise a clearly-labelled editable template. */
export function aiDraftForTopic(topic: string, chapter = 0): DraftQuestion {
  return DRAFTS[topic] ?? FALLBACK(topic, chapter);
}

/** A few questions already in the review pipeline, to show the queue + statuses. */
export const SEED_QUEUE: BankQuestion[] = [
  {
    id: "seed-1",
    ...DRAFTS["Local Anesthetic Toxicity (LAST)"],
    status: "review",
    author: "Dr. A. Cohen",
    source: "ai",
  },
  {
    id: "seed-2",
    question: "Which feature most strongly predicts a difficult mask ventilation rather than a difficult intubation?",
    a: "Mallampati IV",
    b: "Presence of a beard and edentulous state",
    c: "Thyromental distance < 6 cm",
    d: "Limited cervical extension",
    correct: "b",
    explanation:
      "Beard, obesity, age >55, edentulousness, and snoring predict difficult mask ventilation; Mallampati and thyromental distance better predict difficult laryngoscopy.",
    topic: "Airway Management",
    chapter: 40,
    status: "approved",
    author: "Dr. R. Levi",
    source: "manual",
  },
  {
    id: "seed-3",
    ...DRAFTS["Neuromuscular Blockers"],
    status: "draft",
    author: "Dr. S. Mizrahi",
    source: "ai",
  },
];
