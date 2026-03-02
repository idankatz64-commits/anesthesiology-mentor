import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';
import type { DetailedAnswer } from './useStatsData';

export type DrilldownMetric = 'corrected' | 'uncorrected' | 'repeatedErrors';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metric: DrilldownMetric;
  detailedAnswers: DetailedAnswer[];
  onPractice: (questionIds: string[]) => void;
}

const METRIC_LABELS: Record<DrilldownMetric, string> = {
  corrected: 'שאלות מתוקנות',
  uncorrected: 'שאלות שעדיין לא תוקנו',
  repeatedErrors: 'טעויות חוזרות',
};

function filterByMetric(answers: DetailedAnswer[], metric: DrilldownMetric): DetailedAnswer[] {
  switch (metric) {
    case 'corrected':
      return answers.filter(a => a.ever_wrong && a.is_correct);
    case 'uncorrected':
      return answers.filter(a => a.ever_wrong && !a.is_correct);
    case 'repeatedErrors':
      return answers.filter(a => (a.answered_count - a.correct_count) > 1);
  }
}

interface TopicRow {
  topic: string;
  count: number;
  totalInTopic: number;
  pct: number;
  questionIds: string[];
}

export default function PersonalStatsDrilldown({ open, onOpenChange, metric, detailedAnswers, onPractice }: Props) {
  const rows = useMemo<TopicRow[]>(() => {
    const filtered = filterByMetric(detailedAnswers, metric);

    // Count total answers per topic for percentage
    const topicTotals: Record<string, number> = {};
    for (const a of detailedAnswers) {
      const t = a.topic || 'ללא נושא';
      topicTotals[t] = (topicTotals[t] || 0) + 1;
    }

    // Group filtered by topic
    const grouped: Record<string, string[]> = {};
    for (const a of filtered) {
      const t = a.topic || 'ללא נושא';
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(a.question_id);
    }

    return Object.entries(grouped)
      .map(([topic, ids]) => ({
        topic,
        count: ids.length,
        totalInTopic: topicTotals[topic] || ids.length,
        pct: Math.round((ids.length / (topicTotals[topic] || 1)) * 100),
        questionIds: ids,
      }))
      .sort((a, b) => b.count - a.count);
  }, [detailedAnswers, metric]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[480px] overflow-y-auto" dir="rtl">
        <SheetHeader>
          <SheetTitle className="text-right">{METRIC_LABELS[metric]}</SheetTitle>
          <p className="text-xs text-muted-foreground text-right">פירוט לפי נושא • לחץ ״תרגל עכשיו״ להתחיל תרגול</p>
        </SheetHeader>

        {rows.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">אין נתונים להצגה</div>
        ) : (
          <div className="mt-4 space-y-2">
            {rows.map(row => (
              <div key={row.topic} className="bg-muted/30 border border-border rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-foreground truncate">{row.topic}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {row.count} שאלות • {row.pct}% מהנושא
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs gap-1"
                  onClick={() => {
                    onPractice(row.questionIds);
                    onOpenChange(false);
                  }}
                >
                  <Play className="w-3 h-3" />
                  תרגל עכשיו
                </Button>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
