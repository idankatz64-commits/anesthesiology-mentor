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
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function AIExplainDrawer({
  open,
  onClose,
  question,
  optionA,
  optionB,
  optionC,
  optionD,
  correctAnswer,
  userAnswer,
  existingExplanation,
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
    const userLabel = userAnswer ? labels[userAnswer] || userAnswer : null;
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
        if (next[msgIndex])
          next[msgIndex] = { ...next[msgIndex], content: fullText.slice(0, i), animating: i < fullText.length };
        return next;
      });
      if (i < fullText.length) animFrameRef.current = requestAnimationFrame(step);
    };
    animFrameRef.current = requestAnimationFrame(step);
  }, []);

  const sendMessage = useCallback(
    async (msgs: Message[]) => {
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
    },
    [animateText],
  );

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
      setMessages([]);
      setInput("");
      setError(null);
    }
  }, [open]);

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

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "80vh", height: "70vh" }}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-foreground">הסבר AI — Claude</p>
            <p className="text-xs text-muted-foreground">שאל כל שאלת המשך</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground hover:text-foreground"
          >
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
                  {msg.content ||
                    (loading && i === messages.length - 1 ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" /> כותב...
                      </span>
                    ) : null)}
                  {msg.animating && <span className="inline-block w-0.5 h-4 bg-violet-400 ml-0.5 animate-pulse" />}
                </div>
              </div>
            );
          })}
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-xl p-3 text-center">
              שגיאה: {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
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
