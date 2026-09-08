import { useApp } from '@/contexts/AppContext';
import { MIN_SIGNAL_SAMPLE, type LearningReport, type Recommendation } from '@/lib/learningInsights';
import { useLearningReport, type LearningReportState } from './useLearningReport';
import {
  POLICY_NOTE, TREND_CAVEAT, chapterLine, chapterList, confidenceNote, confidenceText, followUpText, pct, recommendationMeta, signalLine, trendText, uncertaintyNotes,
} from '@/lib/learningReportText';
import CurriculumPlanPanel from './CurriculumPlanPanel';

function RecommendationCard({ rec, onOpen }: { rec: Recommendation; onOpen: (rec: Recommendation) => void }) {
  return (
    <li className="rounded-xl border border-border bg-card p-4 space-y-2">
      <p className="font-bold">{rec.title}</p>
      <p className="text-sm text-muted-foreground">{rec.rationale}</p>
      <p className="text-xs text-muted-foreground">{recommendationMeta(rec)}</p>
      {rec.caveats.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{rec.caveats.join(' · ')}</p>}
      <button type="button" onClick={() => onOpen(rec)} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold">
        פתח הגדרות עם הסינון הזה
      </button>
    </li>
  );
}

function ReportBody({ report, withPlan }: { report: LearningReport; withPlan: boolean }) {
  const { openRecommendation } = useApp();
  const o = report.overall;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">כיסוי ליבה</p><p className="text-xl font-bold">{pct(o.policy.coveragePercent)}</p></div>
        <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">הצלחה בבחינה</p><p className="text-xl font-bold">{pct(o.policy.quizSuccessPercent)}</p></div>
        <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">שאלות במאגר</p><p className="text-xl font-bold">נצפו {o.seenCount}</p><p className="text-sm">טרם נצפו {o.unseenCount}</p></div>
        <div className="rounded-xl border border-border p-3"><p className="text-xs text-muted-foreground">פרקים ירוקים</p><p className="text-xl font-bold">{report.chapters.filter((c) => c.policy.green).length} מתוך {report.chapters.length}</p></div>
      </div>
      <p className="text-xs text-muted-foreground">{POLICY_NOTE}</p>
      <p role="note" className="text-xs text-muted-foreground">{uncertaintyNotes(report).join(' · ')}</p>

      <section aria-label="ביטחון" className="space-y-1">
        <h4 className="font-bold text-sm">ביטחון מוצהר</h4>
        <p className={report.signals.interpretation === 'available' ? 'text-sm' : 'text-sm text-muted-foreground'}>{confidenceText(report)}</p>
        <p className="text-xs text-muted-foreground">{confidenceNote(report)}</p>
      </section>

      <section aria-label="מגמה" className="space-y-1">
        <h4 className="font-bold text-sm">מגמה</h4>
        <p className="text-sm">{trendText(report.trend)}</p>
        {report.trend.caveats.length > 0 && <p className="text-xs text-muted-foreground">{report.trend.caveats.map((c) => TREND_CAVEAT[c]).join(' · ')}</p>}
      </section>

      <section aria-label="פרקים" className="space-y-1">
        <h4 className="font-bold text-sm">חוזקות ושיפור</h4>
        <p className="text-sm">חזק: {signalLine(report.strengths)}</p>
        <p className="text-sm">לשיפור: {signalLine(report.improvements)}</p>
        {report.insufficientSample.length > 0 && <p className="text-xs text-muted-foreground">מדגם קטן מדי (פחות מ־{MIN_SIGNAL_SAMPLE}): {chapterList(report.insufficientSample)}</p>}
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">התקדמות לפי פרק</summary>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
            {report.chapters.map((c) => (
              <li key={c.chapter}>{chapterLine(c)}</li>
            ))}
          </ul>
        </details>
      </section>

      <section aria-label="הצעדים הבאים" className="space-y-2">
        <h4 className="font-bold text-sm">הצעדים הבאים</h4>
        {report.recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין עדיין מספיק עדות להמלצה ממוקדת. כל החומר פתוח ללימוד.</p>
        ) : (
          <ul className="space-y-2">{report.recommendations.map((rec) => <RecommendationCard key={rec.id} rec={rec} onOpen={openRecommendation} />)}</ul>
        )}
        {report.followUp.length > 0 && (
          <p className="text-xs text-muted-foreground">{followUpText(report)}</p>
        )}
      </section>

      {withPlan && <CurriculumPlanPanel evidence={report.chapters.map((c) => ({ chapter: c.chapter, green: c.policy.green, coveragePercent: c.policy.coveragePercent }))} />}
    </div>
  );
}

/** State-driven body: callers that already hold the report state (ResultsView, which also prints it) render this directly. */
export function LearningReportSection({ state, withPlan = false }: { state: LearningReportState; withPlan?: boolean }) {
  return (
    <section aria-label="ניתוח למידה מצטבר" className="bg-card rounded-xl border border-border p-5 space-y-4" dir="rtl">
      <h3 className="text-lg font-bold">ניתוח למידה מצטבר</h3>
      {state.status === 'loading' && <p className="text-sm text-muted-foreground">טוען עדות מהניסיונות שהוגשו…</p>}
      {state.status === 'unavailable' && <p role="note" className="text-sm text-muted-foreground">הניתוח אינו זמין כרגע: {state.message}</p>}
      {state.status === 'ready' && <ReportBody report={state.report} withPlan={withPlan} />}
    </section>
  );
}

/** Cumulative learning analysis from immutable submitted attempts (learning_evidence_read). */
export default function LearningReportPanel({ withPlan = false }: { withPlan?: boolean }) {
  return <LearningReportSection state={useLearningReport()} withPlan={withPlan} />;
}
