interface Props {
  stats: { dueToday: number; overdue: number; totalPending: number; next7Days: number };
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'amber' | 'default' }) {
  const toneClass =
    tone === 'red' ? 'text-red-600' :
    tone === 'amber' ? 'text-amber-600' : 'text-foreground';
  return (
    <div className="rounded-xl border bg-card p-4 text-right" dir="rtl">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${toneClass}`}>{value}</div>
    </div>
  );
}

export function SrsStatsRow({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Tile label="ממתינות היום" value={stats.dueToday} tone={stats.dueToday > 0 ? 'amber' : 'default'} />
      <Tile label="באיחור" value={stats.overdue} tone={stats.overdue > 0 ? 'red' : 'default'} />
      <Tile label="סה״כ ממתינות" value={stats.totalPending} />
      <Tile label="ב-7 ימים (כולל איחור)" value={stats.next7Days} />
    </div>
  );
}
