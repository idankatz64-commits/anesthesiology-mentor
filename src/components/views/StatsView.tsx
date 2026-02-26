import { useMemo, useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Search, Download, Upload, ArrowUpDown, TrendingUp, TrendingDown, Minus, Target, BookOpen, CheckCircle, BarChart3 } from 'lucide-react';
import ComparativeStats from './ComparativeStats';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Area, AreaChart,
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

/* ─── Circular Progress Ring ─── */
function ProgressRing({ value, size = 160, strokeWidth = 12 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 70 ? 'hsl(var(--success))' : value >= 50 ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-foreground">{value}%</span>
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">מוכנות</span>
      </div>
    </div>
  );
}

/* ─── Mini Sparkline ─── */
function MiniSparkline({ data, dataKey, color }: { data: any[]; dataKey: string; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
          fill={`url(#spark-${dataKey})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── KPI Card ─── */
function KPICard({
  icon, label, value, trend, sparkData, sparkKey, sparkColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  sparkData?: any[];
  sparkKey?: string;
  sparkColor?: string;
}) {
  return (
    <div className="liquid-glass p-5 flex flex-col justify-between min-h-[140px]">
      <div className="flex items-start justify-between mb-2">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
            trend === 'up' ? 'bg-success/10 text-success' :
            trend === 'down' ? 'bg-destructive/10 text-destructive' :
            'bg-muted text-muted-foreground'
          }`}>
            {trend === 'up' ? <TrendingUp className="w-3 h-3" /> :
             trend === 'down' ? <TrendingDown className="w-3 h-3" /> :
             <Minus className="w-3 h-3" />}
          </div>
        )}
      </div>
      <div>
        <div className="text-2xl font-black text-foreground matrix-text">{value}</div>
        <div className="text-[11px] text-muted-foreground font-medium mt-0.5">{label}</div>
      </div>
      {sparkData && sparkKey && sparkColor && (
        <div className="mt-2 -mx-1">
          <MiniSparkline data={sparkData} dataKey={sparkKey} color={sparkColor} />
        </div>
      )}
    </div>
  );
}

