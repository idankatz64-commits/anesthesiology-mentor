import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TopicStat } from "@/lib/cohortDetail";
import { accuracyColor } from "@/lib/cohortStats";

/** Per-resident topic performance with a Miller-chapter drill-down on click. */
export default function ResidentTopicsCard({ topics }: { topics: TopicStat[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...topics].sort((a, b) => a.accuracy - b.accuracy); // weakest first

  return (
    <div className="glass-tile rounded-xl p-4">
      <h3 className="text-sm font-bold text-foreground mb-1">Topic Performance</h3>
      <p className="text-[11px] text-muted-foreground mb-3">Click a topic for the per-chapter (Miller) breakdown</p>
      <div className="flex flex-col gap-1.5">
        {sorted.map((t) => {
          const isOpen = open === t.topic;
          return (
            <div key={t.topic} className="rounded-lg border border-border/50 overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : t.topic)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/20 transition-colors"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
                <span className="text-xs text-foreground flex-1 text-left">{t.topic}</span>
                <span className="text-xs font-bold tabular-nums" style={{ color: accuracyColor(t.accuracy) }}>
                  {t.accuracy}%
                </span>
                <div className="w-16 h-1.5 rounded-full bg-muted/20 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ backgroundColor: accuracyColor(t.accuracy), width: `${t.accuracy}%` }}
                  />
                </div>
              </button>
              {isOpen && (
                <div className="px-3 pb-2 pt-1 bg-muted/10">
                  {t.chapters.map((c) => (
                    <div key={c.chapter} className="flex items-center gap-3 py-1 pl-6">
                      <span className="text-[11px] text-muted-foreground flex-1 text-left">
                        Ch. {c.chapter} — {c.title}
                      </span>
                      <span
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: accuracyColor(c.accuracy) }}
                      >
                        {c.accuracy}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
