import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { Users, TrendingUp, TrendingDown, Minus, CheckCircle } from 'lucide-react';

type GlobalTopicStat = {
  topic: string;
  total_users: number;
  avg_accuracy: number;
};

export default function ComparativeStats() {
  const { data, progress } = useApp();
  const [globalStats, setGlobalStats] = useState<GlobalTopicStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    supabase.rpc('get_global_topic_stats').then(({ data: stats }) => {
      if (stats) {
        setGlobalStats(stats.map((s: any) => ({
          topic: s.topic,
          total_users: Number(s.total_users),
          avg_accuracy: Number(s.avg_accuracy),
        })));
      }
      setLoading(false);
    });
  }, []);

  const comparison = useMemo(() => {
    const topicMap: Record<string, { answered: number; correct: number }> = {};
    Object.entries(progress.history).forEach(([id, h]) => {
      const q = data.find(x => x[KEYS.ID] === id);
      if (q) {
        const t = q[KEYS.TOPIC] || 'Uncategorized';
        if (!topicMap[t]) topicMap[t] = { answered: 0, correct: 0 };
        topicMap[t].answered += h.answered;
        topicMap[t].correct += h.correct;
      }
    });

    return globalStats.map(gs => {
      const mine = topicMap[gs.topic];
      const myAccuracy = mine ? Math.round((mine.correct / mine.answered) * 100) : null;
      const myAnswered = mine?.answered || 0;
      const diff = myAccuracy !== null ? myAccuracy - gs.avg_accuracy : null;
      const gapQuestions = diff !== null && diff < 0 ? Math.ceil(Math.abs(diff) / 100 * myAnswered) : 0;
      return {
        topic: gs.topic,
        myAccuracy,
        globalAccuracy: gs.avg_accuracy,
        myAnswered,
        globalUsers: gs.total_users,
        diff,
        gapQuestions,
      };
    }).sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0));
  }, [globalStats, progress, data]);

  const gapMetrics = useMemo(() => {
    let totalCorrect = 0, totalAnswered = 0;
    Object.values(progress.history).forEach(h => {
      totalAnswered += h.answered;
      totalCorrect += h.correct;
    });
    const userAccuracy = totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;

    let weightedSum = 0, weightCount = 0;
    globalStats.forEach(gs => {
      weightedSum += gs.avg_accuracy * gs.total_users;
      weightCount += gs.total_users;
    });
    const groupAvg = weightCount > 0 ? weightedSum / weightCount : 0;

    const gap = Math.round(userAccuracy - groupAvg);
    const gapQuestions = gap < 0 ? Math.max(0, Math.ceil(Math.abs(gap) / 100 * totalAnswered)) : 0;

    return { userAccuracy: Math.round(userAccuracy), groupAvg: Math.round(groupAvg), gap, gapQuestions };
  }, [progress, globalStats]);

  const displayed = showAll ? comparison : comparison.slice(0, 5);

  if (loading) {
    return (
      <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-8 text-center">
        <p className="text-muted-foreground animate-pulse">טוען נתוני קבוצה...</p>
      </div>
    );
  }

  if (globalStats.length === 0) {
    return (
      <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-8 text-center">
        <Users className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">אין עדיין מספיק נתונים קבוצתיים.</p>
      </div>
    );
  }

  return (
    <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl overflow-hidden">
      <div className="p-5 border-b border-border dark:border-white/[0.07]">
        <h3 className="font-bold text-foreground flex items-center gap-2 text-sm">
          <Users className="w-5 h-5 text-primary" />
          מיקומך בקבוצה
        </h3>
      </div>

      {/* Gap KPI badge */}
      <div className="px-5 py-3 border-b border-border dark:border-white/[0.07] flex flex-wrap items-center gap-3 text-[11px]">
        <span className={`font-bold ${gapMetrics.gap >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          פער מהממוצע: {gapMetrics.gap > 0 ? '+' : ''}{gapMetrics.gap}%
        </span>
        <span className="text-muted-foreground">|</span>
        {gapMetrics.gapQuestions === 0 ? (
          <span className="text-green-400 font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> מעל הממוצע!</span>
        ) : (
          <span className="text-muted-foreground">עוד ~{gapMetrics.gapQuestions} תשובות נכונות לממוצע</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border dark:border-white/[0.07] text-muted-foreground">
              <th className="px-4 py-2.5 text-right text-[10px] font-bold">נושא</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-bold">הדיוק שלך</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-bold">ממוצע קבוצה</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-bold">פער</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-bold">לסגירה</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(row => (
              <tr key={row.topic} className="border-b border-border/50 dark:border-white/[0.04] hover:bg-muted/20 transition">
                <td className="px-4 py-2.5 font-medium text-foreground text-xs truncate max-w-[150px]">{row.topic}</td>
                <td className="px-4 py-2.5 text-center">
                  {row.myAccuracy !== null ? (
                    <span className="font-bold text-xs text-foreground" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{row.myAccuracy}%</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center text-muted-foreground text-xs" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{row.globalAccuracy}%</td>
                <td className="px-4 py-2.5 text-center">
                  {row.diff === null ? (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  ) : (
                    <span className={`text-[10px] font-bold ${row.diff >= 0 ? 'text-green-400' : 'text-red-400'}`} style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                      {row.diff > 0 ? '+' : ''}{row.diff}%
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center text-[10px] text-muted-foreground" style={{ fontFamily: "'Share Tech Mono', monospace" }}>
                  {row.gapQuestions > 0 ? `~${row.gapQuestions}` : '✓'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {comparison.length > 5 && (
        <div className="p-3 text-center border-t border-border dark:border-white/[0.07]">
          <button onClick={() => setShowAll(!showAll)} className="text-xs text-orange-400 hover:text-orange-300 font-bold transition">
            {showAll ? 'הצג פחות' : `הרחב לטבלה המלאה (${comparison.length}) ↓`}
          </button>
        </div>
      )}
    </div>
  );
}
