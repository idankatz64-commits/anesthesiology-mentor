import { describe, expect, it } from 'vitest';
import {
  buildLearningReport, managementProjection, classifyQuestionSource,
  DENOMINATOR_VERSION, MAX_RECOMMENDATIONS, REHEARSAL_WINDOW_MS,
  type AttemptEvidence, type LearningReport,
} from '@/lib/learningInsights';
import type { HistoryEntry, Question } from '@/lib/types';
import { KEYS } from '@/lib/types';
import type { SrsRecord } from '@/lib/srsRepository';

// Frozen clock; every timestamp below is relative to it.
const NOW = new Date('2026-09-07T12:00:00Z').getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Question has 17 required fields — same pattern as selectionPolicy.test.ts, no cast.
function q(id: string, chapter: number, source = 'מבחן'): Question {
  return {
    [KEYS.ID]: id, [KEYS.REF_ID]: id, [KEYS.QUESTION]: '?',
    [KEYS.A]: 'a', [KEYS.B]: 'b', [KEYS.C]: 'c', [KEYS.D]: 'd',
    [KEYS.CORRECT]: 'A', [KEYS.EXPLANATION]: '', [KEYS.TOPIC]: `ch${chapter}`,
    [KEYS.YEAR]: '2024', [KEYS.SOURCE]: source, [KEYS.MILLER]: '', [KEYS.CHAPTER]: chapter,
    [KEYS.MEDIA_TYPE]: '', [KEYS.MEDIA_LINK]: '', [KEYS.KIND]: '',
  };
}
const chapterBank = (chapter: number, n: number, source?: string) =>
  Array.from({ length: n }, (_, i) => q(`c${chapter}-${i}`, chapter, source));
const ids = (chapter: number, from: number, to: number) => Array.from({ length: to - from }, (_, i) => `c${chapter}-${from + i}`);

// Default: one independent exposure per row, well outside the rehearsal window.
const ev = (questionId: string, mode: 'practice' | 'exam', isCorrect: boolean | null, answeredAt: number, extra: Partial<AttemptEvidence> = {}): AttemptEvidence =>
  ({ questionId, mode, feedbackTiming: mode === 'practice' ? 'immediate' : 'end', answeredAt, isCorrect, confidence: 'confident', ...extra });

const bank100 = chapterBank(12, 100);
const build = (overrides: Partial<Parameters<typeof buildLearningReport>[0]>): LearningReport =>
  buildLearningReport({ bank: bank100, evidence: [], nowMs: NOW, ...overrides });
const chapter = (report: LearningReport, id: number) => report.chapters.find(c => c.chapter === id)!;

