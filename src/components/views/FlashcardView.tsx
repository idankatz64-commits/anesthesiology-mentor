import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS, type Question, type ConfidenceLevel } from '@/lib/types';
import { ArrowRight, BookOpen, RotateCcw, Layers, Brain, AlertTriangle, Sparkles, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { GlobalQuestionStats } from './SessionCommunity';

type FlashcardMode = 'topics' | 'mistakes' | 'smart';

export default function FlashcardView() {
  const { data, progress, navigate, getDueQuestions, updateSpacedRepetition, updateHistory } = useApp();

  const [phase, setPhase] = useState<'setup' | 'active' | 'done'>('setup');
  const [mode, setMode] = useState<FlashcardMode>('smart');
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());

  const [cards, setCards] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ confident: 0, hesitant: 0, guessed: 0 });

  // All unique topics
  const allTopics = useMemo(() => {
    const topics = new Set<string>();
    data.forEach(q => { if (q[KEYS.TOPIC]) topics.add(q[KEYS.TOPIC]); });
    return Array.from(topics).sort();
  }, [data]);

  const toggleTopic = (topic: string) => {
    setSelectedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic); else next.add(topic);
      return next;
    });
  };

  const mistakeCount = useMemo(() => {
    return data.filter(q => progress.history[q[KEYS.ID]]?.lastResult === 'wrong').length;
  }, [data, progress.history]);

  const startFlashcards = async () => {
    setLoading(true);
    try {
      let pool: Question[] = [];

      if (mode === 'topics') {
        pool = data.filter(q => selectedTopics.has(q[KEYS.TOPIC]));
      } else if (mode === 'mistakes') {
        pool = data.filter(q => progress.history[q[KEYS.ID]]?.lastResult === 'wrong');
      } else {
        // Smart mode
        const due = await getDueQuestions();
        pool = [...due];

        // Priority 2: hesitant/guessed from SRS table
        try {
          const { data: { session: authSession } } = await supabase.auth.getSession();
          if (authSession?.user) {
            const { data: lowConfRows } = await supabase
              .from('spaced_repetition')
              .select('question_id')
              .eq('user_id', authSession.user.id)
              .in('confidence', ['hesitant', 'guessed']);

            if (lowConfRows) {
              const existingIds = new Set(pool.map(q => q[KEYS.ID]));
              const extraIds = new Set(lowConfRows.map(r => r.question_id));
              const extra = data.filter(q => extraIds.has(q[KEYS.ID]) && !existingIds.has(q[KEYS.ID]));
              pool = [...pool, ...extra];
            }
          }
        } catch {}

        if (pool.length === 0) {
          // Fallback: random
          pool = [...data];
        }
      }

      if (pool.length === 0) {
        setCards([]);
        setPhase('active');
        return;
      }

      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      setCards(shuffled.slice(0, Math.min(shuffled.length, 30)));
      setIndex(0);
      setFlipped(false);
      setStats({ confident: 0, hesitant: 0, guessed: 0 });
      setPhase('active');
    } finally {
      setLoading(false);
    }
  };

  const current = cards[index];

  const handleConfidence = async (level: ConfidenceLevel) => {
    if (!current) return;
    const isCorrect = level === 'confident' || level === 'hesitant';
    updateHistory(current[KEYS.ID], isCorrect, current[KEYS.TOPIC]);
    await updateSpacedRepetition(current[KEYS.ID], isCorrect, level, current[KEYS.TOPIC]);
    setStats(prev => ({ ...prev, [level]: prev[level] + 1 }));

    if (index + 1 >= cards.length) {
      setPhase('done');
    } else {
      setIndex(prev => prev + 1);
      setFlipped(false);
    }
  };

  // ─── SETUP SCREEN ───
  if (phase === 'setup') {
    const canStart =
      mode === 'topics' ? selectedTopics.size > 0 :
      mode === 'mistakes' ? mistakeCount > 0 :
      true;

    return (
      <div className="fade-in max-w-2xl mx-auto py-8">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate('home')} className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm">
            <ArrowRight className="w-4 h-4" /> חזרה
          </button>
          <h2 className="text-xl font-bold text-foreground">הגדרות כרטיסיות</h2>
        </div>

        {/* Mode cards */}
        <div className="space-y-4 mb-8">
          {/* Mode A: Topics */}
          <button
            onClick={() => setMode('topics')}
            className={`w-full text-right rounded-2xl border-2 p-5 transition-all ${mode === 'topics' ? 'border-primary bg-primary/5 shadow-md' : 'border-border bg-card hover:border-primary/40'}`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${mode === 'topics' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                <Layers className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-foreground">תרגול לפי נושאים</h3>
                <p className="text-sm text-muted-foreground mt-0.5">בחר נושא אחד או יותר ליצירת חפיסת כרטיסיות ממוקדת.</p>
              </div>
              {mode === 'topics' && <Check className="w-5 h-5 text-primary mt-1 shrink-0" />}
            </div>
          </button>

          {/* Mode B: Mistakes */}
          <button
            onClick={() => setMode('mistakes')}
            className={`w-full text-right rounded-2xl border-2 p-5 transition-all ${mode === 'mistakes' ? 'border-destructive bg-destructive/5 shadow-md' : 'border-border bg-card hover:border-destructive/40'}`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${mode === 'mistakes' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'}`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-foreground">חזרה על טעויות</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {mistakeCount > 0
                    ? <>{mistakeCount} שאלות שטעית בהן – תרגול ממוקד לתיקון.</>
                    : <>אין טעויות כרגע – תרגל שאלות קודם.</>}
                </p>
              </div>
              {mode === 'mistakes' && <Check className="w-5 h-5 text-destructive mt-1 shrink-0" />}
            </div>
          </button>

          {/* Mode C: Smart */}
          <button
            onClick={() => setMode('smart')}
            className={`w-full text-right rounded-2xl border-2 p-5 transition-all ${mode === 'smart' ? 'border-primary bg-primary/5 shadow-md' : 'border-border bg-card hover:border-primary/40'}`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${mode === 'smart' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-foreground">למידה חכמה <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full mr-2">מומלץ</span></h3>
                <p className="text-sm text-muted-foreground mt-0.5">האלגוריתם בוחר כרטיסיות על סמך חזרה מרווחת ורמת ביטחון.</p>
              </div>
              {mode === 'smart' && <Check className="w-5 h-5 text-primary mt-1 shrink-0" />}
            </div>
          </button>
        </div>

        {/* Topic selector (only for topics mode) */}
        {mode === 'topics' && (
          <div className="mb-8">
            <h4 className="text-sm font-bold text-muted-foreground mb-3">בחר נושאים ({selectedTopics.size} נבחרו)</h4>
            <div className="max-h-60 overflow-y-auto border border-border rounded-xl p-3 bg-card space-y-1">
              {allTopics.map(topic => (
                <label
                  key={topic}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${selectedTopics.has(topic) ? 'bg-primary/10' : 'hover:bg-muted'}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTopics.has(topic)}
                    onChange={() => toggleTopic(topic)}
                    className="w-4 h-4 accent-primary rounded"
                  />
                  <span className="text-sm text-foreground">{topic}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Start button */}
        <button
          onClick={startFlashcards}
          disabled={!canStart || loading}
          className="w-full bg-primary text-primary-foreground py-4 rounded-xl text-lg font-semibold hover:bg-primary/90 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <><RotateCcw className="w-5 h-5 animate-spin" /> טוען...</>
          ) : (
            <>התחל תרגול</>
          )}
        </button>
      </div>
    );
  }

  // ─── LOADING ───
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

  // ─── EMPTY ───
  if (phase === 'active' && cards.length === 0) {
    return (
      <div className="fade-in max-w-lg mx-auto text-center py-20">
        <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">אין כרטיסיות זמינות</h2>
        <p className="text-muted-foreground mb-6">תרגל שאלות קודם כדי ליצור כרטיסיות לחזרה.</p>
        <button onClick={() => setPhase('setup')} className="bg-primary text-primary-foreground px-6 py-3 rounded-xl font-medium">
          חזרה להגדרות
        </button>
      </div>
    );
  }

  // ─── DONE ───
  if (phase === 'done') {
    const total = stats.confident + stats.hesitant + stats.guessed;
    return (
      <div className="fade-in max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-6">
          <BookOpen className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">סיימת! 🎉</h2>
        <p className="text-muted-foreground mb-8">עברת על {total} כרטיסיות</p>
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="deep-tile rounded-xl p-4">
            <div className="text-2xl font-bold text-success">{stats.confident}</div>
            <div className="text-xs text-muted-foreground mt-1">בטוח</div>
          </div>
          <div className="deep-tile rounded-xl p-4">
            <div className="text-2xl font-bold text-warning">{stats.hesitant}</div>
            <div className="text-xs text-muted-foreground mt-1">מתלבט</div>
          </div>
          <div className="deep-tile rounded-xl p-4">
            <div className="text-2xl font-bold text-destructive">{stats.guessed}</div>
            <div className="text-xs text-muted-foreground mt-1">ניחוש</div>
          </div>
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={() => setPhase('setup')}
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

  // ─── ACTIVE FLASHCARD ───
  const correctAnswer = current[KEYS.CORRECT];
  const correctText = current[correctAnswer as 'A' | 'B' | 'C' | 'D'] || '';

  return (
    <div className="fade-in max-w-2xl mx-auto py-8">
      {/* Progress */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => setPhase('setup')} className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm">
          <ArrowRight className="w-4 h-4" /> חזרה
        </button>
        <span className="text-sm text-muted-foreground font-medium">{index + 1} / {cards.length}</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-muted rounded-full mb-8 overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${((index) / cards.length) * 100}%` }} />
      </div>

      {/* Flashcard */}
      <div style={{ perspective: '1000px' }}>
        <div
          className="relative w-full"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            transition: 'transform 0.6s ease-in-out',
          }}
        >
          {/* Front */}
          <div
            className="w-full rounded-2xl deep-tile p-8 md:p-12 shadow-lg"
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
            className="w-full rounded-2xl deep-tile p-8 md:p-12 shadow-lg absolute top-0 left-0"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            <div className="text-xs text-muted-foreground mb-4 font-medium">תשובה</div>
            <div className="bg-success/10 border border-success/20 rounded-xl p-4 mb-6">
              <div className="text-sm font-bold text-success mb-1">תשובה נכונה: {correctAnswer}</div>
              <p className="text-foreground font-medium">{correctText}</p>
            </div>
            {current[KEYS.EXPLANATION] && current[KEYS.EXPLANATION].trim() && (
              <div className="mb-6">
                <h4 className="text-sm font-bold text-muted-foreground mb-2">הסבר</h4>
                <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{current[KEYS.EXPLANATION]}</p>
              </div>
            )}
            {current[KEYS.MILLER] && current[KEYS.MILLER].trim() && (
              <div className="bg-muted/50 rounded-lg px-4 py-2 mb-6 text-sm text-muted-foreground">
                📖 Miller: {current[KEYS.MILLER]}{current[KEYS.CHAPTER] ? `, Chapter ${current[KEYS.CHAPTER]}` : ''}
              </div>
            )}
            <GlobalQuestionStats questionId={current[KEYS.ID]} />
            <div className="mt-6">
              <p className="text-sm text-muted-foreground text-center mb-3 font-medium">עד כמה ידעת?</p>
              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => handleConfidence('guessed')}
                  className="py-3 rounded-xl font-semibold text-sm bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors">
                  ניחוש
                </button>
                <button onClick={() => handleConfidence('hesitant')}
                  className="py-3 rounded-xl font-semibold text-sm bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 transition-colors">
                  מתלבט
                </button>
                <button onClick={() => handleConfidence('confident')}
                  className="py-3 rounded-xl font-semibold text-sm bg-success/10 text-success border border-success/20 hover:bg-success/20 transition-colors">
                  בטוח
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ minHeight: flipped ? '420px' : '0px' }} />
    </div>
  );
}
