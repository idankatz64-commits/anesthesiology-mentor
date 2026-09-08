// Bounded learning engine (Phase 4A): evidence → cautious interpretation → at
// most three actionable next steps. Pure: no I/O, no Date.now(), no randomness,
// no AI API. Nothing here is wired to UI or persistence yet.
//
// Contract (LEARNING-CURRICULUM-HANDOFF + PHASE-4A-HANDOFF):
//   - inputs are explicit durable attempt rows; legacy history has an unknown mode
//   - 50/25/70 comes from chapterProgressPolicy, never re-implemented here
//   - unscored (null verdict) is never coerced to a boolean and never fills a quota
//   - national / unclassified sources stay out of the core denominator (versioned)
//   - a repeat of the same question inside 24 h is a rehearsal, not independent evidence
//   - no misconception, pass probability or clinical claim is ever produced
//   - recommendations never widen the caller's Setup scope; counts are suggestions
import type { ConfidenceLevel, FeedbackTiming, HistoryEntry, Question } from '@/lib/types';
import { KEYS } from '@/lib/types';
import type { SrsRecord } from '@/lib/srsRepository';
import { calculateChapterProgress, managementProgress, type ChapterAnswer } from '@/lib/chapterProgressPolicy';

export const LEARNING_INSIGHTS_VERSION = 1;
/** Core = non-national, non-unclassified bank. Bump this string if national ever joins a denominator. */
export const DENOMINATOR_VERSION = 'core-v1';
/** Same 24 h window as the SRS cool-down (srsCooldown): a repeat inside it is a rehearsal. */
export const REHEARSAL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MIN_SIGNAL_SAMPLE = 5;
export const MIN_TREND_SAMPLE = 10;
export const TREND_FLAT_BAND_POINTS = 5;
export const TREND_MIX_TOLERANCE_POINTS = 30;
export const TREND_CHAPTER_OVERLAP_MIN = 0.5;
export const DEFAULT_TREND_WINDOW_DAYS = 14;
export const MAX_RECOMMENDATIONS = 3;
export const SUGGESTED_COUNT_CAP = 20;
/** Same bar as the approved policy's 70 %. */
export const STRENGTH_ACCURACY_PERCENT = 70;

const DAY_MS = 24 * 60 * 60 * 1000;

/** One confirmed durable response (attempt_questions row). `isCorrect === null` is unscored. */
export type AttemptEvidence = {
  questionId: string;
  mode: 'practice' | 'exam';
  feedbackTiming: FeedbackTiming;
  answeredAt: number;
  isCorrect: boolean | null;
  confidence: ConfidenceLevel | null;
  /** answer_history.confidence_estimated — a backfilled value, excluded from confidence signals. */
  confidenceEstimated?: boolean;
  attemptId?: string;
  /** Provenance: the recommendation this response followed, if any. */
  recommendationId?: string | null;
  /** Frozen snapshot from learning_evidence_read: classification at answer time (historical, never re-derived). */
  chapter?: number | null;
  scope?: SourceScope;
};

export type SourceScope = 'core' | 'national' | 'unclassified';

/** Mirrors public.question_access_scope (migration 20260907000002): classification by source text only. */
export function classifyQuestionSource(source: string | null | undefined): SourceScope {
  const raw = source ?? '';
  const trimmed = raw.trim();
  if (trimmed === 'ארצי') return 'national';
  if (trimmed === '' || trimmed === 'N/A' || trimmed === '#N/A' || raw.includes('ארצי')) return 'unclassified';
  return 'core';
}

export type InsightsInput = {
  bank: readonly Question[];
  evidence: readonly AttemptEvidence[];
  /** user_answers → HistoryEntry. Mode unknown: seen / legacy mistake at most, never graded. */
  legacyHistory?: Record<string, HistoryEntry>;
  srsData?: Record<string, SrsRecord>;
  nowMs: number;
  /** Setup's current chapter selection; recommendations never leave it. */
  scope?: { chapters?: readonly number[] };
  trendWindowDays?: number;
};

export type ChapterPolicy = ReturnType<typeof calculateChapterProgress>;

