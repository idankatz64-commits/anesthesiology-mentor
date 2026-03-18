# פרומפטים ל-Lovable — AI Integration
# הדבק כל אחד בנפרד. המתן לסיום.

---

## ⚠️ חשוב מאוד — איפה לבדוק

**ה-Preview של Lovable (Editor) לא יעבוד לפיצ'רים האלה.**
ה-Preview רץ בסביבה מבודדת שחוסמת קריאות רשת לשרתים חיצוניים.
תמיד תקבל שם שגיאה "Failed to send a request" — זה לא באג בקוד.

**תבדוק תמיד מהאתר הפרוס: https://anesthesiology-mentor.lovable.app**
זו הסביבה האמיתית. שם זה יעבוד.

---

## פרומפט 1 — תיקון AIExplainDrawer ✅ כבר בוצע!

Replace the entire file `src/components/AIExplainDrawer.tsx` with this exact code:

```tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, Loader2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
  animating?: boolean;
}

interface AIExplainDrawerProps {
  open: boolean;
  onClose: () => void;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctAnswer: string;
  userAnswer: string | null;
  existingExplanation?: string;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export default function AIExplainDrawer({
  open, onClose, question, optionA, optionB, optionC, optionD,
  correctAnswer, userAnswer, existingExplanation,
}: AIExplainDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const buildInitialUserMessage = useCallback((): string => {
    const labels: Record<string, string> = { A: optionA, B: optionB, C: optionC, D: optionD };
    const correctLabel = labels[correctAnswer] || correctAnswer;
    const userLabel = userAnswer ? (labels[userAnswer] || userAnswer) : null;
    let msg = `שאלה:\n${question}\n\nאפשרויות:\nא. ${optionA}\nב. ${optionB}\nג. ${optionC}\nד. ${optionD}\n\nתשובה נכונה: ${correctAnswer}. ${correctLabel}`;
    if (userAnswer && userAnswer !== correctAnswer && userLabel) {
      msg += `\nהמשתמש ענה: ${userAnswer}. ${userLabel} (שגוי)`;
    } else if (userAnswer === correctAnswer) {
      msg += `\nהמשתמש ענה נכון.`;
    }
    if (existingExplanation) {
      const plain = stripHtml(existingExplanation);
      if (plain.length > 10) msg += `\n\nהסבר קיים:\n${plain.slice(0, 600)}`;
    }
    msg += `\n\nהסבר לי בפירוט: למה ${correctAnswer} נכון, ולמה כל אחת מהאפשרויות האחרות שגויה. תוסיף פנינות קליניות רלוונטיות.`;
    return msg;
  }, [question, optionA, optionB, optionC, optionD, correctAnswer, userAnswer, existingExplanation]);

  const animateText = useCallback((fullText: string, msgIndex: number) => {
    let i = 0;
    const step = () => {
      i += Math.ceil(fullText.length / 120);
      setMessages((prev) => {
        const next = [...prev];
        if (next[msgIndex]) next[msgIndex] = { ...next[msgIndex], content: fullText.slice(0, i), animating: i < fullText.length };
        return next;
      });
      if (i < fullText.length) animFrameRef.current = requestAnimationFrame(step);
    };
    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  const sendMessage = useCallback(async (msgs: Message[]) => {
    setLoading(true);
    setError(null);
    const placeholderIndex = msgs.length;
    setMessages((prev) => [...prev, { role: "assistant", content: "", animating: false }]);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("claude-ai", {
        body: { messages: msgs.map((m) => ({ role: m.role, content: m.content })) },
      });
      if (fnError) throw new Error(fnError.message || "שגיאה בקריאה לשרת");
      if (!data?.content) throw new Error("תגובה ריקה מהשרת");
      animateText(data.content, placeholderIndex);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [animateText]);

  useEffect(() => {
    if (!open) return;
    const userMsg: Message = { role: "user", content: buildInitialUserMessage() };
    setMessages([userMsg]);
    sendMessage([userMsg]);
    setTimeout(() => inputRef.current?.focus(), 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setMessages([]); setInput(""); setError(null);
    }
  }, [open]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    sendMessage(newMessages);
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-2xl flex flex-col" style={{ maxHeight: "80vh", height: "70vh" }}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-foreground">הסבר AI — Claude</p>
            <p className="text-xs text-muted-foreground">שאל כל שאלת המשך</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground hover:text-foreground">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && messages.length <= 1 && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="w-7 h-7 animate-spin text-violet-400" />
                <span className="text-xs">Claude חושב...</span>
              </div>
            </div>
          )}
          {messages.map((msg, i) => {
            if (i === 0 && msg.role === "user") return null;
            return (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-1 ml-2 shrink-0">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"}`}
                  dir="auto"
                >
                  {msg.content || (loading && i === messages.length - 1 ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground text-xs"><Loader2 className="w-3 h-3 animate-spin" /> כותב...</span>
                  ) : null)}
                  {msg.animating && <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse" />}
                </div>
              </div>
            );
          })}
          {error && <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl p-3 text-center">שגיאה: {error}</div>}
          <div ref={bottomRef} />
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border flex-shrink-0 bg-card/80 backdrop-blur-sm">
          <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="שאל שאלת המשך..." disabled={loading} dir="auto"
            className="flex-1 bg-muted border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary text-foreground placeholder:text-muted-foreground disabled:opacity-50 transition" />
          <button onClick={handleSend} disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition disabled:opacity-40 flex-shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </>
  );
}
```

---

## פרומפט 2 — הוסף את המאמן האישי לאפליקציה

Do ALL of the following in one step:

**Step A** — Create new file `src/lib/stats.ts`:

```ts
import { UserProgress, Question } from "./types";
import { LS_KEY } from "./types";

