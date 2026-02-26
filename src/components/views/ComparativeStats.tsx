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
      return {
        topic: gs.topic,
        myAccuracy,
        globalAccuracy: gs.avg_accuracy,
        myAnswered,
        globalUsers: gs.total_users,
        diff: myAccuracy !== null ? myAccuracy - gs.avg_accuracy : null,
      };
    }).sort((a, b) => (a.diff ?? -999) - (b.diff ?? -999));
  }, [globalStats, progress, data]);

  // Gap metrics
  const gapMetrics = useMemo(() => {
    let totalCorrect = 0, totalAnswered = 0;
    Object.values(progress.history).forEach(h => {
      totalAnswered += h.answered;
      totalCorrect += h.correct;
    });
    const userAccuracy = totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;

    // Weighted group average
    let weightedSum = 0, weightCount = 0;
    globalStats.forEach(gs => {
      weightedSum += gs.avg_accuracy * gs.total_users;
      weightCount += gs.total_users;
    });
    const groupAvg = weightCount > 0 ? weightedSum / weightCount : 0;

    const gap = Math.round(userAccuracy - groupAvg);
    const gapQuestions = gap < 0
      ? Math.max(0, Math.ceil(Math.abs(gap) / 100 * totalAnswered))
      : 0;

    return { userAccuracy: Math.round(userAccuracy), groupAvg: Math.round(groupAvg), gap, gapQuestions };
  }, [progress, globalStats]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <p className="text-muted-foreground animate-pulse">טוען נתוני קבוצה...</p>
      </div>
    );
  }

  if (globalStats.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <Users className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">אין עדיין מספיק נתונים קבוצתיים.</p>
        <p className="text-xs text-muted-foreground mt-1">תרגל עוד כדי לראות את מיקומך בקבוצה.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-5 border-b border-border">
        <h3 className="font-bold text-foreground flex items-center gap-2 text-sm">
          <Users className="w-5 h-5 text-primary" />
          מיקומך בקבוצה
        </h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">השוואת הביצועים שלך מול הממוצע הכללי</p>
      </div>

      {/* Gap KPI cards */}
      <div className="grid grid-cols-2 gap-3 p-5 border-b border-border">
        <div className={`rounded-xl p-4 text-center border ${gapMetrics.gap >= 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
          <div className="text-[10px] text-muted-foreground mb-1">פער מהממוצע</div>
          <div className={`text-2xl font-black ${gapMetrics.gap >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {gapMetrics.gap > 0 ? '+' : ''}{gapMetrics.gap}%
          </div>
        </div>
        <div className="rounded-xl p-4 text-center border border-border bg-muted/20">
          <div className="text-[10px] text-muted-foreground mb-1">שאלות לסגירת פער</div>
          {gapMetrics.gapQuestions === 0 ? (
            <div className="flex items-center justify-center gap-1.5">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-sm font-bold text-green-400">מעל הממוצע!</span>
            </div>
          ) : (
            <div className="text-2xl font-black text-foreground">~{gapMetrics.gapQuestions}</div>
          )}
          {gapMetrics.gapQuestions > 0 && (
            <p className="text-[9px] text-muted-foreground mt-0.5">תשובות נכונות לממוצע</p>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-right text-xs font-bold">נושא</th>
              <th className="px-4 py-3 text-center text-xs font-bold">הדיוק שלך %</th>
              <th className="px-4 py-3 text-center text-xs font-bold">ממוצע כללי %</th>
              <th className="px-4 py-3 text-center text-xs font-bold">מצב</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map(row => (
              <tr key={row.topic} className="border-b border-border hover:bg-muted/30 transition">
                <td className="px-4 py-3 font-medium text-foreground text-xs">{row.topic}</td>
                <td className="px-4 py-3 text-center">
                  {row.myAccuracy !== null ? (
                    <span className={`font-bold text-xs ${row.myAccuracy >= 80 ? 'text-green-400' : row.myAccuracy >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {row.myAccuracy}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center font-medium text-muted-foreground text-xs">{row.globalAccuracy}%</td>
                <td className="px-4 py-3 text-center">
                  {row.diff === null ? (
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-full">לא נענה</span>
                  ) : row.diff > 5 ? (
                    <span className="text-[10px] font-bold text-green-400 bg-green-500/10 px-2 py-1 rounded-full inline-flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> +{row.diff}%
                    </span>
                  ) : row.diff < -5 ? (
                    <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded-full inline-flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" /> {row.diff}%
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-full inline-flex items-center gap-1">
                      <Minus className="w-3 h-3" /> בממוצע
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