export type ProgressSummary = {
  total: number;
  /** The approved 50/25/70 numbers, scored durable answers only. */
  policy: ChapterPolicy;
  /** Unique questions with any evidence (durable scored, durable unscored, legacy). Informational; does not drive green. */
  seenCount: number;
  unseenCount: number;
  unscoredCount: number;
  legacyOnlyCount: number;
  /** Latest scored durable answer wrong. */
  mistakeCount: number;
  /** Legacy row wrong with no durable evidence for the question. */
  legacyMistakeCount: number;
  /** Earlier independent wrong answer, latest scored answer correct. */
  correctedCount: number;
  dueCount: number;
};
export type ChapterReport = ProgressSummary & { chapter: number };

export type ConfidenceSignals = {
  sample: number;
  correctConfident: number; correctHesitant: number; correctGuessed: number;
  wrongConfident: number; wrongHesitant: number; wrongGuessed: number;
  estimatedExcluded: number;
  missingConfidence: number;
  interpretation: 'insufficient-sample' | 'available';
  note: string;
};

export type TrendCaveat = 'small-sample-recent' | 'small-sample-previous' | 'no-previous-window' | 'mode-mix-differs' | 'exposure-mix-differs' | 'chapter-mix-differs';
export type TrendWindow = {
  fromMs: number; toMs: number;
  scored: number; correct: number; accuracy: number | null;
  practice: number; exam: number; firstExposure: number; repeat: number;
  chapters: number[];
};
export type Trend = {
  windowDays: number;
  recent: TrendWindow;
  previous: TrendWindow;
  deltaPoints: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  comparable: boolean;
  caveats: TrendCaveat[];
};

export type ChapterSignal = {
  chapter: number; sample: number; correct: number; accuracy: number;
  /** Share of explicit-confidence answers that were correct-confident; null without explicit confidence. */
  confidentCorrectShare: number | null;
  correctedCount: number;
};

export type RecommendationKind = 'review-explanations' | 'targeted-mistakes' | 'due-review' | 'unseen-coverage';
/** What Setup would be opened with. Chapters are never wider than the caller's scope. */
export type SetupParams = {
  mode: 'practice' | 'exam';
  chapters: number[];
  source: 'all' | 'mistakes';
  count: number;
  unseenOnly: boolean;
  /** Explicit pool for integration with the bounded selector; absent for unseen-coverage. */
  questionIds?: string[];
};
export type Recommendation = {
  id: string;
  kind: RecommendationKind;
  priority: number;
  title: string;
  rationale: string;
  evidence: Record<string, number | number[] | string[]>;
  caveats: string[];
  setup: SetupParams;
  countIsSuggestion: true;
  provenance: { engine: 'learningInsights'; version: number; asOf: number; denominatorVersion: string };
};

export type FollowUp = {
  recommendationId: string;
  responses: number; scored: number; correct: number; accuracy: number | null;
  firstAt: number; lastAt: number;
  /** Evidence after the recommendation; never a causal claim. */
  causal: false;
};

export type Uncertainty = {
  invalidRowCount: number;
  outsideBankCount: number;
  unscoredCount: number;
  rehearsalCount: number;
  legacyUnknownModeCount: number;
  legacyAmbiguousCount: number;
  estimatedConfidenceCount: number;
  missingConfidenceCount: number;
  missingChapterCount: number;
  /** Frozen chapter differs from the current bank chapter: signals keep the historical chapter, denominators stay current. */
  chapterReclassifiedCount: number;
  /** Frozen scope differs from the current scope: such rows never enter the current core denominator. */
  scopeReclassifiedCount: number;
};

export type LearningReport = {
  version: number;
  asOf: number;
  denominatorVersion: string;
  bank: { total: number; core: number; national: number; unclassified: number };
  /** Unique national questions with evidence — outside every core denominator. */
  nationalSeenCount: number;
  chapters: ChapterReport[];
  overall: ProgressSummary;
  uncertainty: Uncertainty;
  signals: ConfidenceSignals;
  trend: Trend;
  strengths: ChapterSignal[];
  improvements: ChapterSignal[];
  /** Chapters with some independent evidence but below MIN_SIGNAL_SAMPLE. */
  insufficientSample: number[];
  recommendations: Recommendation[];
  followUp: FollowUp[];
};

