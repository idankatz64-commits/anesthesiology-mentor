import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Download, Upload, AlertTriangle, BookOpen, Target, Brain, BarChart3, CheckCircle, XCircle, Repeat } from 'lucide-react';
import { motion } from 'framer-motion';
import AnimatedNumber from '@/components/AnimatedNumber';

import { useStatsData } from '@/components/stats/useStatsData';
import ERITile from '@/components/stats/ERITile';
import ForgettingRiskTile from '@/components/stats/ForgettingRiskTile';
import AccuracyCanvasChart from '@/components/stats/AccuracyCanvasChart';
import TopicPerformanceTable from '@/components/stats/TopicPerformanceTable';
import TopicTreemap from '@/components/stats/TopicTreemap';
import PersonalStatsDrilldown, { type DrilldownMetric } from '@/components/stats/PersonalStatsDrilldown';
import DailyReportTile from '@/components/stats/DailyReportTile';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0, 0, 0.2, 1] as const } }
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

  // ROW 1 — Main KPI
  const kpiCards = [
    { label: 'שאלות היום', value: personalStats.totalAttempts, icon: BarChart3, color: 'text-foreground' },
    { label: 'דיוק', value: stats.accuracy, suffix: '%', icon: Target, color: stats.accuracy >= 70 ? 'text-green-500' : stats.accuracy >= 50 ? 'text-yellow-500' : 'text-destructive' },
    { label: 'טעויות פתוחות', value: personalStats.uncorrected, icon: XCircle, color: 'text-destructive' },
    { label: 'כיסוי מאגר', value: stats.coverage, suffix: '%', icon: BookOpen, color: 'text-primary' },
  ];

  return (
    <>
      <motion.div
        className="fade-in w-full mx-auto flex flex-col gap-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* ROW 1 — 4 KPI Cards */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-3" dir="rtl">
          {kpiCards.map(k => (
            <div key={k.label} className="glass-tile rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <k.icon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{k.label}</span>
              </div>
              <AnimatedNumber
                value={k.value}
                suffix={k.suffix}
                className={`text-3xl font-black ${k.color}`}
                style={{ fontFamily: "'Share Tech Mono', monospace" }}
              />
            </div>
          ))}
        </motion.div>

        {/* ROW 2 — DB Status (3 cards) */}
        <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3" dir="rtl">
          <div className="glass-tile rounded-xl p-2.5 text-center">
            <div className="text-[9px] text-muted-foreground mb-0.5">סה״כ שאלות במאגר</div>
            <AnimatedNumber value={data.length} className="text-2xl font-black text-primary" style={{ fontFamily: "'Share Tech Mono', monospace" }} />
          </div>
          <div className="glass-tile rounded-xl p-2.5 text-center">
            <div className="text-[9px] text-muted-foreground mb-0.5">כוללות הסבר</div>
            <AnimatedNumber value={withExp} className="text-2xl font-black text-green-500" style={{ fontFamily: "'Share Tech Mono', monospace" }} />
          </div>
          <div className="glass-tile rounded-xl p-2.5 text-center">
            <div className="text-[9px] text-muted-foreground mb-0.5">ללא הסבר</div>
            <AnimatedNumber value={withoutExp} className="text-2xl font-black text-destructive" style={{ fontFamily: "'Share Tech Mono', monospace" }} />
          </div>
        </motion.div>

        {/* ROW 3 — Personal Stats (6 cards) */}
        <motion.div variants={itemVariants} dir="rtl">
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Brain className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold text-primary">הסטטיסטיקה שלי</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { value: personalStats.totalAttempts, label: 'שאלות שבוצעו', icon: BarChart3 },
              { value: personalStats.uniqueQuestions, label: 'שאלות ייחודיות', icon: BookOpen },
              { value: personalStats.totalErrors, label: 'טעויות', icon: AlertTriangle, color: 'text-destructive', iconColor: 'text-destructive' },
              { value: personalStats.corrected, label: 'מתוקנות', click: () => setDrilldownMetric('corrected'), color: 'text-green-500', icon: CheckCircle, iconColor: 'text-green-500' },
              { value: personalStats.uncorrected, label: 'לא תוקנו', click: () => setDrilldownMetric('uncorrected'), color: 'text-primary', icon: XCircle, iconColor: 'text-primary' },
              { value: personalStats.repeatedErrors, label: 'טעויות חוזרות', click: () => setDrilldownMetric('repeatedErrors'), color: 'text-destructive', icon: Repeat, iconColor: 'text-destructive' },
            ].map(item => (
              <div
                key={item.label}
                className={`glass-tile rounded-xl p-2.5 text-center ${item.click ? 'cursor-pointer hover:border-primary/30 transition-colors' : ''}`}
                onClick={item.click}
              >
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <item.icon className={`w-3 h-3 ${item.iconColor || 'text-muted-foreground'}`} />
                </div>
                <AnimatedNumber
                  value={item.value}
                  className={`text-xl font-black ${item.color || 'text-foreground'}`}
                  style={{ fontFamily: "var(--font-matrix)" }}
                />
                <div className="text-[9px] text-muted-foreground leading-tight">{item.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ROW 4 — Dual Heatmaps */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="min-h-[300px]">
            <TopicTreemap topicData={stats.topicData} onTopicClick={handleTopicClick} repeatedErrorsByTopic={repeatedErrorsByTopic} />
          </div>
          <ForgettingRiskTile risks={forgettingRisk} />
        </motion.div>

        {/* ROW 5 — Accuracy Chart */}
        <motion.div variants={itemVariants}>
          <AccuracyCanvasChart />
        </motion.div>

        {/* ROW 6 — ERI (with gauges, weak zones, strengths inside) */}
        <motion.div variants={itemVariants}>
          <ERITile
            value={eri.value}
            accuracy={eri.accuracy}
            coverage={eri.coverage}
            criticalAvg={eri.criticalAvg}
            consistency={eri.consistency}
            streak={streak}
            weakZones={weakZones}
            topicData={stats.topicData}
            forgettingRisk={forgettingRisk}
            totalQuestions={data.length}
          />
        </motion.div>

        {/* ROW 7 — Topic Performance Table */}
        <motion.div variants={itemVariants}>
          <TopicPerformanceTable
            topicData={stats.topicData}
            onTopicClick={handleTopicClick}
            progress={progress}
            data={data}
          />
        </motion.div>

        {/* ROW 8 — Daily Summary + Import/Export */}
        <motion.div variants={itemVariants}>
          <DailyReportTile />
        </motion.div>

        <motion.div variants={itemVariants} className="glass-tile rounded-xl p-4" dir="rtl">
          <h3 className="font-bold mb-3 text-xs flex items-center gap-2 text-primary">💾 ניהול נתונים וגיבוי</h3>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleExport} className="px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 bg-primary/10 text-primary border border-primary/25 hover:bg-primary/20">
              <Download className="w-3.5 h-3.5" /> שמור גיבוי לקובץ
            </button>
            <label className="px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer bg-muted/30 text-foreground border border-border hover:bg-muted/50">
              <Upload className="w-3.5 h-3.5" /> טען גיבוי מקובץ
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
