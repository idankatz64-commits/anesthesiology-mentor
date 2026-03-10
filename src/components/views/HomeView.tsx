import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Brain, Dumbbell, RotateCcw, Star, StickyNote, FileCheck, CalendarClock, Layers, Play, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cardHoverTap } from '@/lib/animations';
import { getExamProximityPhase, EXAM_DATE, type ExamPhase } from '@/lib/smartSelection';

const containerVariant = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 250, damping: 25, mass: 0.8 } },
};

export default function HomeView() {
  const { data, progress, navigate, resetAllData, startSession, getDueQuestions, savedSessionInfo, resumeSessionFromDb, clearSavedSession, loadingSavedSession } = useApp();
  const [loadingDue, setLoadingDue] = useState(false);
  const [resuming, setResuming] = useState(false);

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
      <header className="mb-12 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
        <div className="flex items-start gap-4">
          <div>
            <h2 className="text-3xl font-semibold text-foreground tracking-tight">
              שלום, ד"ר <span className="text-primary">מתמחה</span> 👋
            </h2>
            <p className="text-muted-foreground mt-2 font-light text-lg">מוכן להמשיך בהכנות למבחן שלב א'?</p>
          </div>
          {(() => {
            const daysLeft = Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400000);
            if (daysLeft <= 0) return null;
            return (
              <div className={`liquid-glass px-4 py-2.5 flex flex-col items-center min-w-[72px] shrink-0 border ${
                daysLeft <= 30 ? 'border-destructive/30' : daysLeft <= 90 ? 'border-warning/30' : 'border-border'
              }`}>
                <span className={`text-2xl font-bold tabular-nums ${
                  daysLeft <= 30 ? 'text-destructive' : daysLeft <= 90 ? 'text-warning' : 'matrix-text'
                }`}>{daysLeft}</span>
                <span className="text-[10px] text-muted-foreground font-medium">ימים לבחינה</span>
              </div>
            );
          })()}
        </div>
        <button
          onClick={resetAllData}
          className="group liquid-glass text-muted-foreground hover:text-destructive text-sm px-5 py-3 transition-all flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          אפס היסטוריה והתחל מחדש
        </button>
      </header>

      {/* Resume saved session banner */}
      {!loadingSavedSession && savedSessionInfo && (
        <motion.div
          className="mb-8 liquid-glass p-5 border-2 border-primary/30 relative overflow-hidden"
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
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12"
        style={{ minHeight: 300 }}
        variants={containerVariant}
        initial="hidden"
        animate="visible"
      >
        {/* Smart Practice */}
        <motion.div variants={cardVariant} {...cardHoverTap} onClick={handleSmartPractice} className="liquid-glass p-6 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: 'var(--glow-primary)' }}>
              <Brain className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-1 text-foreground matrix-title">Smart Practice</h3>
            <p className="text-sm text-muted-foreground font-light">אלגוריתם חכם הבוחר עבורך 15 שאלות על בסיס נקודות תורפה.</p>
          </div>
        </motion.div>

        {/* Simulation Exam */}
        <motion.div variants={cardVariant} {...cardHoverTap} onClick={handleSimulation} className="liquid-glass p-6 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: 'var(--glow-primary)' }}>
              <FileCheck className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-1 text-foreground matrix-title">מבחן סימולציה</h3>
            <p className="text-sm text-muted-foreground font-light">120 שאלות, 3 שעות, ללא הסברים – כמו מבחן אמיתי.</p>
          </div>
        </motion.div>

        {/* Spaced Repetition */}
        <motion.div variants={cardVariant} {...cardHoverTap} onClick={handleSpacedRepetition} className={`liquid-glass p-6 cursor-pointer group ${loadingDue ? 'opacity-60 pointer-events-none' : ''}`} style={{ willChange: 'transform' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <CalendarClock className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">חזרה מרווחת</h3>
            <p className="text-sm text-muted-foreground font-light">שאלות שמגיעות לך לחזרה היום על פי אלגוריתם SRS.</p>
          </div>
        </motion.div>

        {/* Flashcards */}
        <motion.div variants={cardVariant} {...cardHoverTap} onClick={() => navigate('flashcards')} className="liquid-glass p-6 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: 'var(--glow-primary)' }}>
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-1 text-foreground matrix-title">תרגול כרטיסיות</h3>
            <p className="text-sm text-muted-foreground font-light">כרטיסיות Anki – צפה בשאלה, חשוב, והצג תשובה.</p>
          </div>
        </motion.div>

        <motion.div variants={cardVariant} {...cardHoverTap} onClick={() => navigate('setup-practice')} className="liquid-glass p-6 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="relative">
            <div className="w-12 h-12 bg-muted text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Dumbbell className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">תרגול מותאם</h3>
            <p className="text-sm text-muted-foreground font-light">בחר נושאים, מקורות ומספר שאלות באופן ידני.</p>
          </div>
        </motion.div>

        {/* Mistakes */}
        <motion.div variants={cardVariant} {...cardHoverTap} onClick={() => navigate('setup-practice')} className="liquid-glass p-6 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/6 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-destructive/15 text-destructive rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <RotateCcw className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">חזרה על טעויות</h3>
            <p className="text-sm text-muted-foreground font-light">
              יש לך <span className="matrix-text font-medium">{mistakes}</span> טעויות פתוחות
            </p>
          </div>
        </motion.div>

        {/* Favorites */}
        <motion.div variants={cardVariant} {...cardHoverTap} onClick={() => navigate('setup-practice')} className="liquid-glass p-6 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/6 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Star className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">מועדפים</h3>
            <p className="text-sm text-muted-foreground font-light">
              <span className="matrix-text font-medium">{favsCount}</span> שאלות שסימנת
            </p>
          </div>
        </motion.div>

        {/* Notebook */}
        <motion.div variants={cardVariant} {...cardHoverTap} onClick={() => navigate('notebook')} className="liquid-glass p-6 cursor-pointer group" style={{ willChange: 'transform' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/6 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <StickyNote className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">המחברת שלי</h3>
            <p className="text-sm text-muted-foreground font-light">
              צפייה ב-<span className="matrix-text font-medium">{notesCount}</span> הערות
            </p>
          </div>
        </motion.div>
      </motion.div>

      {/* DB Status */}
      <div className="mb-12">
        <h3 className="text-xs font-bold text-muted-foreground uppercase mb-4 tracking-widest px-1 matrix-title">סטטוס מאגר שאלות</h3>
        <div className="grid grid-cols-3 gap-6">
          <div className="liquid-glass p-5 text-center">
            <div className="text-3xl font-bold matrix-text">{data.length}</div>
            <div className="text-xs text-muted-foreground font-medium mt-1">סה"כ שאלות</div>
          </div>
          <div className="liquid-glass p-5 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-success/8 to-transparent rounded-2xl pointer-events-none" />
            <div className="relative">
              <div className="text-3xl font-bold text-success matrix-text">{withExp}</div>
              <div className="text-xs text-success/70 font-medium mt-1">כוללות הסבר</div>
            </div>
          </div>
          <div className="liquid-glass p-5 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-warning/8 to-transparent rounded-2xl pointer-events-none" />
            <div className="relative">
              <div className="text-3xl font-bold text-warning matrix-text">{withoutExp}</div>
              <div className="text-xs text-warning/70 font-medium mt-1">ללא הסבר</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