export default function StatsView() {
  const { data, progress, importData, startSession, navigate } = useApp();
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

    // Exam readiness = weighted average of coverage & accuracy
    const readiness = Math.round(coverage * 0.4 + accuracy * 0.6);

    return { totalUnique, correctUnique, totalAttempts, accuracy, coverage, topicData, readiness };
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const getScoreColor = (score: number) => {
    if (score > 70) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-destructive';
  };

  const getScoreBg = (score: number) => {
    if (score > 70) return 'bg-success/15 text-success';
    if (score >= 50) return 'bg-warning/15 text-warning';
    return 'bg-destructive/15 text-destructive';
  };

  // Trend calculation: compare last 7 days vs previous 7 days
  const accuracyTrend = useMemo<'up' | 'down' | 'neutral'>(() => {
    if (dailyData.length < 14) return 'neutral';
    const recent = dailyData.slice(7).filter(d => d.count > 0);
    const older = dailyData.slice(0, 7).filter(d => d.count > 0);
    if (recent.length === 0 || older.length === 0) return 'neutral';
    const recentAvg = recent.reduce((s, d) => s + d.rate, 0) / recent.length;
    const olderAvg = older.reduce((s, d) => s + d.rate, 0) / older.length;
    if (recentAvg > olderAvg + 3) return 'up';
    if (recentAvg < olderAvg - 3) return 'down';
    return 'neutral';
  }, [dailyData]);

  const activityTrend = useMemo<'up' | 'down' | 'neutral'>(() => {
    if (dailyData.length < 14) return 'neutral';
    const recent = dailyData.slice(7).reduce((s, d) => s + d.count, 0);
    const older = dailyData.slice(0, 7).reduce((s, d) => s + d.count, 0);
    if (recent > older + 5) return 'up';
    if (recent < older - 5) return 'down';
    return 'neutral';
  }, [dailyData]);

  const handleTopicClick = (topic: string) => {
    const topicQuestions = data.filter(q => q[KEYS.TOPIC] === topic);
    if (topicQuestions.length === 0) return;
    startSession(topicQuestions, Math.min(topicQuestions.length, 15), 'practice');
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
    <div className="fade-in max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-foreground">דשבורד ביצועים</h2>
        <p className="text-sm text-muted-foreground hidden md:block">14 ימים אחרונים</p>
      </div>

      {/* ─── KPI Cards Row ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<Target className="w-4 h-4" />}
          label="דיוק כללי"
          value={`${stats.accuracy}%`}
          trend={accuracyTrend}
          sparkData={dailyData}
          sparkKey="rate"
          sparkColor="hsl(var(--primary))"
        />
        <KPICard
          icon={<BarChart3 className="w-4 h-4" />}
          label="כיסוי מאגר"
          value={`${stats.coverage}%`}
          trend={stats.coverage > 50 ? 'up' : 'neutral'}
          sparkData={dailyData}
          sparkKey="count"
          sparkColor="hsl(var(--info))"
        />
        <KPICard
          icon={<BookOpen className="w-4 h-4" />}
          label="שאלות ייחודיות"
          value={`${stats.totalUnique} / ${data.length}`}
          trend={activityTrend}
        />
        <KPICard
          icon={<CheckCircle className="w-4 h-4" />}
          label="סך ניסיונות"
          value={stats.totalAttempts}
          trend={activityTrend}
        />
      </div>

      {/* ─── Two-Column Middle Section ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Daily Activity Chart (2/3 width) */}
        <div className="lg:col-span-2 liquid-glass p-6">
          <h3 className="font-bold text-foreground mb-1 text-sm">פעילות יומית</h3>
          <p className="text-xs text-muted-foreground mb-4">שאלות שהושלמו + אחוז הצלחה</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dailyData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDateLabel}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false} tickLine={false} />
              <ReTooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
                labelFormatter={formatDateLabel}
                formatter={(v: number) => [v, 'שאלות']}
              />
              <Bar dataKey="count" fill="url(#barGrad)" radius={[6, 6, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2 italic">
            ממוצע קבוצתי: -- (יהיה זמין כשמשתמשים נוספים יצטרפו)
          </p>
        </div>

        {/* Right: Exam Readiness Ring (1/3 width) */}
        <div className="liquid-glass p-6 flex flex-col items-center justify-center gap-4">
          <h3 className="font-bold text-foreground text-sm">מוכנות למבחן</h3>
          <ProgressRing value={stats.readiness} />
          <div className="grid grid-cols-2 gap-3 w-full text-center mt-2">
            <div className="bg-muted/50 rounded-xl p-3">
              <div className="text-lg font-bold text-foreground matrix-text">{stats.coverage}%</div>
              <div className="text-[10px] text-muted-foreground">כיסוי</div>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <div className="text-lg font-bold text-foreground matrix-text">{stats.accuracy}%</div>
              <div className="text-[10px] text-muted-foreground">דיוק</div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">מוכנות = 40% כיסוי + 60% דיוק</p>
        </div>
      </div>

      {/* ─── Success Rate Chart ─── */}
      <div className="liquid-glass p-6">
        <h3 className="font-bold text-foreground mb-1 text-sm">אחוז הצלחה יומי (מעקב שיפור)</h3>
        <p className="text-xs text-muted-foreground mb-4">קו מלא = הצלחה, קו מקווקו = מגמה</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDateLabel}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              unit="%" axisLine={false} tickLine={false} />
            <ReTooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              labelFormatter={formatDateLabel}
              formatter={(v: number, name: string) => {
                if (name === 'trend') return [v + '%', 'קו מגמה'];
                return [v + '%', 'אחוז הצלחה'];
              }}
            />
            <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(var(--primary))' }} connectNulls={false} />
            <Line type="monotone" dataKey="trend" stroke="hsl(var(--info))" strokeWidth={2}
              strokeDasharray="6 3" dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2 italic">
          ממוצע קבוצתי: -- (יהיה זמין כשמשתמשים נוספים יצטרפו)
        </p>
      </div>

      {/* ─── Topic Performance Table ─── */}
      <div className="liquid-glass overflow-hidden">
        <div className="p-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-foreground text-sm">ביצועים לפי נושא</h3>
            <p className="text-xs text-muted-foreground mt-0.5">לחץ על שורה כדי להתחיל תרגול בנושא</p>
          </div>
          <div className="relative w-full sm:w-56">
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="חפש נושא..."
              className="w-full py-2 px-3 pl-9 border border-border rounded-lg bg-card/50 text-foreground text-sm outline-none focus:border-primary transition"
            />
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>

        {filteredTopics.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border/50 text-muted-foreground">
                  <ThHeader label="נושא" sortKey="topic" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="במאגר" sortKey="totalInDb" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="נענו" sortKey="totalAnswered" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="✓" sortKey="correct" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="✗" sortKey="wrong" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="דיוק" sortKey="accuracy" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                  <ThHeader label="Smart Score" sortKey="smartScore" currentKey={sortKey} asc={sortAsc} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map(t => (
                  <tr
                    key={t.topic}
                    onClick={() => handleTopicClick(t.topic)}
                    className="border-b border-border/30 hover:bg-primary/5 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3.5 font-medium text-foreground group-hover:text-primary transition-colors">
                      {t.topic}
                    </td>
                    <td className="px-4 py-3.5 text-center text-muted-foreground matrix-text text-xs">{t.totalInDb}</td>
                    <td className="px-4 py-3.5 text-center text-muted-foreground matrix-text text-xs">{t.totalAnswered}</td>
                    <td className="px-4 py-3.5 text-center text-success matrix-text text-xs">{t.correct}</td>
                    <td className="px-4 py-3.5 text-center text-destructive matrix-text text-xs">{t.wrong}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`font-bold matrix-text text-xs ${getScoreColor(t.accuracy)}`}>
                        {t.accuracy}%
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[48px] px-2.5 py-1 rounded-full text-xs font-black matrix-text ${getScoreBg(t.smartScore)}`}>
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
            <p className="text-lg font-light">אין עדיין נתונים. התחל לתרגל כדי לראות סטטיסטיקות!</p>
          </div>
        )}
      </div>

      {/* ─── Comparative Stats ─── */}
      <ComparativeStats />

      {/* ─── Import/Export ─── */}
      <div className="liquid-glass p-6">
        <h3 className="font-bold mb-4 text-foreground text-sm flex items-center gap-2">💾 ניהול נתונים וגיבוי</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={handleExport} className="bg-primary/10 text-primary border border-primary/20 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/20 transition flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> שמור גיבוי לקובץ
          </button>
          <label className="bg-card/50 text-foreground border border-border px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-muted transition flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" /> טען גיבוי מקובץ
            <input type="file" className="hidden" accept=".json" onChange={handleImport} />
          </label>
        </div>
      </div>
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
      className="px-4 py-3 text-[11px] font-bold cursor-pointer hover:text-foreground transition select-none whitespace-nowrap"
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? 'text-primary' : 'text-muted-foreground/40'}`} />
        {active && <span className="text-[9px]">{asc ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}
