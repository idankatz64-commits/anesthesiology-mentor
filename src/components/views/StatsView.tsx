import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Download, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import ComparativeStats from './ComparativeStats';
import { useStatsData } from '@/components/stats/useStatsData';
import ERITile from '@/components/stats/ERITile';
import WeakZoneMapTile from '@/components/stats/WeakZoneMapTile';
import ForgettingRiskTile from '@/components/stats/ForgettingRiskTile';
import LearningVelocityTile from '@/components/stats/LearningVelocityTile';
import TopicPerformanceTable from '@/components/stats/TopicPerformanceTable';
import TopicTreemap from '@/components/stats/TopicTreemap';
import GaugeDial from '@/components/stats/GaugeDial';
import { HeatmapGrid, HeatmapLegend } from '@/components/stats/HeatmapGrid';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0, 0, 0.2, 1] as const } },
};

export default function StatsView() {
  const { data, progress, importData, startSession } = useApp();
  const {
    stats, eri, streak, weakZones,
    forgettingRisk, dailyData90,
    trendData14, trendData30,
  } = useStatsData();

  const withExp = data.filter(q => q[KEYS.EXPLANATION] && q[KEYS.EXPLANATION].trim().length > 5).length;
  const withoutExp = data.length - withExp;

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
    <motion.div
      className="fade-in max-w-6xl mx-auto space-y-5"
      style={{ minHeight: '100vh' }}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">דשבורד ביצועים</h1>
        <p className="text-xs text-muted-foreground hidden md:block">לחץ על כרטיס לפירוט מלא</p>
      </motion.div>

      {/* ROW 1 — Question Bank Status Bar */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3">
        <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-orange-400" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{withoutExp}</div>
          <div className="text-[10px] text-muted-foreground">ללא הסבר</div>
        </div>
        <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-green-400" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{withExp}</div>
          <div className="text-[10px] text-muted-foreground">כוללות הסבר</div>
        </div>
        <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-3 text-center">
          <div className="text-2xl font-black text-foreground" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{data.length}</div>
          <div className="text-[10px] text-muted-foreground">סה״כ שאלות</div>
        </div>
      </motion.div>

      {/* ROW 2 — Main 3-Column Dashboard Panel */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* LEFT — Weak Zones + Heatmap */}
        <div className="flex flex-col gap-4">
          <WeakZoneMapTile zones={weakZones} />
          <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-4">
            <span className="text-[10px] text-muted-foreground font-medium block mb-2">פעילות 90 יום</span>
            <HeatmapGrid dailyData={dailyData90} cellSize={10} gap={2} />
            <HeatmapLegend />
          </div>
        </div>

        {/* CENTER — ERI Hero */}
        <ERITile
          value={eri.value}
          accuracy={eri.accuracy}
          coverage={eri.coverage}
          criticalAvg={eri.criticalAvg}
          consistency={eri.consistency}
          streak={streak}
        />

        {/* RIGHT — KPI Gauges + Forgetting Risk */}
        <div className="flex flex-col gap-4">
          <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-5">
            <span className="text-xs text-muted-foreground font-medium mb-3 block">מדדים עיקריים</span>
            <div className="flex flex-col items-center gap-2">
              <GaugeDial value={eri.accuracy} max={100} color="#60A5FA" label="🔵 דיוק" pct={eri.accuracy} unit="%" />
              <GaugeDial value={eri.coverage} max={100} color="#F97316" label="🟠 כיסוי" pct={eri.coverage} unit="%" />
              <GaugeDial value={streak} max={30} color="#FB923C" label="🔥 רצף" pct={Math.min(100, Math.round((streak / 30) * 100))} unit=" ימים" />
            </div>
          </div>
          <ForgettingRiskTile risks={forgettingRisk} />
        </div>
      </motion.div>

      {/* ROW 3 — Accuracy Trend Chart (full width) */}
      <motion.div variants={itemVariants}>
        <LearningVelocityTile data={trendData14} fullData={trendData30} />
      </motion.div>

      {/* ROW 4 — Topic Heatmap + Table (full width) */}
      <motion.div variants={itemVariants}>
        <TopicTreemap topicData={stats.topicData} onTopicClick={handleTopicClick} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <TopicPerformanceTable
          topicData={stats.topicData}
          onTopicClick={handleTopicClick}
          progress={progress}
          data={data}
        />
      </motion.div>

      {/* ROW 5 — Group Position */}
      <motion.div variants={itemVariants}>
        <ComparativeStats />
      </motion.div>

      {/* ROW 6 — Import/Export */}
      <motion.div variants={itemVariants} className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-6">
        <h3 className="font-bold mb-4 text-foreground text-sm flex items-center gap-2">💾 ניהול נתונים וגיבוי</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={handleExport} className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-500/20 transition flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> שמור גיבוי לקובץ
          </button>
          <label className="bg-muted/30 text-foreground border border-border px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-muted/50 transition flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" /> טען גיבוי מקובץ
            <input type="file" className="hidden" accept=".json" onChange={handleImport} />
          </label>
        </div>
      </motion.div>
    </motion.div>
  );
}
