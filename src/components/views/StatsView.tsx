import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Download, Upload, User, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import AnimatedNumber from '@/components/AnimatedNumber';

import { useStatsData } from '@/components/stats/useStatsData';
import ERITile from '@/components/stats/ERITile';
import WeakZoneMapTile from '@/components/stats/WeakZoneMapTile';
import ForgettingRiskTile from '@/components/stats/ForgettingRiskTile';
import AccuracyCanvasChart from '@/components/stats/AccuracyCanvasChart';
import TopicPerformanceTable from '@/components/stats/TopicPerformanceTable';
import TopicTreemap from '@/components/stats/TopicTreemap';
import GaugeDial from '@/components/stats/GaugeDial';
import PersonalStatsDrilldown, { type DrilldownMetric } from '@/components/stats/PersonalStatsDrilldown';
import DailyReportTile from '@/components/stats/DailyReportTile';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0, 0, 0.2, 1] as const } }
};

/* Deep tile style shared by all stat cards */
const tileStyle: React.CSSProperties = {
  background: 'rgba(10, 10, 15, 0.8)',
  border: '1px solid rgba(26, 26, 42, 0.8)',
  backdropFilter: 'blur(8px)',
  boxShadow: 'inset 0 1px 0 rgba(123,146,255,0.06), 0 4px 24px rgba(0,0,0,0.45)',
};