type Row = AttemptEvidence & { chapter: number; scope: SourceScope; exposure: 'first' | 'repeat'; rehearsal: boolean };

const round1 = (x: number) => Math.round(x * 10) / 10;
const percent = (part: number, total: number) => (total ? round1((part * 100) / total) : null);
const unique = <T,>(items: readonly T[]) => [...new Set(items)];

function isDue(srs: SrsRecord | undefined, nowMs: number): boolean {
  if (!srs?.next_review_date) return false;
  const ms = Date.parse(srs.next_review_date);
  // ponytail: date-only next_review_date parses as UTC midnight; same convention as srsScheduleFilter / selectionPolicy.
  return !Number.isNaN(ms) && ms <= nowMs;
}

function windowStats(rows: readonly Row[], fromMs: number, toMs: number): TrendWindow {
  const scored = rows.length;
  const correct = rows.filter(r => r.isCorrect === true).length;
  return {
    fromMs, toMs, scored, correct, accuracy: percent(correct, scored),
    practice: rows.filter(r => r.mode === 'practice').length,
    exam: rows.filter(r => r.mode === 'exam').length,
    firstExposure: rows.filter(r => r.exposure === 'first').length,
    repeat: rows.filter(r => r.exposure === 'repeat').length,
    chapters: unique(rows.map(r => r.chapter)).sort((a, b) => a - b),
  };
}

function buildTrend(independent: readonly Row[], nowMs: number, windowDays: number): Trend {
  const windowMs = windowDays * DAY_MS;
  const recentRows = independent.filter(r => r.answeredAt > nowMs - windowMs && r.answeredAt <= nowMs);
  const previousRows = independent.filter(r => r.answeredAt > nowMs - 2 * windowMs && r.answeredAt <= nowMs - windowMs);
  const recent = windowStats(recentRows, nowMs - windowMs, nowMs);
  const previous = windowStats(previousRows, nowMs - 2 * windowMs, nowMs - windowMs);
  const caveats: TrendCaveat[] = [];
  if (recent.scored < MIN_TREND_SAMPLE) caveats.push('small-sample-recent');
  if (previous.scored === 0) caveats.push('no-previous-window');
  else if (previous.scored < MIN_TREND_SAMPLE) caveats.push('small-sample-previous');
  if (recent.scored > 0 && previous.scored > 0) {
    const share = (part: number, total: number) => (part * 100) / total;
    if (Math.abs(share(recent.exam, recent.scored) - share(previous.exam, previous.scored)) > TREND_MIX_TOLERANCE_POINTS) caveats.push('mode-mix-differs');
    if (Math.abs(share(recent.firstExposure, recent.scored) - share(previous.firstExposure, previous.scored)) > TREND_MIX_TOLERANCE_POINTS) caveats.push('exposure-mix-differs');
    const union = unique([...recent.chapters, ...previous.chapters]).length;
    const overlap = recent.chapters.filter(c => previous.chapters.includes(c)).length;
    if (union > 0 && overlap / union < TREND_CHAPTER_OVERLAP_MIN) caveats.push('chapter-mix-differs');
  }
  const deltaPoints = recent.accuracy !== null && previous.accuracy !== null ? round1(recent.accuracy - previous.accuracy) : null;
  const comparable = caveats.length === 0 && deltaPoints !== null;
  const direction: Trend['direction'] = !comparable ? 'unknown'
    : Math.abs(deltaPoints!) < TREND_FLAT_BAND_POINTS ? 'flat' : deltaPoints! > 0 ? 'up' : 'down';
  return { windowDays, recent, previous, deltaPoints, direction, comparable, caveats };
}

