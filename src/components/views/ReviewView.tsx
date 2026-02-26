import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';

export default function ReviewView() {
  const { session, navigate, setSessionIndex } = useApp();
  const { quiz, answers, flagged } = session;

  const answeredCount = answers.filter(a => a !== null).length;
  const skippedCount = quiz.length - answeredCount;

  const handleSubmitExam = () => {
    // Calculate score for exam mode
    let score = 0;
    quiz.forEach((q, i) => {
      const userAns = answers[i];
      if (userAns === q[KEYS.CORRECT]) score++;
    });
    // Update session score before navigating to results
    navigate('results');
  };

  return (
    <div className="fade-in max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-8 text-foreground flex items-center gap-3">
        📋 סיכום לפני הגשה
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="soft-card bg-card border border-border p-6 text-center border-t-4 border-t-primary">
          <div className="text-3xl font-bold text-primary">{answeredCount}</div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">נענו</div>
        </div>
        <div className="soft-card bg-card border border-border p-6 text-center border-t-4 border-t-muted-foreground">
          <div className="text-3xl font-bold text-muted-foreground">{skippedCount}</div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">דולגו / טרם נענו</div>
        </div>
        <div className="soft-card bg-card border border-border p-6 text-center border-t-4 border-t-warning">
          <div className="text-3xl font-bold text-warning">{flagged.size}</div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">סומנו לדגל</div>
        </div>
      </div>

      <div className="soft-card bg-card border border-border p-8 mb-10">
        <h3 className="font-bold text-muted-foreground mb-6 text-xs uppercase tracking-wider">מפת שאלות</h3>
        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-3">
          {quiz.map((q, i) => {
            const isAnswered = answers[i] !== null;
            const isFlagged = flagged.has(i);
            return (
              <div
                key={i}
                onClick={() => { setSessionIndex(i); navigate('session'); }}
                className={`h-12 w-full rounded-xl font-bold text-sm flex items-center justify-center border transition hover:scale-105 cursor-pointer ${
                  isFlagged ? 'bg-warning/10 border-warning/30 text-warning' :
                  isAnswered ? 'bg-primary/10 border-primary/30 text-primary' :
                  'bg-muted border-border text-muted-foreground'
                }`}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-6 justify-center">
        <button
          onClick={() => navigate('session')}
          className="bg-card text-foreground border border-border px-8 py-4 rounded-xl font-medium hover:bg-muted transition"
        >
          חזור למבחן
        </button>
        <button
          onClick={handleSubmitExam}
          className="bg-gradient-to-r from-[hsl(25,95%,53%)] to-[hsl(30,93%,58%)] text-primary-foreground px-10 py-4 rounded-xl font-bold shadow-xl hover:-translate-y-0.5 transition flex items-center gap-3"
        >
          ✅ הגש מבחן וקבל ציון
        </button>
      </div>
    </div>
  );
}
