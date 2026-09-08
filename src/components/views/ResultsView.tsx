import DOMPurify from "dompurify";
import { useMemo, useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { toast } from "sonner";
import { attemptErrorMessage } from "@/lib/attemptsRepository";
import { KEYS, type SessionState } from "@/lib/types";
import {
  RotateCcw,
  ChevronDown,
  ChevronUp,
  BookOpen,
  ExternalLink,
  ArrowRight,
  Trophy,
  Timer,
  Download,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import SessionLearningSummary from "@/components/SessionLearningSummary";
import { buildSessionInsights, questionChangeLabel } from "@/lib/sessionInsights";
import { buildSessionReportHtml } from "@/lib/exportPdf";
import { writeLastSession } from "@/lib/lastSessionStore";
import SessionReportPreview from "@/components/SessionReportPreview";
import { explanationSections } from "@/lib/explanationSections";
import { LearningReportSection } from "@/components/learning/LearningReportPanel";
import { useLearningReport } from "@/components/learning/useLearningReport";
import { ReportQuestionDialog } from "@/components/feedback";

export const formatActive = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

/* ── Explanation renderers (unchanged logic) ── */
function isHtmlContent(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

/**
 * The one-line title of a collapsed question row. Some questions are stored as
 * HTML, and a truncated line inside a button is the wrong place to render
 * markup — so the tags leaked to the learner as a literal "<p>". Same sanitizer
 * used everywhere else in this file, with no tags allowed; asking it for a node
 * rather than a string matters, because the string form re-escapes entities and
 * a question would read "&nbsp;" out loud. Display only: the question itself is
 * untouched, and the expanded panel below still shows it in full.
 */
function questionPreviewText(text: string): string {
  if (!isHtmlContent(text)) return text;
  const stripped = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [], RETURN_DOM: true });
  return (stripped.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Question and option text exactly as it is stored. Most of it is plain and is
 * left untouched; the rows stored as HTML used to leak their own tags to the
 * learner as a literal "<p>" or "<strong>". Those now go through the same
 * DOMPurify call the explanation below already uses, so formatting, formulas
 * and Critical Visuals survive while event handlers and javascript: URLs do
 * not. Display only — nothing here changes what is stored or what is scored.
 */
function StoredContent({ text, className }: { text: string; className: string }) {
  if (!isHtmlContent(text)) return <span className={className}>{text}</span>;
  return (
    <span
      className={`rich-content block ${className}`}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(text) }}
    />
  );
}

function ExplanationRenderer({ text }: { text: string }) {
  let processed = text.replace(/<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  processed = processed.replace(/(?<!\]\()(?<!\()(https?:\/\/[^\s)]+)/g, "[$1]($1)");
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80 transition inline-flex items-center gap-1 break-all"
          >
            {children}
            <ExternalLink className="w-3 h-3 inline-block flex-shrink-0" />
          </a>
        ),
        p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

function SmartExplanation({ text }: { text: string }) {
  return <>{explanationSections(text).map((section, i) => <div key={i}>
    {section.title && <h4 className="font-bold mt-4 mb-2">{section.title}</h4>}
    <ExplanationContent text={section.content} />
  </div>)}</>;
}

function ExplanationContent({ text }: { text: string }) {
  if (isHtmlContent(text)) {
    return (
      <div
        className="rich-content text-sm text-foreground bidi-text prose prose-sm max-w-none"
        style={{ lineHeight: "1.8" }}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(text) }}
      />
    );
  }
  return <ExplanationRenderer text={text} />;
}