describe('learning insights — approved 50/25/70 policy reuse', () => {
  it('99 practice + 1 exam: full coverage but the graded quota is visibly unmet, never green', () => {
    const evidence = ids(12, 0, 100).map((id, i) => ev(id, i === 0 ? 'exam' : 'practice', true, NOW - (100 - i) * DAY));
    const report = build({ evidence });
    const c = chapter(report, 12);
    expect(c.policy).toMatchObject({ coveredCount: 100, coveragePercent: 100, quizCount: 1, requiredQuizCount: 25, quizSuccessPercent: 100, green: false });
    expect(report.overall.policy.green).toBe(false);
    expect(c.seenCount).toBe(100);
    expect(c.unseenCount).toBe(0);
  });

  it('repeating the same question ids does not inflate coverage, quota or seen counts', () => {
    const spaced = Array.from({ length: 50 }, (_, i) => ev('c12-0', 'exam', true, NOW - (60 - i) * DAY));
    const spacedReport = build({ evidence: spaced });
    expect(chapter(spacedReport, 12)).toMatchObject({ seenCount: 1, policy: { coveredCount: 1, quizCount: 1 } });
    expect(spacedReport.uncertainty.rehearsalCount).toBe(0);

    const burst = Array.from({ length: 50 }, (_, i) => ev('c12-0', 'exam', true, NOW - 2 * DAY + i * 1000));
    const burstReport = build({ evidence: burst });
    expect(chapter(burstReport, 12)).toMatchObject({ seenCount: 1, policy: { coveredCount: 1, quizCount: 1 } });
    expect(burstReport.uncertainty.rehearsalCount).toBe(49);
  });

  it('50% coverage + 25 graded exam answers at 72% is green; the projection shows coverage and success only', () => {
    const evidence = ids(12, 0, 50).map((id, i) => ev(id, i < 25 ? 'exam' : 'practice', i >= 7, NOW - (50 - i) * DAY));
    const report = build({ evidence });
    expect(chapter(report, 12).policy).toMatchObject({ green: true, coveragePercent: 50, quizSuccessPercent: 72, quizCount: 25 });
    const projection = managementProjection(report);
    expect(projection.denominatorVersion).toBe(DENOMINATOR_VERSION);
    expect(projection.overall).toEqual({ coveragePercent: 50, successPercent: 72 });
    expect(projection.chapters).toEqual([{ chapter: 12, coveragePercent: 50, successPercent: 72 }]);
    expect(Object.keys(projection).sort()).toEqual(['chapters', 'denominatorVersion', 'overall']);
    expect(JSON.stringify(projection)).not.toMatch(/quiz|required|practice|confidence|questionId|mistake/i);
  });

  it('unscored answers are seen but never fill the graded quota and never make a chapter green', () => {
    const practice = ids(12, 25, 50).map((id, i) => ev(id, 'practice', true, NOW - (30 + i) * DAY));
    const unscored = ids(12, 0, 25).map((id, i) => ev(id, 'exam', null, NOW - (5 + i) * DAY, { confidence: 'hesitant' }));
    const report = build({ evidence: [...practice, ...unscored] });
    const c = chapter(report, 12);
    expect(c.policy).toMatchObject({ coveredCount: 25, quizCount: 0, quizSuccessPercent: null, green: false });
    expect(c).toMatchObject({ seenCount: 50, unscoredCount: 25 });
    expect(report.uncertainty.unscoredCount).toBe(25);

    // One graded answer among 24 unscored + enough practice coverage: still not green, quota shows 1.
    const oneGraded = [...ids(12, 25, 75).map((id, i) => ev(id, 'practice', true, NOW - (30 + i) * DAY)),
      ev('c12-0', 'exam', true, NOW - DAY * 3), ...ids(12, 1, 25).map((id, i) => ev(id, 'exam', null, NOW - (5 + i) * DAY))];
    expect(chapter(build({ evidence: oneGraded }), 12).policy).toMatchObject({ quizCount: 1, quizSuccessPercent: 100, green: false });
  });

  it('the latest graded exam answer defines success; a later practice correction removes the mistake but does not promote the score', () => {
    const report = build({ evidence: [ev('c12-0', 'exam', false, NOW - 10 * DAY), ev('c12-0', 'practice', true, NOW - 5 * DAY)] });
    const c = chapter(report, 12);
    expect(c.policy).toMatchObject({ quizCount: 1, quizSuccessPercent: 0 });
    expect(c.mistakeCount).toBe(0);
    expect(c.correctedCount).toBe(1);

    const flipped = build({ evidence: [ev('c12-0', 'exam', true, NOW - 10 * DAY), ev('c12-0', 'exam', false, NOW - 5 * DAY)] });
    expect(chapter(flipped, 12)).toMatchObject({ mistakeCount: 1, policy: { quizSuccessPercent: 0 } });
  });

  it('a rehearsal inside 24h still feeds the approved rule but is not independent evidence', () => {
    const t = NOW - 3 * DAY;
    const report = build({ evidence: [ev('c12-0', 'exam', false, t), ev('c12-0', 'exam', true, t + HOUR)] });
    expect(REHEARSAL_WINDOW_MS).toBe(DAY);
    expect(chapter(report, 12).policy.quizSuccessPercent).toBe(100);
    expect(report.uncertainty.rehearsalCount).toBe(1);
    expect(report.signals.sample).toBe(1);
    expect(report.signals.wrongConfident).toBe(1);
  });
});