export interface TopicStat {
  topic: string;
  answered: number;
  correct: number;
  accuracy: number;
}

export interface UserStatsForCoach {
  totalAnswered: number;
  totalCorrect: number;
  overallAccuracy: number;
  topicStats: TopicStat[];
  weakTopics: TopicStat[];
  strongTopics: TopicStat[];
  neverAttempted: string[];
  totalQuestions: number;
  coveragePercent: number;
  examDaysLeft: number;
}

export function loadProgressFromStorage(): UserProgress | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProgress;
  } catch {
    return null;
  }
}

export function computeUserStats(progress: UserProgress, questions: Question[]): UserStatsForCoach {
  const history = progress.history ?? {};
  const topicByQuestionId: Record<string, string> = {};
  for (const q of questions) {
    if (q.id && q.topic) topicByQuestionId[q.id] = q.topic;
  }
  const topicMap: Record<string, { answered: number; correct: number }> = {};
  let totalAnswered = 0;
  let totalCorrect = 0;
  for (const [qId, entry] of Object.entries(history)) {
    if (!entry || entry.answered === 0) continue;
    totalAnswered += entry.answered;
    totalCorrect += entry.correct;
    const topic = topicByQuestionId[qId];
    if (!topic) continue;
    if (!topicMap[topic]) topicMap[topic] = { answered: 0, correct: 0 };
    topicMap[topic].answered += entry.answered;
    topicMap[topic].correct += entry.correct;
  }
  const topicStats: TopicStat[] = Object.entries(topicMap)
    .filter(([, v]) => v.answered >= 3)
    .map(([topic, v]) => ({ topic, answered: v.answered, correct: v.correct, accuracy: Math.round((v.correct / v.answered) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy);
  const weakTopics = topicStats.filter(t => t.answered >= 5 && t.accuracy < 60);
  const strongTopics = topicStats.filter(t => t.answered >= 5 && t.accuracy >= 80);
  const allTopics = new Set(questions.map(q => q.topic).filter(Boolean) as string[]);
  const neverAttempted = [...allTopics].filter(t => !topicMap[t]).sort();
  const uniqueAttempted = Object.keys(history).filter(id => (history[id]?.answered ?? 0) > 0).length;
  const examDate = new Date("2026-06-15");
  const examDaysLeft = Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86400000));
  return {
    totalAnswered, totalCorrect,
    overallAccuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
    topicStats, weakTopics, strongTopics, neverAttempted,
    totalQuestions: questions.length,
    coveragePercent: questions.length > 0 ? Math.round((uniqueAttempted / questions.length) * 100) : 0,
    examDaysLeft,
  };
}

export function formatStatsForClaude(stats: UserStatsForCoach): string {
  const lines: string[] = [];
  lines.push("=== נתוני ביצועים ===");
  lines.push(`שאלות שנענו: ${stats.totalAnswered} מתוך ${stats.totalQuestions} (${stats.coveragePercent}% כיסוי)`);
  lines.push(`דיוק כללי: ${stats.overallAccuracy}%`);
  lines.push(`ימים לבחינה: ${stats.examDaysLeft}`);
  lines.push("");
  if (stats.weakTopics.length > 0) {
    lines.push("=== נושאים חלשים (דיוק < 60%, מינימום 5 שאלות) ===");
    for (const t of stats.weakTopics.slice(0, 12)) lines.push(`• ${t.topic}: ${t.accuracy}% (${t.correct}/${t.answered})`);
    lines.push("");
  }
  if (stats.neverAttempted.length > 0) {
    lines.push(`=== נושאים שלא נוגעו כלל (${stats.neverAttempted.length}) ===`);
    lines.push(stats.neverAttempted.slice(0, 20).join(" | "));
    lines.push("");
  }
  if (stats.strongTopics.length > 0) {
    lines.push("=== נושאים חזקים (דיוק > 80%) ===");
    for (const t of stats.strongTopics.slice(0, 8)) lines.push(`• ${t.topic}: ${t.accuracy}% (${t.answered} שאלות)`);
    lines.push("");
  }
  lines.push("=== כל הנושאים (מהחלש לחזק) ===");
  for (const t of stats.topicStats) lines.push(`${t.topic}: ${t.accuracy}% | ${t.answered} שאלות`);
  return lines.join("\n");
}
```

**Step B** — Create new file `src/components/AICoachPanel.tsx`:

```tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Loader2, ChevronDown, Send, Dumbbell, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Question, UserProgress } from "@/lib/types";
import { computeUserStats, formatStatsForClaude } from "@/lib/stats";

