import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Brain, Dumbbell, RotateCcw, Star, StickyNote, FileCheck, CalendarClock, Layers, Play, X, AlertTriangle, ClipboardList, Info, ChevronDown } from 'lucide-react';
import jigsawImg from '@/assets/jigsaw.png';
import { motion, AnimatePresence } from 'framer-motion';
import { getExamProximityPhase, EXAM_DATE, type ExamPhase } from '@/lib/smartSelection';
import MatrixCountdown from '@/components/MatrixCountdown';
import HomeStatsSummary from '@/components/stats/HomeStatsSummary';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import DailyReportModal from '@/components/DailyReportModal';

const containerVariant = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 250, damping: 25, mass: 0.8 } },
};

const PARAM_TOOLTIPS: Record<string, string> = {
  srsUrgency: 'כמה דחוף לחזור על השאלה לפי אלגוריתם SRS — ערך גבוה = איחור גדול מתאריך החזרה',
  topicWeakness: 'חולשה בנושא — ההפרש בין אחוז הדיוק שלך בנושא לדיוק הכללי',
  recencyGap: 'כמה ימים עברו מאז תרגלת את הנושא הזה',
  streakPenalty: 'עונש על רצף טעויות — אם טעית ברציפות בשאלה, הציון עולה',
  examProximity: 'קרבה לתאריך הבחינה — ככל שהמבחן קרוב יותר, הדגש על נושאים חלשים עולה',
  yieldBoost: 'חשיבות הנושא — Tier 1 (1.0), Tier 2 (0.6), Tier 3 (0.2)',
};

