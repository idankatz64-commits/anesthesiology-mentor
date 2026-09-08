import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { buildSessionReportHtml } from '@/lib/exportPdf';
import { buildSessionInsights, captureLearningBaseline } from '@/lib/sessionInsights';
import SessionReportPreview from '@/components/SessionReportPreview';
import { launchQuestion } from './fixtures/launchQuestion';

const bank = Array.from({ length: 35 }, (_, i) => ({ ...launchQuestion(String(i)), explanation: `${'הסבר מלא '.repeat(80)} סוף הסבר ${i}` }));
function report(historyAvailable = true) {
  const insights = buildSessionInsights({ bank, quiz: bank, answers: bank.map(() => 'A'), history: {},
    baseline: historyAvailable ? captureLearningBaseline({}) : undefined, historyAvailable });
  return buildSessionReportHtml({ score: 35, pct: 100, mode: 'practice', details: insights.questions, insights });
}

afterEach(cleanup);

describe('complete printable learning report', () => {
  it('exports the complete report and all questions beyond the first visible page without truncating explanations', () => {
    const doc = new DOMParser().parseFromString(report(), 'text/html');
    expect(doc.documentElement.dir).toBe('rtl');
    expect(doc.querySelectorAll('.question')).toHaveLength(35);
    expect(doc.body.textContent).toContain('ניתוח התקדמות והמלצות');
    expect(doc.body.textContent).toContain('0/35 (0%) → 35/35 (100%)');
    expect(doc.body.textContent).toContain('המלצות להמשך');
    expect(doc.body.textContent).toContain('סוף הסבר 34');
    expect(doc.body.textContent).toContain('אפשרות דלת');
    expect(doc.body.textContent).toContain('דיוק בתשובות שנבדקו');
  });

  it('does not invent cumulative coverage when history is unavailable', () => {
    const doc = new DOMParser().parseFromString(report(false), 'text/html');
    expect(doc.querySelector('.learning')?.textContent).toContain('היסטוריית הלמידה אינה זמינה');
    expect(doc.querySelector('.learning')?.textContent).not.toContain('35/35');
  });

  it('preserves multipart explanation titles without turning them into executable markup', () => {
    const q = { ...bank[0], explanation: 'META_TITLES:["כותרת ראשונה","<img src=x onerror=alert(1)>"]\n<p>תוכן ראשון</p><hr><p>תוכן שני</p>' };
    const doc = new DOMParser().parseFromString(buildSessionReportHtml({ score: 1, pct: 100, mode: 'exam', details: [{ q, userAns: 'A', correctAns: 'A', isCorrect: true }] }), 'text/html');
    expect(Array.from(doc.querySelectorAll('.q-explanation h4')).map(h => h.textContent)).toEqual(['כותרת ראשונה', '<img src=x onerror=alert(1)>']);
    expect(doc.querySelector('.q-explanation')?.textContent).toContain('תוכן שני');
    expect(doc.querySelector('.q-explanation img')).toBeNull();
    expect(doc.body.textContent).not.toContain('META_TITLES');
  });

  it('preserves safe explanation formatting while removing active content from every field', () => {
    const q = { ...bank[0], question: '<img src="x" onerror="alert(1)"><script>alert(2)</script>', topic: '<script>alert(3)</script>',
      A: '<svg onload="alert(4)"></svg>', explanation: '<p>הסבר <strong>חשוב</strong></p><a href="javascript:alert(5)">קישור</a><iframe src="evil"></iframe>' };
    const html = buildSessionReportHtml({ score: 1, pct: 100, mode: 'exam', details: [{ q, userAns: 'A', correctAns: 'A', isCorrect: true }] });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('script, iframe, svg, [onerror], [onload], [href^="javascript:"]')).toBeNull();
    expect(doc.querySelector('.q-explanation strong')?.textContent).toBe('הסבר:');
    expect(doc.querySelector('.q-explanation')?.textContent).toContain('הסבר חשוב');
  });

  it('previews without a popup, prints the report frame, and returns to the existing summary', () => {
    const close = vi.fn();
    render(<SessionReportPreview html={report()} onClose={close} />);
    const frame = screen.getByTitle('דוח הלמידה להדפסה') as HTMLIFrameElement;
    const print = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
    const button = screen.getByRole('button', { name: 'הדפסה / שמירה כ־PDF' });
    expect(button).toBeDisabled();
    expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts');
    fireEvent.load(frame);
    fireEvent.click(button);
    expect(print).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'חזרה לסיכום' }));
    expect(close).toHaveBeenCalled();
  });
});