function buildSignals(independent: readonly Row[]): ConfidenceSignals {
  const s = { sample: 0, correctConfident: 0, correctHesitant: 0, correctGuessed: 0, wrongConfident: 0, wrongHesitant: 0, wrongGuessed: 0, estimatedExcluded: 0, missingConfidence: 0 };
  for (const row of independent) {
    if (row.confidenceEstimated) { s.estimatedExcluded += 1; continue; }
    if (!row.confidence) { s.missingConfidence += 1; continue; }
    s.sample += 1;
    const key = `${row.isCorrect ? 'correct' : 'wrong'}${row.confidence[0].toUpperCase()}${row.confidence.slice(1)}` as keyof typeof s;
    s[key] += 1;
  }
  const interpretation = s.sample >= MIN_SIGNAL_SAMPLE ? 'available' : 'insufficient-sample';
  return {
    ...s, interpretation,
    note: interpretation === 'available'
      ? 'ספירה בלבד: תשובה נכונה-ובטוחה נבדלת מניחוש שהצליח; תשובה שגויה-ובטוחה היא סיבה לקרוא הסבר, לא אבחנה.'
      : `פחות מ-${MIN_SIGNAL_SAMPLE} תשובות עם דירוג ביטחון מפורש — אין עדיין מה לפרש.`,
  };
}

