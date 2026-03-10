import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import AnimatedNumber from '@/components/AnimatedNumber';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarCheck, Target, BookOpen, Clock } from 'lucide-react';

interface DailyData {
  questionsToday: number;
  accuracy: number;
  distinctTopics: number;
  srsTomorrow: number;
}

export default function DailyReportTile() {
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();

      const tomorrow = new Date(todayStart);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split('T')[0];

      const [answersRes, srsRes] = await Promise.all([
        supabase
          .from('user_answers')
          .select('correct_count, answered_count, topic')
          .eq('user_id', user.id)
          .gte('updated_at', todayISO),
        supabase
          .from('spaced_repetition')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('next_review', tomorrowDate),
      ]);

      const rows = answersRes.data || [];
      const totalCorrect = rows.reduce((s, r) => s + (r.correct_count || 0), 0);
      const totalAnswered = rows.reduce((s, r) => s + (r.answered_count || 0), 0);
      const topics = new Set(rows.map(r => r.topic).filter(Boolean));

      setData({
        questionsToday: rows.length,
        accuracy: totalAnswered > 0 ? Math.round(totalCorrect / totalAnswered * 100) : 0,
        distinctTopics: topics.size,
        srsTomorrow: srsRes.count ?? 0,
      });
      setLoading(false);
    };
    fetchData();
  }, []);

  const accuracyColor = data
    ? data.accuracy >= 70 ? 'text-green-500' : data.accuracy >= 50 ? 'text-yellow-500' : 'text-destructive'
    : '';

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" dir="rtl">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const tiles = [
    { icon: CalendarCheck, label: 'שאלות היום', value: data.questionsToday, colorClass: 'text-foreground' },
    { icon: Target, label: 'דיוק', value: data.accuracy, colorClass: accuracyColor, suffix: '%' },
    { icon: BookOpen, label: 'נושאים', value: data.distinctTopics, colorClass: 'text-foreground' },
    { icon: Clock, label: 'SRS מחר', value: data.srsTomorrow, colorClass: 'text-primary' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" dir="rtl">
      {tiles.map((t) => (
        <div key={t.label} className="bg-card border border-border rounded-xl p-3 text-center flex flex-col items-center gap-1">
          <t.icon className="w-4 h-4 text-muted-foreground" />
          <AnimatedNumber
            value={t.value}
            suffix={t.suffix}
            className={`text-2xl font-black ${t.colorClass}`}
            style={{ fontFamily: "'Share Tech Mono', monospace" }}
          />
          <div className="text-[10px] text-muted-foreground">{t.label}</div>
        </div>
      ))}
    </div>
  );
}
