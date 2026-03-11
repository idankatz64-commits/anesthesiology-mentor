import { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { motion } from 'framer-motion';
import AnimatedNumber from '@/components/AnimatedNumber';

/* ── SVG Donut Ring ── */
function DonutRing({ 
  value, 
  max = 100, 
  size = 100, 
  strokeWidth = 8, 
  color, 
  bgColor = 'hsl(var(--muted))',
  label,
  suffix = '%',
}: { 
  value: number; max?: number; size?: number; strokeWidth?: number; 
  color: string; bgColor?: string; label: string; suffix?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={bgColor} strokeWidth={strokeWidth}
            opacity={0.3}
          />
          <motion.circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-foreground" style={{ fontFamily: 'var(--font-matrix)' }}>
            <AnimatedNumber value={value} suffix={suffix} />
          </span>
        </div>
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
        {label}
      </span>
    </div>
  );
}

/* ── Mini Stat Card with color bar ── */
function MiniStat({ 
  label, value, suffix = '', color, badgeText, badgeColor, barPct,
}: { 
  label: string; value: number; suffix?: string; color: string; 
  badgeText?: string | null; badgeColor?: string; barPct?: number;
}) {
  return (
    <div
      className="glass-tile relative overflow-hidden p-3 text-center flex flex-col items-center justify-center gap-0.5"
    >
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">
        {label}
      </div>
      <div className={`text-2xl font-bold ${color}`} style={{ fontFamily: 'var(--font-matrix)' }}>
        <AnimatedNumber value={value} suffix={suffix} />
      </div>
      {badgeText && (
        <div className={`text-[10px] font-medium ${badgeColor}`}>
          {badgeText}
        </div>
      )}
      {barPct !== undefined && (
        <div className="w-full h-1 rounded-full bg-muted/30 mt-1 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: color.includes('destructive') ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(barPct, 100)}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
          />
        </div>
      )}
    </div>
  );
}

export default function HomeStatsSummary() {
  const { progress, data } = useApp();

  const { totalAnswered, accuracy, mistakes, todayCount, completionPct } = useMemo(() => {
    const entries = Object.values(progress.history || {});
    const total = entries.length;
    const correct = entries.filter(h => h.lastResult === 'correct').length;
    const wrong = entries.filter(h => h.lastResult === 'wrong').length;

    const today = new Date().toDateString();
    const todayAnswered = entries.filter(h => {
      if (!h.timestamp) return false;
      return new Date(h.timestamp).toDateString() === today;
    }).length;

    const totalQuestions = data?.length || 1;
    const completion = Math.round((total / totalQuestions) * 100);

    return {
      totalAnswered: total,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      mistakes: wrong,
      todayCount: todayAnswered,
      completionPct: Math.min(completion, 100),
    };
  }, [progress.history, data]);

  const accuracyColor = accuracy >= 70 ? '#22c55e' : accuracy >= 50 ? '#f59f0a' : '#ef4444';
  const completionColor = '#10b981';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Accuracy Ring */}
      <div className="glass-tile p-3 flex items-center justify-center">
        <DonutRing
          value={accuracy}
          color={accuracyColor}
          label="דיוק כללי"
          size={75}
          strokeWidth={6}
        />
      </div>

      {/* Completion Ring */}
      <div className="glass-tile p-3 flex items-center justify-center">
        <DonutRing
          value={completionPct}
          color={completionColor}
          label="כיסוי מאגר"
          size={75}
          strokeWidth={6}
        />
      </div>

      {/* Today's Questions */}
      <MiniStat
        label="שאלות היום"
        value={todayCount}
        color="text-primary"
        badgeText={todayCount >= 10 ? 'קצב טוב' : null}
        badgeColor="text-success"
        barPct={Math.min(todayCount * 10, 100)}
      />

      {/* Open Mistakes */}
      <MiniStat
        label="טעויות פתוחות"
        value={mistakes}
        color="text-destructive"
        badgeText={mistakes > 0 ? `${mistakes} לחזרה` : null}
        badgeColor="text-destructive"
      />
    </div>
  );
}
