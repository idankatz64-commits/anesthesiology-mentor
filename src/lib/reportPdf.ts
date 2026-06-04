// Printable "leave-behind" PDF for a resident progress report.
// Mirrors the established src/lib/exportPdf.ts pattern: build a light, white,
// print-ready HTML document and open it in a new window with a Print/Save-PDF
// button. Light document (NOT the dark glass UI) — clean on paper.
// Content comes from residentReport.ts so the PDF never drifts from the in-app view.
import type { CohortResident, CohortTopic } from "@/data/cohortMockData";
import { type ResidentDetailData, getResidentTrendSeries, trendDelta } from "@/lib/cohortDetail";
import { accuracyColor } from "@/lib/cohortStats";
import { REPORT_STRINGS, reportSummary, reportRecommendations, type ReportLang } from "@/lib/residentReport";
import {
  COHORT_REPORT_STRINGS,
  cohortInsights,
  cohortReportSummary,
  cohortReportRecommendations,
} from "@/lib/cohortReport";

const ACCENT = "#4f46e5"; // indigo — echoes the dashboard, professional on white
const INK = "#0f172a";
const MUTED = "#64748b";
const LINE = "#e2e8f0";

/** Inline SVG accuracy line for the print doc (recharts can't run in the popup). */
function trendSvg(r: CohortResident): string {
  const series = getResidentTrendSeries(r, "month");
  const W = 600;
  const H = 150;
  const padX = 34;
  const padY = 18;
  const n = series.length;
  const x = (i: number) => padX + (i * (W - padX * 2)) / Math.max(1, n - 1);
  const y = (s: number) => H - padY - (s / 100) * (H - padY * 2);
  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.score).toFixed(1)}`);
  const line = pts.join(" ");
  const area = `${padX},${(H - padY).toFixed(1)} ${line} ${(W - padX).toFixed(1)},${(H - padY).toFixed(1)}`;
  const dots = series
    .map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="3" fill="${ACCENT}"/>`)
    .join("");
  const labels = series
    .map(
      (p, i) =>
        `<text x="${x(i).toFixed(1)}" y="${H - 2}" font-size="10" fill="${MUTED}" text-anchor="middle">${p.label}</text>`,
    )
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="direction:ltr">
    <polygon points="${area}" fill="${ACCENT}" opacity="0.08"/>
    <polyline points="${line}" fill="none" stroke="${ACCENT}" stroke-width="2.5"/>
    ${dots}${labels}
  </svg>`;
}

export function exportResidentReport(r: CohortResident, detail: ResidentDetailData, lang: ReportLang): void {
  const t = REPORT_STRINGS[lang];
  const locale = lang === "he" ? "he-IL" : "en-GB";
  const dateStr = new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
  const delta = trendDelta(r);
  const deltaStr = `${delta >= 0 ? "▲ +" : "▼ "}${delta}%`;
  const deltaColor = delta >= 0 ? "#16a34a" : "#dc2626";

  const kpi = (val: string, label: string, color?: string) => `
    <div class="kpi">
      <div class="kpi-val" style="${color ? `color:${color}` : ""}">${val}</div>
      <div class="kpi-lbl">${label}</div>
    </div>`;

  const topic = (s: { topic: string; accuracy: number; chapters: { chapter: number }[] }, focus: boolean) => `
    <div class="topic">
      <div class="topic-head">
        <span class="topic-name">${s.topic}</span>
        <span class="topic-acc" style="color:${focus ? "#b45309" : "#15803d"}">${s.accuracy}%</span>
      </div>
      <div class="topic-ch">${t.millerCh} ${s.chapters.map((c) => c.chapter).join(", ")}</div>
    </div>`;

  const taskRow = (task: { title: string; status: "done" | "pending" | "overdue"; due: string }) => {
    const dot = task.status === "done" ? "#16a34a" : task.status === "overdue" ? "#d97706" : "#94a3b8";
    return `<div class="task">
      <span class="task-dot" style="background:${dot}"></span>
      <span class="task-title ${task.status === "done" ? "done" : ""}">${task.title}</span>
      <span class="task-due">${t.status[task.status]}</span>
    </div>`;
  };

  const current = detail.plan.find((p) => p.status === "current");
  const recos = reportRecommendations(r, detail, lang)
    .map((x) => `<li>${x}</li>`)
    .join("");

  const html = `<!DOCTYPE html>
