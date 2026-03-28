import type { Question, HistoryEntry } from '@/lib/types';
import { KEYS } from '@/lib/types';

// ── Session size types ──────────────────────────────────────────────
export type SessionSize = 'quick' | 'regular' | 'long' | 'simulation';

export const SESSION_SIZE_CONFIG: Record<SessionSize, { count: number; label: string; emoji: string; desc: string }> = {
  quick:      { count: 15,  label: 'מהיר',   emoji: '⚡', desc: 'חזרה מרווחת + נקודות חולשה' },
  regular:    { count: 40,  label: 'רגיל',   emoji: '📖', desc: 'מאוזן: SRS + נושאים חלשים + חדשות' },
  long:       { count: 100, label: 'מעמיק',  emoji: '🔬', desc: 'תרגול עמוק על כל הנושאים' },
  simulation: { count: 120, label: 'סימולציה', emoji: '🎯', desc: 'התפלגות כמו מבחן אמיתי (Miller\'s)' },
};

// ── Yield Tier Map ──────────────────────────────────────────────────
const YIELD_TIER_MAP: Record<string, number> = {
  // Tier 1 (1.0)
  'Cardiac Physiology': 1.0,
  'Respiratory Physiology': 1.0,
  'Perioperative Acid-Base Balance': 1.0,
  'Gastrointestinal and Hepatic Physiology': 1.0,
  'Local Anesthetics': 1.0,
  'Renal Pathophysiology': 1.0,
  'Neuromuscular Monitoring': 1.0,
  'Renal Anatomy and Physiology': 1.0,
  'Chronic Pain Management': 1.0,
  'Inhaled Anesthetic Uptake and Metabolism': 1.0,
  'Respiratory Monitoring': 1.0,
  'Anesthesia for Bariatric Surgery': 1.0,
  'Anesthesia for Obstetrics': 1.0,
  'Basic Principles of Pharmacology': 1.0,
  'Neuromuscular Physiology and Pharmacology': 1.0,
  'Airway Management': 1.0,
  'Peripheral Nerve Blocks': 1.0,
  'Geriatric Anesthesia': 1.0,
  'Critical Care Anesthesiology': 1.0,

  // Tier 2 (0.6)
  'Anesthesia for Trauma': 0.6,
  'PACU': 0.6,
  'Pediatric Anesthesia': 0.6,
  'Perioperative Fluid and Electrolyte Therapy': 0.6,
  'Intravenous Anesthetics': 0.6,
  'Cardiovascular Monitoring': 0.6,
  'Neuromuscular Blocking Drugs': 0.6,
  'Cerebral Physiology': 0.6,
  'Coagulation': 0.6,
  'Neurologic Surgery': 0.6,
  'Spinal Epidural and Caudal Anesthesia': 0.6,
  'Transfusion Therapy': 0.6,
  'Opioids': 0.6,
  'Concurrent Diseases': 0.6,
  'Preoperative Evaluation': 0.6,
  'Acute Postoperative Pain': 0.6,
  'Inhaled Anesthetic Delivery Systems': 0.6,
  'Perioperative Echocardiography': 0.6,

  // Tier 3 (0.2)
  'Thoracic Surgery': 0.2,
  'Neurophysiologic Monitoring': 0.2,
  'Patient Positioning': 0.2,
  'Vascular Surgery': 0.2,
  'Orthopedic Surgery': 0.2,
};

// ── Weight profiles per session size ────────────────────────────────
// [srsUrgency, topicWeakness, recencyGap, streakPenalty, examProximity, yieldBoost]
const WEIGHT_PROFILES: Record<Exclude<SessionSize, 'simulation'>, number[]> = {
  quick:   [0.40, 0.30, 0.15, 0.05, 0.00, 0.10],
  regular: [0.30, 0.25, 0.20, 0.10, 0.05, 0.10],
  long:    [0.25, 0.25, 0.20, 0.10, 0.10, 0.10],
};

