import { useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Search, RotateCcw } from 'lucide-react';

export default function ResultsView() {
  const { session, progress, data, navigate, startSession, updateHistory } = useApp();
  const { quiz, answers, mode } = session;

  const results = useMemo(() => {
    let score = 0;
    const details: { q: typeof quiz[0]; userAns: string | null; correctAns: string; isCorrect: boolean }[] = [];

    quiz.forEach((q, i) => {
      const userAns = answers[i];
      const correctAns = q[KEYS.CORRECT];
      const isCorrect = userAns === correctAns;
      if (userAns && isCorrect) score++;
      details.push({ q, userAns, correctAns, isCorrect });
    });

    // Update history for exam mode
    if (mode === 'exam') {
      quiz.forEach((q, i) => {
        const userAns = answers[i];
        if (userAns) {
          updateHistory(q[KEYS.ID], userAns === q[KEYS.CORRECT]);
        }
      });
    }

    const pct = quiz.length > 0 ? Math.round((score / quiz.length) * 100) : 0;
    return { score, pct, details };
  }, [quiz, answers, mode]);

  const handleReview = () => {
    navigate('session');
    // Set mode to review - will be handled in session
  };

  const handleRestart = () => {
    startSession(quiz, quiz.length, 'practice');
  };

  const icon = results.pct >= 80 ? '🏆' : results.pct >= 60 ? '💪' : '📚';

  return (
    <div className="fade-in max-w-2xl mx-auto text-center pt-10">
      <div className="text-8xl mb-6 animate-bounce drop-shadow-xl">{icon}</div>
      <h2 className="text-4xl font-bold text-foreground mb-3">סיכום ביצועים</h2>
      <p className="text-muted-foreground mb-10 text-lg font-light">סיימת את הסשן בהצלחה</p>

      <div className="grid grid-cols-2 gap-6 mb-10">
        <div className="soft-card bg-card border border-border p-8">
          <div className="text-5xl font-black text-primary mb-2">{results.pct}%</div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">ציון סופי</div>
        </div>
        <div className="soft-card bg-card border border-border p-8">
          <div className="text-5xl font-black text-foreground mb-2">{results.score}/{quiz.length}</div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">תשובות נכונות</div>
        </div>
      </div>

      {/* Weak topics */}
      {(() => {
        const topicStats: Record<string, { total: number; wrong: number }> = {};
        results.details.forEach(d => {
          if (!d.userAns) return;
          const topic = d.q[KEYS.TOPIC] || 'Other';
          if (!topicStats[topic]) topicStats[topic] = { total: 0, wrong: 0 };
          topicStats[topic].total++;
          if (!d.isCorrect) topicStats[topic].wrong++;
        });
        const weak = Object.entries(topicStats)
          .map(([topic, s]) => ({ topic, rate: s.wrong / s.total, count: s.total }))
          .filter(i => i.rate > 0 && i.count >= 1)
          .sort((a, b) => b.rate - a.rate)
          .slice(0, 3);

        if (weak.length === 0) return null;
        return (
          <div className="bg-primary/5 rounded-3xl p-8 border border-primary/10 text-right mb-10 shadow-sm">
            <h3 className="font-bold text-primary mb-4 flex items-center gap-3 text-lg">✨ ניתוח חכם והמלצות</h3>
            <p className="text-foreground mb-2">זוהו נושאים לחיזוק:</p>
            <ul className="list-disc list-inside mt-2 font-bold text-primary space-y-1">
              {weak.map(t => <li key={t.topic}>{t.topic} ({Math.round(t.rate * 100)}% שגיאות)</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">מומלץ לחזור על הפרקים הרלוונטיים במילר.</p>
          </div>
        );
      })()}

      {/* Question details */}
      <div className="text-right soft-card bg-card border border-border p-8 mb-10 max-h-96 overflow-y-auto">
        <h3 className="font-bold text-foreground mb-6 border-b border-border pb-3">פירוט שאלות</h3>
        <div className="space-y-4">
          {results.details.map((d, i) => (
            <div
              key={i}
              className={`p-4 border-b border-border text-sm ${
                d.isCorrect ? 'bg-success-muted' : d.userAns ? 'bg-destructive/5' : 'bg-muted'
              }`}
            >
              <div className="flex justify-between font-bold text-foreground">
                <span>#{d.q[KEYS.ID]}</span>
                <span>{d.userAns ? (d.isCorrect ? '✅' : '❌') : '⚪ (דולג)'}</span>
              </div>
              <p className="mt-2 mb-2 text-muted-foreground font-light bidi-text">{d.q[KEYS.QUESTION].substring(0, 60)}...</p>
              <div className="text-xs text-muted-foreground">תשובתך: {d.userAns || '-'} | נכון: {d.correctAns}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        <button onClick={() => navigate('home')} className="bg-card text-muted-foreground border border-border px-8 py-4 rounded-xl font-medium hover:bg-muted transition">
          חזרה לראשי
        </button>
        <button onClick={handleRestart} className="bg-primary text-primary-foreground px-8 py-4 rounded-xl font-bold shadow-lg hover:-translate-y-0.5 transition flex items-center gap-2">
          <RotateCcw className="w-4 h-4" /> תרגול מחדש
        </button>
      </div>
    </div>
  );
}