<html dir="${t.dir}" lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${t.title} — ${r.initials}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      background: #fff; color: ${INK}; font-size: 13px; line-height: 1.55;
      padding: 32px; direction: ${t.dir};
    }
    .watermark {
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-32deg);
      font-size: 78px; font-weight: 800; color: rgba(79,70,229,0.05);
      white-space: nowrap; pointer-events: none; z-index: 0; letter-spacing: 4px;
    }
    .sheet { position: relative; z-index: 1; max-width: 820px; margin: 0 auto; }
    .header {
      border-bottom: 3px solid ${ACCENT}; padding-bottom: 16px; margin-bottom: 22px;
      display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;
    }
    .header h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
    .header .platform { font-size: 12px; color: ${MUTED}; margin-top: 3px; }
    .header .meta { font-size: 11px; color: ${MUTED}; text-align: ${t.dir === "rtl" ? "left" : "right"}; line-height: 1.7; }
    .header .meta b { color: ${INK}; }
    .section { margin-bottom: 22px; page-break-inside: avoid; }
    .section h2 {
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px;
      color: ${ACCENT}; margin-bottom: 10px;
    }
    .summary {
      background: #f8fafc; border: 1px solid ${LINE}; border-radius: 10px; padding: 14px 16px;
      font-size: 13.5px; line-height: 1.7; unicode-bidi: plaintext;
    }
    .badge { font-size: 9px; font-weight: 700; color: ${ACCENT}; background: rgba(79,70,229,0.1);
      padding: 2px 7px; border-radius: 999px; vertical-align: middle; margin-inline-start: 6px; }
    .kpis { display: flex; gap: 10px; }
    .kpi { flex: 1; background: #fff; border: 1px solid ${LINE}; border-radius: 10px; padding: 12px; text-align: center; }
    .kpi-val { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
    .kpi-lbl { font-size: 9.5px; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 3px; }
    .trend-box { border: 1px solid ${LINE}; border-radius: 10px; padding: 8px 12px 4px; }
    .cols { display: flex; gap: 16px; }
    .col { flex: 1; }
    .topic { border: 1px solid ${LINE}; border-radius: 8px; padding: 9px 12px; margin-bottom: 8px; }
    .topic-head { display: flex; justify-content: space-between; align-items: baseline; }
    .topic-name { font-weight: 600; font-size: 12.5px; }
    .topic-acc { font-weight: 800; font-size: 13px; }
    .topic-ch { font-size: 10.5px; color: ${MUTED}; margin-top: 2px; }
    .task { display: flex; align-items: center; gap: 9px; padding: 5px 0; font-size: 12.5px; border-bottom: 1px solid #f1f5f9; }
    .task-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .task-title { flex: 1; }
    .task-title.done { color: ${MUTED}; text-decoration: line-through; }
    .task-due { font-size: 10.5px; color: ${MUTED}; }
    .rotation { margin-top: 10px; font-size: 12px; color: ${INK}; }
    .rotation b { color: ${ACCENT}; }
    ul.recos { list-style: none; }
    ul.recos li { position: relative; padding-inline-start: 18px; margin-bottom: 7px; font-size: 12.5px; }
    ul.recos li::before { content: "→"; position: absolute; inset-inline-start: 0; color: ${ACCENT}; font-weight: 700; }
    .signature { display: flex; gap: 40px; margin-top: 26px; padding-top: 16px; border-top: 1px solid ${LINE}; }
    .sig-field { flex: 1; }
    .sig-line { border-bottom: 1px solid #cbd5e1; height: 26px; }
    .sig-lbl { font-size: 10px; color: ${MUTED}; margin-top: 4px; }
    .footer { margin-top: 26px; border-top: 1px solid ${LINE}; padding-top: 12px;
      font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; gap: 10px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="watermark">YouShellNotPass</div>
  <div class="sheet">
    <div class="no-print" style="margin-bottom:18px;display:flex;gap:8px">
      <button onclick="window.print()" style="background:${ACCENT};color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">
        🖨 ${t.exportPdf}
      </button>
      <button onclick="window.close()" style="background:#f1f5f9;color:#334155;border:none;padding:10px 22px;border-radius:8px;font-size:14px;cursor:pointer">✕</button>
    </div>

    <div class="header">
      <div>
        <h1>${t.title}</h1>
        <div class="platform">${t.platform}</div>
      </div>
      <div class="meta">
        <div><b>${t.resident}:</b> ${r.initials} · ${r.stageLabel}</div>
        <div><b>${t.period}:</b> ${t.periodValue}</div>
        <div><b>${t.generated}:</b> ${dateStr}</div>
      </div>
    </div>

    <div class="section">
      <h2>${t.execSummary} <span class="badge">${t.aiBadge}</span></h2>
      <div class="summary">${reportSummary(r, detail, lang)}</div>
    </div>

    <div class="section">
      <div class="kpis">
        ${kpi(`${r.accuracy}%`, t.accuracy, ACCENT)}
        ${kpi(`${r.coverage}%`, t.coverage)}
        ${kpi(`${r.questionsPerWeek}`, t.perWeek)}
        ${kpi(`${r.tasksCompleted}/${r.tasksTotal}`, t.tasksComplete)}
        ${kpi(deltaStr, t.trendLabel, deltaColor)}
      </div>
    </div>

    <div class="section">
      <h2>${t.trendSection}</h2>
      <div class="trend-box">${trendSvg(r)}</div>
    </div>

    <div class="section">
      <div class="cols">
        <div class="col">
          <h2>${t.strengths}</h2>
          ${detail.strengths.map((s) => topic(s, false)).join("")}
        </div>
        <div class="col">
          <h2>${t.focusAreas}</h2>
          ${detail.weaknesses.map((s) => topic(s, true)).join("")}
        </div>
      </div>
    </div>

    <div class="section">
      <h2>${t.adherence}</h2>
      ${detail.tasks.map(taskRow).join("")}
      ${current ? `<div class="rotation">${t.currentRotation}: <b>${current.name}</b>${current.note ? ` — ${current.note}` : ""}</div>` : ""}
    </div>

    <div class="section">
      <h2>${t.recommended}</h2>
      <ul class="recos">${recos}</ul>
    </div>

    <div class="signature">
      <div class="sig-field"><div class="sig-line"></div><div class="sig-lbl">${t.signature}</div></div>
      <div class="sig-field" style="max-width:160px"><div class="sig-line"></div><div class="sig-lbl">${t.date}</div></div>
    </div>

    <div class="footer">
      <span>${t.platform}</span>
      <span>${t.footerNote}</span>
    </div>
  </div>
</body>
</html>`;

  // NOTE: no `noopener` here — it makes window.open return null, which would
  // leave nothing to document.write into (blank popup). We control the content.
  const win = window.open("", "_blank", "width=900,height=760");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

/**
 * Program-level (cohort) report PDF. Same light/white "leave-behind" treatment
 * as the resident report; content from cohortReport.ts. Built separately so the
 * working per-resident export above is never touched.
 */
export function exportCohortReport(residents: CohortResident[], topics: CohortTopic[], lang: ReportLang): void {
  const t = COHORT_REPORT_STRINGS[lang];
  const ins = cohortInsights(residents, topics, lang);
  const k = ins.kpis;
  const locale = lang === "he" ? "he-IL" : "en-GB";
  const dateStr = new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });

  const kpi = (val: string, label: string, color?: string) =>
    `<div class="kpi"><div class="kpi-val" style="${color ? `color:${color}` : ""}">${val}</div><div class="kpi-lbl">${label}</div></div>`;

  const maxBand = Math.max(...ins.bands.map((b) => b.count), 1);
  const bands = ins.bands
    .map(
      (b) => `<div class="band">
        <span class="band-lbl">${b.label}</span>
        <span class="band-bar"><span class="band-fill" style="width:${Math.round((b.count / maxBand) * 100)}%"></span></span>
        <span class="band-n">${b.count}</span>
      </div>`,
    )
    .join("");

  const topicRow = (tp: CohortTopic, focus: boolean) =>
    `<div class="topic"><div class="topic-head"><span class="topic-name">${tp.topic}</span><span class="topic-acc" style="color:${focus ? "#b45309" : "#15803d"}">${tp.avgAccuracy}%</span></div></div>`;

  const attention =
    ins.attention.length === 0
      ? `<div class="muted">${t.noAttention}</div>`
      : ins.attention
          .map((r) => {
            const d = trendDelta(r);
            return `<div class="att"><span class="att-dot"></span><span class="att-name">${r.initials} · ${r.stageLabel}</span><span class="att-meta">${r.accuracy}% · Δ${d >= 0 ? "+" : ""}${d} · ${r.lastActive}</span></div>`;
          })
          .join("");

  const roster = residents
    .map((r) => {
      const d = trendDelta(r);
      const sigColor = r.signal === "attention" ? "#d97706" : r.signal === "steady" ? "#64748b" : "#16a34a";
      return `<tr>
        <td class="r-name">${r.initials}</td>
        <td>${r.year}</td>
        <td style="color:${accuracyColor(r.accuracy)};font-weight:700">${r.accuracy}%</td>
        <td style="color:${d >= 0 ? "#16a34a" : "#dc2626"}">${d >= 0 ? "▲ +" : "▼ "}${d}</td>
        <td>${r.tasksCompleted}/${r.tasksTotal}</td>
        <td><span class="pill" style="color:${sigColor};border-color:${sigColor}40">${t.signal[r.signal]}</span></td>
      </tr>`;
    })
    .join("");

  const recos = cohortReportRecommendations(ins, lang)
    .map((x) => `<li>${x}</li>`)
    .join("");

  const html = `<!DOCTYPE html>
<html dir="${t.dir}" lang="${lang}">
<head>
  <meta charset="UTF-8">
  <title>${t.title} — ${t.program}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif; background: #fff; color: ${INK}; font-size: 13px; line-height: 1.55; padding: 32px; direction: ${t.dir}; }
    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-32deg); font-size: 78px; font-weight: 800; color: rgba(79,70,229,0.05); white-space: nowrap; pointer-events: none; z-index: 0; letter-spacing: 4px; }
    .sheet { position: relative; z-index: 1; max-width: 820px; margin: 0 auto; }
    .header { border-bottom: 3px solid ${ACCENT}; padding-bottom: 16px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
    .header h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
    .header .platform { font-size: 12px; color: ${MUTED}; margin-top: 3px; }
    .header .meta { font-size: 11px; color: ${MUTED}; text-align: ${t.dir === "rtl" ? "left" : "right"}; line-height: 1.7; }
    .header .meta b { color: ${INK}; }
    .section { margin-bottom: 22px; page-break-inside: avoid; }
    .section h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: ${ACCENT}; margin-bottom: 10px; }
    .summary { background: #f8fafc; border: 1px solid ${LINE}; border-radius: 10px; padding: 14px 16px; font-size: 13.5px; line-height: 1.7; unicode-bidi: plaintext; }
    .badge { font-size: 9px; font-weight: 700; color: ${ACCENT}; background: rgba(79,70,229,0.1); padding: 2px 7px; border-radius: 999px; vertical-align: middle; margin-inline-start: 6px; }
    .kpis { display: flex; gap: 10px; }
    .kpi { flex: 1; background: #fff; border: 1px solid ${LINE}; border-radius: 10px; padding: 12px; text-align: center; }
    .kpi-val { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
    .kpi-lbl { font-size: 9.5px; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.6px; margin-top: 3px; }
    .band { display: flex; align-items: center; gap: 10px; margin-bottom: 7px; font-size: 12px; }
    .band-lbl { width: 150px; flex-shrink: 0; color: ${INK}; }
    .band-bar { flex: 1; height: 14px; background: #f1f5f9; border-radius: 7px; overflow: hidden; }
    .band-fill { display: block; height: 100%; background: ${ACCENT}; border-radius: 7px; }
    .band-n { width: 22px; text-align: center; font-weight: 700; color: ${INK}; }
    .cols { display: flex; gap: 16px; }
    .col { flex: 1; }
    .topic { border: 1px solid ${LINE}; border-radius: 8px; padding: 9px 12px; margin-bottom: 8px; }
    .topic-head { display: flex; justify-content: space-between; align-items: baseline; }
    .topic-name { font-weight: 600; font-size: 12.5px; }
    .topic-acc { font-weight: 800; font-size: 13px; }
    .att { display: flex; align-items: center; gap: 9px; padding: 6px 0; font-size: 12.5px; border-bottom: 1px solid #f1f5f9; }
    .att-dot { width: 8px; height: 8px; border-radius: 50%; background: #d97706; flex-shrink: 0; }
    .att-name { font-weight: 600; flex: 1; }
    .att-meta { font-size: 11px; color: ${MUTED}; }
    .muted { font-size: 12.5px; color: ${MUTED}; padding: 4px 0; }
    table.roster { width: 100%; border-collapse: collapse; font-size: 12px; }
    table.roster th { text-align: ${t.dir === "rtl" ? "right" : "left"}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: ${MUTED}; padding: 6px 8px; border-bottom: 2px solid ${LINE}; }
    table.roster td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
    table.roster .r-name { font-weight: 700; }
    .pill { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid; }
    ul.recos { list-style: none; }
    ul.recos li { position: relative; padding-inline-start: 18px; margin-bottom: 7px; font-size: 12.5px; unicode-bidi: plaintext; }
    ul.recos li::before { content: "→"; position: absolute; inset-inline-start: 0; color: ${ACCENT}; font-weight: 700; }
    .signature { display: flex; gap: 40px; margin-top: 26px; padding-top: 16px; border-top: 1px solid ${LINE}; }
    .sig-field { flex: 1; } .sig-line { border-bottom: 1px solid #cbd5e1; height: 26px; } .sig-lbl { font-size: 10px; color: ${MUTED}; margin-top: 4px; }
    .footer { margin-top: 26px; border-top: 1px solid ${LINE}; padding-top: 12px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; gap: 10px; }
    @media print { body { padding: 0; } .no-print { display: none !important; } .section { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="watermark">YouShellNotPass</div>
  <div class="sheet">
    <div class="no-print" style="margin-bottom:18px;display:flex;gap:8px">
      <button onclick="window.print()" style="background:${ACCENT};color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">🖨 ${t.exportPdf}</button>
      <button onclick="window.close()" style="background:#f1f5f9;color:#334155;border:none;padding:10px 22px;border-radius:8px;font-size:14px;cursor:pointer">✕</button>
    </div>

    <div class="header">
      <div>
        <h1>${t.title}</h1>
        <div class="platform">${t.program} · ${t.platform}</div>
      </div>
      <div class="meta">
        <div><b>${t.cohortSize}:</b> ${k.activeResidents}</div>
        <div><b>${t.period}:</b> ${t.periodValue}</div>
        <div><b>${t.generated}:</b> ${dateStr}</div>
      </div>
    </div>

    <div class="section">
      <h2>${t.execSummary} <span class="badge">${t.aiBadge}</span></h2>
      <div class="summary">${cohortReportSummary(ins, lang)}</div>
    </div>

    <div class="section">
      <div class="kpis">
        ${kpi(`${k.activeResidents}`, t.residents, ACCENT)}
        ${kpi(`${k.avgAccuracy}%`, t.accuracy, "#16a34a")}
        ${kpi(`${k.avgCoverage}%`, t.coverage)}
        ${kpi(`${k.avgQuestionsPerWeek}`, t.perWeek)}
        ${kpi(`${k.attentionCount}`, t.watch, k.attentionCount > 0 ? "#d97706" : undefined)}
      </div>
    </div>

    <div class="section">
      <h2>${t.distribution}</h2>
      ${bands}
    </div>

    <div class="section">
      <h2>${t.needsAttention}</h2>
      ${attention}
    </div>

    <div class="section">
      <div class="cols">
        <div class="col"><h2>${t.weakest}</h2>${ins.weakTopics.map((tp) => topicRow(tp, true)).join("")}</div>
        <div class="col"><h2>${t.strongest}</h2>${ins.strongTopics.map((tp) => topicRow(tp, false)).join("")}</div>
      </div>
    </div>

    <div class="section">
      <h2>${t.roster}</h2>
      <table class="roster">
        <thead><tr>
          <th>${t.colResident}</th><th>${t.colYear}</th><th>${t.colAccuracy}</th><th>${t.colTrend}</th><th>${t.colTasks}</th><th>${t.colStatus}</th>
        </tr></thead>
        <tbody>${roster}</tbody>
      </table>
    </div>

    <div class="section">
      <h2>${t.recommended}</h2>
      <ul class="recos">${recos}</ul>
    </div>

    <div class="signature">
      <div class="sig-field"><div class="sig-line"></div><div class="sig-lbl">${t.signature}</div></div>
      <div class="sig-field" style="max-width:160px"><div class="sig-line"></div><div class="sig-lbl">${t.date}</div></div>
    </div>

    <div class="footer"><span>${t.platform}</span><span>${t.footerNote}</span></div>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=820");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
