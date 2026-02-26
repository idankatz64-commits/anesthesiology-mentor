import { useState, useMemo } from 'react';
import AnimatedStatsTile from './AnimatedStatsTile';
import type { WeakZone } from './useStatsData';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface Props {
  zones: WeakZone;
}

export default function WeakZoneMapTile({ zones }: Props) {
  const { data, startSession } = useApp();

  const startZoneSession = (ids: string[]) => {
    const questions = data.filter(q => ids.includes(q[KEYS.ID]));
    if (questions.length > 0) {
      startSession(questions, Math.min(questions.length, 20), 'practice');
    }
  };

  // Group IDs by topic
  const groupByTopic = (ids: string[]) => {
    const map: Record<string, string[]> = {};
    ids.forEach(id => {
      const q = data.find(x => x[KEYS.ID] === id);
      const t = q ? (q[KEYS.TOPIC] || 'אחר') : 'אחר';
      if (!map[t]) map[t] = [];
      map[t].push(id);
    });
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  };

  const deadTopics = useMemo(() => groupByTopic(zones.deadZone), [zones.deadZone, data]);
  const studiedTopics = useMemo(() => groupByTopic(zones.studiedNotLearned), [zones.studiedNotLearned, data]);
  const masteredPct = useMemo(() => data.length > 0 ? Math.round((zones.mastered.length / data.length) * 100) : 0, [zones.mastered, data]);

  // Topic distribution bar for studied-not-learned
  const studiedTotal = zones.studiedNotLearned.length;
  const studiedBarSegments = useMemo(() => {
    return studiedTopics.slice(0, 5).map(([topic, ids]) => ({
      topic,
      pct: studiedTotal > 0 ? (ids.length / studiedTotal) * 100 : 0,
    }));
  }, [studiedTopics, studiedTotal]);

  const barColors = ['bg-yellow-400', 'bg-yellow-500', 'bg-amber-400', 'bg-amber-500', 'bg-orange-400'];

  return (
    <AnimatedStatsTile
      collapsed={
        <div className="p-5 space-y-3">
          <span className="text-xs text-muted-foreground font-medium">מפת חולשות</span>

          {/* Dead Zone */}
          <div className="flex items-start gap-2">
            <span className="text-lg">🔴</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-red-400">אזור מת</span>
                <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full font-bold">{zones.deadZone.length}</span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {deadTopics.slice(0, 3).map(([topic]) => (
                  <span key={topic} className="text-[9px] bg-red-500/10 text-red-400/80 px-2 py-0.5 rounded-full truncate max-w-[100px]">{topic}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Studied Not Learned */}
          <div className="flex items-start gap-2">
            <span className="text-lg">🟡</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-yellow-400">נלמד לא נרכש</span>
                <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full font-bold">{zones.studiedNotLearned.length}</span>
              </div>
              {studiedTotal > 0 && (
                <div className="flex h-2 rounded-full overflow-hidden mt-1.5">
                  {studiedBarSegments.map((seg, i) => (
                    <div key={seg.topic} className={`${barColors[i]} h-full`} style={{ width: `${seg.pct}%` }} title={seg.topic} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Mastered */}
          <div className="flex items-start gap-2">
            <span className="text-lg">🟢</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-green-400">נרכש</span>
                <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold">{zones.mastered.length}</span>
              </div>
              {/* Mini progress ring */}
              <div className="mt-1.5 flex items-center gap-2">
                <svg width="28" height="28" viewBox="0 0 28 28">
                  <circle cx="14" cy="14" r="11" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                  <circle
                    cx="14" cy="14" r="11" fill="none" stroke="#22C55E" strokeWidth="3"
                    strokeDasharray={`${(masteredPct / 100) * 69.1} 69.1`}
                    strokeLinecap="round"
                    transform="rotate(-90 14 14)"
                  />
                </svg>
                <span className="text-[10px] text-green-400 font-bold">{masteredPct}% מהמאגר</span>
              </div>
            </div>
          </div>
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-foreground mb-4">מפת חולשות — פירוט לפי נושא</h3>
          <ExpandedZoneSection
            emoji="🔴" label="אזור מת" color="red"
            topics={deadTopics}
            data={data}
            onPractice={() => startZoneSession(zones.deadZone)}
            showPractice={zones.deadZone.length > 0}
          />
          <ExpandedZoneSection
            emoji="🟡" label="נלמד לא נרכש" color="yellow"
            topics={studiedTopics}
            data={data}
            onPractice={() => startZoneSession(zones.studiedNotLearned)}
            showPractice={zones.studiedNotLearned.length > 0}
          />
          <ExpandedZoneSection
            emoji="🟢" label="נרכש" color="green"
            topics={groupByTopic(zones.mastered)}
            data={data}
            showPractice={false}
          />
        </div>
      }
    />
  );
}

function ExpandedZoneSection({
  emoji, label, color, topics, data: allData, onPractice, showPractice,
}: {
  emoji: string; label: string; color: string;
  topics: [string, string[]][];
  data: any[];
  onPractice?: () => void;
  showPractice: boolean;
}) {
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const total = topics.reduce((s, [, ids]) => s + ids.length, 0);

  const colorMap: Record<string, string> = {
    red: 'border-red-500/30 bg-red-500/5',
    yellow: 'border-yellow-500/30 bg-yellow-500/5',
    green: 'border-green-500/30 bg-green-500/5',
  };

  return (
    <div className={`mb-5 border rounded-xl p-4 ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-bold text-sm text-foreground">{emoji} {label} ({total})</h4>
        {showPractice && onPractice && (
          <button
            onClick={(e) => { e.stopPropagation(); onPractice(); }}
            className="text-xs bg-orange-500/20 text-orange-400 px-3 py-1 rounded-lg hover:bg-orange-500/30 transition font-medium"
          >
            התחל תרגול על האזור
          </button>
        )}
      </div>
      {topics.length === 0 ? (
        <p className="text-xs text-muted-foreground">אין שאלות באזור זה</p>
      ) : (
        <div className="space-y-1">
          {topics.map(([topic, ids]) => (
            <div key={topic}>
              <button
                onClick={(e) => { e.stopPropagation(); setOpenTopic(openTopic === topic ? null : topic); }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/30 transition text-sm"
              >
                <span className="text-foreground font-medium truncate">{topic}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{ids.length} שאלות</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${openTopic === topic ? 'rotate-180' : ''}`} />
                </div>
              </button>
              <AnimatePresence>
                {openTopic === topic && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="pl-4 pr-2 pb-2 space-y-1 max-h-40 overflow-y-auto">
                      {ids.slice(0, 15).map(id => {
                        const q = allData.find((x: any) => x[KEYS.ID] === id);
                        return (
                          <div key={id} className="text-[11px] text-muted-foreground truncate bg-muted/20 px-2 py-1 rounded">
                            {q ? q[KEYS.QUESTION].slice(0, 80) : id}
                          </div>
                        );
                      })}
                      {ids.length > 15 && <p className="text-[10px] text-muted-foreground/50">ועוד {ids.length - 15} שאלות...</p>}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
