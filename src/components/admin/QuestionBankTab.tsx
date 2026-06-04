import { useState } from "react";
import { Sparkles, Send, Eraser, Check, X, FilePlus2, Bot, PenLine } from "lucide-react";
import { toast } from "sonner";
import { TOPIC_CATALOG } from "@/data/cohortMockData";
import { aiDraftForTopic, SEED_QUEUE, type AnswerKey, type BankQuestion } from "@/lib/questionBank";

/**
 * Admin · Question Bank — DEMO MOCKUP.
 * Two ways a question enters the bank: an expert authors one by hand, OR the
 * "נסח עם AI" button drafts one (mock for the NotebookLM → Anthropic pipeline).
 * Everything queues for senior review before going live. Frontend-only; no
 * Supabase writes. Real wiring is P3.
 */
const ANSWER_LABELS: Record<AnswerKey, string> = { a: "א", b: "ב", c: "ג", d: "ד" };
const DIFFICULTY = [
  { id: "easy", label: "קל" },
  { id: "medium", label: "בינוני" },
  { id: "hard", label: "קשה" },
] as const;

const statusStyle: Record<BankQuestion["status"], { label: string; cls: string }> = {
  draft: { label: "טיוטה", cls: "bg-muted text-muted-foreground" },
  review: { label: "בבדיקה", cls: "bg-warning/15 text-warning" },
  approved: { label: "אושר", cls: "bg-success/15 text-success" },
};

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none";