export function buildLearningReport(input: InsightsInput): LearningReport {
  const { bank, nowMs } = input;
  const trendWindowDays = input.trendWindowDays ?? DEFAULT_TREND_WINDOW_DAYS;
  const srsData = input.srsData ?? {};
  const uncertainty: Uncertainty = {
    invalidRowCount: 0, outsideBankCount: 0, unscoredCount: 0, rehearsalCount: 0, legacyUnknownModeCount: 0, legacyAmbiguousCount: 0,
    estimatedConfidenceCount: 0, missingConfidenceCount: 0, missingChapterCount: 0, chapterReclassifiedCount: 0, scopeReclassifiedCount: 0,
  };

  // 1. Bank index in the caller's order (deduped by id). Only core questions form denominators.
  const byId = new Map<string, Question>();
  const scopeOf = new Map<string, SourceScope>();
  const coreIds: string[] = [];
  const counts = { total: 0, core: 0, national: 0, unclassified: 0 };
  for (const question of bank) {
    const id = question[KEYS.ID];
    if (!id || byId.has(id)) continue;
    byId.set(id, question);
    const scope = classifyQuestionSource(question[KEYS.SOURCE]);
    scopeOf.set(id, scope);
    counts.total += 1;
    counts[scope] += 1;
    if (scope !== 'core') continue;
    coreIds.push(id);
    if (!(Number(question[KEYS.CHAPTER]) > 0)) uncertainty.missingChapterCount += 1;
  }
  const chapterOf = (id: string) => Number(byId.get(id)?.[KEYS.CHAPTER]) || 0;

  // 2. Normalize durable evidence: drop invalid / outside-bank rows, order by time, mark exposure + rehearsal.
  const valid = input.evidence.filter(r => {
    if (typeof r.questionId !== 'string' || r.questionId === '' || !Number.isFinite(r.answeredAt)) { uncertainty.invalidRowCount += 1; return false; }
    if (!byId.has(r.questionId)) { uncertainty.outsideBankCount += 1; return false; }
    return true;
  });
  const ordered = valid.map((r, index) => ({ r, index })).sort((a, b) => a.r.answeredAt - b.r.answeredAt || a.index - b.index).map(x => x.r);
  const timeline = new Map<string, Row[]>();
  const nationalSeen = new Set<string>();
  for (const r of ordered) {
    // Frozen classification (snapshot at answer time) decides what the row historically was;
    // the current bank decides eligibility for today's denominator. Both must be core.
    const current = scopeOf.get(r.questionId)!;
    const scope = r.scope ?? current;
    if (scope !== current) uncertainty.scopeReclassifiedCount += 1;
    if (scope === 'national') { nationalSeen.add(r.questionId); continue; }
    if (scope !== 'core' || current !== 'core') continue;
    const currentChapter = chapterOf(r.questionId);
    const chapter = typeof r.chapter === 'number' && r.chapter > 0 ? r.chapter : currentChapter;
    if (chapter !== currentChapter) uncertainty.chapterReclassifiedCount += 1;
    const list = timeline.get(r.questionId) ?? [];
    const previous = list[list.length - 1];
    const row: Row = {
      ...r, chapter, scope,
      exposure: previous ? 'repeat' : 'first',
      rehearsal: !!previous && r.answeredAt - previous.answeredAt < REHEARSAL_WINDOW_MS,
    };
    if (row.rehearsal) uncertainty.rehearsalCount += 1;
    if (row.isCorrect === null) uncertainty.unscoredCount += 1;
    if (row.confidenceEstimated) uncertainty.estimatedConfidenceCount += 1;
    else if (!row.confidence) uncertainty.missingConfidenceCount += 1;
    list.push(row);
    timeline.set(r.questionId, list);
  }

  // 3. Legacy history: unknown mode. Seen, and at most a legacy mistake when no durable row exists.
  const legacySeen = new Set<string>();
  const legacyWrongAt = new Map<string, number>();
  for (const [id, entry] of Object.entries(input.legacyHistory ?? {})) {
    if (!byId.has(id)) { uncertainty.outsideBankCount += 1; continue; }
    const scope = scopeOf.get(id)!;
    if (entry.answered === 0 || entry.lastResult === null) { uncertainty.legacyAmbiguousCount += 1; continue; }
    if (scope === 'national') { nationalSeen.add(id); continue; }
    if (scope !== 'core') continue;
    // Only a question with NO durable row is "seen only": every durable submit
    // also writes user_answers (SessionView.processQuizAnswersForSrs), so a
    // fresh 2-question attempt handed itself back as 2 unknown-mode historical
    // records. Same !timeline.has(id) test the other legacy consumers use.
    if (!timeline.has(id)) uncertainty.legacyUnknownModeCount += 1;
    legacySeen.add(id);
    if (entry.lastResult === 'wrong' && !timeline.has(id)) legacyWrongAt.set(id, entry.timestamp);
  }

  // 4. Per-question derived facts (core only).
  const latestScored = new Map<string, Row>();
  const unscoredIds = new Set<string>();
  const corrected = new Set<string>();
  for (const [id, rows] of timeline) {
    const scored = rows.filter(r => r.isCorrect !== null);
    if (scored.length) latestScored.set(id, scored[scored.length - 1]);
    if (rows.some(r => r.isCorrect === null)) unscoredIds.add(id);
    const latest = scored[scored.length - 1];
    if (latest?.isCorrect === true && scored.some(r => !r.rehearsal && r.isCorrect === false && r.answeredAt < latest.answeredAt)) corrected.add(id);
  }
  const mistakeAt = new Map<string, number>();
  for (const [id, row] of latestScored) if (row.isCorrect === false) mistakeAt.set(id, row.answeredAt);

  const summarize = (ids: readonly string[]): ProgressSummary => {
    const answers: ChapterAnswer[] = ids.flatMap(id => (timeline.get(id) ?? [])
      .filter(r => r.isCorrect !== null)
      .map(r => ({ questionId: id, mode: r.mode, correct: r.isCorrect === true, answeredAt: r.answeredAt })));
    const seenCount = ids.filter(id => timeline.has(id) || legacySeen.has(id)).length;
    return {
      total: ids.length,
      policy: calculateChapterProgress(ids, answers),
      seenCount,
      unseenCount: ids.length - seenCount,
      unscoredCount: ids.filter(id => unscoredIds.has(id)).length,
      legacyOnlyCount: ids.filter(id => legacySeen.has(id) && !timeline.has(id)).length,
      mistakeCount: ids.filter(id => mistakeAt.has(id)).length,
      legacyMistakeCount: ids.filter(id => legacyWrongAt.has(id)).length,
      correctedCount: ids.filter(id => corrected.has(id)).length,
      dueCount: ids.filter(id => isDue(srsData[id], nowMs)).length,
    };
  };

  // 5. Chapters (core, ascending; 0 = no chapter) + overall.
  const idsByChapter = new Map<number, string[]>();
  for (const id of coreIds) {
    const chapter = chapterOf(id);
    idsByChapter.set(chapter, [...(idsByChapter.get(chapter) ?? []), id]);
  }
  const chapters: ChapterReport[] = [...idsByChapter].sort((a, b) => a[0] - b[0]).map(([chapter, ids]) => ({ chapter, ...summarize(ids) }));
  const overall = summarize(coreIds);

  // 6. Independent scored evidence → signals, trend, strengths / improvements.
  const independent = [...timeline.values()].flat().filter(r => r.isCorrect !== null && !r.rehearsal);
  const signals = buildSignals(independent);
  const trend = buildTrend(independent, nowMs, trendWindowDays);
  const strengths: ChapterSignal[] = [];
  const improvements: ChapterSignal[] = [];
  const insufficientSample: number[] = [];
  for (const { chapter } of chapters) {
    const rows = independent.filter(r => r.chapter === chapter);
    if (rows.length === 0) continue;
    if (rows.length < MIN_SIGNAL_SAMPLE) { insufficientSample.push(chapter); continue; }
    const correct = rows.filter(r => r.isCorrect === true).length;
    const explicit = rows.filter(r => r.confidence && !r.confidenceEstimated);
    const signal: ChapterSignal = {
      chapter, sample: rows.length, correct, accuracy: percent(correct, rows.length)!,
      confidentCorrectShare: percent(explicit.filter(r => r.isCorrect === true && r.confidence === 'confident').length, explicit.length),
      correctedCount: (idsByChapter.get(chapter) ?? []).filter(id => corrected.has(id)).length,
    };
    (signal.accuracy >= STRENGTH_ACCURACY_PERCENT ? strengths : improvements).push(signal);
  }

  // 7. Recommendations: priority order from the handoff, one per kind, never outside scope.
  const scopeChapters = input.scope?.chapters ? new Set(input.scope.chapters) : null;
  const inScope = (id: string) => !scopeChapters || scopeChapters.has(chapterOf(id));
  const allMistakes = new Map<string, number>([...mistakeAt, ...legacyWrongAt]);
  const recentMistakes = coreIds.filter(id => allMistakes.has(id) && allMistakes.get(id)! > nowMs - REHEARSAL_WINDOW_MS && inScope(id));
  const olderMistakes = coreIds.filter(id => allMistakes.has(id) && allMistakes.get(id)! <= nowMs - REHEARSAL_WINDOW_MS && inScope(id));
  const dueIds = coreIds.filter(id => isDue(srsData[id], nowMs) && inScope(id));
  const chaptersOf = (ids: readonly string[]) => unique(ids.map(chapterOf)).sort((a, b) => a - b);
  const legacyCaveat = (ids: readonly string[]) => (ids.some(id => legacyWrongAt.has(id)) ? ['includes-legacy-history'] : []);
  const provenance = { engine: 'learningInsights' as const, version: LEARNING_INSIGHTS_VERSION, asOf: nowMs, denominatorVersion: DENOMINATOR_VERSION };
  const candidates: Omit<Recommendation, 'id' | 'priority' | 'countIsSuggestion' | 'provenance'>[] = [];

  if (recentMistakes.length) {
    const n = recentMistakes.length;
    const chaptersHit = chaptersOf(recentMistakes);
    candidates.push({
      kind: 'review-explanations',
      title: `לקרוא הסברים ל-${n} שאלות שנענו לא נכון לאחרונה`,
      rationale: `${n} תשובות שגויות ב-24 השעות האחרונות (פרקים ${chaptersHit.join(', ')}). תרגול חוזר עכשיו נופל בתוך חלון ההמתנה של החזרות, לכן ההסבר קודם.`,
      evidence: { recentWrongCount: n, chapters: chaptersHit, questionIds: recentMistakes },
      caveats: legacyCaveat(recentMistakes),
      setup: { mode: 'practice', chapters: chaptersHit, source: 'all', count: Math.min(n, SUGGESTED_COUNT_CAP), unseenOnly: false, questionIds: recentMistakes },
    });
  }
  if (olderMistakes.length) {
    const n = olderMistakes.length;
    const chaptersHit = chaptersOf(olderMistakes);
    candidates.push({
      kind: 'targeted-mistakes',
      title: `לתרגל ${n} טעויות קודמות`,
      rationale: `${n} שאלות שהתשובה האחרונה בהן הייתה שגויה (פרקים ${chaptersHit.join(', ')}). המפגש ייפתח עם מקור "טעויות" בלבד, בלי הרחבה לפרקים אחרים.`,
      evidence: { mistakeCount: n, chapters: chaptersHit, questionIds: olderMistakes },
      caveats: legacyCaveat(olderMistakes),
      setup: { mode: 'practice', chapters: chaptersHit, source: 'mistakes', count: Math.min(n, SUGGESTED_COUNT_CAP), unseenOnly: false, questionIds: olderMistakes },
    });
  }
  if (dueIds.length) {
    const n = dueIds.length;
    const chaptersHit = chaptersOf(dueIds);
    candidates.push({
      kind: 'due-review',
      title: `${n} שאלות מוכנות לחזרה`,
      rationale: `לפי לוח החזרות ${n} שאלות הגיעו למועד חזרה (פרקים ${chaptersHit.join(', ')}). זו הצעה בלבד — אפשר לבחור פחות.`,
      evidence: { dueCount: n, chapters: chaptersHit, questionIds: dueIds },
      caveats: [],
      setup: { mode: 'practice', chapters: chaptersHit, source: 'all', count: Math.min(n, SUGGESTED_COUNT_CAP), unseenOnly: false, questionIds: dueIds },
    });
  }
  const unseenTarget = chapters
    .filter(c => c.unseenCount > 0 && (!scopeChapters || scopeChapters.has(c.chapter)))
    .sort((a, b) => (a.policy.coveragePercent ?? 0) - (b.policy.coveragePercent ?? 0) || a.chapter - b.chapter)[0];
  if (unseenTarget) {
    const coverage = round1(unseenTarget.policy.coveragePercent ?? 0);
    candidates.push({
      kind: 'unseen-coverage',
      title: `להרחיב כיסוי בפרק ${unseenTarget.chapter}`,
      rationale: `${unseenTarget.unseenCount} שאלות בפרק ${unseenTarget.chapter} טרם נענו (כיסוי ${coverage}%). המפגש ייפתח עם "רק שאלות חדשות" בפרק הזה.`,
      evidence: { unseenCount: unseenTarget.unseenCount, coveragePercent: coverage, chapters: [unseenTarget.chapter] },
      caveats: unseenTarget.unscoredCount ? ['unscored-not-counted-as-coverage'] : [],
      setup: { mode: 'practice', chapters: [unseenTarget.chapter], source: 'all', count: Math.min(unseenTarget.unseenCount, SUGGESTED_COUNT_CAP), unseenOnly: true },
    });
  }
  const recommendations: Recommendation[] = candidates.slice(0, MAX_RECOMMENDATIONS).map((c, i) => ({
    id: `rec:${c.kind}:${c.setup.chapters.join('+')}:${nowMs}`, priority: i + 1, ...c, countIsSuggestion: true, provenance,
  }));

  // 8. Later evidence per recommendation — reported, never attributed.
  const byRecommendation = new Map<string, Row[]>();
  for (const row of [...timeline.values()].flat()) {
    if (!row.recommendationId) continue;
    byRecommendation.set(row.recommendationId, [...(byRecommendation.get(row.recommendationId) ?? []), row]);
  }
  const followUp: FollowUp[] = [...byRecommendation].sort(([a], [b]) => a.localeCompare(b)).map(([recommendationId, rows]) => {
    const scored = rows.filter(r => r.isCorrect !== null).length;
    const correct = rows.filter(r => r.isCorrect === true).length;
    return {
      recommendationId, responses: rows.length, scored, correct, accuracy: percent(correct, scored),
      firstAt: Math.min(...rows.map(r => r.answeredAt)), lastAt: Math.max(...rows.map(r => r.answeredAt)), causal: false,
    };
  });

  return {
    version: LEARNING_INSIGHTS_VERSION, asOf: nowMs, denominatorVersion: DENOMINATOR_VERSION,
    bank: counts, nationalSeenCount: nationalSeen.size,
    chapters, overall, uncertainty, signals, trend, strengths, improvements, insufficientSample, recommendations, followUp,
  };
}

/** Management projection: coverage and success only, via the policy's explicit allowlist. No quotas, counts, confidence or ids. */
export function managementProjection(report: LearningReport) {
  return {
    denominatorVersion: report.denominatorVersion,
    overall: managementProgress(report.overall.policy),
    chapters: report.chapters.map(c => ({ chapter: c.chapter, ...managementProgress(c.policy) })),
  };
}
