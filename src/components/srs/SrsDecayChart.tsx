import type { DayBin } from './useSrsDashboard';

interface Props { bins: DayBin[] }

export function SrsDecayChart({ bins }: Props) {
  const max = Math.max(1, ...bins.map(b => b.count));
  return (
    <div className="rounded-xl border bg-card p-4" dir="rtl">
      <div className="text-sm font-semibold mb-3">תחזית חזרות ל-30 יום</div>
      <div className="flex items-end gap-1 h-40">
        {bins.map((b) => {
          const height = (b.count / max) * 100;
          const color = b.isOverdue ? 'bg-red-500' : b.count === 0 ? 'bg-muted' : 'bg-emerald-500';
          return (
            <div
              key={b.date}
              className="flex-1 min-w-0 flex flex-col justify-end"
              title={`${b.date} — ${b.count} שאלות${b.topics.length ? ` (${b.topics.slice(0, 3).join(', ')})` : ''}`}
            >
              <div className={`${color} rounded-t w-full`} style={{ height: `${Math.max(height, b.count > 0 ? 2 : 0)}%` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