/* ── Main Results View ── */
/** `archive`: read-only review of a submitted attempt (milestone 2). No restart, no localStorage, back goes to the archive. */
export default function ResultsView({ archive }: { archive?: { session: SessionState; onBack: () => void } } = {}) {
  const app = useApp();
  const [reportQ, setReportQ] = useState<{ id: string; label: string } | null>(null);
  const { progress, historyLoaded, data, navigate, startSession, resetFilters, setSourceFilter, toggleMultiSelect, toggleUnseenOnly, userId } = app;
  const session = archive?.session ?? app.session;
  const { quiz, answers, mode } = session;
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [printableReport, setPrintableReport] = useState<string | null>(null);
  const questionReviewRef = useRef<HTMLDivElement>(null);
  const questionListRef = useRef<HTMLDivElement>(null);
  const openQuestionReview = () => {
    setExpandedQ(0);
    if (questionListRef.current) questionListRef.current.scrollTop = 0;
    questionReviewRef.current?.scrollIntoView({ block: 'start' });
    questionReviewRef.current?.focus({ preventScroll: true });
  };
  // Server value for durable attempts; session value for legacy/Academy paths. Recorded, never a limit.
  const activeMs = session.attemptResult?.totalActiveMs ?? session.totalActiveMs ?? null;
  const learningReport = useLearningReport();
  const openReport = () => setPrintableReport(buildSessionReportHtml({
    score: results.score, pct: results.pct, mode, details: results.details, insights, totalActiveMs: activeMs, learningReport,
  }));

  const isSimulation = mode === "simulation";
  const [visibleQuestionCount, setVisibleQuestionCount] = useState(30);
  const insights = useMemo(() => buildSessionInsights({ bank: data, quiz, answers, baseline: session.learningBaseline, history: progress.history, historyAvailable: historyLoaded }),
    [data, quiz, answers, session.learningBaseline, progress.history, historyLoaded]);
  const questionInsightById = useMemo(() => new Map(insights.questions.map(q => [q.id, q])), [insights.questions]);
  const continueLearning = (topic: string, source: 'all' | 'mistakes', unseenOnly: boolean) => {
    resetFilters();
    if (topic !== 'כללי') toggleMultiSelect('topic', topic);
    setSourceFilter(source);
    if (unseenOnly) toggleUnseenOnly();
    navigate('setup-practice');
  };

  const results = useMemo(() => {
    const details = insights.questions.map(({ q, userAns, correctAns, isCorrect }) => ({ q, userAns, correctAns, isCorrect }));
    // Durable attempts: the server's scoring is authoritative over the client recount.
    const server = session.attemptResult;
    const score = server?.correctCount ?? insights.overall.correct;
    const total = server ? (mode === "practice" ? server.scoredCount ?? 0 : server.totalCount) : mode === "practice" ? insights.overall.scored : quiz.length;
    const pct = total ? Math.round(score * 100 / total) : null;
    return { score, total, pct, details };
  }, [insights, mode, quiz.length, session.attemptResult]);

  // Exam answers are NOT written here. SessionView's processQuizAnswersForSrs
  // already calls updateHistory for every answered question on submit, for both
  // simulation and exam, so this screen was recording each exam answer a second
  // time: answered_count incremented twice and two answer_history rows per
  // answer. Cherry-picked by hand from e677ca9, whose other 250 lines are a
  // reformat.

  // Save last session results to localStorage
  const lastSessionSaved = useRef(!!archive);
  useEffect(() => {
    if (quiz.length > 0 && !lastSessionSaved.current) {
      lastSessionSaved.current = true;
      const topicCount: Record<string, number> = {};
      quiz.forEach((q) => {
        const t = q[KEYS.TOPIC];
        if (t) topicCount[t] = (topicCount[t] || 0) + 1;
      });
      const topTopics = Object.entries(topicCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t);

      // Stamped with the owner: Home shows this card only back to the account
      // that produced it (see lib/lastSessionStore).
      writeLastSession(userId, {
        score: results.score,
        total: results.total,
        pct: results.pct,
        mode,
        topics: topTopics,
        timestamp: Date.now(),
      });
    }
  }, [quiz, results, mode, userId]);

  const handleRestart = () => {
    const wrongQuestions = results.details.filter(d => d.isCorrect === false).map(d => d.q);
    Promise.resolve(startSession(wrongQuestions, wrongQuestions.length, "practice")).catch((e) => toast.error(attemptErrorMessage(e)));
  };

  const displayPercent = results.pct;
  const statusLabel = mode === "practice" ? "סיכום תרגול אישי" : "סיכום הבוחן";

  // Count errors for review button
  const errorCount = results.details.filter((d) => d.isCorrect === false).length;

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-8 space-y-8">
      {/* ── Hero: Status + Countdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Premium Status Card */}
        <div
          className="lg:col-span-2 flex flex-col justify-start rounded-xl shadow-xl bg-gradient-to-br from-card to-secondary border border-border p-6 relative overflow-hidden"
        >
          <div className="absolute -right-4 -top-4 opacity-10 text-primary">
            <Trophy className="w-[120px] h-[120px]" />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex items-center justify-center bg-primary/20 p-4 rounded-full border border-primary/30">
              <Trophy className="w-12 h-12 text-primary" />
            </div>
            <div className="flex-1 text-center sm:text-right">
              <p className="text-primary text-xs font-bold tracking-widest uppercase mb-1">{statusLabel}</p>
              <h3 className="text-2xl font-bold text-foreground mb-2">
                {isSimulation ? "סיכום הסימולציה" : mode === "practice" ? "סיימת את התרגול" : "סיימת את הבוחן"}
              </h3>
              <p className="text-muted-foreground text-sm max-w-md">
                נענו {insights.overall.answered} מתוך {insights.questions.length} שאלות: {insights.overall.correct} נכונות, {insights.overall.wrong} שגויות ו־{insights.overall.skipped} ללא מענה.{insights.overall.answered > insights.overall.scored && ` ${insights.overall.answered - insights.overall.scored} תשובות ללא מפתח תקין לא סווגו כנכונות או כשגויות.`}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center bg-card/80 p-4 rounded-xl border border-border min-w-[120px]">
              <span className="text-3xl font-black text-primary">
                {results.score}/{results.total}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
                תשובות נכונות
              </span>
            </div>
          </div>
        </div>

        {/* Countdown / Score Card */}
        <div
          className="rounded-xl shadow-xl bg-card border border-border p-6 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{mode === "practice" ? "דיוק בתשובות שנענו" : "ציון הבוחן"}</span>
            <Timer className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex justify-center items-center py-4">
            <div className="text-center">
              <p className="text-6xl font-black text-primary">
                {displayPercent === null ? "—" : `${Math.round(displayPercent)}%`}
              </p>
              <p className="text-xs text-muted-foreground mt-2 uppercase font-bold">
                {mode === "practice" ? "למידה אישית" : "מתוך כלל שאלות הבוחן"}
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {quiz.length} שאלות • {errorCount} שגיאות
            </p>
            {activeMs != null && (
              <p className="text-xs text-muted-foreground mt-1">זמן פעיל: {formatActive(activeMs)}</p>
            )}
            {session.attemptResult?.quarter && (
              <p className="text-xs text-muted-foreground mt-1">
                רבעון {session.attemptResult.quarter}
                {session.attemptResult.submittedAt && ` • הוגש ${new Date(session.attemptResult.submittedAt).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}`}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button type="button" onClick={openQuestionReview} className="flex-1 rounded-xl border border-primary/40 bg-primary/10 p-4 font-bold">עיון בשאלות ובהסברים</button>
        <button type="button" onClick={openReport} className="flex-1 rounded-xl border border-border p-4 font-bold">ייצוא דוח מלא ל־PDF</button>
      </div>

      <SessionLearningSummary insights={insights} onContinue={continueLearning} />
      <LearningReportSection state={learningReport} />

      {/* ── Question History List ── */}
      <div ref={questionReviewRef} tabIndex={-1} aria-label="עיון בשאלות ובהסברים" className="bg-card rounded-xl border border-border overflow-hidden shadow-xl scroll-mt-24">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">כל השאלות וההסברים</h3>
          <span className="text-xs text-muted-foreground">{quiz.length} שאלות</span>
        </div>
        <p className="px-6 py-3 text-sm text-muted-foreground">לחצו על שאלה כדי לפתוח את התשובות וההסבר המלא. העיון אינו משנה את התשובות או את הציון.</p>
        <div ref={questionListRef} role="region" aria-label="רשימת השאלות" className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {results.details.slice(0, visibleQuestionCount).map((d, i) => (
            <div key={i}>
              {/* Question row */}
              <button
                type="button"
                aria-expanded={expandedQ === i}
                aria-controls={`question-explanation-${i}`}
                aria-label={`${expandedQ === i ? 'סגור' : 'פתח'} שאלה ${i + 1} והסבר`}
                className="w-full text-right p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => setExpandedQ(expandedQ === i ? null : i)}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                    d.isCorrect
                      ? "bg-success/10 text-success"
                      : d.isCorrect === false
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {d.isCorrect ? "✓" : d.isCorrect === false ? "✗" : "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate bidi-text">{questionPreviewText(d.q[KEYS.QUESTION])}</p>
                  <p className="text-xs text-muted-foreground">
                    #{d.q[KEYS.REF_ID]} • {d.q[KEYS.TOPIC] || "כללי"}
                    {" · "}{questionChangeLabel[questionInsightById.get(d.q[KEYS.ID])?.change ?? "unknown"]}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                      d.isCorrect
                        ? "bg-success/20 text-success"
                        : d.isCorrect === false
                          ? "bg-destructive/20 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {d.isCorrect ? "נכון" : d.isCorrect === false ? "שגוי" : d.userAns ? "לא נבדק" : "דילוג"}
                  </span>
                  {expandedQ === i ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Expanded details */}
              {expandedQ === i && (
                <div id={`question-explanation-${i}`} role="region" aria-label={`שאלה ${i + 1} והסבר`} className="p-5 border-t border-border bg-muted/20 space-y-4">
                  <StoredContent text={d.q[KEYS.QUESTION]} className="block text-foreground text-sm bidi-text leading-relaxed" />
                  <button
                    type="button"
                    onClick={() => setReportQ({ id: String(d.q[KEYS.ID]), label: `#${d.q[KEYS.REF_ID]}` })}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    דווח על בעיה בשאלה
                  </button>

                  {/* Options */}
                  <div className="space-y-2">
                    {(["A", "B", "C", "D"] as const).map((opt) => {
                      const text = d.q[KEYS[opt]];
                      if (!text) return null;
                      const isCorrectOpt = opt === d.correctAns;
                      const isUserChoice = opt === d.userAns;
                      return (
                        <div
                          key={opt}
                          className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                            isCorrectOpt
                              ? "bg-success/10 text-success font-bold border border-success/20"
                              : isUserChoice && d.isCorrect === false
                                ? "bg-destructive/10 text-destructive border border-destructive/20"
                                : "text-muted-foreground"
                          }`}
                        >
                          <span className="font-bold">{opt}.</span>
                          <StoredContent text={text} className="bidi-text" />
                          {isCorrectOpt && <span>✓</span>}
                          {isUserChoice && d.isCorrect === false && <span>✗</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  {d.q[KEYS.EXPLANATION] && (
                    <div className="bg-card p-6 rounded-xl border border-border">
                      <strong className="text-foreground text-xs block mb-3">💡 הסבר:</strong>
                      <div className="text-sm text-foreground bidi-text markdown-content" style={{ lineHeight: "1.8" }}>
                        <SmartExplanation text={d.q[KEYS.EXPLANATION]} />
                      </div>
                    </div>
                  )}

                  {d.q[KEYS.MILLER] && d.q[KEYS.MILLER] !== "N/A" && (
                    <a
                      href={`https://www.google.com/search?q=Miller's+Anesthesia+10th+edition+page+${d.q[KEYS.MILLER]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-full font-medium transition flex items-center gap-2 w-fit border border-border"
                    >
                      <BookOpen className="w-3 h-3" /> פרק מילר: {d.q[KEYS.MILLER]}
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {visibleQuestionCount < results.details.length && <button type="button" onClick={() => setVisibleQuestionCount(count => count + 30)} className="w-full rounded-xl border border-border p-3 font-bold">הצג עוד שאלות ({results.details.length - visibleQuestionCount} נוספות)</button>}

      {/* ── Action Footer ── */}
      <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
        {errorCount > 0 && !session.quizId && !archive && (
          <button
            onClick={handleRestart}
            className="w-full sm:flex-1 h-14 bg-primary text-primary-foreground font-black text-lg rounded-xl shadow-[0_0_20px_hsl(var(--primary)/0.3)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            תרגול חוזר ({errorCount} שגיאות)
          </button>
        )}
        <button
          onClick={openReport}
          className="w-full sm:w-auto h-14 px-6 bg-card border border-border text-foreground font-bold rounded-xl hover:bg-muted transition-all flex items-center justify-center gap-2"
        >
          <Download className="w-5 h-5" />
          ייצוא PDF
        </button>
        <button
          onClick={() => (archive ? archive.onBack() : navigate("home"))}
          className="w-full sm:flex-1 h-14 bg-secondary text-foreground font-bold text-lg rounded-xl hover:bg-muted transition-all flex items-center justify-center gap-2"
        >
          {archive ? "חזרה לארכיון" : "חזרה לראשי"}
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
      {printableReport && <SessionReportPreview html={printableReport} onClose={() => setPrintableReport(null)} />}
      <ReportQuestionDialog
        open={reportQ !== null}
        onOpenChange={(o) => { if (!o) setReportQ(null); }}
        questionId={reportQ?.id ?? null}
        userId={app.userId ?? null}
        questionLabel={reportQ?.label ?? null}
      />
    </div>
  );
}