// ── Exam simulation topic proportions (avg_q from real exam data) ───
const SIMULATION_PROPORTIONS: Record<string, number> = {
  'Cardiac Physiology': 6,
  'Respiratory Physiology': 5,
  'Basic Principles of Pharmacology': 5,
  'Airway Management': 5,
  'Local Anesthetics': 4,
  'Neuromuscular Physiology and Pharmacology': 4,
  'Anesthesia for Obstetrics': 4,
  'Perioperative Acid-Base Balance': 4,
  'Inhaled Anesthetic Uptake and Metabolism': 3,
  'Renal Anatomy and Physiology': 3,
  'Gastrointestinal and Hepatic Physiology': 3,
  'Chronic Pain Management': 3,
  'Peripheral Nerve Blocks': 3,
  'Pediatric Anesthesia': 3,
  'Critical Care Anesthesiology': 3,
  'Preoperative Evaluation': 3,
  'Cardiovascular Monitoring': 3,
  'Intravenous Anesthetics': 3,
  'Opioids': 3,
  'Spinal Epidural and Caudal Anesthesia': 3,
  'Neuromuscular Blocking Drugs': 2,
  'Neuromuscular Monitoring': 2,
  'Respiratory Monitoring': 2,
  'Renal Pathophysiology': 2,
  'Coagulation': 2,
  'Transfusion Therapy': 2,
  'Concurrent Diseases': 2,
  'Anesthesia for Trauma': 2,
  'PACU': 2,
  'Geriatric Anesthesia': 2,
  'Anesthesia for Bariatric Surgery': 2,
  'Perioperative Fluid and Electrolyte Therapy': 2,
  'Cerebral Physiology': 2,
  'Acute Postoperative Pain': 2,
  'Inhaled Anesthetic Delivery Systems': 2,
  'Perioperative Echocardiography': 1,
  'Thoracic Surgery': 1,
  'Neurophysiologic Monitoring': 1,
  'Patient Positioning': 1,
  'Vascular Surgery': 1,
  'Orthopedic Surgery': 1,
  'Neurologic Surgery': 1,
};

// ── Hardcoded exam date ─────────────────────────────────────────────
export const EXAM_DATE = new Date('2026-06-16T08:00:00');

// ── Exam proximity phase ────────────────────────────────────────────
export type ExamPhase = 'early' | 'approaching' | 'imminent';

export function getExamProximityPhase(): ExamPhase {
  const daysLeft = Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400000);
  if (daysLeft <= 0) return 'early';  // המבחן כבר עבר — חזרה למצב רגיל
  if (daysLeft > 90) return 'early';
  if (daysLeft > 30) return 'approaching';
  return 'imminent';
}

// ── Phase-based weight overrides (W2=topicWeakness, W5=examProximity) ─
const PHASE_OVERRIDES: Record<Exclude<ExamPhase, 'early'>, { w2: number; w5: number }> = {
  approaching: { w2: 0.30, w5: 0.10 },
  imminent:    { w2: 0.35, w5: 0.20 },
};

// ── Interfaces ──────────────────────────────────────────────────────
export interface SrsRecord {
  next_review_date: string;
}

export interface TopicStats {
  accuracy: number;       // 0-1
  lastAnsweredTs: number; // epoch ms, 0 if never
  recentWrongStreak: number; // count of consecutive wrongs in last 5 answers
}

interface ScoringParams {
  srsData: Record<string, SrsRecord>;
  history: Record<string, HistoryEntry>;
  topicStats: Record<string, TopicStats>;
  globalAccuracy: number;
  weights: number[];
}

// ── clamp helper ────────────────────────────────────────────────────
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ── SRS urgency for a single question ───────────────────────────────
function computeSrsUrgency(q: Question, srsData: Record<string, SrsRecord>): number {
  const srs = srsData[q[KEYS.ID]];
  if (!srs) return 0.5; // אין רשומת SRS → עדיפות בינונית
  const daysOverdue = (Date.now() - new Date(srs.next_review_date).getTime()) / 86400000;
  if (daysOverdue <= 0) return 0; // עוד לא הגיע תורה
  return clamp01(daysOverdue / 60); // מנורמל: 60 יום = 1.0
}

