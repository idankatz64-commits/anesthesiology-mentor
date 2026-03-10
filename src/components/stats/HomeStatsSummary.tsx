import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, Target, CalendarClock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import AnimatedNumber from '@/components/AnimatedNumber';

export default function HomeStatsSummary() {
  const [loading, setLoading] = useState(true);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const today = new Date().toISOString().split('T')[0];

      const [answersRes, dueRes] = await Promise.all([
        supabase.from('user_answers').select('is_correct').eq('user_id', user.id),
        supabase.from('spaced_repetition').select('id', { count: 'exact', head: true }).eq('user_id', user.id).lte('next_review_date' as any, today),
      ]);

      const rows = answersRes.data || [];
      const total = rows.length;
      const correct = rows.filter(r => r.is_correct).length;

      setTotalAnswered(total);
      setAccuracy(total > 0 ? Math.round((correct / total) * 100) : 0);
      setDueCount(dueRes.count || 0);
      setLoading(false);
    })();
  }, []);

  const accuracyColor = accuracy >= 70 ? 'text-success' : accuracy >= 50 ? 'text-warning' : 'text-destructive';

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="deep-tile p-5 text-center">
        <div className="flex justify-center mb-2">
          <CheckCircle className="w-5 h-5 text-primary" />
        </div>
        {loading ? <Skeleton className="h-8 w-16 mx-auto" /> : (
          <div className="text-3xl font-bold matrix-text">
            <AnimatedNumber value={totalAnswered} />
          </div>
        )}
        <div className="text-xs text-muted-foreground font-medium mt-1">שאלות שנענו</div>
      </div>

      <div className="liquid-glass p-5 text-center">
        <div className="flex justify-center mb-2">
          <Target className={`w-5 h-5 ${accuracyColor}`} />
        </div>
        {loading ? <Skeleton className="h-8 w-16 mx-auto" /> : (
          <div className={`text-3xl font-bold matrix-text ${accuracyColor}`}>
            <AnimatedNumber value={accuracy} suffix="%" />
          </div>
        )}
        <div className="text-xs text-muted-foreground font-medium mt-1">דיוק</div>
      </div>

      <div className="liquid-glass p-5 text-center">
        <div className="flex justify-center mb-2">
          <CalendarClock className="w-5 h-5 text-primary" />
        </div>
        {loading ? <Skeleton className="h-8 w-16 mx-auto" /> : (
          <div className="text-3xl font-bold matrix-text">
            <AnimatedNumber value={dueCount} />
          </div>
        )}
        <div className="text-xs text-muted-foreground font-medium mt-1">לחזרה היום</div>
      </div>
    </div>
  );
}
