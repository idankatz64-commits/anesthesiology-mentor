import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowUpDown, Play, ChevronDown, ChevronUp, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { TopicStat } from './useStatsData';
import type { UserProgress, Question } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';

/* ─── Types ──────────────────────────────────────── */

type SortKey = 'topic' | 'totalInDb' | 'totalAnswered' | 'correct' | 'wrong' | 'accuracy' | 'smartScore' | 'groupAvg' | 'position';

type ColId = 'totalInDb' | 'totalAnswered' | 'correct' | 'wrong' | 'accuracy' | 'smartScore' | 'groupAvg' | 'position';

interface Props {
  topicData: TopicStat[];
  onTopicClick: (topic: string) => void;
  progress: UserProgress;
  data: Question[];
}

const ALL_COLS: { id: ColId; label: string }[] = [
  { id: 'totalInDb', label: 'במאגר' },
  { id: 'totalAnswered', label: 'נענו' },
  { id: 'correct', label: 'נכון' },
  { id: 'wrong', label: 'שגוי' },
  { id: 'accuracy', label: 'דיוק' },
  { id: 'smartScore', label: 'Smart Score' },
  { id: 'groupAvg', label: 'ממוצע קבוצה' },
  { id: 'position', label: 'מיקום' },
];

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

const rowVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.04, duration: 0.3, ease: [0, 0, 0.2, 1] as const },
  }),
};

/* ─── Helpers ────────────────────────────────────── */

function accColor(acc: number) {
  if (acc >= 70) return '#00e676';
  if (acc >= 50) return '#ff9800';
  return '#ff1744';
}

function scoreBadge(score: number) {
  if (score >= 70) return { label: 'מצוין', cls: 'bg-[#00e676]/15 text-[#00e676] border-[#00e676]/25' };
  if (score >= 50) return { label: 'בינוני', cls: 'bg-[#ff9800]/15 text-[#ff9800] border-[#ff9800]/25' };
  return { label: 'לשפר', cls: 'bg-[#ff1744]/15 text-[#ff1744] border-[#ff1744]/25' };
}

function positionLabel(myAcc: number, groupAvg: number | null, totalUsers: number | null) {
  if (groupAvg === null) return { label: '—', cls: 'text-muted-foreground' };
  if (totalUsers && totalUsers >= 10 && myAcc >= groupAvg + 20) return { label: 'Top 10%', cls: 'text-[#00e676] font-black' };
  const diff = myAcc - groupAvg;
  if (diff > 5) return { label: 'מעל ממוצע', cls: 'text-[#00e676]' };
  if (diff >= -5) return { label: 'בממוצע', cls: 'text-[#ff9800]' };
  return { label: 'מתחת לממוצע', cls: 'text-[#ff1744]' };
}

/* ─── Main Component ─────────────────────────────── */

