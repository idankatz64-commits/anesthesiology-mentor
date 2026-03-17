import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Loader2, ChevronDown, Send, Dumbbell, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Question, UserProgress } from "@/lib/types";
import { computeUserStats, formatStatsForClaude, loadProgressFromStorage } from "@/lib/stats";

const COACH_SYSTEM_PROMPT = `אתה מאמן לימוד אישי לשלב א' בהרדמה וטיפול נמרץ.
קיבלת נתוני ביצועים אמיתיים של מתמחה שמתכונן לבחינה.

תפקידך — לא להסביר חומר (יש NotebookLM לזה) אלא:
1. לנתח את החולשות בצורה ממוקדת וכנה
2. לזהות 3 נושאים דחופים שדורשים עבודה עכשיו (לא הכל חשוב באותה מידה)
3. לתת תוכנית לימוד פרקטית לשבוע הקרוב
4. להמליץ על 10-15 נושאים ספציפיים לתרגול ממוקד היום
5. לתת הערכת כיוון ריאלית — "בקצב הזה תצליח/לא תצליח/גבולי"

סגנון: ישיר, כמו מנחה ב-teaching session שמדבר לרופא. לא "נהדר שאתה מתאמן" — ישר לעניין.
ענה בעברית. מבנה ברור עם כותרות. לא יותר מ-400 מילה.`;

interface Message {
  role: "user" | "assistant";
  content: string;
  animating?: boolean;
}

interface AICoachPanelProps {
  open: boolean;
  onClose: () => void;
  questions: Question[];
  onPracticeWeakTopics?: (topics: string[]) => void;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export default function AICoachPanel({
  open,
  onClose,
  questions,
  onPracticeWeakTopics,
}: AICoachPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weakTopics, setWeakTopics] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // Animate text character-by-character
  const animateText = useCallback((fullText: string, msgIndex: number) => {
    let i = 0;
    const step = () => {
      i += Math.ceil(fullText.length / 100);
      const chunk = fullText.slice(0, i);
      setMessages((prev) => {
        const next = [...prev];
        if (next[msgIndex]) next[msgIndex] = { ...next[msgIndex], content: chunk, animating: i < fullText.length };
        return next;
      });
      if (i < fullText.length) {
        animFrameRef.current = requestAnimationFrame(step);
      }
    };
    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  const sendMessage = useCallback(async (msgs: Message[], systemPrompt?: string) => {
    setLoading(true);
    setError(null);
    const placeholderIndex = msgs.length;
    setMessages((prev) => [...prev, { role: "assistant", content: "", animating: false }]);

    try {
      const apiMessages = msgs.map((m) => ({ role: m.role, content: m.content }));
      const { data, error: fnError } = await supabase.functions.invoke("claude-ai", {
        body: { messages: apiMessages, systemPrompt: systemPrompt ?? COACH_SYSTEM_PROMPT },
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

  // Auto-start: compute stats and send to coach
  useEffect(() => {
    if (!open) return;

    const progress = loadProgressFromStorage();
    if (!progress || !questions.length) {
      setError("אין מספיק נתוני לימוד עדיין. תרגל כמה שאלות קודם.");
      return;
    }

    const stats = computeUserStats(progress, questions);
    setWeakTopics(stats.weakTopics.map(t => t.topic));

    const statsText = formatStatsForClaude(stats);
    const userMsg: Message = { role: "user", content: statsText };
    setMessages([userMsg]);
    sendMessage([userMsg]);
    setTimeout(() => inputRef.current?.focus(), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setMessages([]);
      setInput("");
      setError(null);
    }
  }, [open]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    sendMessage(newMessages);
  };

  const handlePracticeWeakTopics = () => {
    if (onPracticeWeakTopics && weakTopics.length > 0) {
      onClose();
      onPracticeWeakTopics(weakTopics);
    }
  };

  if (!open) return null;

  const showSpinner = loading && messages.filter(m => m.role === "assistant").length === 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />

      <div
        className="fixed inset-0 z-50 bg-card flex flex-col"
        style={{ maxHeight: "100dvh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-foreground">המאמן האישי שלי</p>
            <p className="text-xs text-muted-foreground">ניתוח חולשות + תוכנית לימוד</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
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
            if (i === 0 && msg.role === "user") return null; // hide raw stats
            return (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0 mt-1 ml-2">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  }`}
                  dir="auto"
                >
                  {msg.content || (loading && i === messages.length - 1 ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                      <Loader2 className="w-3 h-3 animate-spin" /> מנתח...
                    </span>
                  ) : null)}
                  {msg.animating && <span className="inline-block w-0.5 h-4 bg-emerald-400 ml-0.5 animate-pulse" />}
                </div>
              </div>
            );
          })}

          {/* Practice weak topics button — shown after coach responds */}
          {!loading && messages.some(m => m.role === "assistant" && m.content.length > 50) && weakTopics.length > 0 && onPracticeWeakTopics && (
            <div className="flex justify-center mt-2">
              <button
                onClick={handlePracticeWeakTopics}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-medium hover:bg-emerald-500/25 transition"
              >
                <Dumbbell className="w-4 h-4" />
                תרגל את הנושאים החלשים ({weakTopics.length} נושאים)
              </button>
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl p-3 text-center">
              שגיאה: {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border flex-shrink-0 bg-card/80 backdrop-blur-sm">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="שאל שאלת המשך..."
            disabled={loading}
            dir="auto"
            className="flex-1 bg-muted border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary text-foreground placeholder:text-muted-foreground disabled:opacity-50 transition"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition disabled:opacity-40 flex-shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </>
  );
}
