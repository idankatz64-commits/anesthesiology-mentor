import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, Target, TrendingDown, RotateCcw } from 'lucide-react';
import AnimatedNumber from '@/components/AnimatedNumber';

interface WeakTopic {
  topic: string;
  errorCount: number;
}

function toIsraelStartOfDay(): string {
  const now = new Date();
  const israelDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  israelDate.setHours(0, 0, 0, 0);
  // Convert back to UTC ISO string
  const offset = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const israelOffset = israelDate.getTime() - offset;
  // Simpler: just format as ISO in Israel midnight
  const y = israelDate.getFullYear();
  const m = String(israelDate.getMonth() + 1).padStart(2, '0');
  const d = String(israelDate.getDate()).padStart(2, '0');
  // Israel is UTC+2 or UTC+3 (DST)
  // Use the browser's knowledge of the offset
  const utcMidnightIsrael = new Date(`${y}-${m}-${d}T00:00:00+03:00`);
  // Check if we're in DST by comparing
  const jan = new Date(y, 0, 1).getTimezoneOffset();
  const jul = new Date(y, 6, 1).getTimezoneOffset();
  const isDST = israelDate.getTimezoneOffset() < Math.max(jan, jul);
  // Israel: IST = UTC+2, IDT = UTC+3
  const offsetStr = isDST ? '+03:00' : '+02:00';
  return `${y}-${m}-${d}T00:00:00${offsetStr}`;
}

export default function DailyReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [srsReviewed, setSrsReviewed] = useState(0);
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const todayStart = toIsraelStartOfDay();

      const [totalRes, correctRes, srsRes, topicRes, categoriesRes] = await Promise.all([
        // Total answered today
        supabase
          .from('answer_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('answered_at', todayStart),
        // Correct today
        supabase
          .from('answer_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('answered_at', todayStart)
          .eq('is_correct', true),
        // SRS cards reviewed today
        supabase
          .from('spaced_repetition')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('updated_at', todayStart),
        // Topic errors today (fetch only wrong answers)
        supabase
          .from('answer_history')
          .select('topic')
          .eq('user_id', user.id)
          .gte('answered_at', todayStart)
          .eq('is_correct', false),
        // Categories for display names
        supabase
          .from('categories')
          .select('topic_num, topic_main'),
      ]);

      setTotalAnswered(totalRes.count || 0);
      setCorrectCount(correctRes.count || 0);
      setSrsReviewed(srsRes.count || 0);

      // Group errors by topic, take top 3
      const errorsByTopic: Record<string, number> = {};
      (topicRes.data || []).forEach(row => {
        const t = row.topic || 'לא ידוע';
        errorsByTopic[t] = (errorsByTopic[t] || 0) + 1;
      });

      const catMap: Record<string, string> = {};
      (categoriesRes.data || []).forEach(c => {
        if (c.topic_num != null) catMap[String(c.topic_num)] = c.topic_main;
      });

      const sorted = Object.entries(errorsByTopic)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([topic, count]) => ({
          topic: catMap[topic] || topic,
          errorCount: count,
        }));

      setWeakTopics(sorted);
      setLoading(false);
    })();
  }, [open]);

  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
  const accuracyColor = accuracy >= 70 ? 'text-success' : accuracy >= 50 ? 'text-warning' : 'text-destructive';

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[90vw] sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">דו״ח יומי 📊</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* Main stats grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="liquid-glass p-4 text-center">
              <CheckCircle className="w-5 h-5 text-primary mx-auto mb-1" />
              {loading ? <Skeleton className="h-8 w-12 mx-auto" /> : (
                <div className="text-2xl font-bold matrix-text"><AnimatedNumber value={totalAnswered} /></div>
              )}
              <div className="text-xs text-muted-foreground mt-1">שאלות היום</div>
            </div>

            <div className="liquid-glass p-4 text-center">
              <Target className={`w-5 h-5 mx-auto mb-1 ${accuracyColor}`} />
              {loading ? <Skeleton className="h-8 w-12 mx-auto" /> : (
                <div className={`text-2xl font-bold matrix-text ${accuracyColor}`}>
                  <AnimatedNumber value={accuracy} suffix="%" />
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-1">דיוק היום</div>
            </div>

            <div className="liquid-glass p-4 text-center">
              <CheckCircle className="w-5 h-5 text-success mx-auto mb-1" />
              {loading ? <Skeleton className="h-8 w-12 mx-auto" /> : (
                <div className="text-2xl font-bold text-success matrix-text"><AnimatedNumber value={correctCount} /></div>
              )}
              <div className="text-xs text-muted-foreground mt-1">תשובות נכונות</div>
            </div>

            <div className="liquid-glass p-4 text-center">
              <RotateCcw className="w-5 h-5 text-primary mx-auto mb-1" />
              {loading ? <Skeleton className="h-8 w-12 mx-auto" /> : (
                <div className="text-2xl font-bold matrix-text"><AnimatedNumber value={srsReviewed} /></div>
              )}
              <div className="text-xs text-muted-foreground mt-1">כרטיסי SRS היום</div>
            </div>
          </div>

          {/* Weak topics */}
          {!loading && weakTopics.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-destructive" />
                נושאים חלשים היום
              </h4>
              <div className="space-y-2">
                {weakTopics.map((wt, i) => (
                  <div key={i} className="flex items-center justify-between liquid-glass p-3 text-sm">
                    <span className="text-foreground font-medium truncate flex-1">{wt.topic}</span>
                    <span className="text-destructive font-bold mr-3">{wt.errorCount} שגיאות</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && totalAnswered === 0 && (
            <div className="text-center text-muted-foreground text-sm py-4">
              עדיין לא תרגלת היום — התחל עכשיו! 💪
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
