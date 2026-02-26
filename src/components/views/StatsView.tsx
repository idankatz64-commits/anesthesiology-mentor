import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Download, Upload } from 'lucide-react';
import ComparativeStats from './ComparativeStats';
import { useStatsData } from '@/components/stats/useStatsData';
import ERITile from '@/components/stats/ERITile';
import AccuracyTile from '@/components/stats/AccuracyTile';
import CoverageTile from '@/components/stats/CoverageTile';
import StreakTile from '@/components/stats/StreakTile';
import LearningVelocityTile from '@/components/stats/LearningVelocityTile';
import WeakZoneMapTile from '@/components/stats/WeakZoneMapTile';
import ForgettingRiskTile from '@/components/stats/ForgettingRiskTile';
import TopicPerformanceTable from '@/components/stats/TopicPerformanceTable';

export default function StatsView() {
  const { data, progress, importData, startSession } = useApp();
  const {
    stats, eri, streak, accuracyTrend, weakZones,
    forgettingRisk, chapterCoverage, dailyData14, dailyData30,
    trendData14, trendData30,
  } = useStatsData();

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

  return (
    <div className="fade-in max-w-6xl mx-auto space-y-6" style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">דשבורד ביצועים</h1>
        <p className="text-xs text-muted-foreground hidden md:block">לחץ על כרטיס לפירוט מלא</p>
      </div>

      {/* Row 1 — 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ERITile
          value={eri.value}
          accuracy={eri.accuracy}
          coverage={eri.coverage}
          criticalAvg={eri.criticalAvg}
          consistency={eri.consistency}
        />
        <AccuracyTile
          accuracy={stats.accuracy}
          trend={accuracyTrend}
          sparkData={dailyData14}
          fullData={trendData30}
        />
        <CoverageTile
          coverage={stats.coverage}
          chapters={chapterCoverage}
        />
        <StreakTile
          streak={streak}
          dailyData={dailyData30}
        />
      </div>

      {/* Row 2 — 3 Medium Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <LearningVelocityTile data={trendData14} />
        <WeakZoneMapTile zones={weakZones} />
        <ForgettingRiskTile risks={forgettingRisk} />
      </div>

      {/* Row 3 — Full-width Topic Table */}
      <TopicPerformanceTable
        topicData={stats.topicData}
        onTopicClick={handleTopicClick}
      />

      {/* Comparative Stats */}
      <ComparativeStats />

      {/* Import/Export */}
      <div className="bg-[#141720] border border-white/[0.07] rounded-xl p-6">
        <h3 className="font-bold mb-4 text-white text-sm flex items-center gap-2">💾 ניהול נתונים וגיבוי</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={handleExport} className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-500/20 transition flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> שמור גיבוי לקובץ
          </button>
          <label className="bg-white/5 text-white border border-white/[0.07] px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-white/10 transition flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" /> טען גיבוי מקובץ
            <input type="file" className="hidden" accept=".json" onChange={handleImport} />
          </label>
        </div>
      </div>
    </div>
  );
}
