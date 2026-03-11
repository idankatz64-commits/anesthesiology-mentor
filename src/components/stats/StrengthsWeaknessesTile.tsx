import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { TopicStat } from '@/components/stats/useStatsData';
import type { ForgettingRisk } from '@/components/stats/useStatsData';
import type { WeakZone } from '@/components/stats/useStatsData';
import WeakZoneMapTile from '@/components/stats/WeakZoneMapTile';
import ForgettingRiskTile from '@/components/stats/ForgettingRiskTile';

interface Props {
  topicData: TopicStat[];
  weakZones: WeakZone;
  forgettingRisk: ForgettingRisk[];
}

export default function StrengthsWeaknessesTile({ topicData, weakZones, forgettingRisk }: Props) {
  const [open, setOpen] = useState(false);

  const sorted = [...topicData].filter(t => t.totalAnswered >= 3).sort((a, b) => b.accuracy - a.accuracy);
  const top2 = sorted.slice(0, 2);
  const bottom2 = sorted.length > 4 ? sorted.slice(-2).reverse() : sorted.slice(Math.max(0, sorted.length - 2)).reverse();

  return (
    <>
      <div
        className="glass-tile rounded-xl p-4 h-full cursor-pointer hover:border-primary/30 transition-colors"
        dir="rtl"
        onClick={() => setOpen(true)}
      >
        <h3 className="text-sm font-bold text-foreground mb-3">חוזקות וחולשות</h3>

        {/* Top Performance */}
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-green-500" />
            <span className="text-[10px] font-bold text-green-500 uppercase tracking-wider">ביצועים חזקים</span>
          </div>
          <div className="space-y-2">
            {top2.map(t => (
              <div key={t.topic}>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className="text-foreground truncate max-w-[70%]">{t.topic}</span>
                  <span className="text-green-500 font-bold">{t.accuracy}%</span>
                </div>
                <Progress value={t.accuracy} className="h-1.5 bg-muted/30 [&>div]:bg-green-500" />
              </div>
            ))}
          </div>
        </div>

        {/* Action Required */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown className="w-3.5 h-3.5 text-destructive" />
            <span className="text-[10px] font-bold text-destructive uppercase tracking-wider">דורש חיזוק</span>
          </div>
          <div className="space-y-2">
            {bottom2.map(t => (
              <div key={t.topic}>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className="text-foreground truncate max-w-[70%]">{t.topic}</span>
                  <span className="text-destructive font-bold">{t.accuracy}%</span>
                </div>
                <Progress value={t.accuracy} className="h-1.5 bg-muted/30 [&>div]:bg-destructive" />
              </div>
            ))}
          </div>
        </div>

        <p className="text-[9px] text-muted-foreground mt-3 text-center">לחץ לפירוט מלא</p>
      </div>

      {/* Expanded modal with WeakZones + ForgettingRisk */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
            >
              <motion.div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" />
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto p-6 relative z-10"
                dir="rtl"
              >
                <button
                  onClick={() => setOpen(false)}
                  className="absolute top-4 left-4 w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition z-20"
                >
                  <X className="w-4 h-4" />
                </button>
                <h3 className="text-lg font-bold text-foreground mb-4">ניתוח חוזקות וחולשות</h3>
                <div className="space-y-4">
                  <WeakZoneMapTile zones={weakZones} />
                  <ForgettingRiskTile risks={forgettingRisk} />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
