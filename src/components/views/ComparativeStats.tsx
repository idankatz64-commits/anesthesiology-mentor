import { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { Users, TrendingUp, TrendingDown, Minus } from 'lucide-react';

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

  if (loading) {
    return (
      <div className="soft-card bg-card border border-border p-8 text-center">
        <p className="text-muted-foreground animate-pulse">טוען נתוני קבוצה...</p>
      </div>
    );
  }

  if (globalStats.length === 0) {
    return (
      <div className="soft-card bg-card border border-border p-8 text-center">
        <Users className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">אין עדיין מספיק נתונים קבוצתיים.</p>
        <p className="text-xs text-muted-foreground mt-1">תרגל עוד כדי לראות את מיקומך בקבוצה.</p>
      </div>
    );
  }

  return (
    <div className="soft-card bg-card border border-border overflow-hidden card-accent-top">
      <div className="p-6 border-b border-border">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          מיקומך בקבוצה
        </h3>
        <p className="text-xs text-muted-foreground mt-1">השוואת הביצועים שלך מול הממוצע הכללי</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border text-muted-foreground">
              <th className="px-4 py-3 text-right text-xs font-bold">נושא</th>
              <th className="px-4 py-3 text-center text-xs font-bold">הדיוק שלך %</th>
              <th className="px-4 py-3 text-center text-xs font-bold">ממוצע כללי %</th>
              <th className="px-4 py-3 text-center text-xs font-bold">מענה שלך</th>
              <th className="px-4 py-3 text-center text-xs font-bold">משתמשים</th>
              <th className="px-4 py-3 text-center text-xs font-bold">מצב</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map(row => (
              <tr key={row.topic} className="border-b border-border hover:bg-muted/30 transition">
                <td className="px-4 py-3 font-medium text-foreground">{row.topic}</td>
                <td className="px-4 py-3 text-center">
                  {row.myAccuracy !== null ? (
                    <span className={`font-bold matrix-text ${row.myAccuracy >= 80 ? 'text-success' : row.myAccuracy >= 60 ? 'text-warning' : 'text-destructive'}`}>
                      {row.myAccuracy}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center font-medium text-muted-foreground matrix-text">{row.globalAccuracy}%</td>
                <td className="px-4 py-3 text-center text-muted-foreground matrix-text">{row.myAnswered}</td>
                <td className="px-4 py-3 text-center text-muted-foreground matrix-text">{row.globalUsers}</td>
                <td className="px-4 py-3 text-center">
                  {row.diff === null ? (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">לא נענה</span>
                  ) : row.diff > 5 ? (
                    <span className="text-xs font-bold text-success bg-success/10 px-2 py-1 rounded-full flex items-center gap-1 justify-center">
                      <TrendingUp className="w-3 h-3" /> מעל הממוצע
                    </span>
                  ) : row.diff < -5 ? (
                    <span className="text-xs font-bold text-destructive bg-destructive/10 px-2 py-1 rounded-full flex items-center gap-1 justify-center">
                      <TrendingDown className="w-3 h-3" /> מתחת לממוצע
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-warning bg-warning/10 px-2 py-1 rounded-full flex items-center gap-1 justify-center">
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
