import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, Bot, Loader2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
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
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Build initial prompt when drawer opens
  const buildInitialUserMessage = useCallback((): string => {
    const answerLabels: Record<string, string> = { A: optionA, B: optionB, C: optionC, D: optionD };
    const correctLabel = answerLabels[correctAnswer] || correctAnswer;
    const userLabel = userAnswer ? (answerLabels[userAnswer] || userAnswer) : null;

    let msg = `שאלה:\n${question}\n\nאפשרויות:\nא. ${optionA}\nב. ${optionB}\nג. ${optionC}\nד. ${optionD}\n\nתשובה נכונה: ${correctAnswer}. ${correctLabel}`;

    if (userAnswer && userAnswer !== correctAnswer && userLabel) {
      msg += `\nהמשתמש ענה: ${userAnswer}. ${userLabel} (שגוי)`;
    } else if (userAnswer === correctAnswer) {
      msg += `\nהמשתמש ענה נכון.`;
    }

    if (existingExplanation) {
      const plain = stripHtml(existingExplanation);
      if (plain.length > 10) {
        msg += `\n\nהסבר קיים:\n${plain.slice(0, 600)}`;
      }
    }

    msg += `\n\nהסבר לי בפירוט: למה ${correctAnswer} נכון, ולמה כל אחת מהאפשרויות האחרות שגויה. תוסיף פנינות קליניות רלוונטיות.`;
    return msg;
  }, [question, optionA, optionB, optionC, optionD, correctAnswer, userAnswer, existingExplanation]);

  const streamMessage = useCallback(async (msgs: Message[]) => {
    setStreaming(true);
    setError(null);

    // Add empty assistant message placeholder
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("לא מחובר");

      const abort = new AbortController();
      abortRef.current = abort;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-ai`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: msgs.map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: abort.signal,
        }
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `שגיאה ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
              accumulated += parsed.delta.text;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: accumulated };
                return next;
              });
            }
          } catch {
            // ignore parse errors for non-JSON lines
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
      // Remove empty placeholder on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, []);

  // Auto-start when drawer opens
  useEffect(() => {
    if (!open) return;
    const initial = buildInitialUserMessage();
    const userMsg: Message = { role: "user", content: initial };
    setMessages([userMsg]);
    streamMessage([userMsg]);
    setTimeout(() => inputRef.current?.focus(), 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setMessages([]);
      setInput("");
      setError(null);
    }
  }, [open]);

  // Scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    streamMessage(newMessages);
  };

  if (!open) return null;

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const showEmpty = messages.length === 0 || (streaming && !lastAssistantMsg?.content);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: "80vh", height: "70vh" }}>

        {/* Header */}
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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {showEmpty && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          )}

          {messages.map((msg, i) => {
            // Skip the initial long user message (the question context)
            if (i === 0 && msg.role === "user") return null;

            return (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-1 ml-2">
                    <Bot className="w-3 h-3 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  }`}
                  dir="auto"
                >
                  {msg.content || (streaming && i === messages.length - 1 ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" /> חושב...
                    </span>
                  ) : null)}
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

        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border flex-shrink-0 bg-card/80 backdrop-blur-sm">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="שאל שאלת המשך..."
            disabled={streaming}
            dir="auto"
            className="flex-1 bg-muted border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary text-foreground placeholder:text-muted-foreground disabled:opacity-50 transition"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 transition disabled:opacity-40 flex-shrink-0"
          >
            {streaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </>
  );
}