describe('learning insights — historical uncertainty', () => {
  it('legacy history has an unknown mode: seen, a legacy mistake at most, never graded', () => {
    const legacyHistory: Record<string, HistoryEntry> = {
      'c12-5': { answered: 3, correct: 2, lastResult: 'correct', everWrong: true, timestamp: NOW - 40 * DAY },
      'c12-6': { answered: 2, correct: 0, lastResult: 'wrong', everWrong: true, timestamp: NOW - 40 * DAY },
      'c12-7': { answered: 0, correct: 0, lastResult: null, everWrong: false, timestamp: NOW - 40 * DAY },
      'c12-6-ghost': { answered: 1, correct: 1, lastResult: 'correct', everWrong: false, timestamp: NOW - 40 * DAY },
    };
    const report = build({ legacyHistory });
    const c = chapter(report, 12);
    expect(c).toMatchObject({ seenCount: 2, legacyOnlyCount: 2, mistakeCount: 0, legacyMistakeCount: 1, policy: { coveredCount: 0, quizCount: 0, green: false } });
    expect(report.uncertainty).toMatchObject({ legacyUnknownModeCount: 2, legacyAmbiguousCount: 1 });
    // A durable answer for the same question takes precedence over the legacy row.
    const merged = build({ legacyHistory, evidence: [ev('c12-6', 'practice', true, NOW - 2 * DAY)] });
    expect(chapter(merged, 12)).toMatchObject({ seenCount: 2, legacyOnlyCount: 1, legacyMistakeCount: 0 });
    // ...including in the caveat. Every durable submit also writes user_answers,
    // so counting those rows made a fresh attempt report itself back as extra
    // "unknown mode" history (QA 2026-09-08: 2 questions answered, 2 records).
    expect(merged.uncertainty.legacyUnknownModeCount).toBe(1);
    const echo = build({ legacyHistory: { 'c12-5': legacyHistory['c12-5'] }, evidence: [ev('c12-5', 'exam', true, NOW - HOUR)] });
    expect(echo.uncertainty.legacyUnknownModeCount).toBe(0);
  });

  it('sparse history: signals and trend say insufficient sample and give no direction', () => {
    const report = build({ evidence: ids(12, 0, 3).map((id, i) => ev(id, 'practice', i > 0, NOW - (2 + i) * DAY)) });
    expect(report.signals.interpretation).toBe('insufficient-sample');
    expect(report.trend.direction).toBe('unknown');
    expect(report.trend.comparable).toBe(false);
    expect(report.trend.caveats).toEqual(expect.arrayContaining(['small-sample-recent', 'no-previous-window']));
    expect(report.strengths).toEqual([]);
    expect(report.improvements).toEqual([]);
    expect(report.insufficientSample).toContain(12);
  });

  it('confidence signals separate correct-confident from guesses and wrong answers; estimated confidence is excluded', () => {
    const rows: AttemptEvidence[] = [
      ...ids(12, 0, 3).map((id, i) => ev(id, 'practice', true, NOW - (10 + i) * DAY, { confidence: 'confident' })),
      ...ids(12, 3, 5).map((id, i) => ev(id, 'practice', true, NOW - (20 + i) * DAY, { confidence: 'guessed' })),
      ...ids(12, 5, 7).map((id, i) => ev(id, 'practice', false, NOW - (30 + i) * DAY, { confidence: 'confident' })),
      ev('c12-7', 'practice', false, NOW - 40 * DAY, { confidence: 'hesitant', confidenceEstimated: true }),
      ev('c12-8', 'practice', true, NOW - 41 * DAY, { confidence: null }),
    ];
    const report = build({ evidence: rows });
    expect(report.signals).toMatchObject({
      sample: 7, correctConfident: 3, correctHesitant: 0, correctGuessed: 2, wrongConfident: 2, wrongHesitant: 0, wrongGuessed: 0,
      estimatedExcluded: 1, missingConfidence: 1, interpretation: 'available',
    });
    expect(report.uncertainty.estimatedConfidenceCount).toBe(1);
    expect(JSON.stringify(report.signals)).not.toMatch(/misconception|probab/i);
  });

  it('evidence outside the bank and invalid rows are dropped and counted, never guessed', () => {
    const report = build({ evidence: [ev('ghost', 'practice', true, NOW - DAY), ev('c12-0', 'practice', true, Number.NaN), ev('', 'practice', true, NOW - DAY)] });
    expect(report.uncertainty).toMatchObject({ outsideBankCount: 1, invalidRowCount: 2 });
    expect(chapter(report, 12).seenCount).toBe(0);
  });
});

