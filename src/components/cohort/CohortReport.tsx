import { useState } from "react";
import { ArrowLeft, Download, Languages, Sparkles, Users } from "lucide-react";
import type { CohortResident, CohortTopic } from "@/data/cohortMockData";
import { trendDelta } from "@/lib/cohortDetail";
import { accuracyColor } from "@/lib/cohortStats";
import {
  COHORT_REPORT_STRINGS,
  cohortInsights,
  cohortReportSummary,
  cohortReportRecommendations,
  type ReportLang,
} from "@/lib/cohortReport";
import { exportCohortReport } from "@/lib/reportPdf";

interface Props {
  residents: CohortResident[];
  topics: CohortTopic[];
  onBack: () => void;
}

const signalColor = { active: "text-success", steady: "text-muted-foreground", attention: "text-warning" } as const;

/**
 * Program-level (cohort) progress report — the program-director's view.
 * Glass document on screen; localized white PDF via Export. EN/HE toggle.
 * Content sourced from cohortReport.ts so the screen and PDF stay in sync.
 */
export default function CohortReport({ residents, topics, onBack }: Props) {
  const [lang, setLang] = useState<ReportLang>("en");
  const t = COHORT_REPORT_STRINGS[lang];
  const ins = cohortInsights(residents, topics, lang);
  const k = ins.kpis;
  const recos = cohortReportRecommendations(ins, lang);
  const maxBand = Math.max(...ins.bands.map((b) => b.count), 1);

  const kpi = (value: string, label: string, color?: string) => (
    <div className="glass-tile rounded-xl p-3 text-center">
      <div className="text-2xl font-black tabular-nums" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
    </div>
  );

  return (
    <div dir={t.dir} className="flex flex-col gap-4">
      {/* Toolbar */}
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
            onClick={() => exportCohortReport(residents, topics, lang)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Download className="w-3.5 h-3.5" /> {t.exportPdf}
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap border-b-2 border-primary/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 bg-brand-mark">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground leading-tight tracking-tight">{t.title}</h1>
            <p className="text-xs text-muted-foreground">
              {t.program} · {t.platform}
            </p>
          </div>
        </div>
        <div
          className={`text-[11px] text-muted-foreground leading-relaxed ${t.dir === "rtl" ? "text-left" : "text-right"}`}
        >
          <div>
            <span className="text-foreground font-semibold">{t.cohortSize}:</span> {k.activeResidents}
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
          {cohortReportSummary(ins, lang)}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        {kpi(`${k.activeResidents}`, t.residents, "hsl(var(--primary))")}
        {kpi(`${k.avgAccuracy}%`, t.accuracy, "hsl(var(--success))")}
        {kpi(`${k.avgCoverage}%`, t.coverage)}
        {kpi(`${k.avgQuestionsPerWeek}`, t.perWeek)}
        {kpi(`${k.attentionCount}`, t.watch, k.attentionCount > 0 ? "hsl(var(--warning))" : undefined)}
      </div>

      {/* Accuracy distribution */}
      <div className="glass-tile rounded-xl p-4">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary mb-3">{t.distribution}</h3>
        <div className="flex flex-col gap-2">
          {ins.bands.map((b) => (
            <div key={b.label} className="flex items-center gap-3 text-xs">
              <span className="w-36 shrink-0 text-foreground">{b.label}</span>
              <span className="flex-1 h-3.5 rounded-full bg-muted/40 overflow-hidden">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.round((b.count / maxBand) * 100)}%` }}
                />
              </span>
              <span className="w-6 text-center font-bold tabular-nums text-foreground">{b.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Needs attention */}
      <div className="glass-tile rounded-xl p-4">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary mb-3">{t.needsAttention}</h3>
        {ins.attention.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t.noAttention}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {ins.attention.map((r) => {
              const d = trendDelta(r);
              return (
                <div key={r.id} className="flex items-center gap-2.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-warning shrink-0" />
                  <span className="flex-1 font-semibold text-foreground">
                    {r.initials} · {r.stageLabel}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {r.accuracy}% · Δ{d >= 0 ? "+" : ""}
                    {d} · {r.lastActive}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Topic focus */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary">{t.weakest}</h3>
          {ins.weakTopics.map((tp) => (
            <div key={tp.topic} className="glass-tile rounded-lg p-3 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">{tp.topic}</span>
              <span className="text-sm font-black tabular-nums" style={{ color: "hsl(var(--warning))" }}>
                {tp.avgAccuracy}%
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary">{t.strongest}</h3>
          {ins.strongTopics.map((tp) => (
            <div key={tp.topic} className="glass-tile rounded-lg p-3 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">{tp.topic}</span>
              <span className="text-sm font-black tabular-nums" style={{ color: "hsl(var(--success))" }}>
                {tp.avgAccuracy}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Roster */}
      <div className="glass-tile rounded-xl p-4 overflow-x-auto">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-primary mb-3">{t.roster}</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
              <th className="text-start font-semibold py-1.5 px-2">{t.colResident}</th>
              <th className="text-start font-semibold py-1.5 px-2">{t.colYear}</th>
              <th className="text-start font-semibold py-1.5 px-2">{t.colAccuracy}</th>
              <th className="text-start font-semibold py-1.5 px-2">{t.colTrend}</th>
              <th className="text-start font-semibold py-1.5 px-2">{t.colTasks}</th>
              <th className="text-start font-semibold py-1.5 px-2">{t.colStatus}</th>
            </tr>
          </thead>
          <tbody>
            {residents.map((r) => {
              const d = trendDelta(r);
              return (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-1.5 px-2 font-bold text-foreground">{r.initials}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{r.year}</td>
                  <td className="py-1.5 px-2 font-bold tabular-nums" style={{ color: accuracyColor(r.accuracy) }}>
                    {r.accuracy}%
                  </td>
                  <td className={`py-1.5 px-2 tabular-nums ${d >= 0 ? "text-success" : "text-destructive"}`}>
                    {d >= 0 ? "▲ +" : "▼ "}
                    {d}
                  </td>
                  <td className="py-1.5 px-2 text-muted-foreground tabular-nums">
                    {r.tasksCompleted}/{r.tasksTotal}
                  </td>
                  <td className={`py-1.5 px-2 font-semibold ${signalColor[r.signal]}`}>{t.signal[r.signal]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Recommended program focus */}
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

      {/* Signature */}
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
