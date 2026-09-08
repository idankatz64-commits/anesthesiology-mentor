import DOMPurify from 'dompurify';
import { KEYS, Question } from './types';
import { questionChangeLabel, type SessionInsights } from './sessionInsights';
import { explanationSections } from './explanationSections';
import type { LearningReportState } from '@/components/learning/useLearningReport';
import { POLICY_NOTE, TREND_CAVEAT, chapterLine, chapterList, confidenceNote, confidenceText, followUpText, pct, recommendationMeta, signalLine, trendText, uncertaintyNotes } from './learningReportText';

interface ExportData {
  score: number;
  pct: number | null;
  mode: string;
  insights?: SessionInsights;
  /** Active time at submit (ms); recorded, never a limit. */
  totalActiveMs?: number | null;
  /** Cumulative report exactly as shown on screen; absent/loading/unavailable is printed as an explicit gap, never as complete. */
  learningReport?: LearningReportState;
  details: {
    q: Question;
    userAns: string | null;
    correctAns: string;
    isCorrect: boolean | null;
  }[];
}

/**
 * Active time as a human duration. `Math.floor(ms / 60000)` printed a real
 * 54-second attempt as "0 דק׳" — every sub-minute session read as no time at
 * all. Display only: the stored millisecond value is untouched.
 * Seconds are dropped past the hour, where they are noise.
 */
