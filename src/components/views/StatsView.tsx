import { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Search, Download, Upload } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';

type TopicStat = {
  topic: string;
  total: number;
  totalDb: number;
  remaining: number;
  correct: number;
  wrong: number;
  score: number;
  smartScore: number;
};

export default function StatsView() {
  const { data, progress, importData } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortCol, setSortCol] = useState<keyof TopicStat>('smartScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const stats = useMemo(() => {
    let totalUnique = 0, correctUnique = 0, mistakes = 0, fixed = 0, totalAttempts = 0;
    const topicMap: Record<string, { ans: number; cor: number; wrong: number; uniqueIds: number }> = {};
    const dbTopicCounts: Record<string, number> = {};

    data.forEach(q => {
      const t = q[KEYS.TOPIC] || 'Uncategorized';
      dbTopicCounts[t] = (dbTopicCounts[t] || 0) + 1;
    });

    Object.entries(progress.history).forEach(([id, h]) => {
      totalUnique++;
      if (h.lastResult === 'correct') correctUnique++;
      if (h.lastResult === 'wrong') mistakes++;
      if (h.everWrong && h.lastResult === 'correct') fixed++;
      totalAttempts += h.answered;

      const q = data.find(x => x[KEYS.ID] === id);
      if (q) {
        const t = q[KEYS.TOPIC] || 'Uncategorized';
        if (!topicMap[t]) topicMap[t] = { ans: 0, cor: 0, wrong: 0, uniqueIds: 0 };
        topicMap[t].ans += h.answered;
        topicMap[t].uniqueIds++;
        if (h.lastResult === 'correct') topicMap[t].cor++;
        else topicMap[t].wrong++;
      }
    });

    const accuracy = totalUnique > 0 ? Math.round((correctUnique / totalUnique) * 100) : 0;

    const topicData: TopicStat[] = Object.entries(topicMap).map(([topic, s]) => {
      const n = s.uniqueIds;
      const bayesianAvg = (s.cor + 0.6 * 10) / (n + 10);
      return {
        topic,
        total: s.uniqueIds,
        totalDb: dbTopicCounts[topic] || 0,
        remaining: (dbTopicCounts[topic] || 0) - s.uniqueIds,
        correct: s.cor,
        wrong: s.wrong,
        score: n > 0 ? Math.round((s.cor / n) * 100) : 0,
        smartScore: Math.round(bayesianAvg * 100),
      };
    });

    return { totalUnique, correctUnique, mistakes, fixed, totalAttempts, accuracy, topicData };
  }, [data, progress]);

  const sortedData = useMemo(() => {
    let filtered = stats.topicData.filter(d => d.topic.toLowerCase().includes(searchTerm.toLowerCase()));
    filtered.sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return filtered;
  }, [stats.topicData, searchTerm, sortCol, sortDir]);

  const chartData = sortedData.slice(0, 30).map(d => ({
    topic: d.topic,
    smartScore: d.smartScore,
    fill: d.smartScore >= 80 ? 'hsl(160, 84%, 39%)' : d.smartScore >= 60 ? 'hsl(38, 92%, 50%)' : 'hsl(0, 84%, 60%)',
  }));

  const handleSort = (col: keyof TopicStat) => {
    if (sortCol === col) setSortDir(p => p === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-10">
        {[
          { label: 'סך ניסיונות', value: stats.totalAttempts, color: 'text-info' },
          { label: 'שאלות ייחודיות', value: stats.totalUnique, color: 'text-foreground' },
          { label: 'דיוק כללי', value: `${stats.accuracy}%`, color: 'text-primary' },
          { label: 'טעויות פתוחות', value: stats.mistakes, color: 'text-destructive' },
          { label: 'תוקנו', value: stats.fixed, color: 'text-success' },
        ].map(item => (
          <div key={item.label} className="soft-card bg-card border border-border p-6">
            <div className={`text-3xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-muted-foreground mt-1 font-medium">{item.label}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="soft-card bg-card border border-border p-6 mb-8">
          <h3 className="font-bold mb-4 text-foreground text-lg">ביצועים לפי נושא (ציון משוקלל)</h3>
          <div style={{ height: Math.max(400, chartData.length * 30) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 120, right: 20 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="topic" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} width={120} />
                <Tooltip />
                <Bar dataKey="smartScore" radius={[0, 6, 6, 0]} barSize={20}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative w-full md:w-1/3 mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="חפש נושא..."
          className="w-full p-3 pl-10 border border-border rounded-xl bg-card text-foreground outline-none focus:border-primary transition"
        />
        <Search className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
      </div>

      {/* Table */}
      <div className="soft-card bg-card border border-border p-8 overflow-x-auto mb-10">
        <h3 className="font-bold mb-6 text-foreground text-lg">טבלת ביצועים מפורטת</h3>
        <table className="w-full text-sm text-right">
          <thead className="text-xs text-muted-foreground uppercase bg-muted border-b border-border select-none">
            <tr>
              {[
                { key: 'topic', label: 'נושא' },
                { key: 'totalDb', label: 'סה"כ במאגר' },
                { key: 'total', label: 'נענו (ייחודי)' },
                { key: 'remaining', label: 'נותרו' },
                { key: 'correct', label: 'נכון' },
                { key: 'wrong', label: 'שגוי' },
                { key: 'smartScore', label: 'ציון משוקלל (%)' },
              ].map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key as keyof TopicStat)}
                  className="px-4 py-3 cursor-pointer hover:bg-muted/80 transition"
                >
                  {col.label} {sortCol === col.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-foreground">
            {sortedData.map(d => (
              <tr key={d.topic} className="border-b border-border hover:bg-muted/50 transition">
                <td className="px-4 py-3 font-medium">{d.topic}</td>
                <td className="px-4 py-3 text-muted-foreground">{d.totalDb}</td>
                <td className="px-4 py-3 font-bold">{d.total}</td>
                <td className="px-4 py-3 text-primary font-bold">{d.remaining}</td>
                <td className="px-4 py-3 text-success">{d.correct}</td>
                <td className="px-4 py-3 text-destructive">{d.wrong}</td>
                <td className={`px-4 py-3 font-bold ${
                  d.smartScore >= 80 ? 'text-success' : d.smartScore >= 60 ? 'text-warning' : 'text-destructive'
                }`}>
                  {d.smartScore}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Import/Export */}
      <div className="soft-card bg-card border border-border p-8">
        <h3 className="font-bold mb-6 text-foreground flex items-center gap-3">💾 ניהול נתונים וגיבוי</h3>
        <div className="flex flex-col md:flex-row gap-4">
          <button
            onClick={handleExport}
            className="bg-primary/10 text-primary border border-primary/20 px-6 py-3 rounded-xl font-bold hover:bg-primary/20 transition flex items-center justify-center gap-2"
          >
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
