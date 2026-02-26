import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowUpDown, X, Play } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import type { TopicStat } from './useStatsData';
import type { UserProgress, Question } from '@/lib/types';
import { KEYS } from '@/lib/types';

type SortKey = 'topic' | 'totalInDb' | 'totalAnswered' | 'correct' | 'wrong' | 'accuracy' | 'smartScore';

interface Props {
  topicData: TopicStat[];
  onTopicClick: (topic: string) => void;
  progress: UserProgress;
  data: Question[];
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export default function TopicPerformanceTable({ topicData, onTopicClick, progress, data }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('smartScore');
  const [sortAsc, setSortAsc] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = topicData.filter(d => d.topic.toLowerCase().includes(searchTerm.toLowerCase()));
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'topic') cmp = a.topic.localeCompare(b.topic);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [topicData, searchTerm, sortKey, sortAsc]);

  const displayed = showAll ? filtered : filtered.slice(0, 5);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const getRowBg = (score: number) => {
    if (score > 70) return 'bg-green-500/5';
    if (score >= 50) return 'bg-yellow-500/5';
    return 'bg-red-500/5';
  };

  const getScoreBg = (score: number) => {
    if (score > 70) return 'bg-green-500/15 text-green-400';
    if (score >= 50) return 'bg-yellow-500/15 text-yellow-400';
    return 'bg-red-500/15 text-red-400';
  };

  // Compute per-topic detail data
  const getTopicDetail = (topic: string) => {
    const topicQuestions = data.filter(q => q[KEYS.TOPIC] === topic);
    const totalInDb = topicQuestions.length;
    let correct = 0, wrong = 0, skipped = 0;

    topicQuestions.forEach(q => {
      const h = progress.history[q[KEYS.ID]];
      if (!h) { skipped++; return; }
      if (h.lastResult === 'correct') correct++;
      else wrong++;
    });
    skipped = totalInDb - correct - wrong;

    const donutData = [
      { name: 'נכון', value: correct, color: '#22C55E' },
      { name: 'שגוי', value: wrong, color: '#EF4444' },
      { name: 'לא נענה', value: skipped, color: '#6B7280' },
    ].filter(d => d.value > 0);

    // Last 5 sessions: simulate from history timestamps
    const sessions: { label: string; acc: number }[] = [];
    const answered = topicQuestions
      .filter(q => progress.history[q[KEYS.ID]])
      .sort((a, b) => (progress.history[b[KEYS.ID]]?.timestamp || 0) - (progress.history[a[KEYS.ID]]?.timestamp || 0));

    // Group by chunks of 5 to simulate "sessions"
    for (let i = 0; i < Math.min(answered.length, 25); i += 5) {
      const chunk = answered.slice(i, i + 5);
      const chunkCorrect = chunk.filter(q => progress.history[q[KEYS.ID]]?.lastResult === 'correct').length;
      sessions.push({ label: `${sessions.length + 1}`, acc: Math.round((chunkCorrect / chunk.length) * 100) });
    }
    sessions.reverse();

    const stat = topicData.find(t => t.topic === topic);
    const coverage = totalInDb > 0 ? Math.round(((correct + wrong) / totalInDb) * 100) : 0;

    return { donutData, sessions: sessions.slice(-5), stat, coverage, correct, wrong, totalInDb };
  };

  return (
    <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl overflow-hidden">
      <div className="p-5 border-b border-border dark:border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-foreground text-sm">ביצועים לפי נושא</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">לחץ על שורה לפירוט</p>
        </div>
        <div className="relative w-full sm:w-56">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="חפש נושא..."
            className="w-full py-2 px-3 pl-9 border border-border dark:border-white/[0.07] rounded-lg bg-muted/30 text-foreground text-sm outline-none focus:border-orange-500/50 transition"
          />
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border dark:border-white/[0.07] text-muted-foreground">
                {[
                  { label: 'נושא', key: 'topic' as SortKey },
                  { label: 'במאגר', key: 'totalInDb' as SortKey },
                  { label: 'נענו', key: 'totalAnswered' as SortKey },
                  { label: '✓', key: 'correct' as SortKey },
                  { label: '✗', key: 'wrong' as SortKey },
                  { label: 'דיוק', key: 'accuracy' as SortKey },
                  { label: 'Smart Score', key: 'smartScore' as SortKey },
                ].map(col => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-[11px] font-bold cursor-pointer hover:text-foreground transition select-none whitespace-nowrap"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown className={`w-3 h-3 ${sortKey === col.key ? 'text-orange-500' : 'text-muted-foreground/40'}`} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map(t => {
                const isExpanded = expandedTopic === t.topic;
                return (
                  <React.Fragment key={t.topic}>
                    <tr
                      onClick={() => setExpandedTopic(isExpanded ? null : t.topic)}
                      className={`border-b border-border/50 dark:border-white/[0.05] hover:bg-orange-500/5 transition-colors cursor-pointer ${getRowBg(t.smartScore)}`}
                    >
                      <td className="px-4 py-3.5 font-medium text-foreground">{t.topic}</td>
                      <td className="px-4 py-3.5 text-center text-muted-foreground text-xs">{t.totalInDb}</td>
                      <td className="px-4 py-3.5 text-center text-muted-foreground text-xs">{t.totalAnswered}</td>
                      <td className="px-4 py-3.5 text-center text-green-400 text-xs">{t.correct}</td>
                      <td className="px-4 py-3.5 text-center text-red-400 text-xs">{t.wrong}</td>
                      <td className="px-4 py-3.5 text-center text-xs font-bold text-foreground">{t.accuracy}%</td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`inline-flex items-center justify-center min-w-[48px] px-2.5 py-1 rounded-full text-xs font-black ${getScoreBg(t.smartScore)}`}>
                          {t.smartScore}%
                        </span>
                      </td>
                    </tr>

                    {/* Inline expansion */}
                    <AnimatePresence>
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <TopicDetailPanel
                              topic={t.topic}
                              detail={getTopicDetail(t.topic)}
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

      {/* Show All / Collapse toggle */}
      {filtered.length > 5 && (
        <div className="p-3 text-center border-t border-border dark:border-white/[0.07]">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-orange-400 hover:text-orange-300 font-bold transition"
          >
            {showAll ? 'הצג פחות' : `הצג הכל (${filtered.length})`}
          </button>
        </div>
      )}
    </div>
  );
}

// Need to import React for Fragment
import React from 'react';

interface TopicDetailPanelProps {
  topic: string;
  detail: {
    donutData: { name: string; value: number; color: string }[];
    sessions: { label: string; acc: number }[];
    stat: TopicStat | undefined;
    coverage: number;
    correct: number;
    wrong: number;
    totalInDb: number;
  };
  onStartPractice: () => void;
  onClose: () => void;
}

function TopicDetailPanel({ topic, detail, onStartPractice, onClose }: TopicDetailPanelProps) {
  const { donutData, sessions, stat, coverage } = detail;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={spring}
      className="overflow-hidden"
    >
      <div className="bg-muted/20 dark:bg-white/[0.03] border-t border-border dark:border-white/[0.07] p-5">
        <div className="flex items-start justify-between mb-4">
          <h4 className="text-sm font-bold text-foreground">{topic}</h4>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-muted-foreground hover:text-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Donut chart */}
          <div className="flex flex-col items-center">
            <p className="text-[10px] text-muted-foreground mb-2">התפלגות תשובות</p>
            <div style={{ width: 120, height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" stroke="none">
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-3 mt-1">
              {donutData.map(d => (
                <span key={d.name} className="text-[9px] text-muted-foreground flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.color }} />
                  {d.name}
                </span>
              ))}
            </div>
          </div>

          {/* Bar chart — last 5 sessions */}
          <div className="flex flex-col items-center">
            <p className="text-[10px] text-muted-foreground mb-2">דיוק ב-5 סשנים אחרונים</p>
            {sessions.length > 0 ? (
              <div style={{ width: '100%', height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sessions} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="acc" fill="#F97316" radius={[4, 4, 0, 0]} name="דיוק %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground/50 mt-8">אין סשנים עדיין</p>
            )}
          </div>

          {/* Stat pills + action */}
          <div className="flex flex-col items-center gap-3">
            <div className="grid grid-cols-2 gap-2 w-full">
              {[
                { label: 'Smart Score', value: `${stat?.smartScore || 0}%`, bg: stat ? getScorePillBg(stat.smartScore) : 'bg-muted/30 text-muted-foreground' },
                { label: 'דיוק', value: `${stat?.accuracy || 0}%`, bg: 'bg-blue-500/15 text-blue-400' },
                { label: 'כיסוי', value: `${coverage}%`, bg: 'bg-orange-500/15 text-orange-400' },
                { label: 'ניסיונות', value: `${stat?.totalAnswered || 0}`, bg: 'bg-muted/30 text-foreground' },
              ].map(p => (
                <div key={p.label} className={`rounded-lg px-3 py-2 text-center ${p.bg}`}>
                  <div className="text-xs font-black">{p.value}</div>
                  <div className="text-[9px] opacity-70">{p.label}</div>
                </div>
              ))}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onStartPractice(); }}
              className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition"
            >
              <Play className="w-4 h-4" /> התחל תרגול בנושא זה
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function getScorePillBg(score: number) {
  if (score > 70) return 'bg-green-500/15 text-green-400';
  if (score >= 50) return 'bg-yellow-500/15 text-yellow-400';
  return 'bg-red-500/15 text-red-400';
}