// ── Topic-level scores (Stage 1 of two-stage selection) ──────────────
// מחשב ציון לכל נושא עפ"י חולשה, תדירות תרגול, חשיבות למבחן
function computeTopicScores(
  topics: string[],
  topicStats: Record<string, TopicStats>,
  globalAccuracy: number,
  weights: number[],
): Record<string, number> {
  const scores: Record<string, number> = {};
  const daysUntilExam = (EXAM_DATE.getTime() - Date.now()) / 86400000;
  const examProximity = daysUntilExam < 60 ? clamp01(1 - daysUntilExam / 60) : 0;

  for (const topic of topics) {
    const ts = topicStats[topic];

    // חולשה יחסית לממוצע הכללי
    let topicWeakness = 0.5; // default: נושא חדש שאין עליו נתונים
    if (ts && globalAccuracy > 0) {
      topicWeakness = clamp01(1 - ts.accuracy / globalAccuracy);
    }

    // כמה זמן לא תרגלנו את הנושא הזה (0=עכשיו, 1=30 יום ויותר)
    let recencyGap = 1; // default: אף פעם לא תורגל
    if (ts && ts.lastAnsweredTs > 0) {
      recencyGap = clamp01((Date.now() - ts.lastAnsweredTs) / (30 * 86400000));
    }

    // רצף טעויות לאחרונה בנושא זה
    const streakPenalty = ts ? clamp01(ts.recentWrongStreak / 5) : 0;

    // חשיבות הנושא למבחן (Tier 1=1.0, Tier 2=0.6, Tier 3=0.2)
    const yieldBoost = YIELD_TIER_MAP[topic] ?? 0.1; // ברירת מחדל: קצת חשוב

    // weights: [srsUrgency(skip for topic), topicWeakness, recencyGap, streakPenalty, examProximity, yieldBoost]
    scores[topic] =
      weights[1] * topicWeakness +
      weights[2] * recencyGap +
      weights[3] * streakPenalty +
      weights[4] * examProximity +
      weights[5] * yieldBoost;
  }

  return scores;
}

