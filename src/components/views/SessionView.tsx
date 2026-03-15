import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { springGentle } from "@/lib/animations";
import { useApp } from "@/contexts/AppContext";
import { KEYS, type ConfidenceLevel } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import {
  X,
  Flag,
  Star,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  BookOpen,
  StickyNote,
  Tag,
  Plus,
  ExternalLink,
  Copy,
  Send,
  Calculator,
  Pencil,
  Check,
  Lightbulb,
  Image as ImageIcon,
} from "lucide-react";
import FormulaCalculatorPanel from "@/components/FormulaCalculatorPanel";
import RichTextEditor from "@/components/RichTextEditor";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { GlobalQuestionStats, CommunityNotes } from "./SessionCommunity";
import { getChapterDisplay, resolveChapterName, MILLER_CHAPTERS } from "@/data/millerChapters";

/** Detect if content contains HTML tags */
function isHtmlContent(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

/** Smart renderer: HTML content via dangerouslySetInnerHTML, plain text via ExplanationRenderer */
function SmartContent({ text, inheritSize = false }: { text: string; inheritSize?: boolean }) {
  const sizeClass = inheritSize ? '' : 'text-base prose prose-sm';
  if (isHtmlContent(text)) {
    return (
      <div
        className={`rich-content markdown-content bidi-text ${sizeClass} max-w-none text-foreground`}
        style={{ lineHeight: inheritSize ? undefined : 1.8 }}
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  }
  return (
    <div className={`markdown-content bidi-text ${inheritSize ? '' : 'text-base'}`} style={{ lineHeight: inheritSize ? undefined : 1.8 }}>
      <ExplanationRenderer text={text} />
    </div>
  );
}

/** Parse URLs and <a> tags inside explanation text into clickable links */
function ExplanationRenderer({ text }: { text: string }) {
  let processed = text.replace(/<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  processed = processed.replace(/(?<!\]\()(?<!\()(https?:\/\/[^\s\)]+)/g, "[$1]($1)");

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

/** Color palette for split sections by index */
const SECTION_COLORS = [
  { border: "border-orange-500/25", header: "bg-orange-500/10 text-orange-400" },
  { border: "border-yellow-500/25", header: "bg-yellow-500/10 text-yellow-400" },
  { border: "border-blue-500/25", header: "bg-blue-500/10 text-blue-400" },
  { border: "border-purple-500/25", header: "bg-purple-500/10 text-purple-400" },
  { border: "border-emerald-500/25", header: "bg-emerald-500/10 text-emerald-400" },
  { border: "border-primary/20", header: "bg-primary/10 text-primary" },
];

/** Parse META_TITLES prefix from explanation field */
function parseExplanation(text: string): { titles: string[]; html: string } {
  const match = text.match(/^META_TITLES:(.*)\n([\s\S]*)$/);
  if (match) {
    try {
      const titles = JSON.parse(match[1]);
      return { titles: Array.isArray(titles) ? titles.map(String) : [], html: match[2] };
    } catch {}
  }
  return { titles: [], html: text };
}

/** Serialize explanation with META_TITLES prefix */
function serializeExplanation(html: string, titles: string[]): string {
  if (titles.every((t) => !t.trim())) return html;
  return `META_TITLES:${JSON.stringify(titles)}\n${html}`;
}

/** Split HTML content into sections by <hr> or --- */
function splitSections(html: string): string[] {
  if (!html) return [];
  return html
    .split(/(?:<hr\s*\/?>|\n---\n|\n---$|^---\n)/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function SessionView() {
  const {
    session,
    progress,
    navigate,
    setAnswer,
    setConfidence,
    setSessionIndex,
    toggleFlag,
    skipQuestion,
    updateHistory,
    updateSpacedRepetition,
    syncAnswerToDb,
    toggleFavorite,
    saveNote,
    setRating,
    addTag,
    removeTag,
    saveSessionToDb,
    clearSavedSession,
    invalidateQuestions,
  } = useApp();
  const { toast } = useToast();
  const isAdmin = useIsAdmin();

  const { quiz, index, mode, answers, confidence, flagged, skipped } = session;
  const [showNote, setShowNote] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [simTimerSeconds, setSimTimerSeconds] = useState(3 * 60 * 60);
  const [calcOpen, setCalcOpen] = useState(false);
  const [editingExplanation, setEditingExplanation] = useState(false);
  const [explanationDraft, setExplanationDraft] = useState("");
  const [sectionTitleDrafts, setSectionTitleDrafts] = useState<string[]>([]);
  const [savingExplanation, setSavingExplanation] = useState(false);
  const [editingCorrectAnswer, setEditingCorrectAnswer] = useState(false);
  const [correctAnswerDraft, setCorrectAnswerDraft] = useState("");
  const [savingCorrectAnswer, setSavingCorrectAnswer] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [chapterDraft, setChapterDraft] = useState("");
  const [savingChapter, setSavingChapter] = useState<"idle" | "saving" | "saved">("idle");
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [questionDraft, setQuestionDraft] = useState("");
  const [answersDraft, setAnswersDraft] = useState({ A: "", B: "", C: "", D: "" });
  const [savingQuestion, setSavingQuestion] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  // Reset drafts when question changes
  useEffect(() => {
    setChapterDraft("");
    setSavingChapter("idle");
    setEditingQuestion(false);
    setQuestionDraft("");
    setAnswersDraft({ A: "", B: "", C: "", D: "" });
    setEditingExplanation(false);
  }, [index]);

  const isSimulation = mode === "simulation";
  const isExam = mode === "exam";

  // Timer for exam mode (count up)
  useEffect(() => {
    if (mode !== "exam") return;
    setTimerSeconds(0);
    const interval = setInterval(() => setTimerSeconds((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [mode]);

  // Timer for simulation mode (countdown from 3 hours)
  useEffect(() => {
    if (!isSimulation) return;
    setSimTimerSeconds(3 * 60 * 60);
    const interval = setInterval(
      () =>
        setSimTimerSeconds((p) => {
          if (p <= 0) return 0;
          return p - 1;
        }),
      1000,
    );
    return () => clearInterval(interval);
  }, [isSimulation]);

  if (!quiz.length) return null;

  const qData = quiz[index];
  const serialNumber = qData[KEYS.ID];
  const questionId = qData[KEYS.REF_ID];
  const savedAns = answers[index];
  const savedConfidence = confidence[index];
  const correctAns = qData[KEYS.CORRECT];
  const isPracticeRevealed = mode === "practice" && savedAns !== null && savedConfidence !== null;
  const isReviewMode = mode === "review";
  const showFeedback = !isSimulation && (isPracticeRevealed || isReviewMode);

  const isFav = progress.favorites.includes(serialNumber);
  const noteText = progress.notes[serialNumber] || "";
  const rating = progress.ratings[serialNumber];
  const tags = progress.tags[serialNumber] || [];

  const needsConfidence = mode === "practice" && savedAns !== null && savedConfidence === null;

  // ── Explanation parsing ──
  const rawExp = qData[KEYS.EXPLANATION] || "";
  const { titles: expTitles, html: expHtml } = parseExplanation(rawExp);
  const expParts = splitSections(expHtml);
  const explanationSections =
    expParts.length > 0
      ? expParts.map((content, i) => ({ content, title: expTitles[i] || null }))
      : [{ content: rawExp || "אין הסבר", title: null }];

  /** Enter explanation edit mode — parses existing data */
  const enterExplanationEdit = () => {
    const raw = qData[KEYS.EXPLANATION] || "";
    const { titles, html } = parseExplanation(raw);
    setExplanationDraft(html);
    setSectionTitleDrafts(splitSections(html).map((_, i) => titles[i] || ""));
    setEditingExplanation(true);
  };

  const handleAnswer = (opt: string) => {
    if (isPracticeRevealed || isReviewMode) return;
    if (isSimulation && savedAns !== null) return;
    setAnswer(index, opt);
    if (isSimulation || isExam) return;
  };

  const handleConfidenceSelect = (level: ConfidenceLevel) => {
    if (mode !== "practice" || savedAns === null) return;
    setConfidence(index, level);
    const isCorrect = savedAns === correctAns;
    updateHistory(serialNumber, isCorrect, qData[KEYS.TOPIC]);
    updateSpacedRepetition(serialNumber, isCorrect, level, qData[KEYS.TOPIC]);
  };

  const handleNext = () => {
    if (index < quiz.length - 1) {
      setSessionIndex(index + 1);
      mainRef.current?.scrollTo(0, 0);
    } else {
      clearSavedSession();
      if (isReviewMode) navigate("results");
      else if (isSimulation) navigate("results");
      else navigate("review");
    }
  };

  const handlePrev = () => {
    if (index > 0) {
      setSessionIndex(index - 1);
      mainRef.current?.scrollTo(0, 0);
    }
  };

  const handleSkip = () => {
    skipQuestion(index);
    if (index < quiz.length - 1) {
      setSessionIndex(index + 1);
      mainRef.current?.scrollTo(0, 0);
    } else {
      if (isSimulation) navigate("results");
      else navigate("review");
    }
  };

  const handleExit = () => {
    if (isReviewMode) {
      navigate("results");
      return;
    }
    setShowExitDialog(true);
  };

  const handleSaveAndExit = async () => {
    await saveSessionToDb(timerSeconds, simTimerSeconds);
    toast({ title: "הסשן נשמר ✅", description: "תוכל להמשיך מאוחר יותר מדף הבית." });
    setShowExitDialog(false);
    navigate("home");
  };

  const handleExitWithoutSaving = () => {
    clearSavedSession();
    setShowExitDialog(false);
    navigate("home");
  };

  const handleSubmitSimulation = () => {
    quiz.forEach((q, i) => {
      const userAns = answers[i];
      if (userAns) {
        const isCorrect = userAns === q[KEYS.CORRECT];
        updateHistory(q[KEYS.ID], isCorrect, q[KEYS.TOPIC]);
      }
    });
    clearSavedSession();
    navigate("results");
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    addTag(serialNumber, tagInput.trim());
    setTagInput("");
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)
      .toString()
      .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const formatCountdown = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const getOptionClasses = (opt: string) => {
    let base = "w-full text-right p-5 rounded-xl border transition relative flex items-center group backdrop-blur-sm ";

    if (isSimulation) {
      if (savedAns === opt)
        return base + "bg-primary/10 border-primary ring-1 ring-primary/30 shadow-[0_0_15px_hsl(25_95%_53%/0.1)]";
      return base + "bg-white/[0.03] border-border hover:border-primary/30 hover:bg-white/[0.06]";
    }

    if (isReviewMode) {
      if (opt === correctAns)
        return base + "bg-success/10 border-success/30 text-success shadow-[0_0_15px_hsl(160_84%_39%/0.1)]";
      if (opt === savedAns && savedAns !== correctAns)
        return base + "bg-destructive/10 border-destructive/30 text-destructive shadow-[0_0_15px_hsl(0_72%_51%/0.1)]";
      return base + "opacity-60 bg-muted border-border";
    }

    if (isPracticeRevealed) {
      if (opt === correctAns)
        return base + "bg-success/10 border-success/30 text-success shadow-[0_0_15px_hsl(160_84%_39%/0.1)]";
      if (opt === savedAns)
        return base + "bg-destructive/10 border-destructive/30 text-destructive shadow-[0_0_15px_hsl(0_72%_51%/0.1)]";
      return base + "opacity-50 border-border";
    }

    if (savedAns === opt)
      return base + "bg-primary/10 border-primary ring-1 ring-primary/30 shadow-[0_0_15px_hsl(25_95%_53%/0.1)]";
    return base + "bg-white/[0.03] border-border hover:border-primary/30 hover:bg-white/[0.06]";
  };

  const progressPercent = ((index + 1) / quiz.length) * 100;

  return (
    <div className="w-full pb-24" ref={mainRef} style={{ minHeight: "60vh" }}>
      {/* ── Unified Top Bar: Progress + Counter + Timer ── */}
      <div className="glass-card rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
                isSimulation
                  ? "bg-primary/10 text-primary border-primary/20"
                  : mode === "practice"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : isExam
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "bg-warning/10 text-warning border-warning/20"
              }`}
            >
              {isSimulation ? "סימולציה" : mode === "practice" ? "תרגול" : isExam ? "בחינה" : "תחקור"}
            </span>
            {(isExam || isSimulation) && (
              <button
                onClick={() => toggleFlag(index)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition border ${
                  flagged.has(index)
                    ? "bg-warning/10 text-warning border-warning/30"
                    : "bg-card text-muted-foreground border-border hover:text-warning"
                }`}
              >
                <Flag className="w-3 h-3" />
              </button>
            )}
          </div>

          <span className="text-foreground text-sm font-bold matrix-text">
            {index + 1} / {quiz.length}
          </span>

          <div className="flex items-center gap-3">
            {isSimulation && (
              <span
                className={`text-xs font-mono font-bold px-3 py-1.5 rounded-lg border ${
                  simTimerSeconds < 600
                    ? "bg-destructive/10 text-destructive border-destructive/20 animate-pulse"
                    : "bg-card text-success border-border"
                }`}
              >
                ⏱ {formatCountdown(simTimerSeconds)}
              </span>
            )}
            {isExam && (
              <span className="bg-card text-success text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-border">
                {formatTime(timerSeconds)}
              </span>
            )}
            <button
              onClick={handleExit}
              className="text-muted-foreground hover:text-destructive text-sm font-medium px-2 py-1 rounded-lg hover:bg-destructive/10 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
          <motion.div
            className="bg-primary h-full rounded-full shadow-[0_0_8px_hsl(25_95%_53%/0.4)]"
            layout
            style={{ width: `${progressPercent}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>
      </div>

      {/* ── Question Card ── */}
      <div className="glass-card rounded-xl overflow-hidden relative">
        {/* Topic Badge */}
        <div className="px-8 pt-6 pb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="bg-primary/15 text-primary text-xs font-bold px-4 py-1.5 rounded-full border border-primary/20 uppercase tracking-wide">
              {qData[KEYS.CHAPTER] ? getChapterDisplay(qData[KEYS.CHAPTER]) : qData[KEYS.TOPIC] || "General"}
            </span>
            <span className="text-muted-foreground text-xs font-medium bidi-text">
              שאלה {questionId} (#{serialNumber})
            </span>
            {qData[KEYS.YEAR] && qData[KEYS.YEAR] !== "N/A" && (
              <span className="text-muted-foreground text-xs">📅 {qData[KEYS.YEAR]}</span>
            )}
            {qData[KEYS.SOURCE] && qData[KEYS.SOURCE] !== "N/A" && (
              <span className="text-muted-foreground text-xs">🏛 {qData[KEYS.SOURCE]}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCalcOpen(true)}
              className="text-muted-foreground hover:text-primary transition flex items-center gap-1.5 text-xs font-bold bg-muted px-3 py-1.5 rounded-lg hover:bg-primary/10 border border-border"
              title="Formula Calculator"
            >
              <Calculator className="w-3.5 h-3.5" /> Σ
            </button>
            <button onClick={() => toggleFavorite(serialNumber)} className="transition">
              <Star
                className={`w-5 h-5 ${isFav ? "fill-warning text-warning" : "text-muted-foreground hover:text-warning"}`}
              />
            </button>
          </div>
        </div>

        {/* Question Text */}
        <div className="p-8 md:p-10">
          <div className="flex items-start gap-2 mb-8">
            {editingQuestion ? (
              <div className="w-full space-y-4">
                <RichTextEditor
                  content={questionDraft}
                  onChange={setQuestionDraft}
                  placeholder="טקסט השאלה..."
                  minHeight="80px"
                />
                <div className="space-y-3">
                  {(["A", "B", "C", "D"] as const).map((opt) => (
                    <div key={opt} className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-muted text-muted-foreground font-bold flex items-center justify-center text-sm shrink-0">
                        {opt}
                      </span>
                      <input
                        type="text"
                        value={answersDraft[opt]}
                        onChange={(e) => setAnswersDraft((prev) => ({ ...prev, [opt]: e.target.value }))}
                        dir="rtl"
                        className="flex-grow bg-muted border border-border rounded-xl px-4 py-3 text-foreground text-base outline-none focus:border-primary"
                        placeholder={`תשובה ${opt}...`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingQuestion(false)}
                    className="px-4 py-2 text-xs font-bold text-muted-foreground bg-muted border border-border rounded-lg hover:bg-muted/80 transition"
                  >
                    ביטול
                  </button>
                  <button
                    disabled={savingQuestion}
                    onClick={async () => {
                      setSavingQuestion(true);
                      const { error } = await supabase
                        .from("questions")
                        .update({
                          question: questionDraft,
                          a: answersDraft.A,
                          b: answersDraft.B,
                          c: answersDraft.C,
                          d: answersDraft.D,
                          manually_edited: true,
                        })
                        .eq("id", serialNumber);
                      setSavingQuestion(false);
                      if (error) {
                        toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" });
                      } else {
                        (qData as any)[KEYS.QUESTION] = questionDraft;
                        (qData as any)[KEYS.A] = answersDraft.A;
                        (qData as any)[KEYS.B] = answersDraft.B;
                        (qData as any)[KEYS.C] = answersDraft.C;
                        (qData as any)[KEYS.D] = answersDraft.D;
                        invalidateQuestions();
                        setEditingQuestion(false);
                        toast({ title: "השאלה עודכנה ✅" });
                      }
                    }}
                    className="px-4 py-2 text-xs font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition disabled:opacity-50"
                  >
                    {savingQuestion ? "..." : "שמור"}
                  </button>
                </div>
              </div>
            ) : (
              <>
              <div className="text-foreground text-xl md:text-2xl leading-snug font-bold flex-grow">
                  <SmartContent text={qData[KEYS.QUESTION]} inheritSize />
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setQuestionDraft(qData[KEYS.QUESTION]);
                      setAnswersDraft({
                        A: qData[KEYS.A] || "",
                        B: qData[KEYS.B] || "",
                        C: qData[KEYS.C] || "",
                        D: qData[KEYS.D] || "",
                      });
                      setEditingQuestion(true);
                    }}
                    className="text-muted-foreground hover:text-primary transition p-1 rounded-md hover:bg-primary/10 shrink-0 mt-1"
                    title="ערוך שאלה ותשובות"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Media */}
          {qData[KEYS.MEDIA_LINK] && qData[KEYS.MEDIA_LINK] !== "nan" && (
            <div className="mb-6">
              {qData[KEYS.MEDIA_LINK].match(/\.(jpeg|jpg|gif|png)$/i) ? (
                <img src={qData[KEYS.MEDIA_LINK]} className="max-h-80 object-contain rounded-lg" alt="Question media" />
              ) : (
                <a
                  href={qData[KEYS.MEDIA_LINK]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline font-medium"
                >
                  פתח קובץ מצורף
                </a>
              )}
            </div>
          )}

          {/* Hidden Image Infrastructure — ready for future backend */}
          {false && (
            <div className="mb-6 glass-card rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-3">
                <ImageIcon className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-foreground">CRITICAL VISUALS</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="bg-muted rounded-lg aspect-video flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-center">Image caption 1</p>
                </div>
                <div>
                  <div className="bg-muted rounded-lg aspect-video flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-center">Image caption 2</p>
                </div>
              </div>
            </div>
          )}

          {/* Options */}
          {!editingQuestion && (
            <div className="space-y-4">
              {(["A", "B", "C", "D"] as const).map((opt) => {
                const text = qData[KEYS[opt]];
                if (!text) return null;
                return (
                  <button
                    key={opt}
                    onClick={() => handleAnswer(opt)}
                    disabled={isPracticeRevealed || isReviewMode || (isSimulation && savedAns !== null)}
                    className={getOptionClasses(opt)}
                  >
                    <span className="w-9 h-9 rounded-full bg-muted text-muted-foreground font-bold flex items-center justify-center ml-4 text-sm group-hover:bg-primary/10 group-hover:text-primary transition-colors shrink-0">
                      {opt}
                    </span>
                    <span className="flex-grow text-foreground text-lg font-light leading-snug bidi-text">{text}</span>
                    {!isSimulation && (isPracticeRevealed || isReviewMode) && opt === correctAns && (
                      <span className="absolute left-5 text-success text-xl">✓</span>
                    )}
                    {!isSimulation &&
                      (isPracticeRevealed || isReviewMode) &&
                      opt === savedAns &&
                      opt !== correctAns && <span className="absolute left-5 text-destructive text-xl">✗</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Confidence Tracker - Segmented Control */}
          {needsConfidence && (
            <div className="mt-8">
              <p className="text-sm font-bold text-muted-foreground mb-3 text-center">עד כמה אתה בטוח בתשובה?</p>
              <div className="flex rounded-xl overflow-hidden border border-border bg-muted/50">
                {(
                  [
                    {
                      level: "confident" as ConfidenceLevel,
                      label: "בטוח",
                      color: "bg-success/20 text-success border-success/30",
                    },
                    {
                      level: "hesitant" as ConfidenceLevel,
                      label: "מתלבט",
                      color: "bg-warning/20 text-warning border-warning/30",
                    },
                    {
                      level: "guessed" as ConfidenceLevel,
                      label: "ניחוש",
                      color: "bg-destructive/20 text-destructive border-destructive/30",
                    },
                  ] as const
                ).map(({ level, label, color }, i) => (
                  <button
                    key={level}
                    onClick={() => handleConfidenceSelect(level)}
                    className={`flex-1 py-3.5 text-sm font-bold transition-all ${
                      i < 2 ? "border-l border-border" : ""
                    } hover:${color} text-muted-foreground hover:text-foreground`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Metadata: Notes, Rating, Tags — hide in simulation */}
          {!isSimulation && (
            <div className="mt-8 pt-6 border-t border-border space-y-4">
              {/* Rating */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground ml-2">דרגת קושי:</span>
                {(["easy", "medium", "hard"] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setRating(serialNumber, level)}
                    className={`rating-btn px-4 py-2 rounded-xl text-xs font-bold ${
                      level === "easy"
                        ? "bg-success/10 text-success"
                        : level === "medium"
                          ? "bg-warning/10 text-warning"
                          : "bg-destructive/10 text-destructive"
                    } ${rating === level ? "active" : ""}`}
                  >
                    {level === "easy" ? "קל 🟢" : level === "medium" ? "בינוני 🟡" : "קשה 🔴"}
                  </button>
                ))}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  <Tag className="w-3 h-3 inline" /> תגיות:
                </span>
                {tags.map((tag) => (
                  <div
                    key={tag}
                    className="tag-chip bg-muted text-foreground px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 border border-border"
                  >
                    {tag}
                    <X
                      className="w-3 h-3 cursor-pointer hover:text-destructive"
                      onClick={() => removeTag(serialNumber, tag)}
                    />
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                    placeholder="תגית חדשה..."
                    className="px-3 py-1 bg-muted border border-border rounded-full text-xs outline-none focus:border-primary w-28 text-foreground"
                  />
                  <button onClick={handleAddTag} className="text-primary hover:text-primary/80 transition">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Note */}
              <div>
                <button
                  onClick={() => setShowNote(!showNote)}
                  className="text-xs font-bold text-primary flex items-center gap-2 hover:underline"
                >
                  <StickyNote className="w-3 h-3" />
                  {noteText ? "ערוך הערה אישית (קיים)" : "הוסף הערה אישית"}
                </button>
                {showNote && (
                  <div className="mt-2">
                    <RichTextEditor
                      content={noteText}
                      onChange={(html) => saveNote(serialNumber, html)}
                      placeholder="הקלד הערה..."
                      minHeight="80px"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Feedback Section ── */}
        {showFeedback && (
          <div className="border-t border-border p-5 md:p-10 space-y-6 bg-muted/20">
            {/* (1) Correct/Wrong indicator */}
            <div className="font-bold text-lg flex items-center gap-2 flex-wrap">
              {savedAns === correctAns ? (
                <span className="text-success flex items-center gap-2">✅ יפה מאוד! — <span className="font-extrabold">{qData[KEYS[correctAns as keyof typeof KEYS]] || correctAns}</span></span>
              ) : (
                <span className="text-destructive flex items-center gap-2">❌ התשובה הנכונה היא: <span className="font-extrabold">{qData[KEYS[correctAns as keyof typeof KEYS]] || correctAns}</span></span>
              )}
              {isAdmin && !editingCorrectAnswer && (
                <button
                  onClick={() => {
                    setCorrectAnswerDraft(correctAns);
                    setEditingCorrectAnswer(true);
                  }}
                  className="text-muted-foreground hover:text-primary transition p-1 rounded-md hover:bg-primary/10"
                  title="ערוך תשובה נכונה"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Admin: edit correct answer */}
            {editingCorrectAnswer && (
              <div className="p-4 bg-muted/50 rounded-xl border border-border space-y-3">
                <p className="text-sm font-bold text-foreground">שנה תשובה נכונה:</p>
                <div className="flex gap-2">
                  {(["A", "B", "C", "D"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setCorrectAnswerDraft(opt)}
                      className={`w-10 h-10 rounded-lg font-bold text-sm border transition ${
                        correctAnswerDraft === opt
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-primary/30"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {showConfirmSave ? (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg space-y-2">
                    <p className="text-xs font-bold text-destructive">
                      ⚠️ שינוי התשובה הנכונה ישפיע על כל המשתמשים. להמשיך?
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => {
                          setShowConfirmSave(false);
                          setEditingCorrectAnswer(false);
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-muted-foreground bg-muted border border-border rounded-lg hover:bg-muted/80 transition"
                      >
                        ביטול
                      </button>
                      <button
                        disabled={savingCorrectAnswer}
                        onClick={async () => {
                          setSavingCorrectAnswer(true);
                          const { error } = await supabase
                            .from("questions")
                            .update({ correct: correctAnswerDraft, manually_edited: true })
                            .eq("id", serialNumber);
                          setSavingCorrectAnswer(false);
                          if (error) {
                            toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" });
                          } else {
                            qData[KEYS.CORRECT] = correctAnswerDraft;
                            invalidateQuestions();
                            setEditingCorrectAnswer(false);
                            setShowConfirmSave(false);
                            toast({ title: "התשובה הנכונה עודכנה ✅" });
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-destructive-foreground bg-destructive rounded-lg hover:opacity-90 transition disabled:opacity-50"
                      >
                        {savingCorrectAnswer ? "..." : "אישור שמירה"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingCorrectAnswer(false)}
                      className="px-4 py-2 text-xs font-bold text-muted-foreground bg-muted border border-border rounded-lg hover:bg-muted/80 transition"
                    >
                      ביטול
                    </button>
                    <button
                      onClick={() => {
                        if (correctAnswerDraft !== correctAns) {
                          setShowConfirmSave(true);
                        } else {
                          setEditingCorrectAnswer(false);
                        }
                      }}
                      className="px-4 py-2 text-xs font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition"
                    >
                      שמור
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-border" />

            {/* (2) Explanation */}
            {editingExplanation ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-medium text-foreground flex items-center gap-2">
                    💡 עריכת הסבר:
                  </strong>
                  <button
                    onClick={() => {
                      const newHtml = explanationDraft + "\n<hr>\n";
                      setExplanationDraft(newHtml);
                      const newSections = splitSections(newHtml);
                      setSectionTitleDrafts(newSections.map((_, i) => sectionTitleDrafts[i] || ""));
                      toast({ title: "נוסף מפריד ✂️", description: "הוסף כותרת לחלק החדש למטה" });
                    }}
                    className="text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition border border-primary/20"
                  >
                    ✂️ פצל לחלונות
                  </button>
                </div>

                <RichTextEditor content={explanationDraft} onChange={setExplanationDraft} minHeight="120px" />

                {/* Section title inputs — shown only when there are multiple sections */}
                {splitSections(explanationDraft).length > 1 && (
                  <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-2">
                    <p className="text-xs font-bold text-muted-foreground">כותרות חלקים (אופציונלי):</p>
                    {splitSections(explanationDraft).map((_, i) => {
                      const isLastSection = i === splitSections(explanationDraft).length - 1;
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span
                            className="text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                            style={{
                              background: ["#f97316", "#eab308", "#3b82f6", "#a855f7", "#10b981"][i % 5] + "22",
                              color: ["#f97316", "#eab308", "#3b82f6", "#a855f7", "#10b981"][i % 5],
                            }}
                          >
                            {i + 1}
                          </span>
                          <input
                            type="text"
                            value={sectionTitleDrafts[i] || ""}
                            onChange={(e) =>
                              setSectionTitleDrafts((prev) => {
                                const next = [...prev];
                                next[i] = e.target.value;
                                return next;
                              })
                            }
                            placeholder={isLastSection ? "סיכום — מוצג רוחב מלא..." : `כותרת חלק ${i + 1}...`}
                            className="flex-grow px-3 py-1.5 text-xs bg-muted border border-border rounded-lg text-foreground outline-none focus:border-primary"
                            dir="auto"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingExplanation(false)}
                    className="px-4 py-2 text-xs font-bold text-muted-foreground bg-muted border border-border rounded-lg hover:bg-muted/80 transition"
                  >
                    ביטול
                  </button>
                  <button
                    disabled={savingExplanation}
                    onClick={async () => {
                      setSavingExplanation(true);
                      const currentSections = splitSections(explanationDraft);
                      const titlesToSave = currentSections.map((_, i) => sectionTitleDrafts[i] || "");
                      const toSave = serializeExplanation(explanationDraft, titlesToSave);
                      const { error } = await supabase
                        .from("questions")
                        .update({ explanation: toSave, manually_edited: true })
                        .eq("id", serialNumber);
                      setSavingExplanation(false);
                      if (error) {
                        toast({ title: "שגיאה בשמירה", description: error.message, variant: "destructive" });
                      } else {
                        qData[KEYS.EXPLANATION] = toSave;
                        invalidateQuestions();
                        setEditingExplanation(false);
                        toast({ title: "ההסבר עודכן ✅" });
                      }
                    }}
                    className="px-4 py-2 text-xs font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition disabled:opacity-50"
                  >
                    {savingExplanation ? "..." : "שמור"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {explanationSections.length === 1 ? (
                  /* ── Single section: original style ── */
                  <div className="glass-card rounded-xl p-6 border border-border">
                    <div className="flex items-center gap-2 mb-3">
                      <Lightbulb className="w-4 h-4 text-primary" />
                      <strong className="text-sm font-medium text-foreground">הסבר:</strong>
                      {isAdmin && (
                        <button
                          onClick={enterExplanationEdit}
                          className="text-muted-foreground hover:text-primary transition p-1 rounded-md hover:bg-primary/10"
                          title="ערוך הסבר"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <SmartContent text={explanationSections[0].content} />
                  </div>
                ) : (
                  /* ── Multiple sections: smart grid layout ── */
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {explanationSections.map((section, i) => {
                        const isLast = i === explanationSections.length - 1;
                        const nonLastCount = explanationSections.length - 1;
                        // If odd number of non-last sections, first one gets full width
                        const isAloneInRow = !isLast && nonLastCount % 2 === 1 && i === 0;
                        const isFullWidth = isLast || isAloneInRow;
                        const color = SECTION_COLORS[i % SECTION_COLORS.length];

                        return (
                          <div
                            key={i}
                            className={`glass-card rounded-xl border overflow-hidden ${color.border} ${
                              isFullWidth ? "md:col-span-2" : ""
                            } ${isLast ? "ring-1 ring-primary/20" : ""}`}
                          >
                            {section.title && (
                              <div className={`flex items-center gap-2 px-4 py-2.5 ${color.header}`}>
                                <h4 className="font-bold text-xs uppercase tracking-widest">{section.title}</h4>
                              </div>
                            )}
                            <div className={`p-5 ${isLast ? "bg-primary/5" : ""}`}>
                              <SmartContent text={section.content} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={enterExplanationEdit}
                        className="text-xs font-bold text-primary flex items-center gap-1.5 hover:underline mt-2"
                      >
                        <Pencil className="w-3 h-3" /> ערוך הסבר
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            <div className="border-t border-border" />

            {/* (3) Source citations */}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`https://www.google.com/search?q=Miller's+Anesthesia+10th+edition+page+${qData[KEYS.MILLER]}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground bg-muted hover:bg-muted/80 px-4 py-2 rounded-full font-medium transition flex items-center gap-2 w-fit border border-border"
              >
                <BookOpen className="w-3 h-3" /> Miller Page: {qData[KEYS.MILLER]}
              </a>

              {/* Admin inline chapter editor */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">פרק:</span>
                  <input
                    type="text"
                    value={chapterDraft || String(qData[KEYS.CHAPTER] || "")}
                    onChange={(e) => {
                      setChapterDraft(e.target.value);
                      setSavingChapter("idle");
                    }}
                    onFocus={() => {
                      if (!chapterDraft) setChapterDraft(String(qData[KEYS.CHAPTER] || ""));
                    }}
                    onBlur={async () => {
                      if (!chapterDraft || chapterDraft === String(qData[KEYS.CHAPTER] || "")) return;
                      const { valid } = resolveChapterName(chapterDraft);
                      if (!valid) return;
                      setSavingChapter("saving");
                      const chapterVal = chapterDraft.trim().toUpperCase() === "ACLS" ? 0 : parseInt(chapterDraft, 10);
                      const chapterName = MILLER_CHAPTERS[chapterVal] || "";
                      const { error } = await supabase
                        .from("questions")
                        .update({
                          chapter: chapterVal,
                          miller: String(chapterVal),
                          topic: chapterName,
                          manually_edited: true,
                        })
                        .eq("id", serialNumber);
                      if (!error) {
                        invalidateQuestions();
                        (qData as any)[KEYS.CHAPTER] = chapterVal;
                        (qData as any)[KEYS.MILLER] = String(chapterVal);
                        (qData as any)[KEYS.TOPIC] = chapterName;
                        setSavingChapter("saved");
                        setChapterDraft("");
                        setTimeout(() => setSavingChapter("idle"), 2000);
                      } else {
                        setSavingChapter("idle");
                        toast({ title: "שגיאה בשמירת פרק", description: error.message, variant: "destructive" });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="w-16 px-2 py-1 text-xs bg-muted border border-border rounded-lg text-foreground outline-none focus:border-primary text-center"
                    placeholder="#"
                  />
                  {chapterDraft &&
                    (() => {
                      const { valid, display } = resolveChapterName(chapterDraft);
                      return (
                        <span className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>
                          {display}
                        </span>
                      );
                    })()}
                  {savingChapter === "saved" && <Check className="w-3.5 h-3.5 text-success" />}
                </div>
              )}

              {/* Non-admin chapter display */}
              {!isAdmin && qData[KEYS.CHAPTER] ? (
                <span className="text-xs text-muted-foreground bg-muted px-4 py-2 rounded-full font-medium border border-border">
                  📖 {getChapterDisplay(qData[KEYS.CHAPTER])}
                </span>
              ) : null}

              {/* Global question success rate */}
              <GlobalQuestionStats questionId={serialNumber} />
            </div>

            <div className="border-t border-border" />

            {/* (4) Community comments */}
            <CommunityNotes questionId={serialNumber} />
          </div>
        )}

        {/* ── Bottom Navigation ── */}
        <div className="border-t border-border p-5 flex justify-between items-center sticky bottom-0 z-10 bg-card/80 backdrop-blur-md rounded-b-xl">
          <button
            onClick={handlePrev}
            className={`text-muted-foreground hover:text-foreground px-4 py-2.5 font-medium transition flex items-center gap-2 rounded-xl hover:bg-muted ${index === 0 ? "invisible" : ""}`}
          >
            <ChevronRight className="w-4 h-4" /> הקודם
          </button>

          <div className="flex items-center gap-3">
            {!isReviewMode && !isSimulation && (
              <button
                onClick={handleSkip}
                className="text-muted-foreground hover:text-foreground text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-muted transition tracking-wider uppercase"
              >
                דלג <SkipForward className="w-3 h-3 inline mr-1" />
              </button>
            )}
            {mode === "practice" && !isReviewMode && (
              <button
                onClick={() => toggleFlag(index)}
                className={`px-3 py-2.5 rounded-xl flex items-center gap-1.5 text-xs font-bold transition border ${
                  flagged.has(index)
                    ? "bg-warning/10 text-warning border-warning/30"
                    : "text-muted-foreground border-border hover:text-warning hover:bg-warning/10"
                }`}
              >
                <Flag className="w-3 h-3" /> סמן
              </button>
            )}
            {isSimulation && index === quiz.length - 1 && (
              <button
                onClick={handleSubmitSimulation}
                className="bg-destructive text-destructive-foreground px-6 py-3 rounded-xl font-bold shadow-lg transition flex items-center gap-2"
              >
                <Send className="w-4 h-4" /> הגש מבחן
              </button>
            )}
          </div>

          <button
            onClick={handleNext}
            disabled={needsConfidence}
            className={`bg-primary text-primary-foreground px-8 py-3 rounded-xl hover:opacity-90 font-bold shadow-lg transition flex items-center gap-2 text-base ${
              needsConfidence ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {index === quiz.length - 1 ? (isReviewMode ? "סיים תחקור" : isSimulation ? "הבא" : "סיום וסיכום") : "הבא"}
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      <FormulaCalculatorPanel open={calcOpen} onClose={() => setCalcOpen(false)} />

      {/* Exit Dialog */}
      {showExitDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="liquid-glass max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-foreground text-center">לצאת מהסשן?</h3>
            <p className="text-sm text-muted-foreground text-center">
              תוכל לשמור את ההתקדמות ולהמשיך מאוחר יותר, או לצאת בלי לשמור.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSaveAndExit}
                className="w-full bg-primary text-primary-foreground px-5 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition"
              >
                💾 שמור וצא
              </button>
              <button
                onClick={handleExitWithoutSaving}
                className="w-full bg-destructive/15 text-destructive px-5 py-3 rounded-xl font-bold text-sm hover:bg-destructive/25 transition"
              >
                🚪 צא בלי לשמור
              </button>
              <button
                onClick={() => setShowExitDialog(false)}
                className="w-full text-muted-foreground px-5 py-3 rounded-xl text-sm hover:bg-muted transition"
              >
                ביטול — המשך לתרגל
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