export default function QuestionBankTab() {
  const [topic, setTopic] = useState(TOPIC_CATALOG[0].topic);
  const selectedTopic = TOPIC_CATALOG.find((t) => t.topic === topic) ?? TOPIC_CATALOG[0];
  const [chapter, setChapter] = useState<number>(selectedTopic.chapters[0].chapter);
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTY)[number]["id"]>("medium");
  const [question, setQuestion] = useState("");
  const [opts, setOpts] = useState({ a: "", b: "", c: "", d: "" });
  const [correct, setCorrect] = useState<AnswerKey>("a");
  const [explanation, setExplanation] = useState("");
  const [source, setSource] = useState<"manual" | "ai">("manual");
  const [queue, setQueue] = useState<BankQuestion[]>(SEED_QUEUE);

  const onTopicChange = (next: string) => {
    setTopic(next);
    const tc = TOPIC_CATALOG.find((t) => t.topic === next);
    if (tc) setChapter(tc.chapters[0].chapter);
  };

  const draftWithAI = () => {
    const d = aiDraftForTopic(topic, chapter);
    setQuestion(d.question);
    setOpts({ a: d.a, b: d.b, c: d.c, d: d.d });
    setCorrect(d.correct);
    setExplanation(d.explanation);
    setChapter(d.chapter);
    setSource("ai");
    toast.success("AI ניסח טיוטה — עברו, ערכו ושלחו לאישור");
  };

  const clearForm = () => {
    setQuestion("");
    setOpts({ a: "", b: "", c: "", d: "" });
    setCorrect("a");
    setExplanation("");
    setSource("manual");
  };

  const submit = () => {
    if (!question.trim()) return toast.error("יש לכתוב גזע שאלה");
    if (!opts.a.trim() || !opts.b.trim() || !opts.c.trim() || !opts.d.trim())
      return toast.error("יש למלא את כל ארבע התשובות");
    const item: BankQuestion = {
      id: `q-${Date.now()}`,
      question,
      ...opts,
      correct,
      explanation,
      topic,
      chapter,
      status: "review",
      author: "sandbox@exam.dev",
      source,
    };
    setQueue([item, ...queue]);
    clearForm();
    toast.success("נשלח לתור האישור");
  };

  const setStatus = (id: string, status: BankQuestion["status"]) =>
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, status } : it)));
  const reject = (id: string) => setQueue((q) => q.filter((it) => it.id !== id));

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="bg-primary/15 text-primary p-2.5 rounded-xl">
            <FilePlus2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">בנק שאלות</h2>
            <p className="text-xs text-muted-foreground">כתיבת שאלה ידנית או ניסוח עם AI → תור אישור</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-warning/15 text-warning border border-warning/20">
          מוקאפ · נתוני דוגמה
        </span>
      </div>

      {/* Authoring form */}
      <div className="glass-card rounded-2xl p-5 border border-border flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-foreground">שאלה חדשה</h3>
          <button
            onClick={draftWithAI}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-3.5 h-3.5" /> נסח עם AI
          </button>
        </div>

        {/* Topic / chapter / difficulty */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-muted-foreground">נושא</label>
            <select value={topic} onChange={(e) => onTopicChange(e.target.value)} className={field}>
              {TOPIC_CATALOG.map((t) => (
                <option key={t.topic} value={t.topic}>
                  {t.topic}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">פרק (Miller)</label>
            <select value={chapter} onChange={(e) => setChapter(Number(e.target.value))} className={field}>
              {selectedTopic.chapters.map((c) => (
                <option key={c.chapter} value={c.chapter}>
                  {c.chapter} — {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">רמת קושי</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
              className={field}
            >
              {DIFFICULTY.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Stem */}
        <div>
          <label className="text-[11px] text-muted-foreground">גזע השאלה</label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            className={field}
            placeholder="כתבו את גזע השאלה, או לחצו ״נסח עם AI״…"
          />
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["a", "b", "c", "d"] as AnswerKey[]).map((k) => (
            <div key={k} className="flex items-center gap-2">
              <button
                onClick={() => setCorrect(k)}
                title="סמן כתשובה הנכונה"
                className={`w-7 h-7 shrink-0 rounded-lg text-xs font-bold transition-colors ${
                  correct === k
                    ? "bg-success text-success-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {ANSWER_LABELS[k]}
              </button>
              <input
                value={opts[k]}
                onChange={(e) => setOpts({ ...opts, [k]: e.target.value })}
                className={field}
                placeholder={`תשובה ${ANSWER_LABELS[k]}`}
              />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground -mt-1">לחצו על אות כדי לסמן את התשובה הנכונה (ירוק = נכון).</p>

        {/* Explanation */}
        <div>
          <label className="text-[11px] text-muted-foreground">הסבר</label>
          <textarea
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={2}
            className={field}
            placeholder="הסבר שמופיע למתמחה אחרי המענה…"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={clearForm}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <Eraser className="w-3.5 h-3.5" /> נקה
          </button>
          <button
            onClick={submit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Send className="w-3.5 h-3.5" /> שלח לאישור
          </button>
        </div>
      </div>

      {/* Review queue */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-foreground">תור אישור ({queue.length})</h3>
        {queue.map((q) => {
          const st = statusStyle[q.status];
          return (
            <div key={q.id} className="glass-card rounded-xl p-4 border border-border flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.cls}`}>{st.label}</span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {q.source === "ai" ? <Bot className="w-3 h-3" /> : <PenLine className="w-3 h-3" />}
                    {q.source === "ai" ? "AI" : "ידני"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    · {q.topic} · מילר {q.chapter}
                  </span>
                </div>
                {q.status !== "approved" && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setStatus(q.id, "approved")}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-success/15 text-success hover:bg-success/25 transition-colors"
                    >
                      <Check className="w-3 h-3" /> אשר
                    </button>
                    <button
                      onClick={() => reject(q.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      <X className="w-3 h-3" /> דחה
                    </button>
                  </div>
                )}
              </div>
              <p className="text-sm text-foreground leading-relaxed" style={{ unicodeBidi: "plaintext" }}>
                {q.question}
              </p>
              <div className="text-[11px] text-muted-foreground">
                תשובה נכונה: <span className="text-success font-bold">{ANSWER_LABELS[q.correct]}</span> · {q.author}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