const COACH_SYSTEM_PROMPT = `אתה מאמן לימוד אישי לשלב א' בהרדמה וטיפול נמרץ.
קיבלת נתוני ביצועים אמיתיים של מתמחה שמתכונן לבחינה.

תפקידך — לא להסביר חומר (יש NotebookLM לזה) אלא:
1. לנתח את החולשות בצורה ממוקדת וכנה
2. לזהות 3 נושאים דחופים שדורשים עבודה עכשיו
3. לתת תוכנית לימוד פרקטית לשבוע הקרוב
4. להמליץ על 10-15 נושאים ספציפיים לתרגול ממוקד היום
5. לתת הערכת כיוון ריאלית — "בקצב הזה תצליח/לא תצליח/גבולי"

סגנון: ישיר, כמו מנחה ב-teaching session. לא מחמאות — ישר לעניין.
ענה בעברית. מבנה ברור עם כותרות. לא יותר מ-400 מילה.`;

interface Message { role: "user" | "assistant"; content: string; animating?: boolean; }

interface AICoachPanelProps {
  open: boolean;
  onClose: () => void;
  questions: Question[];
  progress: UserProgress;
}

export default function AICoachPanel({ open, onClose, questions, progress }: AICoachPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const animFrameRef = useRef<number | null>(null);

  const animateText = useCallback((fullText: string, msgIndex: number) => {
    let i = 0;
    const step = () => {
      i += Math.ceil(fullText.length / 100);
      setMessages((prev) => {
        const next = [...prev];
        if (next[msgIndex]) next[msgIndex] = { ...next[msgIndex], content: fullText.slice(0, i), animating: i < fullText.length };
        return next;
      });
      if (i < fullText.length) animFrameRef.current = requestAnimationFrame(step);
    };
    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  const sendMessage = useCallback(async (msgs: Message[], sysPrompt?: string) => {
    setLoading(true);
    setError(null);
    const placeholderIndex = msgs.length;
    setMessages((prev) => [...prev, { role: "assistant", content: "", animating: false }]);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("claude-ai", {
        body: { messages: msgs.map((m) => ({ role: m.role, content: m.content })), systemPrompt: sysPrompt ?? COACH_SYSTEM_PROMPT },
      });
      if (fnError) throw new Error(fnError.message || "שגיאה בקריאה לשרת");
      if (!data?.content) throw new Error("תגובה ריקה מהשרת");
      animateText(data.content, placeholderIndex);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [animateText]);

  useEffect(() => {
    if (!open || !questions.length) return;
    const stats = computeUserStats(progress, questions);
    setWeakTopics(stats.weakTopics.map(t => t.topic));
    const statsText = formatStatsForClaude(stats);
    const userMsg: Message = { role: "user", content: statsText };
    setMessages([userMsg]);
    sendMessage([userMsg]);
    setTimeout(() => inputRef.current?.focus(), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setMessages([]); setInput(""); setError(null);
    }
  }, [open]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    sendMessage(newMessages);
  };

  if (!open) return null;
  const showSpinner = loading && messages.filter(m => m.role === "assistant").length === 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 bg-card flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-foreground">המאמן האישי שלי</p>
            <p className="text-xs text-muted-foreground">ניתוח חולשות + תוכנית לימוד</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground hover:text-foreground">
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {showSpinner && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
                <span className="text-xs text-center">Claude מנתח את הנתונים שלך...</span>
              </div>
            </div>
          )}
          {messages.map((msg, i) => {
            if (i === 0 && msg.role === "user") return null;
            return (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 mt-1 ml-2">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"}`}
                  dir="auto"
                >
                  {msg.content || (loading && i === messages.length - 1 ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground text-xs"><Loader2 className="w-3 h-3 animate-spin" /> מנתח...</span>
                  ) : null)}
                  {msg.animating && <span className="inline-block w-0.5 h-4 bg-emerald-400 ml-0.5 animate-pulse" />}
                </div>
              </div>
            );
          })}
          {!loading && weakTopics.length > 0 && messages.some(m => m.role === "assistant" && m.content.length > 50) && (
            <div className="flex justify-center mt-2">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs">
                <Dumbbell className="w-3.5 h-3.5" />
                {weakTopics.length} נושאים חלשים זוהו — סנן את תרגול לפי הנושאים האלה
              </div>
            </div>
          )}
          {error && <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl p-3 text-center">שגיאה: {error}</div>}
          <div ref={bottomRef} />
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border flex-shrink-0 bg-card/80 backdrop-blur-sm">
          <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="שאל שאלת המשך..." disabled={loading} dir="auto"
            className="flex-1 bg-muted border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary text-foreground placeholder:text-muted-foreground disabled:opacity-50 transition" />
          <button onClick={handleSend} disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition disabled:opacity-40 flex-shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </>
  );
}
```

**Step C** — In `src/components/views/StatsView.tsx`, make these changes:

1. Add to the imports at the top:
```tsx
import AICoachPanel from '@/components/AICoachPanel';
```

2. Inside the `StatsView` component function, after the existing `useState` declarations, add:
```tsx
const [coachOpen, setCoachOpen] = useState(false);
```

3. At the very beginning of the returned JSX (just inside the outermost `<motion.div>` or `<div>`), add this button as the first element:
```tsx
<button
  onClick={() => setCoachOpen(true)}
  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-sm hover:bg-emerald-500/20 active:scale-98 transition mb-5"
>
  <TrendingUp className="w-4 h-4" />
  המאמן האישי שלי — ניתוח חולשות
</button>

<AICoachPanel
  open={coachOpen}
  onClose={() => setCoachOpen(false)}
  questions={data}
  progress={progress}
/>
```

Note: `data` and `progress` are already available from `useApp()` at the top of StatsView.
Also note: `TrendingUp` is already imported in StatsView.
