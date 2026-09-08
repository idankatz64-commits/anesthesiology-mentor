import { describe, expect, it } from 'vitest';
import { buildSessionReportHtml } from '@/lib/exportPdf';
import { buildSessionInsights, captureLearningBaseline } from '@/lib/sessionInsights';
import { buildLearningReport, type AttemptEvidence } from '@/lib/learningInsights';
import type { LearningReportState } from '@/components/learning/useLearningReport';
import { launchQuestion } from './fixtures/launchQuestion';

// Finding 1: the printable report must carry the same cumulative analysis the screen shows,
// or say explicitly that it is incomplete. Never a partial report labelled complete.
const NOW = new Date('2026-09-07T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const bank = Array.from({ length: 35 }, (_, i) => ({ ...launchQuestion(String(i)), chapter: i < 20 ? 12 : 13, source: 'מבחן', explanation: `הסבר ${i}` }));
const ev = (questionId: string, isCorrect: boolean, daysAgo: number): AttemptEvidence =>
  ({ questionId, mode: 'exam', feedbackTiming: 'end', answeredAt: NOW - daysAgo * DAY, isCorrect, confidence: 'confident' });
// Chapter 12: 15 of 20 seen in exam, 12 correct. Chapter 13 untouched → a recommendation exists.
const evidence = bank.slice(0, 15).map((q, i) => ev(q.id, i < 12, 10 - (i % 5)));
const cumulative = buildLearningReport({ bank, evidence, nowMs: NOW });

const html = (learningReport?: LearningReportState) => {
  const insights = buildSessionInsights({ bank, quiz: bank, answers: bank.map(() => 'A'), history: {}, baseline: captureLearningBaseline({}), historyAvailable: true });
  return buildSessionReportHtml({ score: 35, pct: 100, mode: 'practice', details: insights.questions, insights, learningReport });
};
const parse = (s: string) => new DOMParser().parseFromString(s, 'text/html');

describe('PDF export — cumulative learning report', () => {
  it('prints the same overall/chapter figures, caveats and recommendations the screen shows, plus the legacy session section and all questions', () => {
    const doc = parse(html({ status: 'ready', report: cumulative }));
    const text = doc.body.textContent ?? '';
    const section = doc.querySelector('.cumulative')!;
    expect(section.classList.contains('incomplete')).toBe(false);
    expect(text).toContain('דוח שלם');
    expect(text).not.toContain('דוח חלקי');
    // Overall tiles match the engine.
    const o = cumulative.overall;
    expect(section.textContent).toContain(`כיסוי ליבה ${Math.round(o.policy.coveragePercent!)}%`);
    expect(section.textContent).toContain(`נצפו ${o.seenCount} · טרם נצפו ${o.unseenCount}`);
    // Every chapter appears with its own coverage/success/status line.
    for (const c of cumulative.chapters) {
      expect(section.textContent).toContain(`פרק ${c.chapter}: כיסוי ${c.policy.coveragePercent == null ? '—' : `${Math.round(c.policy.coveragePercent)}%`}`);
    }
    // Trend + confidence caveats and the conservative-handling notes are present.
    expect(section.textContent).toContain('ביטחון מוצהר');
    expect(section.textContent).toContain('מגמה');
    expect(section.textContent).toContain('טיפול שמרני בשאלות ללא מפתח מאומת');
    expect(section.textContent).toContain('מדיניות 50/25/70');
    // Exact recommendations, title and rationale.
    expect(cumulative.recommendations.length).toBeGreaterThan(0);
    for (const rec of cumulative.recommendations) {
      expect(section.textContent).toContain(rec.title);
      expect(section.textContent).toContain(rec.rationale);
    }
    // Legacy before/after session section and full question list are preserved.
    expect(text).toContain('0/35 (0%) → 35/35 (100%)');
    expect(doc.querySelectorAll('.question')).toHaveLength(35);
    expect(text).toContain('הסבר 34');
  });

  it('marks the report as partial while the cumulative analysis is still loading or absent', () => {
    for (const state of [undefined, { status: 'loading' } as const]) {
      const doc = parse(html(state));
      expect(doc.querySelector('.cumulative.incomplete')).not.toBeNull();
      expect(doc.body.textContent).toContain('דוח חלקי — הניתוח המצטבר חסר');
      expect(doc.body.textContent).toContain('הדוח הזה אינו שלם');
      expect(doc.body.textContent).toContain('עדיין נטען');
      expect(doc.body.textContent).not.toContain('דוח שלם');
      expect(doc.querySelectorAll('.question')).toHaveLength(35);
    }
  });

  it('marks the report as partial with the reason when the cumulative analysis is unavailable', () => {
    const doc = parse(html({ status: 'unavailable', message: 'יש להתחבר כדי לראות ניתוח למידה.' }));
    expect(doc.body.textContent).toContain('דוח חלקי — הניתוח המצטבר חסר');
    expect(doc.body.textContent).toContain('אינו זמין (יש להתחבר כדי לראות ניתוח למידה.)');
    expect(doc.querySelector('.cumulative h3')).toBeNull();
  });

  it('escapes every dynamic cumulative field and never prints internal management measures', () => {
    const hostile = {
      ...cumulative,
      recommendations: [{ ...cumulative.recommendations[0], title: '<script>alert(1)</script>', rationale: '<img src=x onerror=alert(2)>', caveats: ['<b onclick="x">c</b>'] }],
    };
    const doc = parse(html({ status: 'ready', report: hostile }));
    expect(doc.querySelector('.cumulative script, .cumulative img, .cumulative b')).toBeNull();
    expect(doc.querySelector('.cumulative')?.textContent).toContain('<script>alert(1)</script>');
    expect(doc.querySelector('.cumulative')?.textContent).toContain('<img src=x onerror=alert(2)>');
    const unavailable = parse(html({ status: 'unavailable', message: '<iframe src=evil></iframe>' }));
    expect(unavailable.querySelector('iframe')).toBeNull();
    expect(unavailable.body.textContent).toContain('<iframe src=evil></iframe>');
    // Owner-only quota / raw evidence never appears in a learner's PDF.
    expect(doc.body.textContent).not.toMatch(/quota|question_id|member_id/);
  });
});
