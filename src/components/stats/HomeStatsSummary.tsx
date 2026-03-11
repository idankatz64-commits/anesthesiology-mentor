import { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { CheckCircle, Target, CalendarClock, TrendingUp, TrendingDown } from 'lucide-react';
import AnimatedNumber from '@/components/AnimatedNumber';

export default function HomeStatsSummary() {
  const { progress } = useApp();

  const { totalAnswered, accuracy, mistakes, todayCount } = useMemo(() => {
    const entries = Object.values(progress.history || {});
    const total = entries.length;
    const correct = entries.filter(h => h.lastResult === 'correct').length;
    const wrong = entries.filter(h => h.lastResult === 'wrong').length;

    // Count today's answers
    const today = new Date().toDateString();
    const todayAnswered = entries.filter(h => {
      if (!h.timestamp) return false;
      return new Date(h.timestamp).toDateString() === today;
    }).length;

    return {
      totalAnswered: total,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      mistakes: wrong,
      todayCount: todayAnswered,
    };
  }, [progress.history]);

  const metrics = [
    {
      label: 'שאלות היום',
      value: todayCount,
      suffix: '',
      color: 'text-primary',
      badgeText: todayCount >= 10 ? 'קצב טוב' : null,
      badgeColor: 'text-success',
    },
    {
      label: 'טעויות פתוחות',
      value: mistakes,
      suffix: '',
      color: 'text-destructive',
      badgeText: mistakes > 0 ? `${mistakes} לחזרה` : null,
      badgeColor: 'text-destructive',
    },
    {
      label: 'סה״כ נענו',
      value: totalAnswered,
      suffix: '',
      color: 'text-foreground',
      badgeText: null,
      badgeColor: '',
    },
    {
      label: 'דיוק כללי',
      value: accuracy,
      suffix: '%',
      color: accuracy >= 70 ? 'text-success' : accuracy >= 50 ? 'text-warning' : 'text-destructive',
      badgeText: accuracy >= 70 ? 'מצוין' : accuracy >= 50 ? 'בינוני' : 'צריך שיפור',
      badgeColor: accuracy >= 70 ? 'text-success' : accuracy >= 50 ? 'text-warning' : 'text-destructive',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="relative rounded-2xl overflow-hidden p-5 text-center"
          style={{
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.15em] mb-3">
            {m.label}
          </div>
          <div className={`text-3xl font-bold ${m.color}`} style={{ fontFamily: 'var(--font-matrix)' }}>
            <AnimatedNumber value={m.value} suffix={m.suffix} />
          </div>
          {m.badgeText && (
            <div className={`text-[10px] font-medium mt-2 ${m.badgeColor}`}>
              {m.badgeText}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
