import { useState } from "react";
import {
  ArrowLeft,
  Download,
  Languages,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { CohortResident } from "@/data/cohortMockData";
import { getResidentDetail, trendDelta } from "@/lib/cohortDetail";
import { accuracyColor } from "@/lib/cohortStats";
import { REPORT_STRINGS, reportSummary, reportRecommendations, type ReportLang } from "@/lib/residentReport";
import { exportResidentReport } from "@/lib/reportPdf";
import ResidentTrendChart from "./ResidentTrendChart";

const taskIcon = { done: CheckCircle2, pending: Clock, overdue: AlertCircle } as const;
const taskColor = { done: "text-success", pending: "text-muted-foreground", overdue: "text-warning" } as const;

interface Props {
  resident: CohortResident;
  onBack: () => void;
}

/**
 * In-app "leave-behind" progress report for one resident — the demo's secret
 * weapon. Glass document on screen; a localized white PDF via Export.
 * Language is a live EN/HE toggle (decided by comparison, not pre-committed).
 * All content is sourced from residentReport.ts so the screen and the PDF match.
 */
export default function ResidentReport({ resident: r, onBack }: Props) {
  const [lang, setLang] = useState<ReportLang>("en");
  const detail = getResidentDetail(r);
  const t = REPORT_STRINGS[lang];
  const delta = trendDelta(r);
  const recos = reportRecommendations(r, detail, lang);
  const current = detail.plan.find((p) => p.status === "current");

  const kpi = (value: string, label: string, color?: string) => (
    <div className="glass-tile rounded-xl p-3 text-center">
      <div className="text-2xl font-black tabular-nums" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
    </div>
  );

  const topicCard = (s: { topic: string; accuracy: number; chapters: { chapter: number }[] }, focus: boolean) => (
    <div key={s.topic} className="glass-tile rounded-lg p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{s.topic}</span>
        <span
          className="text-sm font-black tabular-nums"
          style={{ color: focus ? "hsl(var(--warning))" : "hsl(var(--success))" }}
        >
          {s.accuracy}%
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        {t.millerCh} {s.chapters.map((c) => c.chapter).join(", ")}
      </div>
    </div>
  );

  return (
    <div dir={t.dir} className="flex flex-col gap-4">
      {/* Toolbar (not part of the printed doc) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t.back}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "he" : "en")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground hover:bg-accent transition-colors"
          >
            <Languages className="w-3.5 h-3.5" /> {t.langToggle}
          </button>
          <button
            onClick={() => exportResidentReport(r, detail, lang)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Download className="w-3.5 h-3.5" /> {t.exportPdf}
          </button>
        </div>
      </div>

      {/* Report header */}
      <div className="flex items-end justify-between gap-4 flex-wrap border-b-2 border-primary/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 bg-avatar-gradient">
            {r.initials}
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground leading-tight tracking-tight">{t.title}</h1>
            <p className="text-xs text-muted-foreground">{t.platform}</p>
          </div>
        </div>
        <div
          className={`text-[11px] text-muted-foreground leading-relaxed ${t.dir === "rtl" ? "text-left" : "text-right"}`}
        >
          <div>
            <span className="text-foreground font-semibold">{t.resident}:</span> {r.initials} · {r.stageLabel}
          </div>
          <div>
            <span className="text-foreground font-semibold">{t.period}:</span> {t.periodValue}
          </div>
        </div>
      </div>

      {/* Executive summary */}
      <div className="glass-tile rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">{t.execSummary}</h3>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">{t.aiBadge}</span>
        </div>
        <p className="text-sm text-foreground/85 leading-relaxed" style={{ unicodeBidi: "plaintext" }}>
          {reportSummary(r, detail, lang)}
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {kpi(`${r.accuracy}%`, t.accuracy, accuracyColor(r.accuracy))}
        {kpi(`${r.coverage}%`, t.coverage)}
        {kpi(`${r.questionsPerWeek}`, t.perWeek)}
        {kpi(`${r.tasksCompleted}/${r.tasksTotal}`, t.tasksComplete)}
        <div className="glass-tile rounded-xl p-3 text-center">
          <div
            className={`text-2xl font-black tabular-nums flex items-center justify-center gap-1 ${delta >= 0 ? "text-success" : "text-destructive"}`}
          >
            {delta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {delta >= 0 ? "+" : ""}
            {delta}
          </div>
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{t.trendLabel}</div>
        </div>
      </div>

      {/* Accuracy trend (reuses the shared interactive chart) */}
      <ResidentTrendChart
        resident={r}
        labels={{ title: t.trendSection, subtitle: t.trendSub, ranges: t.trendRanges, tooltip: t.accuracy }}
      />

      {/* Strengths + Focus areas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary">{t.strengths}</h3>
          {detail.strengths.map((s) => topicCard(s, false))}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary">{t.focusAreas}</h3>
          {detail.weaknesses.map((s) => topicCard(s, true))}
        </div>
      </div>

      {/* Task & rotation adherence */}
      <div className="glass-tile rounded-xl p-4">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary mb-3">{t.adherence}</h3>
        <div className="flex flex-col gap-1.5">
          {detail.tasks.map((task) => {
            const Icon = taskIcon[task.status];
            return (
              <div key={task.id} className="flex items-center gap-2.5 text-xs">
                <Icon className={`w-3.5 h-3.5 shrink-0 ${taskColor[task.status]}`} />
                <span
                  className={`flex-1 ${task.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {task.title}
                </span>
                <span className={`text-[10px] ${task.status === "overdue" ? "text-warning" : "text-muted-foreground"}`}>
                  {t.status[task.status]}
                </span>
              </div>
            );
          })}
        </div>
        {current && (
          <div className="text-xs text-foreground mt-3 pt-3 border-t border-border">
            {t.currentRotation}: <span className="font-bold text-primary">{current.name}</span>
            {current.note ? ` — ${current.note}` : ""}
          </div>
        )}
      </div>

      {/* Recommended focus */}
      <div className="glass-tile rounded-xl p-4">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary mb-3">{t.recommended}</h3>
        <ul className="flex flex-col gap-2">
          {recos.map((rec, i) => (
            <li key={i} className="flex gap-2 text-xs text-foreground/85" style={{ unicodeBidi: "plaintext" }}>
              <span className="text-primary font-bold shrink-0">→</span>
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Signature line */}
      <div className="flex gap-8 pt-4 border-t border-border">
        <div className="flex-1">
          <div className="h-7 border-b border-muted-foreground/40" />
          <div className="text-[10px] text-muted-foreground mt-1">{t.signature}</div>
        </div>
        <div className="w-40">
          <div className="h-7 border-b border-muted-foreground/40" />
          <div className="text-[10px] text-muted-foreground mt-1">{t.date}</div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center">{t.footerNote}</p>
    </div>
  );
}
