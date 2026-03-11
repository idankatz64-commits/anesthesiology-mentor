import { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { CheckCircle, Target, CalendarClock } from 'lucide-react';
import AnimatedNumber from '@/components/AnimatedNumber';

export default function HomeStatsSummary() {
  const { progress } = useApp();

  const { totalAnswered, accuracy, mistakes } = useMemo(() => {
    const entries = Object.values(progress.history || {});
    const total = entries.length;
    const correct = entries.filter(h => h.lastResult === 'correct').length;
    const wrong = entries.filter(h => h.lastResult === 'wrong').length;
    return {
      totalAnswered: total,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      mistakes: wrong,
    };
  }, [progress.history]);

  const accuracyColor = accuracy >= 70 ? 'text-success' : accuracy >= 50 ? 'text-warning' : 'text-destructive';

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="deep-tile p-5 text-center">
        <div className="flex justify-center mb-2">
          <CheckCircle className="w-5 h-5 text-primary" />
        </div>
        <div className="text-3xl font-bold matrix-text">
          <AnimatedNumber value={totalAnswered} />
        </div>
        <div className="text-xs text-muted-foreground font-medium mt-1">שאלות שנענו</div>
      </div>

      <div className="deep-tile p-5 text-center">
        <div className="flex justify-center mb-2">
          <Target className={`w-5 h-5 ${accuracyColor}`} />
        </div>
        <div className={`text-3xl font-bold matrix-text ${accuracyColor}`}>
          <AnimatedNumber value={accuracy} suffix="%" />
        </div>
        <div className="text-xs text-muted-foreground font-medium mt-1">דיוק</div>
      </div>

      <div className="deep-tile p-5 text-center">
        <div className="flex justify-center mb-2">
          <CalendarClock className="w-5 h-5 text-destructive" />
        </div>
        <div className="text-3xl font-bold matrix-text text-destructive">
          <AnimatedNumber value={mistakes} />
        </div>
        <div className="text-xs text-muted-foreground font-medium mt-1">טעויות פתוחות</div>
      </div>
    </div>
  );
}