describe('learning insights — trends over comparable composition', () => {
  const previous = ids(12, 0, 10).map((id, i) => ev(id, 'practice', i < 5, NOW - (15 + i) * DAY));
  it('comparable windows give a delta and a direction', () => {
    const recent = ids(12, 10, 20).map((id, i) => ev(id, 'practice', i < 8, NOW - (1 + i) * DAY));
    const report = build({ evidence: [...previous, ...recent] });
    expect(report.trend).toMatchObject({ windowDays: 14, comparable: true, caveats: [], deltaPoints: 30, direction: 'up' });
    expect(report.trend.recent).toMatchObject({ scored: 10, correct: 8, accuracy: 80, practice: 10, exam: 0, firstExposure: 10 });
    expect(report.trend.previous).toMatchObject({ scored: 10, correct: 5, accuracy: 50 });
  });

  it('a different mode mix keeps the delta but withholds the direction with a caveat', () => {
    const recent = ids(12, 10, 20).map((id, i) => ev(id, 'exam', i < 8, NOW - (1 + i) * DAY));
    const report = build({ evidence: [...previous, ...recent] });
    expect(report.trend.deltaPoints).toBe(30);
    expect(report.trend.direction).toBe('unknown');
    expect(report.trend.caveats).toEqual(['mode-mix-differs']);
  });

  it('a small change stays flat', () => {
    const recent = ids(12, 10, 20).map((id, i) => ev(id, 'practice', i < 5, NOW - (1 + i) * DAY));
    expect(build({ evidence: [...previous, ...recent] }).trend).toMatchObject({ deltaPoints: 0, direction: 'flat' });
  });
});

describe('learning insights — denominators', () => {
  it('national bank questions stay out of the core denominator and are counted separately', () => {
    const bank = [...bank100, ...chapterBank(12, 50, 'ארצי').map(x => ({ ...x, [KEYS.ID]: `n-${x[KEYS.ID]}` }))];
    const evidence = [...ids(12, 0, 40).map((id, i) => ev(id, 'exam', true, NOW - (2 + i) * DAY)),
      ...Array.from({ length: 50 }, (_, i) => ev(`n-c12-${i}`, 'exam', true, NOW - (2 + i) * DAY))];
    const report = buildLearningReport({ bank, evidence, nowMs: NOW });
    expect(report.denominatorVersion).toBe('core-v1');
    expect(report.bank).toMatchObject({ total: 150, core: 100, national: 50, unclassified: 0 });
    expect(report.nationalSeenCount).toBe(50);
    expect(chapter(report, 12)).toMatchObject({ total: 100, policy: { coveredCount: 40, coveragePercent: 40, quizCount: 40 } });
    expect(report.overall.policy).toMatchObject({ coveredCount: 40, coveragePercent: 40 });
  });

  it('classifies sources exactly like question_access_scope', () => {
    expect(classifyQuestionSource('ארצי')).toBe('national');
    expect(classifyQuestionSource('  ארצי ')).toBe('national');
    expect(classifyQuestionSource('ארצי 2020')).toBe('unclassified');
    expect(classifyQuestionSource('')).toBe('unclassified');
    expect(classifyQuestionSource('#N/A')).toBe('unclassified');
    expect(classifyQuestionSource('מבחן שלב א')).toBe('core');
  });

  it('questions without a chapter are reported, not guessed into one', () => {
    const report = buildLearningReport({ bank: [...bank100, q('nochap', 0)], evidence: [ev('nochap', 'practice', true, NOW - DAY)], nowMs: NOW });
    expect(report.uncertainty.missingChapterCount).toBe(1);
    expect(report.chapters.map(c => c.chapter)).toEqual([0, 12]);
  });
});

