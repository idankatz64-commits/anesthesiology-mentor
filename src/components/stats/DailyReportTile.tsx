import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import AnimatedNumber from '@/components/AnimatedNumber';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, TrendingUp, TrendingDown, Minus } from 'lucide-react';

function toIsraelDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

interface DailyData {
  questionsToday: number;
  accuracy: number;
  distinctTopics: number;
  srsTomorrow: number;
}

export default function DailyReportTile() {
  const { progress } = useApp();
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Use Israel timezone for "today" boundaries
      const now = new Date();
      const todayStr = toIsraelDateStr(now);
      const todayISO = todayStr + 'T00:00:00+03:00'; // Israel timezone offset

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = toIsraelDateStr(tomorrow);

      const [answersRes, srsRes] = await Promise.all([
        supabase
          .from('answer_history')
          .select('is_correct, topic')
          .eq('user_id', user.id)
          .gte('answered_at', todayISO),
        supabase
          .from('spaced_repetition')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('next_review_date', tomorrowDate),
      ]);

      const rows = answersRes.data || [];
      const totalCorrect = rows.filter(r => r.is_correct).length;
      const totalAnswered = rows.length;
      const topics = new Set(rows.map(r => r.topic).filter(Boolean));

      setData({
        questionsToday: totalAnswered,
        accuracy: totalAnswered > 0 ? Math.round(totalCorrect / totalAnswered * 100) : 0,
        distinctTopics: topics.size,
        srsTomorrow: srsRes.count ?? 0,
      });
      setLoading(false);
    };
    fetchData();
  }, [progress]);

  if (loading) {
    return <Skeleton className="h-16 rounded-xl" />;
  }

  if (!data) return null;

  const accuracyColor = data.accuracy >= 70 ? 'text-green-500' : data.accuracy >= 50 ? 'text-yellow-500' : 'text-destructive';
  const TrendIcon = data.accuracy >= 70 ? TrendingUp : data.accuracy >= 50 ? Minus : TrendingDown;
  const trendColor = data.accuracy >= 70 ? 'text-green-500' : data.accuracy >= 50 ? 'text-yellow-500' : 'text-destructive';

  const summaryText = data.questionsToday === 0
    ? 'עדיין לא תרגלת היום — התחל עכשיו!'
    : data.accuracy >= 70
      ? `יום מצוין! ${data.questionsToday} שאלות ב-${data.accuracy}% דיוק`
      : `תרגלת ${data.questionsToday} שאלות — המשך לשפר!`;

  return (
    <div className="glass-tile rounded-xl p-4 border-r-4 border-r-green-500/60 flex items-center gap-4" dir="rtl">
      <FileText className="w-5 h-5 text-green-500 shrink-0" />
      <div className="flex-1 flex flex-wrap items-center gap-x-6 gap-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">שאלות היום:</span>
          <AnimatedNumber value={data.questionsToday} className="text-sm font-black text-foreground" style={{ fontFamily: "'Share Tech Mono', monospace" }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">דיוק:</span>
          <AnimatedNumber value={data.accuracy} suffix="%" className={`text-sm font-black ${accuracyColor}`} style={{ fontFamily: "'Share Tech Mono', monospace" }} />
          <TrendIcon className={`w-3.5 h-3.5 ${trendColor}`} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">נושאים:</span>
          <span className="text-sm font-bold text-foreground">{data.distinctTopics}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">SRS מחר:</span>
          <span className="text-sm font-bold text-primary">{data.srsTomorrow}</span>
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground hidden sm:block max-w-[200px]">{summaryText}</span>
    </div>
  );
}