export default function TopicPerformanceTable({ topicData, onTopicClick, progress, data }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('smartScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [visibleCols, setVisibleCols] = useState<Set<ColId>>(new Set(ALL_COLS.map(c => c.id)));
  const [groupStats, setGroupStats] = useState<Record<string, { avg: number; users: number }>>({});

  useEffect(() => {
    supabase.rpc('get_global_topic_stats').then(({ data: rows }) => {
      if (!rows) return;
      const map: Record<string, { avg: number; users: number }> = {};
      rows.forEach((r: any) => {
        if (r.topic) map[r.topic] = { avg: Math.round(r.avg_accuracy), users: r.total_users ?? 0 };
      });
      setGroupStats(map);
    });
  }, []);

  const toggleCol = useCallback((id: ColId) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const isVisible = useCallback((id: ColId) => visibleCols.has(id), [visibleCols]);

  const enriched = useMemo(() => {
    return topicData.map(t => ({
      ...t,
      groupAvg: groupStats[t.topic]?.avg ?? null,
      totalUsers: groupStats[t.topic]?.users ?? null,
    }));
  }, [topicData, groupStats]);

  const filtered = useMemo(() => {
    let list = enriched.filter(d => d.topic.toLowerCase().includes(searchTerm.toLowerCase()));
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'topic': cmp = a.topic.localeCompare(b.topic); break;
        case 'groupAvg': cmp = (a.groupAvg ?? -1) - (b.groupAvg ?? -1); break;
        case 'position': cmp = (a.accuracy - (a.groupAvg ?? 0)) - (b.accuracy - (b.groupAvg ?? 0)); break;
        default: cmp = (a[sortKey] as number) - (b[sortKey] as number); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [enriched, searchTerm, sortKey, sortAsc]);

  const displayed = showAll ? filtered : filtered.slice(0, 10);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'topic'); }
  };

  const colCount = 1 + ALL_COLS.filter(c => isVisible(c.id)).length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 flex flex-col gap-3 border-b border-border" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-foreground">ביצועים לפי נושא</h3>
            <p className="text-[10px] mt-0.5 text-muted-foreground">לחץ על שורה לפירוט • מיון לפי Smart Score</p>
          </div>
          <div className="relative w-full sm:w-56">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="חפש נושא..."
              className="w-full py-2 px-3 pl-9 rounded-lg text-sm outline-none transition bg-background border border-border text-foreground placeholder:text-muted-foreground"
            />
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>

        {/* Column Toggle Bar */}
        <div className="flex flex-wrap gap-1.5">
          {ALL_COLS.map(col => {
            const active = isVisible(col.id);
            return (
              <motion.button
                key={col.id}
                onClick={() => toggleCol(col.id)}
                whileTap={{ scale: 0.93 }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all border ${
                  active
                    ? 'bg-primary/15 border-primary text-primary'
                    : 'bg-transparent border-border text-muted-foreground'
                }`}
              >
                {col.label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="bg-background border-b border-border">
                <SortHeader label="נושא" sortKey="topic" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                {isVisible('totalInDb') && <SortHeader label="במאגר" sortKey="totalInDb" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />}
                {isVisible('totalAnswered') && <SortHeader label="נענו" sortKey="totalAnswered" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />}
                {isVisible('correct') && <SortHeader label="נכון" sortKey="correct" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />}
                {isVisible('wrong') && <SortHeader label="שגוי" sortKey="wrong" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />}
                {isVisible('accuracy') && <SortHeader label="דיוק" sortKey="accuracy" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />}
                {isVisible('smartScore') && <SortHeader label="Smart Score" sortKey="smartScore" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />}
                {isVisible('groupAvg') && <SortHeader label="ממוצע קבוצה" sortKey="groupAvg" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />}
                {isVisible('position') && <SortHeader label="מיקום" sortKey="position" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />}
              </tr>
            </thead>
            <tbody>
              {displayed.map((t, idx) => {
                const isExpanded = expandedTopic === t.topic;
                const badge = scoreBadge(t.smartScore);
                const pos = positionLabel(t.accuracy, t.groupAvg, t.totalUsers);

                return (
                  <React.Fragment key={t.topic}>
                    <motion.tr
                      custom={idx}
                      variants={rowVariants}
                      initial="hidden"
                      animate="visible"
                      onClick={() => setExpandedTopic(isExpanded ? null : t.topic)}
                      className={`cursor-pointer transition-colors border-b border-border ${
                        isExpanded ? 'bg-accent/30' : 'hover:bg-muted/50'
                      }`}
                    >
                      <td className="px-2 py-2 font-medium text-foreground text-xs">{t.topic}</td>

                      {isVisible('totalInDb') && (
                        <td className="px-2 py-2 text-center text-[10px] text-muted-foreground">{t.totalInDb}</td>
                      )}
                      {isVisible('totalAnswered') && (
                        <td className="px-2 py-2 text-center text-[10px] text-muted-foreground">{t.totalAnswered}</td>
                      )}
                      {isVisible('correct') && (
                        <td className="px-2 py-2 text-center text-[10px] font-bold" style={{ color: '#00e676' }}>{t.correct}</td>
                      )}
                      {isVisible('wrong') && (
                        <td className="px-2 py-2 text-center text-[10px] font-bold" style={{ color: '#ff1744' }}>{t.wrong}</td>
                      )}
                      {isVisible('accuracy') && (
                        <td className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-10 h-[5px] rounded-full overflow-hidden bg-border">
                              <div className="h-full rounded-full" style={{ width: `${t.accuracy}%`, background: accColor(t.accuracy) }} />
                            </div>
                            <span className="text-[10px] font-bold" style={{ color: accColor(t.accuracy) }}>{t.accuracy}%</span>
                          </div>
                        </td>
                      )}
                      {isVisible('smartScore') && (
                        <td className="px-2 py-2 text-center">
                          <span className={`inline-flex items-center justify-center min-w-[48px] px-2 py-0.5 rounded-full text-[10px] font-black border ${badge.cls}`}>
                            {t.smartScore}% {badge.label}
                          </span>
                        </td>
                      )}
                      {isVisible('groupAvg') && (
                        <td className="px-2 py-2 text-center text-[10px] text-muted-foreground">
                          {t.groupAvg !== null ? `${t.groupAvg}%` : '—'}
                        </td>
                      )}
                      {isVisible('position') && (
                        <td className="px-2 py-2 text-center">
                          <span className={`text-[10px] font-bold ${pos.cls}`}>{pos.label}</span>
                        </td>
                      )}
                    </motion.tr>

                    <AnimatePresence>
                      {isExpanded && (
                        <tr>
                          <td colSpan={colCount} className="p-0">
                            <ExpandedPanel
                              topic={t.topic}
                              topicStat={t}
                              groupAvg={t.groupAvg}
                              totalUsers={t.totalUsers}
                              onStartPractice={() => onTopicClick(t.topic)}
                              onClose={() => setExpandedTopic(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-light">אין עדיין נתונים. התחל לתרגל!</p>
        </div>
      )}

      {filtered.length > 10 && (
        <div className="p-3 text-center border-t border-border">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-bold transition flex items-center gap-1 mx-auto text-primary"
          >
            {showAll ? <><ChevronUp className="w-3 h-3" /> הצג פחות</> : <><ChevronDown className="w-3 h-3" /> הצג הכל ({filtered.length})</>}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Sort Header Cell ───────────────────────────── */

function SortHeader({ label, sortKey, currentKey, asc, onSort }: {
  label: string; sortKey: SortKey; currentKey: SortKey; asc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={`px-2 py-2 text-[10px] font-bold cursor-pointer select-none whitespace-nowrap text-right transition ${
        active ? 'text-primary' : 'text-muted-foreground'
      }`}
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? 'text-primary' : 'text-muted-foreground/40'}`} />
      </span>
    </th>
  );
}

/* ─── Expanded Detail Panel ──────────────────────── */

interface ExpandedProps {
  topic: string;
  topicStat: TopicStat & { groupAvg: number | null; totalUsers: number | null };
  groupAvg: number | null;
  totalUsers: number | null;
  onStartPractice: () => void;
  onClose: () => void;
}

function ExpandedPanel({ topic, topicStat, groupAvg, totalUsers, onStartPractice, onClose }: ExpandedProps) {
  const [sessionData, setSessionData] = useState<{ label: string; acc: number }[]>([]);

  useEffect(() => {
    const fetchSessions = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: rows } = await supabase
        .from('answer_history')
        .select('is_correct, answered_at')
        .eq('user_id', session.user.id)
        .eq('topic', topic)
        .order('answered_at', { ascending: true });

      if (!rows || rows.length === 0) return;

      const byDate: Record<string, { correct: number; total: number }> = {};
      rows.forEach((r: any) => {
        const day = new Date(r.answered_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
        if (!byDate[day]) byDate[day] = { correct: 0, total: 0 };
        byDate[day].total++;
        if (r.is_correct) byDate[day].correct++;
      });

      const sessions = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-5)
        .map(([date, v]) => ({
          label: new Date(date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }),
          acc: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
        }));

      setSessionData(sessions);
    };
    fetchSessions();
  }, [topic]);

  const unanswered = topicStat.totalInDb - topicStat.totalAnswered;
  const gap = groupAvg !== null ? topicStat.accuracy - groupAvg : null;
  const remaining = topicStat.totalInDb - topicStat.totalAnswered;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={spring}
      className="overflow-hidden"
    >
      <div
        className="p-5 bg-accent/20 border-t border-border"
        dir="rtl"
        style={{ borderRight: '2px solid hsl(var(--primary))' }}
      >
        <div className="flex items-start justify-between mb-4">
          <h4 className="text-sm font-bold text-foreground">{topic}</h4>
          <button onClick={e => { e.stopPropagation(); onClose(); }} className="text-muted-foreground hover:text-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <PanelA sessionData={sessionData} />
          <PanelB correct={topicStat.correct} wrong={topicStat.wrong} unanswered={unanswered} accuracy={topicStat.accuracy} />
          <PanelC
            myAccuracy={topicStat.accuracy}
            groupAvg={groupAvg}
            gap={gap}
            remaining={remaining}
            smartScore={topicStat.smartScore}
            onStartPractice={onStartPractice}
          />
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Panel A: Session Bar Chart ─────────────────── */

function PanelA({ sessionData }: { sessionData: { label: string; acc: number }[] }) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-[10px] mb-2 font-bold text-muted-foreground">דיוק ב-5 סשנים אחרונים</p>
      {sessionData.length > 0 ? (
        <div style={{ width: '100%', height: 130 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sessionData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <XAxis dataKey="label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11, color: 'hsl(var(--foreground))' }}
                formatter={(v: number) => [`${v}%`, 'דיוק']}
              />
              <Bar dataKey="acc" radius={[4, 4, 0, 0]} name="דיוק %">
                {sessionData.map((entry, i) => (
                  <Cell key={i} fill={accColor(entry.acc)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-[10px] mt-8 text-muted-foreground/50">אין היסטוריית סשנים עדיין</p>
      )}
    </div>
  );
}

/* ─── Panel B: Donut Chart ───────────────────────── */

function PanelB({ correct, wrong, unanswered, accuracy }: { correct: number; wrong: number; unanswered: number; accuracy: number }) {
  const total = correct + wrong + unanswered;
  if (total === 0) return <div className="flex items-center justify-center text-muted-foreground"><p className="text-xs">אין נתונים</p></div>;

  const segments = [
    { value: correct, color: '#00e676', label: 'נכון' },
    { value: wrong, color: '#ff1744', label: 'שגוי' },
    { value: unanswered, color: 'hsl(var(--muted-foreground))', label: 'לא נענו' },
  ];

  const r = 50, cx = 60, cy = 60, strokeWidth = 14;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center">
      <p className="text-[10px] mb-2 font-bold text-muted-foreground">התפלגות תשובות</p>
      <svg width={120} height={120} viewBox="0 0 120 120">
        {segments.map((seg, i) => {
          const pct = seg.value / total;
          const dash = pct * circumference;
          const el = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              style={{ transition: 'stroke-dasharray 0.5s' }}
            />
          );
          offset += dash;
          return el;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-foreground" fontSize="16" fontWeight="900">{accuracy}%</text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-muted-foreground" fontSize="8">דיוק</text>
      </svg>
      <div className="flex gap-3 mt-2">
        {segments.map(seg => (
          <div key={seg.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
            <span className="text-[9px] text-muted-foreground">{seg.label} ({seg.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Panel C: Group Position ────────────────────── */

function PanelC({ myAccuracy, groupAvg, gap, remaining, smartScore, onStartPractice }: {
  myAccuracy: number; groupAvg: number | null; gap: number | null; remaining: number; smartScore: number;
  onStartPractice: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[10px] font-bold text-center text-muted-foreground">מיקום בקבוצה</p>

      {/* Gradient bar */}
      <div className="relative h-5 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, #ff1744, #ff9800, #00e676)' }}>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-primary bg-background"
          style={{
            left: `${Math.min(98, Math.max(2, myAccuracy))}%`,
            transform: 'translate(-50%, -50%)',
            top: '50%',
          }}
        />
        {groupAvg !== null && (
          <div
            className="absolute top-0 h-full w-[2px]"
            style={{ left: `${Math.min(98, Math.max(2, groupAvg))}%`, background: '#ff9800' }}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-[9px] px-1 text-muted-foreground">
        <span>0%</span>
        <div className="flex gap-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block bg-background border border-primary" /> אני</span>
          {groupAvg !== null && <span className="flex items-center gap-1"><span className="w-2 h-[6px] inline-block" style={{ background: '#ff9800' }} /> ממוצע</span>}
        </div>
        <span>100%</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-5 gap-1 text-center">
        {[
          { label: 'דיוק שלי', value: `${myAccuracy}%`, color: accColor(myAccuracy) },
          { label: 'ממוצע קבוצה', value: groupAvg !== null ? `${groupAvg}%` : '—', color: '#ff9800' },
          { label: 'פער', value: gap !== null ? `${gap > 0 ? '+' : ''}${gap}%` : '—', color: gap !== null ? accColor(myAccuracy) : undefined },
          { label: 'נשאר לסגירה', value: `${remaining}`, color: 'hsl(var(--primary))' },
          { label: 'Smart Score', value: `${smartScore}%`, color: accColor(smartScore) },
        ].map(s => (
          <div key={s.label} className="rounded-lg px-1 py-1.5 bg-card">
            <div className="text-[11px] font-black" style={{ color: s.color }}>{s.value}</div>
            <div className="text-[8px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <button
        onClick={e => { e.stopPropagation(); onStartPractice(); }}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Play className="w-4 h-4" /> התחל תרגול בנושא זה
      </button>
    </div>
  );
}
