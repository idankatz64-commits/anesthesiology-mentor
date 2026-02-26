import { useState, useMemo } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import type { TopicStat } from './useStatsData';

type SortKey = 'topic' | 'totalInDb' | 'totalAnswered' | 'correct' | 'wrong' | 'accuracy' | 'smartScore';

interface Props {
  topicData: TopicStat[];
  onTopicClick: (topic: string) => void;
}

export default function TopicPerformanceTable({ topicData, onTopicClick }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('smartScore');
  const [sortAsc, setSortAsc] = useState(true);

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

  return (
    <div className="bg-[#141720] border border-white/[0.07] rounded-xl overflow-hidden">
      <div className="p-5 border-b border-white/[0.07] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-white text-sm">ביצועים לפי נושא</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">לחץ על שורה כדי להתחיל תרגול</p>
        </div>
        <div className="relative w-full sm:w-56">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="חפש נושא..."
            className="w-full py-2 px-3 pl-9 border border-white/[0.07] rounded-lg bg-white/5 text-white text-sm outline-none focus:border-orange-500/50 transition"
          />
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 border-b border-white/[0.07] text-muted-foreground">
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
                    className="px-4 py-3 text-[11px] font-bold cursor-pointer hover:text-white transition select-none whitespace-nowrap"
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
              {filtered.map(t => (
                <tr
                  key={t.topic}
                  onClick={() => onTopicClick(t.topic)}
                  className={`border-b border-white/[0.05] hover:bg-orange-500/5 transition-colors cursor-pointer ${getRowBg(t.smartScore)}`}
                >
                  <td className="px-4 py-3.5 font-medium text-white">{t.topic}</td>
                  <td className="px-4 py-3.5 text-center text-muted-foreground text-xs">{t.totalInDb}</td>
                  <td className="px-4 py-3.5 text-center text-muted-foreground text-xs">{t.totalAnswered}</td>
                  <td className="px-4 py-3.5 text-center text-green-400 text-xs">{t.correct}</td>
                  <td className="px-4 py-3.5 text-center text-red-400 text-xs">{t.wrong}</td>
                  <td className="px-4 py-3.5 text-center text-xs font-bold text-white">{t.accuracy}%</td>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`inline-flex items-center justify-center min-w-[48px] px-2.5 py-1 rounded-full text-xs font-black ${getScoreBg(t.smartScore)}`}>
                      {t.smartScore}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-light">אין עדיין נתונים. התחל לתרגל!</p>
        </div>
      )}
    </div>
  );
}