describe('learning insights — strengths, improvements, due review', () => {
  it('needs a minimum independent sample per chapter', () => {
    const bank = [...bank100, ...chapterBank(13, 20), ...chapterBank(14, 20)];
    const evidence = [
      ...ids(12, 0, 10).map((id, i) => ev(id, 'practice', i < 9, NOW - (2 + i) * DAY)),
      ...ids(13, 0, 10).map((id, i) => ev(id, 'practice', i < 4, NOW - (2 + i) * DAY)),
      ...ids(14, 0, 3).map((id, i) => ev(id, 'practice', true, NOW - (2 + i) * DAY)),
    ];
    const report = buildLearningReport({ bank, evidence, nowMs: NOW });
    expect(report.strengths).toEqual([expect.objectContaining({ chapter: 12, sample: 10, accuracy: 90 })]);
    expect(report.improvements).toEqual([expect.objectContaining({ chapter: 13, sample: 10, accuracy: 40 })]);
    expect(report.insufficientSample).toEqual([14]);
  });

  it('counts only SRS records that are due now', () => {
    const srsData: Record<string, SrsRecord> = {
      'c12-0': { next_review_date: '2026-09-06', interval_days: 1, ease_factor: 2.5, repetitions: 1, confidence: 'confident', last_correct: true },
      'c12-1': { next_review_date: '2026-09-08', interval_days: 1, ease_factor: 2.5, repetitions: 1, confidence: 'confident', last_correct: true },
    };
    expect(chapter(build({ srsData }), 12).dueCount).toBe(1);
    expect(build({}).chapters[0].dueCount).toBe(0);
  });
});

describe('learning insights — recommendations', () => {
  const bank = [...bank100, ...chapterBank(13, 20), ...chapterBank(14, 20)];
  const oldMistakes = ids(12, 0, 3).map((id, i) => ev(id, 'practice', false, NOW - (3 + i) * DAY));
  const recentWrong = ids(13, 0, 2).map((id, i) => ev(id, 'practice', false, NOW - (1 + i) * HOUR));
  const srsData: Record<string, SrsRecord> = Object.fromEntries(ids(12, 10, 14).map(id =>
    [id, { next_review_date: '2026-09-06', interval_days: 1, ease_factor: 2.5, repetitions: 1, confidence: 'confident', last_correct: true }]));
  const full = () => buildLearningReport({ bank, evidence: [...oldMistakes, ...recentWrong], srsData, nowMs: NOW });

  it('returns at most three prioritized, evidence-backed actions with explicit Setup parameters', () => {
    const { recommendations } = full();
    expect(recommendations).toHaveLength(MAX_RECOMMENDATIONS);
    expect(recommendations.map(r => r.kind)).toEqual(['review-explanations', 'targeted-mistakes', 'due-review']);
    expect(recommendations.map(r => r.priority)).toEqual([1, 2, 3]);
    expect(new Set(recommendations.map(r => r.id)).size).toBe(3);
    const [review, mistakes, due] = recommendations;
    expect(review.setup).toMatchObject({ chapters: [13], source: 'all', count: 2, questionIds: ['c13-0', 'c13-1'] });
    expect(mistakes.setup).toMatchObject({ mode: 'practice', chapters: [12], source: 'mistakes', count: 3, unseenOnly: false });
    expect(mistakes.evidence).toMatchObject({ mistakeCount: 3 });
    expect(due.setup).toMatchObject({ chapters: [12], count: 4, questionIds: ids(12, 10, 14) });
    for (const r of recommendations) {
      expect(r.provenance).toMatchObject({ engine: 'learningInsights', asOf: NOW, denominatorVersion: DENOMINATOR_VERSION });
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.rationale.length).toBeGreaterThan(0);
      expect(r.countIsSuggestion).toBe(true);
    }
    expect(JSON.stringify(recommendations)).not.toMatch(/חובה|overdue|באיחור/);
  });

  it('never widens beyond the caller\'s selected chapters; empty intersections drop the action', () => {
    const { recommendations } = buildLearningReport({ bank, evidence: [...oldMistakes, ...recentWrong], srsData, nowMs: NOW, scope: { chapters: [13] } });
    // Chapter 13 has recent wrong answers and unseen questions; 12 (mistakes, due) and 14 (unseen) are out of scope.
    expect(recommendations.map(r => r.kind)).toEqual(['review-explanations', 'unseen-coverage']);
    for (const r of recommendations) expect(r.setup.chapters).toEqual([13]);
    expect(JSON.stringify(recommendations)).not.toMatch(/c12-|c14-/);
  });

  it('unseen coverage targets the lowest-coverage chapter deterministically and caps the suggested count', () => {
    const evidence = [...ids(12, 0, 60).map((id, i) => ev(id, 'practice', true, NOW - (2 + i) * DAY)), ...ids(13, 0, 5).map((id, i) => ev(id, 'practice', true, NOW - (2 + i) * DAY))];
    const { recommendations } = buildLearningReport({ bank, evidence, nowMs: NOW });
    expect(recommendations.map(r => r.kind)).toEqual(['unseen-coverage']);
    expect(recommendations[0].setup).toMatchObject({ chapters: [14], unseenOnly: true, source: 'all', count: 20 });
    expect(recommendations[0].evidence).toMatchObject({ unseenCount: 20, coveragePercent: 0 });
  });

  it('a fully covered bank with no mistakes or due items yields no forced action', () => {
    const evidence = ids(12, 0, 100).map((id, i) => ev(id, 'practice', true, NOW - (2 + i) * DAY));
    expect(build({ evidence }).recommendations).toEqual([]);
  });

  it('reports later evidence per recommendation without a causal claim', () => {
    const evidence = ids(12, 0, 4).map((id, i) => ev(id, 'practice', i < 3, NOW - (2 + i) * DAY, { recommendationId: 'rec:test' }));
    const report = build({ evidence: [...evidence, ev('c12-9', 'practice', true, NOW - DAY)] });
    expect(report.followUp).toEqual([expect.objectContaining({ recommendationId: 'rec:test', responses: 4, scored: 4, correct: 3, accuracy: 75, causal: false })]);
  });
});

