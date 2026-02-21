import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS, type Question, type ConfidenceLevel } from '@/lib/types';
import { ArrowRight, BookOpen, RotateCcw } from 'lucide-react';

export default function FlashcardView() {
  const { data, navigate, getDueQuestions, updateSpacedRepetition, updateHistory } = useApp();

  const [cards, setCards] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ confident: 0, hesitant: 0, guessed: 0 });

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const due = await getDueQuestions();
      if (due.length > 0) {
        setCards(due.sort(() => Math.random() - 0.5).slice(0, 30));
      } else {
        // Fallback: random questions
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        setCards(shuffled.slice(0, 20));
      }
    } finally {
      setLoading(false);
    }
  }, [getDueQuestions, data]);

  useEffect(() => { loadCards(); }, [loadCards]);

  const current = cards[index];

  const handleConfidence = async (level: ConfidenceLevel) => {
    if (!current) return;
    // In flashcard mode, "confident" = user knew it (correct), otherwise treat as incorrect
    const isCorrect = level === 'confident' || level === 'hesitant';
    updateHistory(current[KEYS.ID], isCorrect);
    await updateSpacedRepetition(current[KEYS.ID], isCorrect, level);

    setStats(prev => ({ ...prev, [level]: prev[level] + 1 }));

    if (index + 1 >= cards.length) {
      setDone(true);
    } else {
      setIndex(prev => prev + 1);
      setFlipped(false);
    }
  };

  if (loading) {
    return (
      <div className="fade-in flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <RotateCcw className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground">טוען כרטיסיות...</p>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="fade-in max-w-lg mx-auto text-center py-20">
        <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">אין כרטיסיות זמינות</h2>
        <p className="text-muted-foreground mb-6">תרגל שאלות קודם כדי ליצור כרטיסיות לחזרה.</p>
        <button onClick={() => navigate('home')} className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium">
          חזרה לדף הבית
        </button>
      </div>
    );
  }

  if (done) {
    const total = stats.confident + stats.hesitant + stats.guessed;
    return (
      <div className="fade-in max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-6">
          <BookOpen className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">סיימת! 🎉</h2>
        <p className="text-muted-foreground mb-8">עברת על {total} כרטיסיות</p>
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-2xl font-bold text-success">{stats.confident}</div>
            <div className="text-xs text-muted-foreground mt-1">בטוח</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-2xl font-bold text-warning">{stats.hesitant}</div>
            <div className="text-xs text-muted-foreground mt-1">מתלבט</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-2xl font-bold text-destructive">{stats.guessed}</div>
            <div className="text-xs text-muted-foreground mt-1">ניחוש</div>
          </div>
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={() => { setDone(false); setIndex(0); setFlipped(false); setStats({ confident: 0, hesitant: 0, guessed: 0 }); loadCards(); }}
            className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium">
            סבב נוסף
          </button>
          <button onClick={() => navigate('home')}
            className="bg-card border border-border text-foreground px-6 py-3 rounded-xl font-medium hover:bg-muted transition-colors">
            חזרה לדף הבית
          </button>
        </div>
      </div>
    );
  }

  const correctAnswer = current[KEYS.CORRECT];
  const correctText = current[correctAnswer as 'A' | 'B' | 'C' | 'D'] || '';

  return (
    <div className="fade-in max-w-2xl mx-auto py-8">
      {/* Progress */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate('home')} className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm">
          <ArrowRight className="w-4 h-4" /> חזרה
        </button>
        <span className="text-sm text-muted-foreground font-medium">{index + 1} / {cards.length}</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-muted rounded-full mb-8 overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${((index) / cards.length) * 100}%` }} />
      </div>

      {/* Flashcard */}
      <div className="perspective-1000" style={{ perspective: '1000px' }}>
        <div
          className={`relative w-full transition-transform duration-600 ease-in-out`}
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            transition: 'transform 0.6s ease-in-out',
          }}
        >
          {/* Front */}
          <div
            className="w-full rounded-2xl border border-border bg-card p-8 md:p-12 shadow-lg"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className="text-xs text-muted-foreground mb-4 font-medium">
              {current[KEYS.TOPIC]} • שאלה {current[KEYS.ID]}
            </div>
            <p className="text-lg md:text-xl font-medium text-foreground leading-relaxed whitespace-pre-wrap">
              {current[KEYS.QUESTION]}
            </p>

            {!flipped && (
              <button
                onClick={() => setFlipped(true)}
                className="mt-8 w-full bg-primary text-primary-foreground py-4 rounded-xl text-lg font-semibold hover:bg-primary/90 transition-colors shadow-md"
              >
                הצג תשובה
              </button>
            )}
          </div>

          {/* Back */}
          <div
            className="w-full rounded-2xl border border-border bg-card p-8 md:p-12 shadow-lg absolute top-0 left-0"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="text-xs text-muted-foreground mb-4 font-medium">תשובה</div>

            <div className="bg-success/10 border border-success/20 rounded-xl p-4 mb-6">
              <div className="text-sm font-bold text-success mb-1">תשובה נכונה: {correctAnswer}</div>
              <p className="text-foreground font-medium">{correctText}</p>
            </div>

            {current[KEYS.EXPLANATION] && current[KEYS.EXPLANATION].trim() && (
              <div className="mb-6">
                <h4 className="text-sm font-bold text-muted-foreground mb-2">הסבר</h4>
                <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">
                  {current[KEYS.EXPLANATION]}
                </p>
              </div>
            )}

            {current[KEYS.MILLER] && current[KEYS.MILLER].trim() && (
              <div className="bg-muted/50 rounded-lg px-4 py-2 mb-6 text-sm text-muted-foreground">
                📖 Miller: {current[KEYS.MILLER]}{current[KEYS.CHAPTER] ? `, Chapter ${current[KEYS.CHAPTER]}` : ''}
              </div>
            )}

            {/* Confidence buttons */}
            <div className="mt-6">
              <p className="text-sm text-muted-foreground text-center mb-3 font-medium">עד כמה ידעת?</p>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => handleConfidence('guessed')}
                  className="py-3 rounded-xl font-semibold text-sm bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors"
                >
                  ניחוש
                </button>
                <button
                  onClick={() => handleConfidence('hesitant')}
                  className="py-3 rounded-xl font-semibold text-sm bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 transition-colors"
                >
                  מתלבט
                </button>
                <button
                  onClick={() => handleConfidence('confident')}
                  className="py-3 rounded-xl font-semibold text-sm bg-success/10 text-success border border-success/20 hover:bg-success/20 transition-colors"
                >
                  בטוח
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Min height spacer so the confidence buttons are visible when flipped */}
      <div style={{ minHeight: flipped ? '420px' : '0px' }} />
    </div>
  );
}
