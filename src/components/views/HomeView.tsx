import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Brain, Dumbbell, RotateCcw, Star, StickyNote, FileCheck, CalendarClock, Layers, Play, X } from 'lucide-react';

export default function HomeView() {
  const { data, progress, navigate, resetAllData, startSession, getDueQuestions, savedSessionInfo, resumeSessionFromDb, clearSavedSession, loadingSavedSession } = useApp();
  const [loadingDue, setLoadingDue] = useState(false);
  const [resuming, setResuming] = useState(false);

  let mistakes = 0;
  Object.values(progress.history).forEach(h => { if (h.lastResult === 'wrong') mistakes++; });
  const notesCount = Object.keys(progress.notes).length;
  const favsCount = progress.favorites.length;

  const withExp = data.filter(q => q[KEYS.EXPLANATION] && q[KEYS.EXPLANATION].trim().length > 5).length;
  const withoutExp = data.length - withExp;

  // Smart Practice
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
    <div className="fade-in max-w-6xl mx-auto">
      <header className="mb-12 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-semibold text-foreground tracking-tight">
            שלום, ד"ר <span className="text-primary">מתמחה</span> 👋
          </h2>
          <p className="text-muted-foreground mt-2 font-light text-lg">מוכן להמשיך בהכנות למבחן שלב א'?</p>
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
        <div className="mb-8 liquid-glass p-5 border-2 border-primary/30 relative overflow-hidden">
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
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {/* Smart Practice */}
        <div
          onClick={handleSmartPractice}
          className="liquid-glass p-6 cursor-pointer group"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: 'var(--glow-primary)' }}>
              <Brain className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-1 text-foreground matrix-title">Smart Practice</h3>
            <p className="text-sm text-muted-foreground font-light">אלגוריתם חכם הבוחר עבורך 15 שאלות על בסיס נקודות תורפה.</p>
          </div>
        </div>

        {/* Simulation Exam */}
        <div
          onClick={handleSimulation}
          className="liquid-glass p-6 cursor-pointer group"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: 'var(--glow-primary)' }}>
              <FileCheck className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-1 text-foreground matrix-title">מבחן סימולציה</h3>
            <p className="text-sm text-muted-foreground font-light">120 שאלות, 3 שעות, ללא הסברים – כמו מבחן אמיתי.</p>
          </div>
        </div>

        {/* Spaced Repetition */}
        <div
          onClick={handleSpacedRepetition}
          className={`liquid-glass p-6 cursor-pointer group ${loadingDue ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <CalendarClock className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">חזרה מרווחת</h3>
            <p className="text-sm text-muted-foreground font-light">שאלות שמגיעות לך לחזרה היום על פי אלגוריתם SRS.</p>
          </div>
        </div>

        {/* Flashcards */}
        <div
          onClick={() => navigate('flashcards')}
          className="liquid-glass p-6 cursor-pointer group"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent rounded-2xl pointer-events-none" />
          <div className="relative">
            <div className="w-12 h-12 bg-primary/15 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: 'var(--glow-primary)' }}>
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg mb-1 text-foreground matrix-title">תרגול כרטיסיות</h3>
            <p className="text-sm text-muted-foreground font-light">כרטיסיות Anki – צפה בשאלה, חשוב, והצג תשובה.</p>
          </div>
        </div>

        <div onClick={() => navigate('setup-practice')} className="liquid-glass p-6 cursor-pointer group">
          <div className="relative">
            <div className="w-12 h-12 bg-muted text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Dumbbell className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg mb-1 text-foreground">תרגול מותאם</h3>
            <p className="text-sm text-muted-foreground font-light">בחר נושאים, מקורות ומספר שאלות באופן ידני.</p>
          </div>
        </div>

        {/* Mistakes */}
        <div onClick={() => navigate('setup-practice')} className="liquid-glass p-6 cursor-pointer group">
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
        </div>

        {/* Favorites */}
        <div onClick={() => navigate('setup-practice')} className="liquid-glass p-6 cursor-pointer group">
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
        </div>

        {/* Notebook */}
        <div onClick={() => navigate('notebook')} className="liquid-glass p-6 cursor-pointer group">
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
        </div>
      </div>

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
