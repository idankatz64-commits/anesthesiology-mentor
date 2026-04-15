import type { DayBin } from './useSrsDashboard';

interface Props { bins: DayBin[] }

const X_TICKS = [0, 7, 14, 21, 29];

function formatTick(bin: DayBin, idx: number): string {
  if (idx === 0) return 'היום';
  const [, m, d] = bin.date.split('-');
  return `${Number(d)}/${Number(m)}`;
}

function yTicks(max: number): number[] {
  if (max <= 10) return [max, Math.round(max / 2)];
  const step = Math.ceil(max / 4 / 10) * 10;
  return [step * 4, step * 3, step * 2, step].filter((v) => v > 0);
}

export function SrsDecayChart({ bins }: Props) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  const ticks = yTicks(max);

  return (
    <div className="rounded-xl border bg-card p-4" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold">תחזית חזרות ל-30 יום</div>
        <div className="text-xs text-muted-foreground">מקס׳: {max} שאלות</div>
      </div>

      <div className="flex gap-2">
        {/* Y-axis labels */}
        <div className="flex flex-col justify-between h-40 text-[10px] text-muted-foreground text-left w-8 pr-1 py-0">
          {ticks.map((t) => (
            <div key={t} className="leading-none">{t}</div>
          ))}
          <div className="leading-none">0</div>
        </div>

        {/* Bars */}
        <div className="flex-1 flex items-end gap-1 h-40 border-b border-border">
          {bins.map((b) => {
            const height = (b.count / max) * 100;
            const color = b.isOverdue
              ? 'bg-red-500'
              : b.count === 0
              ? 'bg-muted'
              : 'bg-emerald-500';
            const displayHeight = Math.max(height, b.count > 0 ? 2 : 0);
            return (
              <div
                key={b.date}
                className="flex-1 min-w-0 h-full flex flex-col justify-end relative group"
                title={`${b.date} — ${b.count} שאלות${b.topics.length ? ` (${b.topics.slice(0, 3).join(', ')})` : ''}`}
              >
                {b.count > 0 && (
                  <div className="absolute -top-4 left-0 right-0 text-center text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {b.count}
                  </div>
                )}
                <div className={`${color} rounded-t w-full`} style={{ height: `${displayHeight}%` }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex gap-2 mt-1">
        <div className="w-8" />
        <div className="flex-1 relative h-4 text-[10px] text-muted-foreground">
          {X_TICKS.map((i) => (
            <div
              key={i}
              className="absolute"
              style={{ right: `${(i / 29) * 100}%`, transform: 'translateX(50%)' }}
            >
              {formatTick(bins[i] ?? bins[0], i)}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-red-500 rounded-sm" /> באיחור/היום</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-emerald-500 rounded-sm" /> עתידי</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-muted rounded-sm border border-border" /> ריק</span>
        <span className="ml-auto">ציר X: ימים קדימה · ציר Y: מס׳ שאלות</span>
      </div>
    </div>
  );
}
