import { useMemo, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Search, Download, Upload, TrendingUp, TrendingDown, Target, BookOpen, AlertTriangle, CheckCircle } from 'lucide-react';

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
    const coverage = data.length > 0 ? Math.round((totalUnique / data.length) * 100) : 0;

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

    return { totalUnique, correctUnique, mistakes, fixed, totalAttempts, accuracy, coverage, topicData };
  }, [data, progress]);

  const filteredTopics = useMemo(() => {
    let filtered = stats.topicData.filter(d => d.topic.toLowerCase().includes(searchTerm.toLowerCase()));
    filtered.sort((a, b) => a.smartScore - b.smartScore);
    return filtered;
  }, [stats.topicData, searchTerm]);

  const strongTopics = filteredTopics.filter(t => t.smartScore >= 70);
  const weakTopics = filteredTopics.filter(t => t.smartScore < 70);

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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <SummaryCard label="סך ניסיונות" value={stats.totalAttempts} icon={<Target className="w-5 h-5" />} color="text-info" />
        <SummaryCard label="שאלות ייחודיות" value={stats.totalUnique} icon={<BookOpen className="w-5 h-5" />} color="text-foreground" />
        <SummaryCard label="כיסוי מאגר" value={`${stats.coverage}%`} icon={<Target className="w-5 h-5" />} color="text-primary" />
        <SummaryCard label="דיוק כללי" value={`${stats.accuracy}%`} icon={stats.accuracy >= 60 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />} color={stats.accuracy >= 60 ? 'text-success' : 'text-destructive'} />
        <SummaryCard label="טעויות פתוחות" value={stats.mistakes} icon={<AlertTriangle className="w-5 h-5" />} color="text-destructive" />
        <SummaryCard label="תוקנו" value={stats.fixed} icon={<CheckCircle className="w-5 h-5" />} color="text-success" />
      </div>

      {/* Overall Progress Bar */}
      <div className="soft-card bg-card border border-border p-6 mb-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-foreground">כיסוי כולל של המאגר</h3>
          <span className="text-2xl font-black text-primary">{stats.coverage}%</span>
        </div>
        <div className="w-full bg-border h-4 rounded-full overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-700"
            style={{ width: `${stats.coverage}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">{stats.totalUnique} מתוך {data.length} שאלות נענו</p>
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

      {/* Weak Topics */}
      {weakTopics.length > 0 && (
        <div className="mb-10">
          <h3 className="text-lg font-bold text-destructive mb-4 flex items-center gap-2">
            <TrendingDown className="w-5 h-5" /> נושאים לחיזוק ({weakTopics.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {weakTopics.map(t => (
              <TopicCard key={t.topic} topic={t} variant="weak" />
            ))}
          </div>
        </div>
      )}

      {/* Strong Topics */}
      {strongTopics.length > 0 && (
        <div className="mb-10">
          <h3 className="text-lg font-bold text-success mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" /> נושאים חזקים ({strongTopics.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {strongTopics.map(t => (
              <TopicCard key={t.topic} topic={t} variant="strong" />
            ))}
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

function SummaryCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="soft-card bg-card border border-border p-5">
      <div className={`${color} mb-2`}>{icon}</div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1 font-medium">{label}</div>
    </div>
  );
}

function TopicCard({ topic, variant }: { topic: TopicStat; variant: 'strong' | 'weak' }) {
  const barColor = variant === 'strong' ? 'bg-success' : topic.smartScore >= 50 ? 'bg-warning' : 'bg-destructive';
  const borderColor = variant === 'strong' ? 'border-success/20' : 'border-destructive/20';

  return (
    <div className={`soft-card bg-card border ${borderColor} p-5`}>
      <div className="flex items-start justify-between mb-3">
        <h4 className="font-bold text-foreground text-sm leading-tight flex-1">{topic.topic}</h4>
        <span className={`text-xl font-black ${variant === 'strong' ? 'text-success' : topic.smartScore >= 50 ? 'text-warning' : 'text-destructive'}`}>
          {topic.smartScore}%
        </span>
      </div>
      <div className="w-full bg-border h-2.5 rounded-full overflow-hidden mb-3">
        <div
          className={`${barColor} h-full rounded-full transition-all duration-500`}
          style={{ width: `${topic.smartScore}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>✅ {topic.correct} נכון</span>
        <span>❌ {topic.wrong} שגוי</span>
        <span>📋 {topic.remaining} נותרו</span>
      </div>
    </div>
  );
}
