import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer
} from 'recharts';
import GaugeDial from './GaugeDial';
import { Progress } from '@/components/ui/progress';
import type { TopicStat, WeakZone, ForgettingRisk } from './useStatsData';

interface ERITileProps {
  value: number;
  accuracy: number;
  coverage: number;
  criticalAvg: number;
  consistency: number;
  streak: number;
  weakZones?: WeakZone;
  topicData?: TopicStat[];
  forgettingRisk?: ForgettingRisk[];
  totalQuestions?: number;
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

function ERIRing({ value, size = 140 }: { value: number; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 70 ? '#22C55E' : value >= 50 ? '#f59e0b' : '#EF4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity={0.1} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s ease-out', filter: `drop-shadow(0 0 8px ${color}40)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-black text-foreground" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{value}%</span>
        <span className="text-xs text-muted-foreground font-medium mt-1">{getLabel(value)}</span>
      </div>
    </div>
  );
}

function getLabel(value: number) {
  if (value >= 70) return 'מוכן למבחן';
  if (value >= 50) return 'טוב';
  return 'מוכן חלקית';
}

export default function ERITile({
  value, accuracy, coverage, criticalAvg, consistency, streak,
  weakZones, topicData, forgettingRisk, totalQuestions = 0
}: ERITileProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const radarData = [
    { subject: 'דיוק (25%)', val: accuracy, fullMark: 100 },
    { subject: 'כיסוי (25%)', val: coverage, fullMark: 100 },
    { subject: 'נושאים קריטיים (30%)', val: criticalAvg, fullMark: 100 },
    { subject: 'עקביות (20%)', val: consistency, fullMark: 100 },
  ];

  // Weak zone gauges
  const deadCount = weakZones?.deadZone.length ?? 0;
  const studiedCount = weakZones?.studiedNotLearned.length ?? 0;
  const masteredCount = weakZones?.mastered.length ?? 0;
  const maxGauge = Math.max(deadCount, studiedCount, masteredCount, 1);
  const deadPct = totalQuestions > 0 ? Math.round((deadCount / totalQuestions) * 100) : 0;
  const studiedPct = totalQuestions > 0 ? Math.round((studiedCount / totalQuestions) * 100) : 0;
  const masteredPct = totalQuestions > 0 ? Math.round((masteredCount / totalQuestions) * 100) : 0;

  // Strengths/weaknesses from topicData
  const sorted = [...(topicData || [])].filter(t => t.totalAnswered >= 3).sort((a, b) => b.accuracy - a.accuracy);
  const top2 = sorted.slice(0, 2);
  const bottom2 = sorted.length > 4 ? sorted.slice(-2).reverse() : sorted.slice(Math.max(0, sorted.length - 2)).reverse();

  return (
    <>
      <motion.div
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
        transition={spring}
        className="glass-tile rounded-xl cursor-pointer p-4"
        dir="rtl"
      >
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* ERI Ring */}
          <div className="flex flex-col items-center shrink-0">
            <ERIRing value={value} size={140} />
            <p className="mt-1 font-mono font-bold text-sm text-primary">מדד מוכנות למבחן</p>
          </div>

          {/* Right side: Gauges + Weak Zone Gauges */}
          <div className="flex-1 grid grid-cols-3 sm:grid-cols-6 gap-3 w-full">
            {/* Main metrics */}
            <div className="flex flex-col items-center glass-tile rounded-lg p-2">
              <span className="text-xl font-black text-foreground" style={{ fontFamily: "'Share Tech Mono', monospace", color: accuracy >= 70 ? '#22C55E' : accuracy >= 50 ? '#f59e0b' : '#EF4444' }}>{accuracy}%</span>
              <span className="text-[9px] text-muted-foreground">דיוק</span>
            </div>
            <div className="flex flex-col items-center glass-tile rounded-lg p-2">
              <span className="text-xl font-black text-primary" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{coverage}%</span>
              <span className="text-[9px] text-muted-foreground">כיסוי</span>
            </div>
            <div className="flex flex-col items-center glass-tile rounded-lg p-2">
              <span className="text-xl font-black" style={{ fontFamily: "'Share Tech Mono', monospace", color: '#FB923C' }}>{streak}</span>
              <span className="text-[9px] text-muted-foreground">רצף</span>
            </div>
            {/* Weak zone gauges */}
            <div className="flex flex-col items-center glass-tile rounded-lg p-2">
              <span className="text-xl font-black text-green-500" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{masteredCount}</span>
              <span className="text-[9px] text-muted-foreground">🟢 נרכש</span>
            </div>
            <div className="flex flex-col items-center glass-tile rounded-lg p-2">
              <span className="text-xl font-black text-yellow-500" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{studiedCount}</span>
              <span className="text-[9px] text-muted-foreground">🟡 לא נרכש</span>
            </div>
            <div className="flex flex-col items-center glass-tile rounded-lg p-2">
              <span className="text-xl font-black text-destructive" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{deadCount}</span>
              <span className="text-[9px] text-muted-foreground">🔴 אזור מת</span>
            </div>
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground text-center mt-2">לחץ לפירוט מלא</p>
      </motion.div>

      {/* Expanded modal with everything */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
            >
              <motion.div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={spring}
                className="bg-card border border-border rounded-xl w-[90vw] max-w-5xl max-h-[90vh] overflow-y-auto p-6 relative z-10"
                dir="rtl"
              >
                <button onClick={(e) => { e.stopPropagation(); setOpen(false); }} className="absolute top-4 left-4 w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition z-20">
                  <X className="w-4 h-4" />
                </button>

                <h3 className="text-lg font-bold text-foreground mb-6">מדד מוכנות למבחן (ERI) — פירוט מלא</h3>

                {/* ERI Ring + Radar */}
                <div className="flex flex-col md:flex-row items-center gap-8 mb-6">
                  <ERIRing value={value} size={180} />
                  <div className="flex-1 w-full" style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="rgba(255,255,255,0.1)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 10 }} />
                        <Radar dataKey="val" stroke="#F97316" fill="#F97316" fillOpacity={0.25} strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Component scores */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  {[
                    { label: 'דיוק', val: accuracy, weight: '25%' },
                    { label: 'כיסוי', val: coverage, weight: '25%' },
                    { label: 'נושאים קריטיים', val: criticalAvg, weight: '30%' },
                    { label: 'עקביות', val: consistency, weight: '20%' },
                  ].map((item) => (
                    <div key={item.label} className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-foreground">{item.val}%</div>
                      <div className="text-[10px] text-muted-foreground">{item.label} ({item.weight})</div>
                    </div>
                  ))}
                </div>

                {/* Weak Zone Map */}
                {weakZones && (
                  <div className="mb-6">
                    <h4 className="text-sm font-bold text-foreground mb-3">מפת חולשות</h4>
                    <div className="grid grid-cols-3 gap-3">
                      <GaugeDial value={masteredCount} max={maxGauge} color="#22C55E" label="🟢 נרכש" pct={masteredPct} />
                      <GaugeDial value={studiedCount} max={maxGauge} color="#f59e0b" label="🟡 לא נרכש" pct={studiedPct} />
                      <GaugeDial value={deadCount} max={maxGauge} color="#EF4444" label="🔴 אזור מת" pct={deadPct} />
                    </div>
                  </div>
                )}

                {/* Strengths & Weaknesses */}
                {topicData && topicData.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-sm font-bold text-foreground mb-3">חוזקות וחולשות</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Top performers */}
                      <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-3">
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
                      {/* Weak performers */}
                      <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3">
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
                    </div>
                  </div>
                )}

                {/* Forgetting Risk top items */}
                {forgettingRisk && forgettingRisk.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-foreground mb-3">סיכון שכחה — נושאים בסיכון גבוה</h4>
                    <div className="space-y-2 max-h-[30vh] overflow-y-auto">
                      {forgettingRisk.slice(0, 6).map(r => (
                        <div key={r.topic} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2">
                          <span className="text-xs text-foreground truncate flex-1">{r.topic}</span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-[10px] text-muted-foreground">{r.daysSince} ימים • {r.accuracy}%</span>
                            <span className="text-sm font-black text-primary" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{r.risk.toFixed(1)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
