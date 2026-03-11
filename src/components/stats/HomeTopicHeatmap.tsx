import { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { motion } from 'framer-motion';

interface TopicStat {
  topic: string;
  correct: number;
  total: number;
  accuracy: number;
}

function getAccuracyColor(pct: number): string {
  if (pct >= 80) return 'hsl(142 71% 45%)';   // green
  if (pct >= 50) return 'hsl(36 96% 50%)';     // amber
  return 'hsl(0 84% 60%)';                      // red
}

function getAccuracyBg(pct: number): string {
  if (pct >= 80) return 'rgba(34,197,94,0.15)';
  if (pct >= 50) return 'rgba(245,159,10,0.15)';
  return 'rgba(239,68,68,0.15)';
}

export default function HomeTopicHeatmap() {
  const { data, progress } = useApp();

  const weakTopics = useMemo(() => {
    const topicMap: Record<string, { correct: number; total: number }> = {};
    
    Object.entries(progress.history).forEach(([id, h]) => {
      const q = data.find(x => x[KEYS.ID] === id);
      if (!q || !q[KEYS.TOPIC]) return;
      const topic = q[KEYS.TOPIC];
      if (!topicMap[topic]) topicMap[topic] = { correct: 0, total: 0 };
      topicMap[topic].total += h.answered;
      topicMap[topic].correct += h.correct;
    });

    const stats: TopicStat[] = Object.entries(topicMap)
      .filter(([, v]) => v.total >= 3)
      .map(([topic, v]) => ({
        topic,
        correct: v.correct,
        total: v.total,
        accuracy: Math.round((v.correct / v.total) * 100),
      }));

    // Sort by accuracy ascending (weakest first), take top 7
    stats.sort((a, b) => a.accuracy - b.accuracy);
    return stats.slice(0, 7);
  }, [data, progress.history]);

  if (weakTopics.length === 0) {
    return (
      <div className="glass-tile p-5 flex items-center justify-center text-sm text-muted-foreground">
        תרגל שאלות כדי לראות מפת נושאים
      </div>
    );
  }

  return (
    <div className="glass-tile p-4 h-full">
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-3">
        נושאים להתמקד בהם
      </h3>
      <div className="grid grid-cols-1 gap-2">
        {weakTopics.map((t, i) => (
          <motion.div
            key={t.topic}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/20"
            style={{ background: getAccuracyBg(t.accuracy) }}
          >
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: getAccuracyColor(t.accuracy) }}
            />
            <span className="text-xs text-foreground/80 flex-1 truncate">{t.topic}</span>
            <span 
              className="text-xs font-bold tabular-nums"
              style={{ color: getAccuracyColor(t.accuracy) }}
            >
              {t.accuracy}%
            </span>
            {/* Mini bar */}
            <div className="w-12 h-1.5 rounded-full bg-muted/20 overflow-hidden shrink-0">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: getAccuracyColor(t.accuracy) }}
                initial={{ width: 0 }}
                animate={{ width: `${t.accuracy}%` }}
                transition={{ duration: 0.8, delay: 0.3 + i * 0.05 }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
