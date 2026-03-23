import { KEYS, Question } from './types';

interface ExportData {
  score: number;
  pct: number;
  mode: string;
  details: {
    q: Question;
    userAns: string | null;
    correctAns: string;
    isCorrect: boolean;
  }[];
}

const ANSWER_MAP: Record<string, string> = { A: 'א', B: 'ב', C: 'ג', D: 'ד' };

function answerLabel(key: string | null, q: Question): string {
  if (!key) return '—';
  const text = q[key as keyof Question] as string ?? '';
  return `${ANSWER_MAP[key] ?? key}. ${text}`;
}

export function exportSessionToPdf({ score, pct, mode, details }: ExportData): void {
  const modeLabel = mode === 'exam' ? 'בחינה' : mode === 'simulation' ? 'סימולציה' : 'תרגול';
  const dateStr = new Date().toLocaleDateString('he-IL');

  const rows = details.map((d, i) => {
    const qText = d.q[KEYS.QUESTION] ?? '';
    const topic = d.q[KEYS.TOPIC] ?? '';
    const userLabel = answerLabel(d.userAns, d.q);
    const correctLabel = answerLabel(d.correctAns, d.q);
    const statusColor = d.isCorrect ? '#16a34a' : d.userAns ? '#dc2626' : '#6b7280';
    const statusText = d.isCorrect ? '✓ נכון' : d.userAns ? '✗ שגוי' : 'דילוג';
    const explanation = d.q[KEYS.EXPLANATION] ?? '';

    return `
      <div class="question ${d.isCorrect ? 'correct' : d.userAns ? 'wrong' : 'skipped'}">
        <div class="q-header">
          <span class="q-num">${i + 1}</span>
          <span class="q-topic">${topic}</span>
          <span class="q-status" style="color: ${statusColor}">${statusText}</span>
        </div>
        <p class="q-text">${qText}</p>
        <div class="q-answers">
          <div class="ans-row">
            <span class="ans-label">תשובתך:</span>
            <span style="color: ${d.isCorrect ? '#16a34a' : '#dc2626'}">${userLabel}</span>
          </div>
          ${!d.isCorrect ? `<div class="ans-row">
            <span class="ans-label">תשובה נכונה:</span>
            <span style="color: #16a34a">${correctLabel}</span>
          </div>` : ''}
        </div>
        ${explanation ? `<div class="q-explanation"><strong>הסבר:</strong> ${explanation.replace(/<[^>]*>/g, ' ').slice(0, 400)}${explanation.length > 400 ? '...' : ''}</div>` : ''}
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <title>סיכום סשן — YouShellNotPass</title>
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

  <div class="no-print" style="margin-bottom: 16px">
    <button onclick="window.print()"
      style="background:#ea9906;color:#fff;border:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;margin-left:8px">
      🖨 הדפס / שמור PDF
    </button>
    <button onclick="window.close()"
      style="background:#f3f4f6;color:#374151;border:none;padding:10px 24px;border-radius:6px;font-size:14px;cursor:pointer">
      סגור
    </button>
  </div>

  <div class="header">
    <div>
      <h1>סיכום סשן — ${modeLabel}</h1>
      <p style="color:#6b7280;font-size:12px">YouShellNotPass · סימולטור הרדמה</p>
    </div>
    <div class="meta">
      <div>${dateStr}</div>
      <div>${details.length} שאלות</div>
    </div>
  </div>

  <div class="score-row">
    <div class="score-box">
      <div class="val">${pct}%</div>
      <div class="lbl">ציון</div>
    </div>
    <div class="score-box">
      <div class="val">${score}</div>
      <div class="lbl">נכון</div>
    </div>
    <div class="score-box">
      <div class="val">${details.length - score}</div>
      <div class="lbl">שגוי</div>
    </div>
    <div class="score-box">
      <div class="val">${details.filter(d => !d.userAns).length}</div>
      <div class="lbl">דילוגים</div>
    </div>
  </div>

  ${rows}

  <div class="footer">
    <span>YouShellNotPass — סימולטור הרדמה</span>
    <span>anesthesiology-mentor.vercel.app</span>
    <span>${dateStr}</span>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700,noopener,noreferrer');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