// ── Compute smart score for a single question ───────────────────────
function computeSmartScore(q: Question, params: ScoringParams): number {
  const { srsData, topicStats, globalAccuracy, weights } = params;
  const qId = q[KEYS.ID];
  const topic = q[KEYS.TOPIC] || '';
  const now = Date.now();
  const today = new Date();

  // 1. srsUrgency
  const srsUrgency = computeSrsUrgency(q, srsData);

  // 2. topicWeakness
  const ts = topicStats[topic];
  let topicWeakness = 0.5; // default if no data
  if (ts && globalAccuracy > 0) {
    topicWeakness = clamp01(1 - (ts.accuracy / globalAccuracy));
  }

  // 3. recencyGap
  let recencyGap = 1; // default if never answered in topic
  if (ts && ts.lastAnsweredTs > 0) {
    const daysSince = (now - ts.lastAnsweredTs) / (1000 * 60 * 60 * 24);
    recencyGap = clamp01(daysSince / 30);
  }

  // 4. streakPenalty
  let streakPenalty = 0;
  if (ts) {
    streakPenalty = clamp01(ts.recentWrongStreak / 5);
  }

  // 5. examProximity
  const daysUntilExam = (EXAM_DATE.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  const examProximity = daysUntilExam < 60 ? clamp01(1 - daysUntilExam / 60) : 0;

  // 6. yieldBoost
  const yieldBoost = YIELD_TIER_MAP[topic] ?? 0;

  const factors = [srsUrgency, topicWeakness, recencyGap, streakPenalty, examProximity, yieldBoost];
  let score = 0;
  for (let i = 0; i < 6; i++) {
    score += weights[i] * factors[i];
  }

  return score;
}

// ── Slot allocation per topic (Hamilton proportional method) ─────────
// מחלק count שאלות בין נושאים פרופורציונלית לציון, עם תקרה למניעת שליטה
function allocateSlots(
  topicScores: Record<string, number>,
  byTopic: Record<string, Question[]>,
  count: number,
): Record<string, number> {
  const topics = Object.keys(topicScores);
  if (topics.length === 0) return {};

  // תקרה: נושא אחד לא יכול לתפוס יותר מ-25% מהסשן (מינימום 2 שאלות)
  const maxPerTopic = Math.max(2, Math.ceil(count * 0.25));

  const totalScore = topics.reduce((sum, t) => sum + topicScores[t], 0);

  // שלב 1: חלק אידיאלי לכל נושא (עם נקודה עשרונית)
  const ideal: Record<string, number> = {};
  for (const t of topics) {
    const proportion = totalScore > 0 ? topicScores[t] / totalScore : 1 / topics.length;
    ideal[t] = proportion * count;
  }

  // שלב 2: floor לכולם, עם מגבלות (תקרה + כמה שיש בפועל בpool)
  const slots: Record<string, number> = {};
  let allocated = 0;
  for (const t of topics) {
    slots[t] = Math.min(
      Math.floor(ideal[t]),
      maxPerTopic,
      byTopic[t].length,
    );
    allocated += slots[t];
  }

  // שלב 3: חלק את ה-slots שנותרו לנושאים עם השארית הגדולה ביותר
  // (Hamilton method — אלה שה"מגיע להם" הכי הרבה מהחלק האידיאלי)
  const remaining = count - allocated;
  const candidates = topics
    .filter(t => slots[t] < Math.min(maxPerTopic, byTopic[t].length))
    .sort((a, b) => {
      const fracDiff =
        (ideal[b] - Math.floor(ideal[b])) - (ideal[a] - Math.floor(ideal[a]));
      return fracDiff !== 0 ? fracDiff : topicScores[b] - topicScores[a];
    });

  for (let i = 0; i < remaining && i < candidates.length; i++) {
    slots[candidates[i]]++;
  }

  return slots;
}

// ── Compute topic stats from history ────────────────────────────────
export function computeTopicStats(
  history: Record<string, HistoryEntry>,
  data: Question[]
): { topicStats: Record<string, TopicStats>; globalAccuracy: number } {
  const topicAgg: Record<string, { correct: number; answered: number; lastTs: number; recentResults: boolean[] }> = {};
  let globalCorrect = 0;
  let globalAnswered = 0;

  // Build a questionId → topic map
  const qTopicMap: Record<string, string> = {};
  for (const q of data) {
    qTopicMap[q[KEYS.ID]] = q[KEYS.TOPIC] || '';
  }

  for (const [qId, h] of Object.entries(history)) {
    const topic = qTopicMap[qId] || '';
    if (!topicAgg[topic]) {
      topicAgg[topic] = { correct: 0, answered: 0, lastTs: 0, recentResults: [] };
    }
    const agg = topicAgg[topic];
    agg.correct += h.correct;
    agg.answered += h.answered;
    agg.lastTs = Math.max(agg.lastTs, h.timestamp);
    // Track last result for streak calculation
    if (h.lastResult) {
      agg.recentResults.push(h.lastResult === 'correct');
    }
    globalCorrect += h.correct;
    globalAnswered += h.answered;
  }

  const globalAccuracy = globalAnswered > 0 ? globalCorrect / globalAnswered : 0.5;

  const topicStats: Record<string, TopicStats> = {};
  for (const [topic, agg] of Object.entries(topicAgg)) {
    // Count recent wrong streak from the end of results
    let recentWrongStreak = 0;
    const results = agg.recentResults.slice(-5);
    for (let i = results.length - 1; i >= 0; i--) {
      if (!results[i]) recentWrongStreak++;
      else break;
    }
    topicStats[topic] = {
      accuracy: agg.answered > 0 ? agg.correct / agg.answered : 0,
      lastAnsweredTs: agg.lastTs,
      recentWrongStreak,
    };
  }

  return { topicStats, globalAccuracy };
}

// ── Main selection function ─────────────────────────────────────────
export function selectSmartQuestions(
  pool: Question[],
  count: number,
  sessionSize: SessionSize,
  srsData: Record<string, SrsRecord>,
  history: Record<string, HistoryEntry>,
  allData: Question[]
): Question[] {
  if (pool.length === 0) return [];

  // Simulation mode: proportional distribution
  if (sessionSize === 'simulation') {
    return selectSimulationQuestions(pool, count);
  }

  // Scored selection
  const { topicStats, globalAccuracy } = computeTopicStats(history, allData);
  const weights = [...WEIGHT_PROFILES[sessionSize]];

  // Apply exam proximity phase overrides to W2 and W5
  const phase = getExamProximityPhase();
  if (phase !== 'early') {
    const overrides = PHASE_OVERRIDES[phase];
    weights[1] = overrides.w2; // topicWeakness
    weights[4] = overrides.w5; // examProximity
  }

  // לא יותר ממה שיש בpool בפועל
  const effectiveCount = Math.min(count, pool.length);

  // ── STAGE 1: קבץ לפי נושא + חשב ציון לכל נושא ───────────────────
  const byTopic: Record<string, Question[]> = {};
  for (const q of pool) {
    const topic = q[KEYS.TOPIC] || '__other__';
    if (!byTopic[topic]) byTopic[topic] = [];
    byTopic[topic].push(q);
  }

  const topics = Object.keys(byTopic);
  const topicScores = computeTopicScores(topics, topicStats, globalAccuracy, weights);

  // ── STAGE 2: הקצה slots לנושאים (פרופורציונלי + תקרת 25%) ────────
  const slots = allocateSlots(topicScores, byTopic, effectiveCount);

  // ── STAGE 3: בחר שאלות בתוך כל נושא לפי SRS urgency ──────────────
  const selected: Question[] = [];
  for (const topic of topics) {
    const n = slots[topic] ?? 0;
    if (n <= 0) continue;
    const scored = byTopic[topic]
      .map(q => ({ q, urgency: computeSrsUrgency(q, srsData) + Math.random() * 0.001 }))
      .sort((a, b) => b.urgency - a.urgency);
    selected.push(...scored.slice(0, n).map(s => s.q));
  }

  // ── מלא gaps: אם pool קטן מדי ב-slot מסוים, קח מהשאר ────────────
  if (selected.length < effectiveCount) {
    const usedIds = new Set(selected.map(q => q[KEYS.ID]));
    const leftover = pool
      .filter(q => !usedIds.has(q[KEYS.ID]))
      .map(q => ({ q, urgency: computeSrsUrgency(q, srsData) + Math.random() * 0.001 }))
      .sort((a, b) => b.urgency - a.urgency);
    selected.push(...leftover.slice(0, effectiveCount - selected.length).map(s => s.q));
  }

  // Shuffle the final selection so presentation order isn't predictable
  const result = selected.slice(0, effectiveCount);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

// ── Simulation mode: proportional topic distribution ────────────────
function selectSimulationQuestions(pool: Question[], count: number): Question[] {
  const totalProportion = Object.values(SIMULATION_PROPORTIONS).reduce((a, b) => a + b, 0);

  // Group pool by topic
  const byTopic: Record<string, Question[]> = {};
  for (const q of pool) {
    const topic = q[KEYS.TOPIC] || '__other__';
    if (!byTopic[topic]) byTopic[topic] = [];
    byTopic[topic].push(q);
  }

  const selected: Question[] = [];

  // Allocate proportionally
  for (const [topic, proportion] of Object.entries(SIMULATION_PROPORTIONS)) {
    const target = Math.round((proportion / totalProportion) * count);
    const available = byTopic[topic] || [];
    // Shuffle and take up to target
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    selected.push(...shuffled.slice(0, target));
    // Remove used questions
    delete byTopic[topic];
  }

  // Fill remaining slots from leftover questions
  if (selected.length < count) {
    const remaining: Question[] = [];
    for (const qs of Object.values(byTopic)) {
      remaining.push(...qs);
    }
    const shuffled = remaining.sort(() => Math.random() - 0.5);
    selected.push(...shuffled.slice(0, count - selected.length));
  }

  // Final shuffle
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }

  return selected.slice(0, count);
}