export default function StatsView() {
  const { data, progress, importData, startSession } = useApp();
  const {
    stats, eri, streak, weakZones,
    forgettingRisk,
    trendData14, trendData30,
    personalStats,
    detailedAnswers,
    repeatedErrorsByTopic,
  } = useStatsData();
  const [drilldownMetric, setDrilldownMetric] = useState<DrilldownMetric | null>(null);

  const withExp = data.filter((q) => q[KEYS.EXPLANATION] && q[KEYS.EXPLANATION].trim().length > 5).length;
  const withoutExp = data.length - withExp;

  const handleTopicClick = (topic: string) => {
    const topicQuestions = data.filter((q) => q[KEYS.TOPIC] === topic);
    if (topicQuestions.length === 0) return;
    startSession(topicQuestions, Math.min(topicQuestions.length, 15), 'practice');
  };

  const handleDrilldownPractice = (questionIds: string[]) => {
    const questions = data.filter(q => questionIds.includes(q[KEYS.ID]));
    if (questions.length === 0) return;
    startSession(questions, Math.min(questions.length, 15), 'practice');
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
        if (parsed && parsed.history && typeof parsed.history === 'object') {
          importData(parsed);
          const count = Object.keys(parsed.history).length;
          alert(`הנתונים נטענו בהצלחה! ${count} שאלות יובאו.`);
          return;
        }
        const oldData = parsed?.data || parsed;
        if (oldData && typeof oldData === 'object') {
          const normalized: any = {
            history: oldData.history || {},
            favorites: Array.isArray(oldData.favorites) ? oldData.favorites : [],
            notes: oldData.notes || {},
            ratings: oldData.ratings || {},
            tags: oldData.tags || {},
            plan: null,
          };
          const count = Object.keys(normalized.history).length;
          if (count > 0) {
            importData(normalized);
            alert(`יובאו בהצלחה ${count} שאלות מהגרסה הישנה!`);
            return;
          }
        }
        alert('קובץ לא תקין — לא זוהה היסטוריית שאלות.');
      } catch { alert('שגיאה בקריאת הקובץ. ודא שהקובץ הוא JSON תקני.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <>
    <motion.div
      className="fade-in max-w-6xl mx-auto space-y-5 relative"
      style={{ minHeight: '100vh' }}
      variants={containerVariants}
      initial="hidden"
      animate="visible">

      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between" dir="rtl">
        <h1 className="text-2xl font-bold" style={{ color: '#7b92ff', textShadow: '0 0 20px rgba(123,146,255,0.2)' }}>דשבורד ביצועים</h1>
        <p className="text-xs text-muted-foreground hidden md:block">לחץ על כרטיס לפירוט מלא</p>
      </motion.div>

      {/* Daily Report */}
      <motion.div variants={itemVariants}>
        <DailyReportTile />
      </motion.div>

      {/* ROW 1 — Question Bank Status Bar */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3" dir="rtl">
        {[
          { value: withoutExp, color: '#ff1744', label: 'ללא הסבר' },
          { value: withExp, color: '#7b92ff', label: 'כוללות הסבר' },
          { value: data.length, color: '#e0e0e0', label: 'סה״כ שאלות' },
        ].map(item => (
          <div key={item.label} className="rounded-2xl p-4 text-center transition-all duration-200" style={tileStyle}>
            <div className="text-3xl font-black" style={{ fontFamily: "'Share Tech Mono', monospace", color: item.color, textShadow: `0 0 12px ${item.color}33` }}>{item.value}</div>
            <div className="text-[11px] text-muted-foreground">{item.label}</div>
          </div>
        ))}
      </motion.div>

      {/* ROW 1.5 — Personal Statistics */}
      <motion.div variants={itemVariants} className="flex items-center gap-2 pt-2" dir="rtl">
        <User className="w-4 h-4" style={{ color: '#7b92ff' }} />
        <h2 className="text-lg font-bold" style={{ color: '#7b92ff', textShadow: '0 0 12px rgba(123,146,255,0.15)' }}>הסטטיסטיקה שלי</h2>
      </motion.div>
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3" dir="rtl">
        {[
          { value: personalStats.totalAttempts, label: 'שאלות שבוצעו', click: undefined },
          { value: personalStats.uniqueQuestions, label: 'שאלות ייחודיות', click: undefined },
          { value: personalStats.totalErrors, label: 'טעויות', click: undefined },
          { value: personalStats.corrected, label: 'שאלות מתוקנות', click: () => setDrilldownMetric('corrected'), color: '#00e676' },
          { value: personalStats.uncorrected, label: 'שאלות שעדיין לא תוקנו', click: () => setDrilldownMetric('uncorrected'), color: '#7b92ff' },
          { value: personalStats.repeatedErrors, label: 'טעויות חוזרות', click: () => setDrilldownMetric('repeatedErrors'), color: '#ff1744', icon: true },
        ].map(item => (
          <div
            key={item.label}
            className={`rounded-2xl p-4 text-center transition-all duration-200 ${item.click ? 'cursor-pointer hover:brightness-110' : ''}`}
            style={tileStyle}
            onClick={item.click}
          >
            <div className="flex items-center justify-center gap-1">
              {item.icon && <AlertTriangle className="w-4 h-4" style={{ color: '#ff1744' }} />}
              <AnimatedNumber
                value={item.value}
                className={`text-3xl font-black ${item.icon ? '' : ''}`}
                style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  color: item.color || '#e0e0e0',
                  textShadow: item.color ? `0 0 12px ${item.color}33` : undefined,
                }}
              />
            </div>
            <div className={`text-[11px] text-muted-foreground ${item.icon ? 'font-bold' : ''}`}>{item.label}</div>
          </div>
        ))}
      </motion.div>

      {/* ROW 2 — Main 3-Column Dashboard Panel */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <WeakZoneMapTile zones={weakZones} />
        <ERITile
          value={eri.value}
          accuracy={eri.accuracy}
          coverage={eri.coverage}
          criticalAvg={eri.criticalAvg}
          consistency={eri.consistency}
          streak={streak} />
        <div className="rounded-2xl p-5 transition-all duration-200" style={tileStyle} dir="rtl">
          <span className="text-sm font-bold block text-right mb-4" style={{ color: '#7b92ff' }}>מדדים עיקריים</span>
          <div className="flex flex-col items-center gap-2">
            <GaugeDial value={eri.accuracy} max={100} color="#22c55e" label="🟢 דיוק" pct={eri.accuracy} unit="%" />
            <GaugeDial value={eri.coverage} max={100} color="#f59e0b" label="🟠 כיסוי" pct={eri.coverage} unit="%" />
            <GaugeDial value={streak} max={30} color="#F97316" label="🔥 רצף" pct={Math.min(100, Math.round(streak / 30 * 100))} unit=" ימים" />
          </div>
        </div>
      </motion.div>

      {/* ROW 2.5 — Forgetting Risk */}
      <motion.div variants={itemVariants}>
        <ForgettingRiskTile risks={forgettingRisk} />
      </motion.div>

      {/* ROW 3 — Accuracy Trend Chart */}
      <motion.div variants={itemVariants}>
        <AccuracyCanvasChart />
      </motion.div>

      {/* ROW 4 — Topic Heatmap */}
      <motion.div variants={itemVariants} className="min-h-[400px]">
        <TopicTreemap topicData={stats.topicData} onTopicClick={handleTopicClick} repeatedErrorsByTopic={repeatedErrorsByTopic} />
      </motion.div>

      <motion.div variants={itemVariants}>
        <TopicPerformanceTable
          topicData={stats.topicData}
          onTopicClick={handleTopicClick}
          progress={progress}
          data={data} />
      </motion.div>

      {/* ROW 6 — Import/Export */}
      <motion.div variants={itemVariants} className="rounded-2xl p-6 transition-all duration-200" style={tileStyle} dir="rtl">
        <h3 className="font-bold mb-4 text-sm flex items-center gap-2" style={{ color: '#7b92ff' }}>💾 ניהול נתונים וגיבוי</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={handleExport} className="px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2" style={{ background: 'rgba(123,146,255,0.12)', color: '#7b92ff', border: '1px solid rgba(123,146,255,0.25)' }}>
            <Download className="w-4 h-4" /> שמור גיבוי לקובץ
          </button>
          <label className="px-5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer" style={{ background: 'rgba(255,255,255,0.04)', color: '#e0e0e0', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Upload className="w-4 h-4" /> טען גיבוי מקובץ
            <input type="file" className="hidden" accept=".json" onChange={handleImport} />
          </label>
        </div>
      </motion.div>
    </motion.div>

    {drilldownMetric && (
      <PersonalStatsDrilldown
        open={!!drilldownMetric}
        onOpenChange={(open) => { if (!open) setDrilldownMetric(null); }}
        metric={drilldownMetric}
        detailedAnswers={detailedAnswers}
        onPractice={handleDrilldownPractice}
      />
    )}
    </>
  );
}
