import { useMemo, useState } from 'react';
import AnimatedStatsTile from './AnimatedStatsTile';
import { Flame } from 'lucide-react';
import type { DailyData } from './useStatsData';

interface Props {
  streak: number;
  dailyData: DailyData[];
}

function getHeatColor(count: number) {
  if (count === 0) return 'bg-muted/30';
  if (count <= 5) return 'bg-orange-300/40 dark:bg-orange-900/50';
  if (count <= 15) return 'bg-orange-400/60 dark:bg-orange-600/60';
  return 'bg-orange-600 dark:bg-orange-500';
}

function HeatmapGrid({ dailyData, cellSize = 12, gap = 2 }: { dailyData: DailyData[]; cellSize?: number; gap?: number }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  // Build 7-row x N-column grid (column-first: each column = 1 week, rows = days Sun-Sat)
  const grid = useMemo(() => {
    if (dailyData.length === 0) return [];
    // Pad to start on Sunday
    const firstDate = new Date(dailyData[0].date + 'T00:00:00');
    const startDay = firstDate.getDay(); // 0=Sun
    const padded: (DailyData | null)[] = Array(startDay).fill(null).concat(dailyData);
    // Build columns
    const cols: (DailyData | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      cols.push(padded.slice(i, i + 7));
    }
    // Pad last column to 7
    const last = cols[cols.length - 1];
    while (last.length < 7) last.push(null);
    return cols;
  }, [dailyData]);

  return (
    <div className="relative">
      <div className="flex" style={{ gap }}>
        {grid.map((col, ci) => (
          <div key={ci} className="flex flex-col" style={{ gap }}>
            {col.map((d, ri) => (
              <div
                key={ri}
                className={`rounded-sm ${d ? getHeatColor(d.count) : 'bg-transparent'}`}
                style={{ width: cellSize, height: cellSize }}
                onMouseEnter={(e) => {
                  if (!d) return;
                  const dt = new Date(d.date + 'T00:00:00');
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    text: `${dt.getDate()}/${dt.getMonth() + 1} — ${d.count} שאלות, ${d.rate}% דיוק`,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        ))}
      </div>
      {tooltip && (
        <div
          className="fixed z-50 bg-card border border-border rounded-lg px-3 py-1.5 text-[11px] text-foreground shadow-lg pointer-events-none"
          style={{ left: tooltip.x + 10, top: tooltip.y - 30 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div className="flex items-center gap-1.5 mt-3">
      <span className="text-[9px] text-muted-foreground/60">פחות</span>
      {['bg-muted/30', 'bg-orange-300/40 dark:bg-orange-900/50', 'bg-orange-400/60 dark:bg-orange-600/60', 'bg-orange-600 dark:bg-orange-500'].map((c, i) => (
        <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
      ))}
      <span className="text-[9px] text-muted-foreground/60">יותר</span>
    </div>
  );
}

export default function StreakTile({ streak, dailyData }: Props) {
  return (
    <AnimatedStatsTile
      collapsed={
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="w-5 h-5 text-orange-500" />
            <div>
              <div className="text-xl font-black text-foreground leading-none">{streak}</div>
              <span className="text-[9px] text-muted-foreground/60">ימים רצופים</span>
            </div>
          </div>
          <HeatmapGrid dailyData={dailyData} cellSize={10} gap={2} />
          <HeatmapLegend />
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-foreground mb-1">רצף למידה — {dailyData.length} ימים אחרונים</h3>
          <p className="text-xs text-muted-foreground mb-4">כל ריבוע = יום, צבע לפי כמות שאלות שנענו</p>
          <div className="flex items-center gap-3 mb-4">
            <Flame className="w-8 h-8 text-orange-500" />
            <div>
              <div className="text-3xl font-black text-foreground">{streak}</div>
              <span className="text-xs text-muted-foreground">ימים רצופים 🔥</span>
            </div>
          </div>
          <HeatmapGrid dailyData={dailyData} cellSize={16} gap={3} />
          <HeatmapLegend />
        </div>
      }
    />
  );
}
