import { useState } from "react";
import { Treemap, ResponsiveContainer } from "recharts";
import { LayoutGrid, List } from "lucide-react";
import type { TopicStat } from "@/lib/cohortDetail";

/** Accuracy → color (weak red → mid amber → strong green). */
function topicColor(a: number): string {
  if (a >= 80) return "hsl(142 64% 38%)";
  if (a >= 65) return "hsl(142 45% 33%)";
  if (a >= 50) return "hsl(36 88% 44%)";
  return "hsl(0 70% 47%)";
}

interface TileProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  accuracy?: number;
  depth?: number;
}

function TopicTile({ x = 0, y = 0, width = 0, height = 0, name, accuracy = 0, depth }: TileProps) {
  if (depth !== 1) return null;
  const show = width > 52 && height > 28;
  return (
    <g style={{ cursor: "pointer" }}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        fill={topicColor(accuracy)}
        stroke="hsl(var(--background))"
        strokeWidth={2}
      />
      {show && (
        <foreignObject x={x} y={y} width={width} height={height} style={{ pointerEvents: "none", overflow: "hidden" }}>
          <div
            style={{
              width,
              height,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              boxSizing: "border-box",
              textAlign: "center",
            }}
          >
            <span style={{ color: "#fff", fontSize: Math.min(13, width / 8), fontWeight: 700, lineHeight: 1.1 }}>
              {name}
            </span>
            <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: 700, marginTop: 2 }}>
              {accuracy}%
            </span>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

/**
 * Per-resident topic performance, switchable between a treemap (default) and a
 * plain table. Either way, click a topic to reveal its Miller-chapter breakdown.
 */
export default function ResidentTopics({ topics }: { topics: TopicStat[] }) {
  const [view, setView] = useState<"treemap" | "table">("treemap");
  const [sel, setSel] = useState<string | null>(null);
  const data = topics.map((t) => ({ name: t.topic, size: Math.max(2, t.chapters.length), accuracy: t.accuracy }));
  const tableRows = [...topics].sort((a, b) => a.accuracy - b.accuracy); // weakest first
  const selected = topics.find((t) => t.topic === sel) || null;

  const tabCls = (active: boolean) =>
    `flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors ${
      active ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="glass-tile rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-sm font-bold text-foreground">Topic Performance</h3>
        <div className="flex items-center rounded-lg border border-border bg-muted/20 p-0.5">
          <button onClick={() => setView("treemap")} className={tabCls(view === "treemap")}>
            <LayoutGrid className="w-3 h-3" /> Map
          </button>
          <button onClick={() => setView("table")} className={tabCls(view === "table")}>
            <List className="w-3 h-3" /> Table
          </button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">Color = accuracy · click a topic for its Miller chapters</p>

      {view === "treemap" ? (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={data}
              dataKey="size"
              nameKey="name"
              content={<TopicTile />}
              isAnimationActive={false}
              onClick={(node: { name?: string }) => node?.name && setSel(node.name === sel ? null : node.name)}
            />
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tableRows.map((t) => (
            <button
              key={t.topic}
              onClick={() => setSel(t.topic === sel ? null : t.topic)}
              className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/20 transition-colors text-left"
            >
              <span className="text-xs text-foreground flex-1 truncate">{t.topic}</span>
              <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: topicColor(t.accuracy) }}>
                {t.accuracy}%
              </span>
              <div className="w-16 h-1.5 rounded-full bg-muted/20 overflow-hidden shrink-0">
                <div
                  className="h-full rounded-full"
                  style={{ backgroundColor: topicColor(t.accuracy), width: `${t.accuracy}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-3 rounded-lg border border-border/60 bg-muted/10 p-3">
          <div className="text-xs font-bold text-foreground mb-2">{selected.topic} — Miller chapters</div>
          <div className="flex flex-col gap-1">
            {selected.chapters.map((c) => (
              <div key={c.chapter} className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground flex-1">
                  Ch. {c.chapter} — {c.title}
                </span>
                <span className="text-[11px] font-semibold tabular-nums" style={{ color: topicColor(c.accuracy) }}>
                  {c.accuracy}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
