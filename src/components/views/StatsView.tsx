import { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Search, Download, Upload, ArrowUpDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type TopicStat = {
  topic: string;
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
};

type SortKey = 'topic' | 'total' | 'correct' | 'accuracy';

export default function StatsView() {
  const { data, progress, importData } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('accuracy');
  const [sortAsc, setSortAsc] = useState(true);

  const stats = useMemo(() => {
    let totalUnique = 0, correctUnique = 0, totalAttempts = 0;
    const topicMap: Record<string, { total: number; correct: number; wrong: number }> = {};

    Object.entries(progress.history).forEach(([id, h]) => {
      totalUnique++;
      if (h.lastResult === 'correct') correctUnique++;
      totalAttempts += h.answered;

      const q = data.find(x => x[KEYS.ID] === id);
      if (q) {
        const t = q[KEYS.TOPIC] || 'Uncategorized';
        if (!topicMap[t]) topicMap[t] = { total: 0, correct: 0, wrong: 0 };
        topicMap[t].total++;
        if (h.lastResult === 'correct') topicMap[t].correct++;
        else topicMap[t].wrong++;
      }
    });

    const accuracy = totalUnique > 0 ? Math.round((correctUnique / totalUnique) * 100) : 0;
    const coverage = data.length > 0 ? Math.round((totalUnique / data.length) * 100) : 0;

    const topicData: TopicStat[] = Object.entries(topicMap).map(([topic, s]) => ({
      topic,
      total: s.total,
      correct: s.correct,
      wrong: s.wrong,
      accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
    }));

    return { totalUnique, correctUnique, totalAttempts, accuracy, coverage, topicData };
  }, [data, progress]);

  const filteredTopics = useMemo(() => {
    let filtered = stats.topicData.filter(d => d.topic.toLowerCase().includes(searchTerm.toLowerCase()));
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'topic') cmp = a.topic.localeCompare(b.topic);
      else if (sortKey === 'total') cmp = a.total - b.total;
      else if (sortKey === 'correct') cmp = a.correct - b.correct;
      else cmp = a.accuracy - b.accuracy;
      return sortAsc ? cmp : -cmp;
    });
    return filtered;
  }, [stats.topicData, searchTerm, sortKey, sortAsc]);

  // Chart data sorted weakest to strongest
  const chartData = useMemo(() => {
    return [...stats.topicData]
      .filter(d => d.topic.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.accuracy - b.accuracy);
  }, [stats.topicData, searchTerm]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const getBarColor = (accuracy: number) => {
    if (accuracy >= 80) return 'hsl(160, 84%, 39%)';
    if (accuracy >= 60) return 'hsl(38, 92%, 50%)';
    return 'hsl(0, 84%, 60%)';
  };

  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(progress));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `anesthesia_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed && parsed.history) {
          importData(parsed);
          alert('הנתונים נטענו בהצלחה!');
        } else {
          alert('קובץ לא תקין.');
        }
      } catch { alert('שגיאה בקריאת הקובץ.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold mb-8 text-foreground">הסטטיסטיקה שלי</h2>

      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <SummaryCard label="סך ניסיונות" value={stats.totalAttempts} />
        <SummaryCard label="שאלות ייחודיות" value={`${stats.totalUnique} / ${data.length}`} />
        <SummaryCard label="כיסוי מאגר" value={`${stats.coverage}%`} accent />
        <SummaryCard label="דיוק כללי" value={`${stats.accuracy}%`} accent />
      </div>

      {/* Search */}
      <div className="relative w-full md:w-1/3 mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="חפש נושא..."
          className="w-full p-3 pl-10 border border-border rounded-xl bg-card text-foreground outline-none focus:border-primary transition"
        />
        <Search className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
      </div>

      {/* Horizontal Bar Chart */}
      {chartData.length > 0 && (
        <div className="soft-card bg-card border border-border p-6 mb-10">
          <h3 className="font-bold text-foreground mb-4">דיוק לפי נושא (חלש → חזק)</h3>
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 36)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="topic"
                width={180}
                tick={{ fontSize: 11, textAnchor: 'end' }}
              />
              <Tooltip
                formatter={(value: number) => [`${value}%`, 'דיוק']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.75rem',
                  fontSize: '0.8rem',
                }}
              />
              <Bar dataKey="accuracy" radius={[0, 6, 6, 0]} barSize={20}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={getBarColor(entry.accuracy)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Data Table */}
      {filteredTopics.length > 0 && (
        <div className="soft-card bg-card border border-border overflow-hidden mb-10">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border text-muted-foreground">
                  <ThHeader label="נושא" sortKey="topic" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="נענו" sortKey="total" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="נכון" sortKey="correct" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="דיוק %" sortKey="accuracy" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map(t => (
                  <tr key={t.topic} className="border-b border-border hover:bg-muted/30 transition">
                    <td className="px-4 py-3 font-medium text-foreground">{t.topic}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.total}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{t.correct}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${t.accuracy >= 80 ? 'text-success' : t.accuracy >= 60 ? 'text-warning' : 'text-destructive'}`}>
                        {t.accuracy}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredTopics.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-light">אין עדיין נתונים. התחל לתרגל כדי לראות סטטיסטיקות!</p>
        </div>
      )}

      {/* Import/Export */}
      <div className="soft-card bg-card border border-border p-8">
        <h3 className="font-bold mb-6 text-foreground flex items-center gap-3">💾 ניהול נתונים וגיבוי</h3>
        <div className="flex flex-col md:flex-row gap-4">
          <button onClick={handleExport} className="bg-primary/10 text-primary border border-primary/20 px-6 py-3 rounded-xl font-bold hover:bg-primary/20 transition flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> שמור גיבוי לקובץ
          </button>
          <label className="bg-card text-foreground border border-border px-6 py-3 rounded-xl font-bold hover:bg-muted transition flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" /> טען גיבוי מקובץ
            <input type="file" className="hidden" accept=".json" onChange={handleImport} />
          </label>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="soft-card bg-card border border-border p-5">
      <div className={`text-2xl font-black ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1 font-medium">{label}</div>
    </div>
  );
}

function ThHeader({ label, sortKey, currentKey, asc, onSort }: {
  label: string; sortKey: SortKey; currentKey: SortKey; asc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className="px-4 py-3 text-xs font-bold cursor-pointer hover:text-foreground transition select-none"
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? 'text-primary' : 'text-muted-foreground/50'}`} />
        {active && <span className="text-[10px]">{asc ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}