describe('learning insights — frozen evidence classification vs current eligibility', () => {
  const bank = [...chapterBank(12, 10), ...chapterBank(13, 10)];
  it('a chapter edit keeps the historical chapter for signals while coverage follows the current bank', () => {
    // c13-0..4 answered while they were still chapter 12 (frozen snapshot), bank now says 13.
    const evidence = ids(13, 0, 5).map((id, i) => ev(id, 'practice', true, NOW - (2 + i) * DAY, { chapter: 12 }));
    const report = buildLearningReport({ bank, evidence, nowMs: NOW });
    expect(chapter(report, 13).policy.coveragePercent).toBe(50); // current denominator
    expect(chapter(report, 12).policy.coveragePercent).toBe(0);
    expect(report.strengths.map(s => s.chapter)).toEqual([12]); // historical classification
    expect(report.uncertainty.chapterReclassifiedCount).toBe(5);
  });
  it('a source edit that turns a core question national never lets old core answers into the current denominator, and a frozen national answer never widens core', () => {
    const edited = [...chapterBank(12, 9), q('c12-9', 12, 'ארצי'), q('c12-10', 12)];
    const evidence = [
      ev('c12-9', 'exam', true, NOW - 2 * DAY, { scope: 'core', chapter: 12 }), // was core, now national
      ev('c12-10', 'exam', true, NOW - 3 * DAY, { scope: 'national', chapter: 12 }), // was national, now core
    ];
    const report = buildLearningReport({ bank: edited, evidence, nowMs: NOW });
    expect(report.bank).toEqual({ total: 11, core: 10, national: 1, unclassified: 0 });
    expect(chapter(report, 12).seenCount).toBe(0);
    expect(chapter(report, 12).policy.coveragePercent).toBe(0);
    expect(report.nationalSeenCount).toBe(1);
    expect(report.uncertainty.scopeReclassifiedCount).toBe(2);
  });
  it('a revoked or removed question stays out of every denominator and is reported as outside the bank', () => {
    const evidence = [ev('gone-1', 'exam', true, NOW - DAY, { scope: 'national', chapter: 12 }), ev('gone-2', 'exam', true, NOW - DAY, { scope: 'core', chapter: 12 })];
    const report = buildLearningReport({ bank, evidence, nowMs: NOW });
    expect(report.overall.seenCount).toBe(0);
    expect(report.uncertainty.outsideBankCount).toBe(2);
    expect(report.bank.total).toBe(20);
  });
});
