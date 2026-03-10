import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowUpDown, Play, ChevronDown, ChevronUp, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { TopicStat } from './useStatsData';
import type { UserProgress, Question } from '@/lib/types';
import { KEYS } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';

type SortKey = 'rank' | 'topic' | 'totalInDb' | 'coverage' | 'accuracy' | 'smartScore';

interface Props {
  topicData: TopicStat[];
  onTopicClick: (topic: string) => void;
  progress: UserProgress;
  data: Question[];
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

function getAccuracyColor(acc: number) {
  if (acc >= 70) return '#22c55e';
  if (acc >= 50) return '#f59e0b';
  return '#ef4444';
}

function getScoreBadge(score: number) {
  if (score >= 70) return { label: 'מצוין', bg: 'bg-green-500/15 text-green-400 border-green-500/20' };
  if (score >= 50) return { label: 'בינוני', bg: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' };
  return { label: 'לשפר', bg: 'bg-red-500/15 text-red-400 border-red-500/20' };
}

function getPositionBadge(myAcc: number, groupAvg: number | null) {
  if (groupAvg === null) return null;
  const diff = myAcc - groupAvg;
  if (diff > 5) return { label: 'מעל ממוצע', bg: 'bg-green-500/10 text-green-400' };
  if (diff >= -5) return { label: 'בממוצע', bg: 'bg-muted/40 text-muted-foreground' };
  return { label: 'מתחת לממוצע', bg: 'bg-red-500/10 text-red-400' };
}

export default function TopicPerformanceTable({ topicData, onTopicClick, progress, data }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('smartScore');
  const [sortAsc, setSortAsc] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [groupStats, setGroupStats] = useState<Record<string, number>>({});

  // Fetch group averages
  useEffect(() => {
    supabase.rpc('get_global_topic_stats').then(({ data: rows }) => {
      if (!rows) return;
      const map: Record<string, number> = {};
      rows.forEach((r: any) => { if (r.topic) map[r.topic] = Math.round(r.avg_accuracy); });
      setGroupStats(map);
    });
  }, []);

  // Enrich topic data with coverage
  const enriched = useMemo(() => {
    return topicData.map((t, _i) => ({
      ...t,
      coverage: t.totalInDb > 0 ? Math.round((t.totalAnswered / t.totalInDb) * 100) : 0,
      groupAvg: groupStats[t.topic] ?? null,
    }));
  }, [topicData, groupStats]);

  const filtered = useMemo(() => {
    let list = enriched.filter(d => d.topic.toLowerCase().includes(searchTerm.toLowerCase()));
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'topic') cmp = a.topic.localeCompare(b.topic);
      else if (sortKey === 'coverage') cmp = a.coverage - b.coverage;
      else if (sortKey === 'rank') cmp = a.smartScore - b.smartScore; // rank by smartScore
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? cmp : -cmp;
    });
    // Assign rank after sorting by smartScore descending
    return list.map((item, idx) => ({ ...item, rank: idx + 1 }));
  }, [enriched, searchTerm, sortKey, sortAsc]);

  const displayed = showAll ? filtered : filtered.slice(0, 10);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'topic'); }
  };

  return (
    <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-border dark:border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3" dir="rtl">
        <div>
          <h3 className="font-bold text-foreground text-sm">ביצועים לפי נושא</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">לחץ על שורה לפירוט • מיון לפי Smart Score</p>
        </div>
        <div className="relative w-full sm:w-56">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="חפש נושא..."
            className="w-full py-2 px-3 pl-9 border border-border dark:border-white/[0.07] rounded-lg bg-muted/30 text-foreground text-sm outline-none focus:border-primary/50 transition"
          />
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="bg-muted/30 border-b border-border dark:border-white/[0.07] text-muted-foreground">
                {([
                  { label: '#', key: 'rank' as SortKey, w: 'w-10' },
                  { label: 'נושא', key: 'topic' as SortKey, w: '' },
                  { label: 'במאגר', key: 'totalInDb' as SortKey, w: 'w-16' },
                  { label: 'כיסוי', key: 'coverage' as SortKey, w: 'w-16' },
                  { label: 'דיוק שלי', key: 'accuracy' as SortKey, w: 'w-20' },
                  { label: 'ממוצע קבוצה', key: 'accuracy' as SortKey, w: 'w-24' },
                  { label: 'Smart Score', key: 'smartScore' as SortKey, w: 'w-28' },
                ] as { label: string; key: SortKey; w: string }[]).map((col, i) => (
                  <th
                    key={col.label + i}
                    className={`px-3 py-3 text-[11px] font-bold cursor-pointer hover:text-foreground transition select-none whitespace-nowrap text-right ${col.w}`}
                    onClick={() => col.key !== 'accuracy' || col.label === 'דיוק שלי' ? handleSort(col.key) : undefined}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.label !== 'ממוצע קבוצה' && (
                        <ArrowUpDown className={`w-3 h-3 ${sortKey === col.key ? 'text-primary' : 'text-muted-foreground/30'}`} />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map(t => {
                const isExpanded = expandedTopic === t.topic;
                const badge = getScoreBadge(t.smartScore);
                const posBadge = getPositionBadge(t.accuracy, t.groupAvg);
                const borderColor = getAccuracyColor(t.accuracy);

                return (
                  <React.Fragment key={t.topic}>
                    <tr
                      onClick={() => setExpandedTopic(isExpanded ? null : t.topic)}
                      className="border-b border-border/50 dark:border-white/[0.05] hover:bg-accent/5 transition-colors cursor-pointer group"
                      style={{ borderTop: `2px solid ${borderColor}` }}
                    >
                      {/* Rank */}
                      <td className="px-3 py-3 text-center text-muted-foreground text-xs font-mono">{t.rank}</td>
                      {/* Topic */}
                      <td className="px-3 py-3 font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <span>{t.topic}</span>
                          {posBadge && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${posBadge.bg}`}>
                              {posBadge.label}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* NT (bank) */}
                      <td className="px-3 py-3 text-center text-muted-foreground text-xs">{t.totalInDb}</td>
                      {/* Coverage */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs text-amber-400 font-bold">{t.coverage}%</span>
                      </td>
                      {/* My accuracy */}
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-bold" style={{ color: getAccuracyColor(t.accuracy) }}>{t.accuracy}%</span>
                      </td>
                      {/* Group avg */}
                      <td className="px-3 py-3 text-center">
                        {t.groupAvg !== null ? (
                          <span className="text-xs text-muted-foreground">{t.groupAvg}%</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/30">—</span>
                        )}
                      </td>
                      {/* Smart Score badge */}
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[56px] px-2.5 py-1 rounded-full text-[11px] font-black border ${badge.bg}`}>
                          {t.smartScore}% {badge.label}
                        </span>
                      </td>
                    </tr>

                    {/* Expansion */}
                    <AnimatePresence>
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <TopicDetailPanel
                              topic={t.topic}
                              topicStat={t}
                              progress={progress}
                              data={data}
                              groupAvg={t.groupAvg}
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
        <div className="p-3 text-center border-t border-border dark:border-white/[0.07]">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-primary hover:text-primary/80 font-bold transition flex items-center gap-1 mx-auto"
          >
            {showAll ? <><ChevronUp className="w-3 h-3" /> הצג פחות</> : <><ChevronDown className="w-3 h-3" /> הצג הכל ({filtered.length})</>}
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Expanded Detail Panel ──────────────────────────── */

interface DetailPanelProps {
  topic: string;
  topicStat: TopicStat & { coverage: number; groupAvg: number | null };
  progress: UserProgress;
  data: Question[];
  groupAvg: number | null;
  onStartPractice: () => void;
  onClose: () => void;
}

function TopicDetailPanel({ topic, topicStat, progress, data, groupAvg, onStartPractice, onClose }: DetailPanelProps) {
  const [sessionData, setSessionData] = useState<{ label: string; acc: number }[]>([]);

  // Fetch last 5 sessions from answer_history for this topic
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

      // Group into sessions by date
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
        .map(([date, v], i) => ({
          label: new Date(date).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }),
          acc: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
        }));

      setSessionData(sessions);
    };
    fetchSessions();
  }, [topic]);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={spring}
      className="overflow-hidden"
    >
      <div className="bg-muted/20 dark:bg-white/[0.03] border-t border-border dark:border-white/[0.07] p-5" dir="rtl">
        <div className="flex items-start justify-between mb-4">
          <h4 className="text-sm font-bold text-foreground">{topic}</h4>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-muted-foreground hover:text-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Stats pills */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Smart Score', value: `${topicStat.smartScore}%`, color: getAccuracyColor(topicStat.smartScore) },
              { label: 'דיוק שלי', value: `${topicStat.accuracy}%`, color: getAccuracyColor(topicStat.accuracy) },
              { label: 'כיסוי', value: `${topicStat.coverage}%`, color: '#f59e0b' },
              { label: 'ממוצע קבוצה', value: groupAvg !== null ? `${groupAvg}%` : '—', color: '#6b7280' },
              { label: 'ניסיונות', value: `${topicStat.totalAnswered}`, color: 'hsl(var(--foreground))' },
              { label: 'במאגר', value: `${topicStat.totalInDb}`, color: 'hsl(var(--muted-foreground))' },
            ].map(p => (
              <div key={p.label} className="bg-muted/30 rounded-lg px-3 py-2 text-center">
                <div className="text-xs font-black" style={{ color: p.color }}>{p.value}</div>
                <div className="text-[9px] text-muted-foreground">{p.label}</div>
              </div>
            ))}
          </div>

          {/* Session accuracy bars */}
          <div className="flex flex-col items-center">
            <p className="text-[10px] text-muted-foreground mb-2">דיוק ב-5 סשנים אחרונים</p>
            {sessionData.length > 0 ? (
              <div style={{ width: '100%', height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sessionData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number) => [`${v}%`, 'דיוק']}
                    />
                    <Bar dataKey="acc" radius={[4, 4, 0, 0]} name="דיוק %">
                      {sessionData.map((entry, i) => (
                        <Cell key={i} fill={getAccuracyColor(entry.acc)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground/50 mt-8">אין היסטוריית סשנים עדיין</p>
            )}
          </div>

          {/* Action */}
          <div className="flex flex-col items-center justify-center gap-3">
            {groupAvg !== null && (
              <div className="text-center">
                <div className="text-[10px] text-muted-foreground mb-1">פער מממוצע קבוצה</div>
                <div className="text-2xl font-black" style={{ fontFamily: "'Share Tech Mono', monospace", color: getAccuracyColor(topicStat.accuracy) }}>
                  {topicStat.accuracy - groupAvg > 0 ? '+' : ''}{topicStat.accuracy - groupAvg}%
                </div>
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onStartPractice(); }}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-bold transition"
            >
              <Play className="w-4 h-4" /> התחל תרגול בנושא זה
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