function FormulaParam({ name }: { name: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="text-primary cursor-help underline decoration-dotted underline-offset-2 bg-transparent border-none p-0 font-mono text-xs inline">{name}</button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs" dir="rtl">
        <p>{PARAM_TOOLTIPS[name]}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function HomeView() {
  const { data, progress, navigate, resetAllData, startSession, getDueQuestions, savedSessionInfo, resumeSessionFromDb, clearSavedSession, loadingSavedSession } = useApp();
  const [loadingDue, setLoadingDue] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [algoOpen, setAlgoOpen] = useState(false);

  // Exam proximity badge
  const examPhase = useMemo(() => getExamProximityPhase(), []);
  const [phaseDismissed, setPhaseDismissed] = useState(() => {
    const stored = localStorage.getItem('exam_phase_banner_dismissed_v1');
    return stored === examPhase;
  });
  const showExamBadge = examPhase !== 'early' && !phaseDismissed;
  const dismissExamBadge = () => {
    localStorage.setItem('exam_phase_banner_dismissed_v1', examPhase);
    setPhaseDismissed(true);
  };

  let mistakes = 0;
  Object.values(progress.history).forEach(h => { if (h.lastResult === 'wrong') mistakes++; });
  const notesCount = Object.keys(progress.notes).length;
  const favsCount = progress.favorites.length;

  const withExp = data.filter(q => q[KEYS.EXPLANATION] && q[KEYS.EXPLANATION].trim().length > 5).length;
  const withoutExp = data.length - withExp;

  const handleSmartPractice = () => {
    if (!data.length) return;
    const topicStats: Record<string, { correct: number; total: number }> = {};
    Object.entries(progress.history).forEach(([id, h]) => {
      const q = data.find(x => x[KEYS.ID] === id);
      if (q && q[KEYS.TOPIC]) {
        if (!topicStats[q[KEYS.TOPIC]]) topicStats[q[KEYS.TOPIC]] = { correct: 0, total: 0 };
        topicStats[q[KEYS.TOPIC]].total += h.answered;
        topicStats[q[KEYS.TOPIC]].correct += h.correct;
      }
    });

    let weightedPool: { q: typeof data[0]; weight: number }[] = [];
    const mistakeQs = data.filter(q => progress.history[q[KEYS.ID]]?.lastResult === 'wrong');
    mistakeQs.forEach(q => weightedPool.push({ q, weight: 10 }));

    const others = data.filter(q => progress.history[q[KEYS.ID]]?.lastResult !== 'wrong');
    others.forEach(q => {
      let weight = 1;
      const topic = q[KEYS.TOPIC];
      if (topicStats[topic]) {
        const acc = topicStats[topic].correct / topicStats[topic].total;
        if (acc < 0.5) weight = 3;
        else if (acc < 0.8) weight = 1.5;
      } else {
        weight = 2;
      }
      weightedPool.push({ q, weight });
    });

    const selected: typeof data = [];
    for (let i = 0; i < 15 && weightedPool.length > 0; i++) {
      const totalWeight = weightedPool.reduce((sum, item) => sum + item.weight, 0);
      let random = Math.random() * totalWeight;
      for (let j = 0; j < weightedPool.length; j++) {
        random -= weightedPool[j].weight;
        if (random <= 0) {
          selected.push(weightedPool[j].q);
          weightedPool.splice(j, 1);
          break;
        }
      }
    }

    if (selected.length === 0) return;
    startSession(selected, selected.length, 'practice');
  };

  const handleSimulation = () => {
    if (!data.length) return;
    startSession(data, 120, 'simulation');
  };

  const handleSpacedRepetition = async () => {
    setLoadingDue(true);
    try {
      const due = await getDueQuestions();
      if (due.length === 0) {
        alert('אין שאלות לחזרה היום! תרגל שאלות חדשות.');
        return;
      }
      startSession(due, Math.min(due.length, 30), 'practice');
    } finally {
      setLoadingDue(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Matrix Countdown — full width at top */}
      <MatrixCountdown />

      {/* Metrics Summary Bar */}
      <div className="mt-6">
        <HomeStatsSummary />
      </div>

      <header className="mt-8 mb-12 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
        <div className="flex items-center gap-3">
          <img src={jigsawImg} alt="Jigsaw" className="w-12 h-12 object-contain drop-shadow-[0_0_12px_rgba(220,38,38,0.7)] animate-pulse" />
          <h2 className="text-3xl font-semibold text-foreground tracking-tight matrix-title">
            Let's Play A Game<span className="text-primary">...</span>
          </h2>
        </div>
        <button
          onClick={resetAllData}
          className="group deep-tile text-muted-foreground hover:text-destructive text-sm px-5 py-3 transition-all flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          אפס היסטוריה והתחל מחדש
        </button>
      </header>

      {/* Resume saved session banner */}
      {!loadingSavedSession && savedSessionInfo && (
        <motion.div
          className="mb-8 deep-tile p-5 border-2 border-primary/30 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 250, damping: 25 }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-foreground flex items-center gap-2 text-base">
                <Play className="w-5 h-5 text-primary" />
                יש לך סשן שמור!
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {savedSessionInfo.mode === 'simulation' ? 'סימולציה' :
                 savedSessionInfo.mode === 'exam' ? 'בחינה' : 'תרגול'}{' '}
                — שאלה {savedSessionInfo.index + 1} מתוך {savedSessionInfo.questionIds.length}
                {' · '}נשמר ב-{new Date(savedSessionInfo.createdAt).toLocaleDateString('he-IL')}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setResuming(true);
                  await resumeSessionFromDb();
                  setResuming(false);
                }}
                disabled={resuming}
                className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition flex items-center gap-2 shadow-lg disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                {resuming ? 'טוען...' : 'המשך סשן'}
              </button>
              <button
                onClick={() => clearSavedSession()}
                className="text-muted-foreground hover:text-destructive p-2.5 rounded-xl hover:bg-destructive/10 transition"
                title="מחק סשן שמור"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Exam proximity badge */}
      <AnimatePresence>
        {showExamBadge && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`mb-6 rounded-xl border px-5 py-3 flex items-center justify-between gap-3 ${
              examPhase === 'imminent'
                ? 'bg-destructive/10 border-destructive/30 text-destructive'
                : 'bg-warning/10 border-warning/30 text-warning'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {examPhase === 'imminent'
                ? 'מצב בחינה — עדיפות מקסימלית לנושאים חלשים'
                : 'מצב התקרבות לבחינה — דגש על נושאים חלשים'}
            </div>
            <button onClick={dismissExamBadge} className="p-1 rounded hover:bg-foreground/10 transition shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10"
        style={{ minHeight: 300 }}
        variants={containerVariant}
        initial="hidden"
        animate="visible"
      >
        {/* Smart Practice */}
        <motion.div variants={cardVariant} whileTap={{ scale: 0.97 }} onClick={handleSmartPractice} className="glass-tile p-5 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: 'var(--glow-primary)' }}>
              <Brain className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-1 text-foreground">Smart Practice</h3>
            <p className="text-sm text-muted-foreground font-light">אלגוריתם חכם הבוחר עבורך 15 שאלות על בסיס נקודות תורפה.</p>
          </div>
        </motion.div>

        {/* Simulation Exam */}
        <motion.div variants={cardVariant} whileTap={{ scale: 0.97 }} onClick={handleSimulation} className="glass-tile p-5 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: 'var(--glow-primary)' }}>
              <FileCheck className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-1 text-foreground">מבחן סימולציה</h3>
            <p className="text-sm text-muted-foreground font-light">120 שאלות, 3 שעות, ללא הסברים – כמו מבחן אמיתי.</p>
          </div>
        </motion.div>

        {/* Spaced Repetition */}
        <motion.div variants={cardVariant} whileTap={{ scale: 0.97 }} onClick={handleSpacedRepetition} className={`glass-tile p-5 cursor-pointer group ${loadingDue ? 'opacity-60 pointer-events-none' : ''}`} style={{ willChange: 'transform' }}>
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <CalendarClock className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">חזרה מרווחת</h3>
            <p className="text-sm text-muted-foreground font-light">שאלות שמגיעות לך לחזרה היום על פי אלגוריתם SRS.</p>
          </div>
        </motion.div>

        {/* Flashcards */}
        <motion.div variants={cardVariant} whileTap={{ scale: 0.97 }} onClick={() => navigate('flashcards')} className="glass-tile p-5 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: 'var(--glow-primary)' }}>
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-1 text-foreground">תרגול כרטיסיות</h3>
            <p className="text-sm text-muted-foreground font-light">כרטיסיות Anki – צפה בשאלה, חשוב, והצג תשובה.</p>
          </div>
        </motion.div>

        <motion.div variants={cardVariant} whileTap={{ scale: 0.97 }} onClick={() => navigate('setup-practice')} className="glass-tile p-5 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="relative">
            <div className="w-12 h-12 bg-muted text-primary rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Dumbbell className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">תרגול מותאם</h3>
            <p className="text-sm text-muted-foreground font-light">בחר נושאים, מקורות ומספר שאלות באופן ידני.</p>
          </div>
        </motion.div>

        {/* Mistakes */}
        <motion.div variants={cardVariant} whileTap={{ scale: 0.97 }} onClick={() => navigate('setup-practice')} className="glass-tile p-5 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="relative">
            <div className="w-12 h-12 bg-destructive/15 text-destructive rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <RotateCcw className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">חזרה על טעויות</h3>
            <p className="text-sm text-muted-foreground font-light">
              יש לך <span className="text-primary font-medium">{mistakes}</span> טעויות פתוחות
            </p>
          </div>
        </motion.div>

        {/* Favorites */}
        <motion.div variants={cardVariant} whileTap={{ scale: 0.97 }} onClick={() => navigate('setup-practice')} className="glass-tile p-5 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Star className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">מועדפים</h3>
            <p className="text-sm text-muted-foreground font-light">
              <span className="text-primary font-medium">{favsCount}</span> שאלות שסימנת
            </p>
          </div>
        </motion.div>

        {/* Notebook */}
        <motion.div variants={cardVariant} whileTap={{ scale: 0.97 }} onClick={() => navigate('notebook')} className="glass-tile p-5 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <StickyNote className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">המחברת שלי</h3>
            <p className="text-sm text-muted-foreground font-light">
              צפייה ב-<span className="text-primary font-medium">{notesCount}</span> הערות
            </p>
          </div>
        </motion.div>

        {/* Algorithm Explainer — in grid, same size as other cards */}
        <TooltipProvider delayDuration={200}>
          <motion.div variants={cardVariant} whileTap={{ scale: 0.97 }} onClick={() => setAlgoOpen(o => !o)} className="glass-tile p-5 cursor-pointer group" style={{ willChange: 'transform' }}>
            <div className="relative">
              <div className="w-12 h-12 bg-primary/15 text-primary rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Info className="w-6 h-6" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg mb-1 text-foreground">איך נבחרות השאלות?</h3>
                <motion.div animate={{ rotate: algoOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </motion.div>
              </div>
              <p className="text-sm text-muted-foreground font-light">הצצה לאלגוריתם הניקוד החכם שמנהל את הסדר.</p>
            </div>
          </motion.div>
        </TooltipProvider>
      </motion.div>

      {/* Algorithm Explainer expanded content — below grid */}
      <TooltipProvider delayDuration={200}>
        <AnimatePresence>
          {algoOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="overflow-hidden mb-10 -mt-5"
            >
              <div className="deep-tile p-6 space-y-5 text-sm text-muted-foreground leading-relaxed" dir="rtl">
                <p className="text-foreground font-medium">
                  כל שאלה מקבלת ציון חכם לפי הנוסחה:
                </p>
                <div className="bg-muted/30 rounded-lg px-4 py-3 text-xs font-mono text-foreground/80 overflow-x-auto" dir="ltr">
                  smartScore = W1×<FormulaParam name="srsUrgency" /> + W2×<FormulaParam name="topicWeakness" /> + W3×<FormulaParam name="recencyGap" /> + W4×<FormulaParam name="streakPenalty" /> + W5×<FormulaParam name="examProximity" /> + W6×<FormulaParam name="yieldBoost" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-4">
                    <h4 className="font-bold text-foreground mb-1">⚡ מהיר (15 שאלות)</h4>
                    <p>דגש על שאלות SRS דחופות ונושאים חלשים. סבב חזרה מהיר.</p>
                  </div>
                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-4">
                    <h4 className="font-bold text-foreground mb-1">📘 רגיל (40 שאלות)</h4>
                    <p>ניקוד היברידי מאוזן על פני 6 פרמטרים – חזרה + חומר חדש.</p>
                  </div>
                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-4">
                    <h4 className="font-bold text-foreground mb-1">🔬 מעמיק (100 שאלות)</h4>
                    <p>כיסוי רחב עם פיזור נושאים מקסימלי. לסשנים ארוכים.</p>
                  </div>
                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-4">
                    <h4 className="font-bold text-foreground mb-1">🎯 סימולציה (120 שאלות)</h4>
                    <p>חלוקה פרופורציונלית לפי משקלי נושאים היסטוריים בבחינה. ללא ניקוד.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </TooltipProvider>

      {/* Daily Report — slim horizontal tile */}
      <div className="mb-6">
        <button
          onClick={() => setReportOpen(true)}
          className="deep-tile w-full px-6 py-3 flex items-center justify-center gap-2 text-sm font-semibold text-primary"
        >
          <ClipboardList className="w-5 h-5" />
          דו״ח יומי
        </button>
      </div>
      <DailyReportModal open={reportOpen} onClose={() => setReportOpen(false)} />

      {/* DB Status — slim horizontal bar */}
      <div className="mb-12">
        <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3 tracking-widest px-1 matrix-title">סטטוס מאגר שאלות</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="deep-tile p-4 text-center">
            <div className="text-2xl font-bold matrix-text">{data.length}</div>
            <div className="text-[10px] text-muted-foreground font-medium mt-1">סה"כ שאלות</div>
          </div>
          <div className="deep-tile p-4 text-center">
            <div className="text-2xl font-bold text-success matrix-text">{withExp}</div>
            <div className="text-[10px] text-success/70 font-medium mt-1">כוללות הסבר</div>
          </div>
          <div className="deep-tile p-4 text-center">
            <div className="text-2xl font-bold text-warning matrix-text">{withoutExp}</div>
            <div className="text-[10px] text-warning/70 font-medium mt-1">ללא הסבר</div>
          </div>
        </div>
      </div>
    </div>
  );
}
