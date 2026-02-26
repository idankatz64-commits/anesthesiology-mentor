import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS, type ConfidenceLevel } from '@/lib/types';
import ReactMarkdown from 'react-markdown';
import {
  X, Flag, Star, ChevronRight, ChevronLeft, SkipForward, BookOpen,
  StickyNote, Tag, Plus, ExternalLink, Copy, Send, Calculator, Pencil,
} from 'lucide-react';
import FormulaCalculatorPanel from '@/components/FormulaCalculatorPanel';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { supabase } from '@/integrations/supabase/client';
import { GlobalQuestionStats, CommunityNotes } from './SessionCommunity';

/** Parse URLs and <a> tags inside explanation text into clickable links */
function ExplanationRenderer({ text }: { text: string }) {
  let processed = text.replace(
    /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi,
    '[$2]($1)'
  );
  processed = processed.replace(
    /(?<!\]\()(?<!\()(https?:\/\/[^\s\)]+)/g,
    '[$1]($1)'
  );

  return (
    <ReactMarkdown
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80 transition inline-flex items-center gap-1 break-all">
            {children}
            <ExternalLink className="w-3 h-3 inline-block flex-shrink-0" />
          </a>
        ),
        p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

export default function SessionView() {
  const {
    session, progress, navigate, setAnswer, setConfidence, setSessionIndex,
    toggleFlag, skipQuestion, updateHistory, updateSpacedRepetition, syncAnswerToDb, toggleFavorite,
    saveNote, setRating, addTag, removeTag, saveSessionToDb, clearSavedSession,
  } = useApp();
  const { toast } = useToast();
  const isAdmin = useIsAdmin();

  const { quiz, index, mode, answers, confidence, flagged, skipped } = session;
  const [showNote, setShowNote] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [simTimerSeconds, setSimTimerSeconds] = useState(3 * 60 * 60);
  const [calcOpen, setCalcOpen] = useState(false);
  const [editingExplanation, setEditingExplanation] = useState(false);
  const [explanationDraft, setExplanationDraft] = useState('');
  const [savingExplanation, setSavingExplanation] = useState(false);
  const [editingCorrectAnswer, setEditingCorrectAnswer] = useState(false);
  const [correctAnswerDraft, setCorrectAnswerDraft] = useState('');
  const [savingCorrectAnswer, setSavingCorrectAnswer] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const isSimulation = mode === 'simulation';
  const isExam = mode === 'exam';

  // Timer for exam mode (count up)
  useEffect(() => {
    if (mode !== 'exam') return;
    setTimerSeconds(0);
    const interval = setInterval(() => setTimerSeconds(p => p + 1), 1000);
    return () => clearInterval(interval);
  }, [mode]);

  // Timer for simulation mode (countdown from 3 hours)
  useEffect(() => {
    if (!isSimulation) return;
    setSimTimerSeconds(3 * 60 * 60);
    const interval = setInterval(() => setSimTimerSeconds(p => {
      if (p <= 0) return 0;
      return p - 1;
    }), 1000);
    return () => clearInterval(interval);
  }, [isSimulation]);

  if (!quiz.length) return null;

  const qData = quiz[index];
  const serialNumber = qData[KEYS.ID]; // Serial_Question_Number# from CSV
  const questionId = qData[KEYS.REF_ID]; // QuestionID from CSV
  const savedAns = answers[index];
  const savedConfidence = confidence[index];
  const correctAns = qData[KEYS.CORRECT];
  const isPracticeRevealed = mode === 'practice' && savedAns !== null && savedConfidence !== null;
  const isReviewMode = mode === 'review';
  // In simulation: never show feedback during session
  const showFeedback = !isSimulation && (isPracticeRevealed || isReviewMode);

  const isFav = progress.favorites.includes(serialNumber);
  const noteText = progress.notes[serialNumber] || '';
  const rating = progress.ratings[serialNumber];
  const tags = progress.tags[serialNumber] || [];

  // Whether the user needs to pick confidence before proceeding (practice mode)
  const needsConfidence = mode === 'practice' && savedAns !== null && savedConfidence === null;

  const handleAnswer = (opt: string) => {
    if (isPracticeRevealed || isReviewMode) return;
    if (isSimulation && savedAns !== null) return; // can change in sim? No, lock it.
    setAnswer(index, opt);
    // For simulation/exam, don't reveal or update history yet
    if (isSimulation || isExam) return;
    // For practice, wait for confidence before updating history
  };

  const handleConfidenceSelect = (level: ConfidenceLevel) => {
    if (mode !== 'practice' || savedAns === null) return;
    setConfidence(index, level);
    const isCorrect = savedAns === correctAns;
    updateHistory(serialNumber, isCorrect);
    updateSpacedRepetition(serialNumber, isCorrect, level);
    syncAnswerToDb(serialNumber, isCorrect, qData[KEYS.TOPIC]);
  };

  const handleNext = () => {
    if (index < quiz.length - 1) {
      setSessionIndex(index + 1);
      mainRef.current?.scrollTo(0, 0);
    } else {
      clearSavedSession();
      if (isReviewMode) navigate('results');
      else if (isSimulation) navigate('results');
      else navigate('review');
    }
  };

  const handlePrev = () => {
    if (index > 0) {
      setSessionIndex(index - 1);
      mainRef.current?.scrollTo(0, 0);
    }
  };

  const handleSkip = () => {
    skipQuestion(index);
    if (index < quiz.length - 1) {
      setSessionIndex(index + 1);
      mainRef.current?.scrollTo(0, 0);
    } else {
      if (isSimulation) navigate('results');
      else navigate('review');
    }
  };

  const handleExit = () => {
    if (isReviewMode) { navigate('results'); return; }
    const choice = window.confirm('לשמור את ההתקדמות ולהמשיך מאוחר יותר?');
    if (choice) {
      saveSessionToDb(timerSeconds, simTimerSeconds).then(() => {
        toast({ title: 'הסשן נשמר ✅', description: 'תוכל להמשיך מאוחר יותר מדף הבית.' });
        navigate('home');
      });
    } else {
      if (window.confirm('לצאת בלי לשמור?')) {
        clearSavedSession();
        navigate('home');
      }
    }
  };

  const handleSubmitSimulation = () => {
    quiz.forEach((q, i) => {
      const userAns = answers[i];
      if (userAns) {
        const isCorrect = userAns === q[KEYS.CORRECT];
        updateHistory(q[KEYS.ID], isCorrect);
        syncAnswerToDb(q[KEYS.ID], isCorrect, q[KEYS.TOPIC]);
      }
    });
    clearSavedSession();
    navigate('results');
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    addTag(serialNumber, tagInput.trim());
    setTagInput('');
  };


  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const formatCountdown = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const getOptionClasses = (opt: string) => {
    let base = 'w-full text-right p-5 rounded-2xl border transition relative flex items-center group ';

    if (isSimulation) {
      if (savedAns === opt) return base + 'bg-primary/10 border-primary ring-1 ring-primary/30 shadow-[0_0_15px_hsl(25_95%_53%/0.1)]';
      return base + 'bg-card border-border hover:border-primary/30 hover:shadow-sm';
    }

    if (isReviewMode) {
      if (opt === correctAns) return base + 'bg-success/10 border-success/30 text-success shadow-[0_0_15px_hsl(160_84%_39%/0.1)]';
      if (opt === savedAns && savedAns !== correctAns) return base + 'bg-destructive/10 border-destructive/30 text-destructive shadow-[0_0_15px_hsl(0_72%_51%/0.1)]';
      return base + 'opacity-60 bg-muted border-border';
    }

    if (isPracticeRevealed) {
      if (opt === correctAns) return base + 'bg-success/10 border-success/30 text-success shadow-[0_0_15px_hsl(160_84%_39%/0.1)]';
      if (opt === savedAns) return base + 'bg-destructive/10 border-destructive/30 text-destructive shadow-[0_0_15px_hsl(0_72%_51%/0.1)]';
      return base + 'opacity-50 border-border';
    }

    if (savedAns === opt) return base + 'bg-primary/10 border-primary ring-1 ring-primary/30 shadow-[0_0_15px_hsl(25_95%_53%/0.1)]';
    return base + 'bg-card border-border hover:border-primary/30 hover:shadow-sm';
  };

  return (
    <div className="fade-in max-w-3xl mx-auto pb-24" ref={mainRef}>
      {/* Top Bar */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
            isSimulation ? 'bg-primary/10 text-primary border-primary/20' :
            mode === 'practice' ? 'bg-primary/10 text-primary border-primary/20' :
            isExam ? 'bg-primary/10 text-primary border-primary/20' :
            'bg-warning/10 text-warning border-warning/20'
          }`}>
            {isSimulation ? 'סימולציה' : mode === 'practice' ? 'תרגול' : isExam ? 'בחינה' : 'תחקור'}
          </span>
          {isSimulation && (
            <span className={`text-xs font-mono font-bold px-3 py-1.5 rounded-lg border ${
              simTimerSeconds < 600 ? 'bg-destructive/10 text-destructive border-destructive/20 animate-pulse' : 'bg-card text-success border-border'
            }`}>
              ⏱ {formatCountdown(simTimerSeconds)}
            </span>
          )}
          {isExam && (
            <span className="bg-card text-success text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-border">
              {formatTime(timerSeconds)}
            </span>
          )}
          {(isExam || isSimulation) && (
            <button
              onClick={() => toggleFlag(index)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition border shadow-sm ${
                flagged.has(index) ? 'bg-warning/10 text-warning border-warning/30' : 'bg-card text-muted-foreground border-border hover:text-warning'
              }`}
            >
              <Flag className="w-3 h-3" />
            </button>
          )}
        </div>
        <span className="text-muted-foreground text-sm font-medium bg-card px-3 py-1 rounded-lg border border-border matrix-text">
          שאלה {index + 1} מתוך {quiz.length}
        </span>
        <button onClick={handleExit} className="text-muted-foreground hover:text-destructive text-sm font-medium px-3 py-1 rounded-lg hover:bg-destructive/10 transition">
          <X className="w-4 h-4 inline ml-1" /> צא
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted h-2.5 rounded-full mb-8 overflow-hidden">
        <div className="bg-primary h-full transition-all duration-500 rounded-full shadow-[0_0_8px_hsl(25_95%_53%/0.4)]" style={{ width: `${((index + 1) / quiz.length) * 100}%` }} />
      </div>

      {/* Question Card */}
      <div className="soft-card bg-card border border-border overflow-hidden relative card-accent-top">
        {/* Meta bar */}
        <div className="bg-muted/50 px-8 py-4 border-b border-border flex flex-wrap gap-4 text-xs text-muted-foreground font-medium justify-between items-center">
          <div className="flex flex-wrap gap-4 items-center">
            <span className="text-foreground font-bold bidi-text">
              שאלה {questionId} (מספר סידורי: {serialNumber})
            </span>
            <span className="flex items-center gap-1.5">📁 <span className="text-foreground">{qData[KEYS.TOPIC]}</span></span>
            <span className="flex items-center gap-1.5">📅 <span className="text-foreground">{qData[KEYS.YEAR]}</span></span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCalcOpen(true)}
              className="text-muted-foreground hover:text-primary transition flex items-center gap-1.5 text-xs font-bold bg-muted px-3 py-1.5 rounded-lg hover:bg-primary/10"
              title="Formula Calculator"
            >
              <Calculator className="w-3.5 h-3.5" /> Σ
            </button>
            <button onClick={() => toggleFavorite(serialNumber)} className="transition">
              <Star className={`w-5 h-5 ${isFav ? 'fill-warning text-warning' : 'text-muted-foreground hover:text-warning'}`} />
            </button>
          </div>
        </div>

        {/* Question Text */}
        <div className="p-8 md:p-10">
          <p className="text-foreground text-lg leading-relaxed font-medium bidi-text mb-8">{qData[KEYS.QUESTION]}</p>

          {/* Media */}
          {qData[KEYS.MEDIA_LINK] && qData[KEYS.MEDIA_LINK] !== 'nan' && (
            <div className="mb-6">
              {qData[KEYS.MEDIA_LINK].match(/\.(jpeg|jpg|gif|png)$/i) ? (
                <img src={qData[KEYS.MEDIA_LINK]} className="max-h-80 object-contain rounded-lg" alt="Question media" />
              ) : (
                <a href={qData[KEYS.MEDIA_LINK]} target="_blank" rel="noopener noreferrer" className="text-primary underline font-medium">
                  פתח קובץ מצורף
                </a>
              )}
            </div>
          )}

          {/* Options */}
          <div className="space-y-5">
            {(['A', 'B', 'C', 'D'] as const).map(opt => {
              const text = qData[KEYS[opt]];
              if (!text) return null;
              return (
                <button
                  key={opt}
                  onClick={() => handleAnswer(opt)}
                  disabled={isPracticeRevealed || isReviewMode || (isSimulation && savedAns !== null)}
                  className={getOptionClasses(opt)}
                >
                  <span className="w-8 h-8 rounded-full bg-muted text-muted-foreground font-bold flex items-center justify-center ml-3 text-sm group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    {opt}
                  </span>
                  <span className="flex-grow text-foreground text-lg font-light leading-snug bidi-text">{text}</span>
                  {!isSimulation && (isPracticeRevealed || isReviewMode) && opt === correctAns && <span className="absolute left-5 text-success text-xl">✓</span>}
                  {!isSimulation && (isPracticeRevealed || isReviewMode) && opt === savedAns && opt !== correctAns && <span className="absolute left-5 text-destructive text-xl">✗</span>}
                </button>
              );
            })}
          </div>

          {/* Confidence Tracker - Practice mode only */}
          {needsConfidence && (
            <div className="mt-6 p-6 bg-muted/50 rounded-2xl border border-border">
              <p className="text-sm font-bold text-foreground mb-4 text-center">עד כמה אתה בטוח בתשובה?</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => handleConfidenceSelect('confident')}
                  className="px-6 py-3 rounded-xl text-sm font-bold bg-success/15 text-success border border-success/30 hover:bg-success/25 transition"
                >
                  ✅ בטוח
                </button>
                <button
                  onClick={() => handleConfidenceSelect('hesitant')}
                  className="px-6 py-3 rounded-xl text-sm font-bold bg-warning/15 text-warning border border-warning/30 hover:bg-warning/25 transition"
                >
                  🤔 מתלבט
                </button>
                <button
                  onClick={() => handleConfidenceSelect('guessed')}
                  className="px-6 py-3 rounded-xl text-sm font-bold bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 transition"
                >
                  🎲 ניחוש
                </button>
              </div>
            </div>
          )}

          {/* Metadata: Notes, Rating, Tags — hide in simulation */}
          {!isSimulation && (
            <div className="mt-8 pt-6 border-t border-border space-y-4">
              {/* Rating */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground ml-2">דרגת קושי:</span>
                {(['easy', 'medium', 'hard'] as const).map(level => (
                  <button
                    key={level}
                    onClick={() => setRating(serialNumber, level)}
                    className={`rating-btn px-4 py-2 rounded-xl text-xs font-bold ${
                      level === 'easy' ? 'bg-success/10 text-success' :
                      level === 'medium' ? 'bg-warning/10 text-warning' :
                      'bg-destructive/10 text-destructive'
                    } ${rating === level ? 'active' : ''}`}
                  >
                    {level === 'easy' ? 'קל 🟢' : level === 'medium' ? 'בינוני 🟡' : 'קשה 🔴'}
                  </button>
                ))}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground"><Tag className="w-3 h-3 inline" /> תגיות:</span>
                {tags.map(tag => (
                  <div key={tag} className="tag-chip bg-muted text-foreground px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 border border-border">
                    {tag}
                    <X className="w-3 h-3 cursor-pointer hover:text-destructive" onClick={() => removeTag(serialNumber, tag)} />
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                    placeholder="תגית חדשה..."
                    className="px-3 py-1 bg-muted border border-border rounded-full text-xs outline-none focus:border-primary w-28 text-foreground"
                  />
                  <button onClick={handleAddTag} className="text-primary hover:text-primary/80 transition">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Note */}
              <div>
                <button
                  onClick={() => setShowNote(!showNote)}
                  className="text-xs font-bold text-primary flex items-center gap-2 hover:underline"
                >
                  <StickyNote className="w-3 h-3" />
                  {noteText ? 'ערוך הערה אישית (קיים)' : 'הוסף הערה אישית'}
                </button>
                {showNote && (
                  <textarea
                    value={noteText}
                    onChange={e => saveNote(serialNumber, e.target.value)}
                    className="w-full mt-2 p-4 bg-muted border border-border rounded-xl text-sm outline-none focus:border-primary resize-y min-h-[80px] text-foreground"
                    placeholder="הקלד הערה..."
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Feedback - NOT shown in simulation mode */}
        {showFeedback && (
          <div className="bg-muted/30 border-t border-border p-5 md:p-10 space-y-6">
            {/* (1) Correct/Wrong indicator + admin edit correct answer */}
            <div className="font-bold text-lg flex items-center gap-2 flex-wrap">
              {savedAns === correctAns ? (
                <span className="text-success flex items-center gap-2">✅ יפה מאוד!</span>
              ) : (
                <span className="text-destructive flex items-center gap-2">❌ התשובה הנכונה היא {correctAns}</span>
              )}
              {isAdmin && !editingCorrectAnswer && (
                <button
                  onClick={() => { setCorrectAnswerDraft(correctAns); setEditingCorrectAnswer(true); }}
                  className="text-muted-foreground hover:text-primary transition p-1 rounded-md hover:bg-primary/10"
                  title="ערוך תשובה נכונה"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Admin: edit correct answer */}
            {editingCorrectAnswer && (
              <div className="p-4 bg-muted/50 rounded-xl border border-border space-y-3">
                <p className="text-sm font-bold text-foreground">שנה תשובה נכונה:</p>
                <div className="flex gap-2">
                  {(['A', 'B', 'C', 'D'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setCorrectAnswerDraft(opt)}
                      className={`w-10 h-10 rounded-lg font-bold text-sm border transition ${
                        correctAnswerDraft === opt
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-muted-foreground border-border hover:border-primary/30'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {showConfirmSave ? (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg space-y-2">
                    <p className="text-xs font-bold text-destructive">⚠️ שינוי התשובה הנכונה ישפיע על כל המשתמשים. להמשיך?</p>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setShowConfirmSave(false); setEditingCorrectAnswer(false); }}
                        className="px-3 py-1.5 text-xs font-bold text-muted-foreground bg-muted border border-border rounded-lg hover:bg-muted/80 transition"
                      >
                        ביטול
                      </button>
                      <button
                        disabled={savingCorrectAnswer}
                        onClick={async () => {
                          setSavingCorrectAnswer(true);
                          const { error } = await supabase
                            .from('questions')
                            .update({ correct: correctAnswerDraft })
                            .eq('id', serialNumber);
                          setSavingCorrectAnswer(false);
                          if (error) {
                            toast({ title: 'שגיאה בשמירה', description: error.message, variant: 'destructive' });
                          } else {
                            qData[KEYS.CORRECT] = correctAnswerDraft;
                            setEditingCorrectAnswer(false);
                            setShowConfirmSave(false);
                            toast({ title: 'התשובה הנכונה עודכנה ✅' });
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-destructive-foreground bg-destructive rounded-lg hover:opacity-90 transition disabled:opacity-50"
                      >
                        {savingCorrectAnswer ? '...' : 'אישור שמירה'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingCorrectAnswer(false)}
                      className="px-4 py-2 text-xs font-bold text-muted-foreground bg-muted border border-border rounded-lg hover:bg-muted/80 transition"
                    >
                      ביטול
                    </button>
                    <button
                      onClick={() => {
                        if (correctAnswerDraft !== correctAns) {
                          setShowConfirmSave(true);
                        } else {
                          setEditingCorrectAnswer(false);
                        }
                      }}
                      className="px-4 py-2 text-xs font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition"
                    >
                      שמור
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="border-t border-border" />

            {/* (2) Explanation text */}
            <div className="bg-card p-6 rounded-2xl border border-border text-foreground shadow-sm font-light">
              <strong className="block text-foreground mb-3 font-medium flex items-center gap-2 text-sm">
                💡 הסבר:
                {isAdmin && !editingExplanation && (
                  <button
                    onClick={() => { setExplanationDraft(qData[KEYS.EXPLANATION] || ''); setEditingExplanation(true); }}
                    className="text-muted-foreground hover:text-primary transition p-1 rounded-md hover:bg-primary/10"
                    title="ערוך הסבר"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </strong>
              {editingExplanation ? (
                <div className="space-y-3">
                  <textarea
                    value={explanationDraft}
                    onChange={e => setExplanationDraft(e.target.value)}
                    className="w-full p-4 bg-muted border border-border rounded-xl text-sm outline-none focus:border-primary resize-y min-h-[120px] text-foreground font-normal"
                    dir="auto"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingExplanation(false)}
                      className="px-4 py-2 text-xs font-bold text-muted-foreground bg-muted border border-border rounded-lg hover:bg-muted/80 transition"
                    >
                      ביטול
                    </button>
                    <button
                      disabled={savingExplanation}
                      onClick={async () => {
                        setSavingExplanation(true);
                        const { error } = await supabase
                          .from('questions')
                          .update({ explanation: explanationDraft })
                          .eq('id', serialNumber);
                        setSavingExplanation(false);
                        if (error) {
                          toast({ title: 'שגיאה בשמירה', description: error.message, variant: 'destructive' });
                        } else {
                          qData[KEYS.EXPLANATION] = explanationDraft;
                          setEditingExplanation(false);
                          toast({ title: 'ההסבר עודכן ✅' });
                        }
                      }}
                      className="px-4 py-2 text-xs font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition disabled:opacity-50"
                    >
                      {savingExplanation ? '...' : 'שמור'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="markdown-content bidi-text text-base" style={{ lineHeight: '1.8' }}>
                  <ExplanationRenderer text={qData[KEYS.EXPLANATION] || 'אין הסבר'} />
                </div>
              )}
            </div>

            <div className="border-t border-border" />

            {/* (3) Source citations */}
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`https://www.google.com/search?q=Miller's+Anesthesia+10th+edition+page+${qData[KEYS.MILLER]}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground bg-muted hover:bg-muted/80 px-4 py-2 rounded-full font-medium transition flex items-center gap-2 w-fit border border-border"
              >
                <BookOpen className="w-3 h-3" /> Miller Page: {qData[KEYS.MILLER]}
              </a>
              {/* Global question success rate */}
              <GlobalQuestionStats questionId={serialNumber} />
            </div>

            <div className="border-t border-border" />

            {/* (4) Community comments */}
            <CommunityNotes questionId={serialNumber} />
          </div>
        )}

        {/* Navigation */}
        <div className="bg-card border-t border-border p-6 flex justify-between items-center sticky bottom-0 z-10 shadow-sm rounded-b-2xl">
          <button
            onClick={handlePrev}
            className={`text-muted-foreground hover:text-foreground px-4 py-2 font-medium transition flex items-center gap-2 ${index === 0 ? 'invisible' : ''}`}
          >
            <ChevronRight className="w-4 h-4" /> הקודם
          </button>

          <div className="flex items-center gap-3">
            {!isReviewMode && !isSimulation && (
              <button onClick={handleSkip} className="text-muted-foreground hover:text-foreground text-xs font-bold px-4 tracking-wider uppercase">
                דלג <SkipForward className="w-3 h-3 inline mr-1" />
              </button>
            )}
            {isSimulation && index === quiz.length - 1 && (
              <button
                onClick={handleSubmitSimulation}
                className="bg-destructive text-destructive-foreground px-6 py-3 rounded-xl font-bold shadow-lg transition flex items-center gap-2"
              >
                <Send className="w-4 h-4" /> הגש מבחן
              </button>
            )}
          </div>

          <button
            onClick={handleNext}
            disabled={needsConfidence}
            className={`bg-primary text-primary-foreground px-8 py-3.5 rounded-xl hover:opacity-90 font-medium shadow-lg transition flex items-center gap-2 text-base ${
              needsConfidence ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {index === quiz.length - 1
              ? (isReviewMode ? 'סיים תחקור' : isSimulation ? 'הבא' : 'סיום וסיכום')
              : 'הבא'}
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      <FormulaCalculatorPanel open={calcOpen} onClose={() => setCalcOpen(false)} />
    </div>
  );
}
