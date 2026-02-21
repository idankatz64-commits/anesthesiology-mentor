import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Brain, Dumbbell, RotateCcw, Star, StickyNote, FileCheck, CalendarClock, Layers } from 'lucide-react';

export default function HomeView() {
  const { data, progress, navigate, resetAllData, startSession, getDueQuestions } = useApp();
  const [loadingDue, setLoadingDue] = useState(false);

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

  // Simulation Exam - 120 random questions
  const handleSimulation = () => {
    if (!data.length) return;
    startSession(data, 120, 'simulation');
  };

  // Spaced Repetition - due questions
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
          className="group bg-card border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 text-sm px-5 py-3 rounded-xl transition-all shadow-sm hover:shadow-md flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          אפס היסטוריה והתחל מחדש
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {/* Smart Practice */}
        <div
          onClick={handleSmartPractice}
          className="soft-card bg-card border border-border p-6 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute -right-10 -top-10 w-24 h-24 bg-primary/10 rounded-full blur-2xl" />
          <div className="w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform shadow-lg">
            <Brain className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-lg mb-1 text-foreground">Smart Practice (AI)</h3>
          <p className="text-sm text-muted-foreground font-light">אלגוריתם חכם הבוחר עבורך 15 שאלות על בסיס נקודות תורפה.</p>
        </div>

        {/* Simulation Exam */}
        <div
          onClick={handleSimulation}
          className="soft-card bg-card border border-border p-6 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute -left-10 -top-10 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl" />
          <div className="w-12 h-12 bg-orange-500 text-white rounded-xl flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform shadow-lg">
            <FileCheck className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-lg mb-1 text-foreground">מבחן סימולציה</h3>
          <p className="text-sm text-muted-foreground font-light">120 שאלות, 3 שעות, ללא הסברים – כמו מבחן אמיתי.</p>
        </div>

        {/* Spaced Repetition */}
        <div
          onClick={handleSpacedRepetition}
          className={`soft-card bg-card border border-border p-6 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group ${loadingDue ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <div className="w-12 h-12 bg-info/10 text-info rounded-xl flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform">
            <CalendarClock className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-lg mb-1 text-foreground">חזרה מרווחת</h3>
          <p className="text-sm text-muted-foreground font-light">שאלות שמגיעות לך לחזרה היום על פי אלגוריתם SRS.</p>
        </div>

        {/* Flashcards */}
        <div
          onClick={() => navigate('flashcards')}
          className="soft-card bg-card border border-border p-6 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute -left-10 -bottom-10 w-24 h-24 bg-accent/20 rounded-full blur-2xl" />
          <div className="w-12 h-12 bg-accent text-accent-foreground rounded-xl flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform shadow-lg">
            <Layers className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-lg mb-1 text-foreground">תרגול כרטיסיות</h3>
          <p className="text-sm text-muted-foreground font-light">כרטיסיות Anki – צפה בשאלה, חשוב, והצג תשובה.</p>
        </div>

        <div onClick={() => navigate('setup-practice')} className="soft-card bg-card border border-border p-6 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group">
          <div className="w-12 h-12 bg-muted text-primary rounded-xl flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform">
            <Dumbbell className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-lg mb-1 text-foreground">תרגול מותאם</h3>
          <p className="text-sm text-muted-foreground font-light">בחר נושאים, מקורות ומספר שאלות באופן ידני.</p>
        </div>

        {/* Mistakes */}
        <div onClick={() => navigate('setup-practice')} className="soft-card bg-card border border-border p-6 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group">
          <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-xl flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform">
            <RotateCcw className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-lg mb-1 text-foreground">חזרה על טעויות</h3>
          <p className="text-sm text-muted-foreground font-light">
            יש לך <span className="text-destructive font-medium">{mistakes}</span> טעויות פתוחות
          </p>
        </div>

        {/* Favorites */}
        <div onClick={() => navigate('setup-practice')} className="soft-card bg-card border border-border p-6 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group">
          <div className="w-12 h-12 bg-warning/10 text-warning rounded-xl flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform">
            <Star className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-lg mb-1 text-foreground">מועדפים</h3>
          <p className="text-sm text-muted-foreground font-light">
            <span className="text-warning font-medium">{favsCount}</span> שאלות שסימנת
          </p>
        </div>

        {/* Notebook */}
        <div onClick={() => navigate('notebook')} className="soft-card bg-card border border-border p-6 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group">
          <div className="w-12 h-12 bg-warning-muted text-warning rounded-xl flex items-center justify-center text-xl mb-4 group-hover:scale-110 transition-transform">
            <StickyNote className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-lg mb-1 text-foreground">המחברת שלי</h3>
          <p className="text-sm text-muted-foreground font-light">
            צפייה ב-<span className="text-warning font-medium">{notesCount}</span> הערות
          </p>
        </div>
      </div>

      {/* DB Status */}
      <div className="mb-12">
        <h3 className="text-xs font-bold text-muted-foreground uppercase mb-4 tracking-widest px-1">סטטוס מאגר שאלות</h3>
        <div className="grid grid-cols-3 gap-6">
          <div className="soft-card bg-card border border-border p-5 text-center">
            <div className="text-3xl font-bold text-foreground">{data.length}</div>
            <div className="text-xs text-muted-foreground font-medium mt-1">סה"כ שאלות</div>
          </div>
          <div className="soft-card p-5 text-center bg-success-muted border border-success/20">
            <div className="text-3xl font-bold text-success">{withExp}</div>
            <div className="text-xs text-success/70 font-medium mt-1">כוללות הסבר</div>
          </div>
          <div className="soft-card p-5 text-center bg-warning-muted border border-warning/20">
            <div className="text-3xl font-bold text-warning">{withoutExp}</div>
            <div className="text-xs text-warning/70 font-medium mt-1">ללא הסבר</div>
          </div>
        </div>
      </div>
    </div>
  );
}
