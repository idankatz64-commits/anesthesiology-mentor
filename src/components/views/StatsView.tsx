import { useMemo, useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Search, Download, Upload, ArrowUpDown } from 'lucide-react';
import ComparativeStats from './ComparativeStats';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

type TopicStat = {
  topic: string;
  totalInDb: number;
  totalAnswered: number;
  correct: number;
  wrong: number;
  accuracy: number;
  smartScore: number;
};

type SortKey = 'topic' | 'totalInDb' | 'totalAnswered' | 'correct' | 'wrong' | 'accuracy' | 'smartScore';

type DailyData = { date: string; count: number; correct: number; rate: number };

function calcSmartScore(answered: number, accuracy: number): number {
  return Math.round(((answered / (answered + 10)) * accuracy) + ((10 / (answered + 10)) * 50));
}

function linearRegression(data: { x: number; y: number }[]) {
  const n = data.length;
  if (n < 2) return null;
  const sumX = data.reduce((s, d) => s + d.x, 0);
  const sumY = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumX2 = data.reduce((s, d) => s + d.x * d.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function GroupAvgPlaceholder() {
  return (
    <p className="text-xs text-muted-foreground mt-2 italic">
      ממוצע קבוצתי: -- (יהיה זמין כשמשתמשים נוספים יצטרפו)
    </p>
  );
}

export default function StatsView() {
  const { data, progress, importData } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('smartScore');
  const [sortAsc, setSortAsc] = useState(true);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);

  // Fetch daily activity from Supabase
  useEffect(() => {
    const fetchDaily = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 13);
      const startStr = startDate.toISOString().split('T')[0];

      const { data: rows } = await supabase
        .from('user_answers')
        .select('updated_at, is_correct')
        .eq('user_id', session.user.id)
        .gte('updated_at', startStr + 'T00:00:00Z');

      // Build 14-day buckets
      const buckets: Record<string, { count: number; correct: number }> = {};
      for (let i = 0; i < 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (13 - i));
        const key = d.toISOString().split('T')[0];
        buckets[key] = { count: 0, correct: 0 };
      }

      (rows || []).forEach((r: any) => {
        const day = new Date(r.updated_at).toISOString().split('T')[0];
        if (buckets[day]) {
          buckets[day].count++;
          if (r.is_correct) buckets[day].correct++;
        }
      });

      setDailyData(
        Object.entries(buckets).map(([date, v]) => ({
          date,
          count: v.count,
          correct: v.correct,
          rate: v.count > 0 ? Math.round((v.correct / v.count) * 100) : 0,
        }))
      );
    };
    fetchDaily();
  }, []);

  // Trend line data
  const trendData = useMemo(() => {
    const activeDays = dailyData.filter(d => d.count > 0);
    if (activeDays.length < 2) return dailyData.map(d => ({ ...d, trend: undefined as number | undefined }));
    const points = activeDays.map((d, i) => ({ x: dailyData.indexOf(d), y: d.rate }));
    const reg = linearRegression(points);
    if (!reg) return dailyData.map(d => ({ ...d, trend: undefined as number | undefined }));
    return dailyData.map((d, i) => ({
      ...d,
      trend: Math.max(0, Math.min(100, Math.round(reg.intercept + reg.slope * i))),
    }));
  }, [dailyData]);

  // Success rate with color segments
  const rateSegments = useMemo(() => {
    return trendData.map((d, i) => {
      const prev = i > 0 ? trendData[i - 1] : null;
      let color = 'hsl(var(--muted-foreground))';
      if (prev && prev.count > 0 && d.count > 0) {
        if (d.rate > prev.rate) color = 'hsl(var(--success))';
        else if (d.rate < prev.rate) color = 'hsl(var(--destructive))';
      }
      return { ...d, segmentColor: color };
    });
  }, [trendData]);

  const stats = useMemo(() => {
    let totalUnique = 0, correctUnique = 0, totalAttempts = 0;
    const topicMap: Record<string, { totalAnswered: number; correct: number; wrong: number }> = {};
    const topicDbCount: Record<string, number> = {};
    data.forEach(q => {
      const t = q[KEYS.TOPIC] || 'Uncategorized';
      topicDbCount[t] = (topicDbCount[t] || 0) + 1;
    });

    Object.entries(progress.history).forEach(([id, h]) => {
      totalUnique++;
      if (h.lastResult === 'correct') correctUnique++;
      totalAttempts += h.answered;
      const q = data.find(x => x[KEYS.ID] === id);
      if (q) {
        const t = q[KEYS.TOPIC] || 'Uncategorized';
        if (!topicMap[t]) topicMap[t] = { totalAnswered: 0, correct: 0, wrong: 0 };
        topicMap[t].totalAnswered++;
        if (h.lastResult === 'correct') topicMap[t].correct++;
        else topicMap[t].wrong++;
      }
    });

    const accuracy = totalUnique > 0 ? Math.round((correctUnique / totalUnique) * 100) : 0;
    const coverage = data.length > 0 ? Math.round((totalUnique / data.length) * 100) : 0;

    const topicData: TopicStat[] = Object.entries(topicMap).map(([topic, s]) => {
      const acc = s.totalAnswered > 0 ? Math.round((s.correct / s.totalAnswered) * 100) : 0;
      return {
        topic,
        totalInDb: topicDbCount[topic] || 0,
        totalAnswered: s.totalAnswered,
        correct: s.correct,
        wrong: s.wrong,
        accuracy: acc,
        smartScore: calcSmartScore(s.totalAnswered, acc),
      };
    });

    return { totalUnique, correctUnique, totalAttempts, accuracy, coverage, topicData };
  }, [data, progress]);

  const filteredTopics = useMemo(() => {
    let filtered = stats.topicData.filter(d => d.topic.toLowerCase().includes(searchTerm.toLowerCase()));
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'topic') cmp = a.topic.localeCompare(b.topic);
      else cmp = (a[sortKey] as number) - (b[sortKey] as number);
      return sortAsc ? cmp : -cmp;
    });
    return filtered;
  }, [stats.topicData, searchTerm, sortKey, sortAsc]);

  const chartData = useMemo(() => {
    return [...stats.topicData]
      .filter(d => d.topic.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => a.smartScore - b.smartScore);
  }, [stats.topicData, searchTerm]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const getBarColor = (score: number) => {
    if (score >= 80) return 'bg-success';
    if (score >= 60) return 'bg-warning';
    return 'bg-destructive';
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
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

  const formatDateLabel = (d: string) => {
    const date = new Date(d + 'T00:00:00');
    return `${date.getDate()}/${date.getMonth() + 1}`;
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

      {/* NEW: Daily Question Completion */}
      <div className="soft-card bg-card border border-border p-6 mb-10 card-accent-top">
        <h3 className="font-bold text-foreground mb-4">שאלות שהושלמו ליום (14 ימים אחרונים)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <ReTooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              labelFormatter={formatDateLabel}
              formatter={(v: number) => [v, 'שאלות']}
            />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <GroupAvgPlaceholder />
      </div>

      {/* NEW: Daily Success Rate */}
      <div className="soft-card bg-card border border-border p-6 mb-10 card-accent-top">
        <h3 className="font-bold text-foreground mb-4">אחוז הצלחה יומי (מעקב שיפור)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rateSegments} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} unit="%" />
            <ReTooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              labelFormatter={formatDateLabel}
              formatter={(v: number, name: string) => {
                if (name === 'trend') return [v + '%', 'קו מגמה'];
                return [v + '%', 'אחוז הצלחה'];
              }}
            />
            <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--primary))' }} connectNulls={false} />
            <Line type="monotone" dataKey="trend" stroke="hsl(var(--info, 210 100% 50%))" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <GroupAvgPlaceholder />
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

      {/* Bar Chart */}
      {chartData.length > 0 && (
        <div className="soft-card bg-card border border-border p-6 mb-10 card-accent-top">
          <h3 className="font-bold text-foreground mb-6">Smart Score לפי נושא (חלש → חזק)</h3>
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
            {chartData.map(entry => (
              <div key={entry.topic}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground truncate max-w-[60%]">{entry.topic}</span>
                  <span className={`text-sm font-bold matrix-text ${getScoreColor(entry.smartScore)}`}>{entry.smartScore}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${getBarColor(entry.smartScore)}`}
                    style={{ width: `${Math.max(entry.smartScore, 2)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <GroupAvgPlaceholder />
        </div>
      )}

      {/* Data Table */}
      {filteredTopics.length > 0 && (
        <div className="soft-card bg-card border border-border overflow-hidden mb-10 card-accent-top">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border text-muted-foreground">
                  <ThHeader label="נושא" sortKey="topic" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="במאגר" sortKey="totalInDb" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="נענו" sortKey="totalAnswered" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="נכון" sortKey="correct" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="שגוי" sortKey="wrong" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="דיוק %" sortKey="accuracy" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="Smart Score %" sortKey="smartScore" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map(t => (
                  <tr key={t.topic} className="border-b border-border hover:bg-muted/30 transition">
                    <td className="px-4 py-3 font-medium text-foreground">{t.topic}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground matrix-text">{t.totalInDb}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground matrix-text">{t.totalAnswered}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground matrix-text">{t.correct}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground matrix-text">{t.wrong}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold matrix-text ${getScoreColor(t.accuracy)}`}>
                        {t.accuracy}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-black text-base matrix-text ${getScoreColor(t.smartScore)}`}>
                        {t.smartScore}%
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

      <div className="mb-10">
        <ComparativeStats />
      </div>

      {/* Import/Export */}
      <div className="soft-card bg-card border border-border p-8 card-accent-top">
        <h3 className="font-bold mb-6 text-foreground flex items-center gap-3">💾 ניהול נתונים וגיבוי</h3>
        <div className="flex flex-col md:flex-row gap-4">
          <button onClick={handleExport} className="bg-primary/10 text-primary border border-primary/20 px-6 py-3 rounded-xl font-bold hover:bg-primary/20 transition flex items-center justify-center gap-2 hover-glow">
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
    <div className="soft-card bg-card border border-border p-5 card-accent-top">
      <div className={`text-2xl font-black matrix-text ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</div>
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
      className="px-4 py-3 text-xs font-bold cursor-pointer hover:text-foreground transition select-none whitespace-nowrap"
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