export function formatActiveDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} שע׳`);
  if (m) parts.push(`${m} דק׳`);
  if (sec && !h) parts.push(`${sec} שנ׳`);
  return parts.length ? parts.join(' ') : '0 שנ׳';
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const coverage = (count: number | null, total: number) => count === null || !total ? '—' : `${count}/${total} (${Math.round(count * 100 / total)}%)`;

function reportContent(text: string): string {
  const content = text;
  if (!/<[a-z][\s\S]*>/i.test(content)) return escapeHtml(content).replace(/\n/g, '<br>');
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'i', 'em', 'u', 'sub', 'sup', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'code', 'pre', 'h3', 'h4', 'a', 'img', 'hr', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'colspan', 'rowspan'],
  });
}

const ANSWER_MAP: Record<string, string> = { A: 'א', B: 'ב', C: 'ג', D: 'ד' };

function answerLabel(key: string | null, q: Question): string {
  if (!key) return '—';
  const text = q[key as keyof Question] as string ?? '';
  return `${ANSWER_MAP[key] ?? key}. ${text}`;
}

/** Every dynamic string is escaped; the only markup here is the template's own. */
function cumulativeSection(state: LearningReportState | undefined): { html: string; complete: boolean } {
  const gap = (why: string) => ({ complete: false, html: `
    <section class="cumulative incomplete">
      <h2>ניתוח למידה מצטבר</h2>
      <p class="gap"><strong>הדוח הזה אינו שלם:</strong> ${why} הניתוח המצטבר לא נכלל. לייצוא מלא יש להמתין שהניתוח יוצג במסך ולייצא שוב.</p>
    </section>` });
  if (!state || state.status === 'loading') return gap('הניתוח המצטבר עדיין נטען.');
  if (state.status === 'unavailable') return gap(`הניתוח המצטבר אינו זמין (${escapeHtml(state.message)}).`);
  const r = state.report;
  const o = r.overall;
  const li = (items: readonly string[]) => items.map(t => `<li>${escapeHtml(t)}</li>`).join('');
  return { complete: true, html: `
    <section class="cumulative">
      <h2>ניתוח למידה מצטבר</h2>
      <p>כיסוי ליבה <strong>${escapeHtml(pct(o.policy.coveragePercent))}</strong> · הצלחה בבחינה <strong>${escapeHtml(pct(o.policy.quizSuccessPercent))}</strong> · נצפו <strong>${o.seenCount}</strong> · טרם נצפו <strong>${o.unseenCount}</strong> · פרקים ירוקים <strong>${r.chapters.filter(c => c.policy.green).length} מתוך ${r.chapters.length}</strong></p>
      <p>${escapeHtml(POLICY_NOTE)}</p>
      <p>${escapeHtml(uncertaintyNotes(r).join(' · '))}</p>
      <h3>ביטחון מוצהר</h3>
      <p>${escapeHtml(confidenceText(r))}</p>
      <p>${escapeHtml(confidenceNote(r))}</p>
      <h3>מגמה</h3>
      <p>${escapeHtml(trendText(r.trend))}</p>
      ${r.trend.caveats.length ? `<p>${escapeHtml(r.trend.caveats.map(c => TREND_CAVEAT[c]).join(' · '))}</p>` : ''}
      <h3>חוזקות ושיפור</h3>
      <p>חזק: ${escapeHtml(signalLine(r.strengths))}</p>
      <p>לשיפור: ${escapeHtml(signalLine(r.improvements))}</p>
      ${r.insufficientSample.length ? `<p>מדגם קטן מדי: ${escapeHtml(chapterList(r.insufficientSample))}</p>` : ''}
      <h3>התקדמות לפי פרק</h3>
      <ul class="chapters">${li(r.chapters.map(chapterLine))}</ul>
      <h3>הצעדים הבאים</h3>
      ${r.recommendations.length === 0 ? '<p>אין עדיין מספיק עדות להמלצה ממוקדת. כל החומר פתוח ללימוד.</p>' : r.recommendations.map(rec => `<article class="topic-report">
        <h4>${escapeHtml(rec.title)}</h4>
        <p>${escapeHtml(rec.rationale)}</p>
        <p>${escapeHtml(recommendationMeta(rec))}</p>
        ${rec.caveats.length ? `<p>${escapeHtml(rec.caveats.join(' · '))}</p>` : ''}
      </article>`).join('')}
      ${r.followUp.length ? `<p>${escapeHtml(followUpText(r))}</p>` : ''}
    </section>` };
}

export function buildSessionReportHtml({ score, pct: sessionPct, mode, details, insights, totalActiveMs, learningReport }: ExportData): string {
  const cumulative = cumulativeSection(learningReport);
  const modeLabel = mode === 'exam' ? 'בחינה' : mode === 'simulation' ? 'סימולציה' : 'תרגול';
  const dateStr = new Date().toLocaleDateString('he-IL');

  const changes = new Map(insights?.questions.map(q => [q.id, q.change]) ?? []);
  const learning = insights ? `
    <section class="learning">
      <h2>ניתוח התקדמות והמלצות</h2>
      <p>מדדי למידה אישיים מתרגול ומבוחן ביחס למאגר הזמין. חזרה על שאלה אינה נספרת שוב ככיסוי חדש.</p>
      <p>כיסוי כולל: <bdi dir="ltr">${coverage(insights.overall.coveredBefore, insights.overall.total)} → ${coverage(insights.progressAvailable ? insights.overall.coveredAfter : null, insights.overall.total)}</bdi> (לפני ← אחרי)</p>
      <p>שאלות חדשות שכוסו: <strong>${insights.overall.newCount ?? '—'}</strong> · טעויות קודמות שתוקנו: <strong>${insights.overall.correctedCount ?? '—'}</strong></p>
      ${!insights.progressAvailable ? '<p>היסטוריית הלמידה אינה זמינה; אי אפשר לחשב כיסוי מצטבר.</p>' : !insights.baselineAvailable ? '<p>חסרה תמונת מצב מתחילת המפגש; אין השוואת לפני ואחרי.</p>' : ''}
      <h3>התקדמות בנושאי המפגש</h3>
      ${insights.topics.map(topic => `<article class="topic-report">
        <h4>${escapeHtml(topic.topic)}</h4>
        <p>במפגש: ${topic.correct} נכונות מתוך ${topic.scored} תשובות שנבדקו · ${topic.skipped} ללא מענה</p>
        <p>כיסוי בנושא: <bdi dir="ltr">${coverage(topic.coveredBefore, topic.total)} → ${coverage(insights.progressAvailable ? topic.coveredAfter : null, topic.total)}</bdi></p>
        <p>שאלות שהתשובה האחרונה עליהן נכונה: <bdi dir="ltr">${topic.latestCorrectBefore ?? '—'} → ${insights.progressAvailable ? topic.latestCorrectAfter : '—'}</bdi></p>
        ${topic.answered < 5 ? '<p>מפגש קצר — אין להסיק ממנו לבדו על שליטה בחומר.</p>' : ''}
      </article>`).join('')}
      <h3>המלצות להמשך</h3>
      ${insights.recommendations.map(rec => `<article class="topic-report"><h4>${escapeHtml(rec.title)}</h4><p>${escapeHtml(rec.reason)}</p></article>`).join('')}
      <p>ההמלצות לבחירתך; אפשר לשנות את הקצב, הכמות ומועד ההסברים.</p>
    </section>` : '';

  const rows = details.map((d, i) => {
    const qText = d.q[KEYS.QUESTION] ?? '';
    const topic = d.q[KEYS.TOPIC] ?? '';
    const userLabel = answerLabel(d.userAns, d.q);
    const correctLabel = answerLabel(d.correctAns, d.q);
    const statusColor = d.isCorrect ? '#16a34a' : d.isCorrect === false ? '#dc2626' : '#6b7280';
    const statusText = d.isCorrect ? '✓ נכון' : d.isCorrect === false ? '✗ שגוי' : d.userAns ? 'לא נבדק' : 'דילוג';
    const explanation = d.q[KEYS.EXPLANATION] ?? '';

    return `
      <div class="question ${d.isCorrect ? 'correct' : d.isCorrect === false ? 'wrong' : 'skipped'}">
        <div class="q-header">
          <span class="q-num">${i + 1}</span>
          <span class="q-topic">${escapeHtml(topic)}</span>
          <span class="q-status" style="color: ${statusColor}">${statusText}</span>
        </div>
        <p class="q-text">${reportContent(qText)}</p>
        ${changes.has(d.q[KEYS.ID]) ? `<p>${questionChangeLabel[changes.get(d.q[KEYS.ID])!]}</p>` : ''}
        <div class="q-answers">
          ${(['A', 'B', 'C', 'D'] as const).filter(key => d.q[key]).map(key => `<div class="ans-row"><span class="ans-label">${key}.</span><span>${reportContent(d.q[key])}</span></div>`).join('')}
          <div class="ans-row">
            <span class="ans-label">תשובתך:</span>
            <span style="color: ${d.isCorrect ? '#16a34a' : d.isCorrect === false ? '#dc2626' : '#6b7280'}">${escapeHtml(userLabel)}</span>
          </div>
          ${!d.isCorrect && ['A', 'B', 'C', 'D'].includes(d.correctAns) ? `<div class="ans-row">
            <span class="ans-label">תשובה נכונה:</span>
            <span style="color: #16a34a">${escapeHtml(correctLabel)}</span>
          </div>` : ''}
        </div>
        ${explanation ? `<div class="q-explanation"><strong>הסבר:</strong>${explanationSections(explanation).map(section => `${section.title ? `<h4>${escapeHtml(section.title)}</h4>` : ''}${reportContent(section.content)}`).join('')}</div>` : ''}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>דוח למידה — YouShellNotPass</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Arial', sans-serif;
      background: #fff;
      color: #1a1a1a;
      font-size: 13px;
      line-height: 1.5;
      padding: 24px;
      direction: rtl;
    }
    @page { size: A4; margin: 15mm; }
    h2, h3, h4 { margin: 14px 0 8px; break-after: avoid; }
    p { overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ddd; padding: 5px; }
    a { color: #965b00; overflow-wrap: anywhere; }
    .learning { margin: 20px 0; }
    .topic-report { border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin: 10px 0; break-inside: avoid; }
    .cumulative { margin: 20px 0; }
    .cumulative .chapters { columns: 2; padding-right: 18px; }
    .incomplete .gap { border: 1px solid #dc2626; color: #991b1b; padding: 10px; border-radius: 8px; }
    .score-row, .header, .footer { flex-wrap: wrap; }
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-size: 72px;
      font-weight: 900;
      color: rgba(234, 153, 6, 0.06);
      white-space: nowrap;
      pointer-events: none;
      z-index: 0;
      letter-spacing: 4px;
    }
    .header {
      border-bottom: 2px solid #ea9906;
      padding-bottom: 16px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header h1 { font-size: 20px; color: #1a1a1a; }
    .header .meta { font-size: 11px; color: #666; text-align: left; }
    .score-row {
      display: flex;
      gap: 24px;
      margin-bottom: 24px;
      background: #fafafa;
      border: 1px solid #e5e7eb;
      padding: 16px;
      border-radius: 8px;
    }
    .score-box { text-align: center; }
    .score-box .val { font-size: 28px; font-weight: 900; color: #ea9906; }
    .score-box .lbl { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
    .question {
      margin-bottom: 16px;
      padding: 12px 16px;
      border-radius: 6px;
      border-right: 4px solid #e5e7eb;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-right-width: 4px;
      page-break-inside: avoid;
      position: relative;
    }
    .question.correct { border-right-color: #16a34a; }
    .question.wrong { border-right-color: #dc2626; }
    .question.skipped { border-right-color: #9ca3af; opacity: 0.7; }
    .q-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .q-num {
      background: #ea9906;
      color: #fff;
      font-weight: 700;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      flex-shrink: 0;
    }
    .q-topic {
      font-size: 10px;
      background: rgba(234,153,6,0.1);
      color: #b45309;
      padding: 2px 8px;
      border-radius: 999px;
      font-weight: 600;
    }
    .q-status { margin-right: auto; font-weight: 700; font-size: 12px; }
    .q-text { font-weight: 500; margin-bottom: 8px; color: #1a1a1a; }
    .q-answers { font-size: 12px; }
    .ans-row { display: flex; gap: 8px; margin-bottom: 4px; }
    .ans-label { color: #6b7280; min-width: 80px; }
    .q-explanation {
      margin-top: 8px;
      padding: 8px;
      background: #f9fafb;
      border-radius: 4px;
      font-size: 11px;
      color: #4b5563;
      border: 1px solid #e5e7eb;
    }
    .footer {
      margin-top: 32px;
      border-top: 1px solid #e5e7eb;
      padding-top: 12px;
      font-size: 10px;
      color: #9ca3af;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding: 16px; }
      .no-print { display: none !important; }
      .question { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="watermark">YouShellNotPass</div>

  <div class="header">
    <div>
      <h1>סיכום סשן — ${modeLabel}</h1>
      <p style="color:#6b7280;font-size:12px">YouShellNotPass · סימולטור הרדמה</p>
    </div>
    <div class="meta">
      <div>${dateStr}</div>
      <div>${details.length} שאלות</div>
      <div class="completeness">${cumulative.complete ? 'דוח שלם' : 'דוח חלקי — הניתוח המצטבר חסר'}</div>
      ${totalActiveMs != null ? `<div>זמן פעיל: ${formatActiveDuration(totalActiveMs)}</div>` : ''}
    </div>
  </div>

  <div class="score-row">
    <div class="score-box">
      <div class="val">${sessionPct === null ? "—" : `${sessionPct}%`}</div>
      <div class="lbl">${mode === "practice" ? "דיוק בתשובות שנבדקו" : "ציון מתוך כלל שאלות הבוחן"}</div>
    </div>
    <div class="score-box">
      <div class="val">${score}</div>
      <div class="lbl">נכון</div>
    </div>
    <div class="score-box">
      <div class="val">${details.filter(d => d.isCorrect === false).length}</div>
      <div class="lbl">שגוי</div>
    </div>
    <div class="score-box">
      <div class="val">${details.filter(d => !d.userAns).length}</div>
      <div class="lbl">דילוגים</div>
    </div>
  </div>

  ${learning}
  ${cumulative.html}
  <h2>כל השאלות וההסברים</h2>
  ${rows}

  <div class="footer">
    <span>YouShellNotPass — סימולטור הרדמה</span>
    <span>anesthesiology-mentor.vercel.app</span>
    <span>${dateStr}</span>
  </div>
</body>
</html>`;

}
