import StatsTile from './StatsTile';
import type { ForgettingRisk } from './useStatsData';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { AlertTriangle } from 'lucide-react';

interface Props {
  risks: ForgettingRisk[];
}

export default function ForgettingRiskTile({ risks }: Props) {
  const { data, startSession } = useApp();

  const handlePractice = (topic: string) => {
    const questions = data.filter(q => q[KEYS.TOPIC] === topic);
    if (questions.length > 0) {
      startSession(questions, Math.min(questions.length, 15), 'practice');
    }
  };

  return (
    <StatsTile
      collapsed={
        <div className="p-5">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> סיכון שכחה
          </span>
          <div className="mt-3 space-y-1.5">
            {risks.length === 0 ? (
              <p className="text-xs text-muted-foreground/50">אין נושאים בסיכון כרגע</p>
            ) : (
              risks.slice(0, 5).map(r => (
                <div key={r.topic} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate flex-1 ml-2">{r.topic}</span>
                  <span className="font-bold text-orange-400 shrink-0">{r.risk.toFixed(1)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-white mb-4">סיכון שכחה — כל הנושאים</h3>
          <p className="text-xs text-muted-foreground mb-4">ציון = (ימים מהניסיון האחרון / 7) × (1 - דיוק). ככל שהציון גבוה יותר, הסיכון גדול יותר.</p>
          {risks.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין נתונים עדיין</p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {risks.map(r => (
                <div key={r.topic} className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{r.topic}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.daysSince} ימים מאז • דיוק {r.accuracy}%
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-lg font-black text-orange-400">{r.risk.toFixed(1)}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handlePractice(r.topic); }}
                      className="text-[10px] bg-orange-500/20 text-orange-400 px-3 py-1.5 rounded-lg hover:bg-orange-500/30 transition font-bold"
                    >
                      התחל תרגול
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}
