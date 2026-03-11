import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { springGentle } from '@/lib/animations';
import { useApp } from '@/contexts/AppContext';
import { KEYS, type ConfidenceLevel } from '@/lib/types';
import ReactMarkdown from 'react-markdown';
import {
  X, Flag, Star, ChevronRight, ChevronLeft, SkipForward, BookOpen,
  StickyNote, Tag, Plus, ExternalLink, Copy, Send, Calculator, Pencil, Check,
} from 'lucide-react';
import FormulaCalculatorPanel from '@/components/FormulaCalculatorPanel';
import RichTextEditor from '@/components/RichTextEditor';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { supabase } from '@/integrations/supabase/client';
import { GlobalQuestionStats, CommunityNotes } from './SessionCommunity';
import { getChapterDisplay, resolveChapterName, MILLER_CHAPTERS } from '@/data/millerChapters';

/** Detect if content contains HTML tags */
function isHtmlContent(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

/** Smart renderer: HTML content via dangerouslySetInnerHTML, plain text via ExplanationRenderer */
function SmartContent({ text }: { text: string }) {
  if (isHtmlContent(text)) {
    return (
      <div
        className="rich-content markdown-content bidi-text text-base prose prose-sm max-w-none text-foreground"
        style={{ lineHeight: '1.8' }}
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  }
  return (
    <div className="markdown-content bidi-text text-base" style={{ lineHeight: '1.8' }}>
      <ExplanationRenderer text={text} />
    </div>
  );
}

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
    invalidateQuestions,
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
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [chapterDraft, setChapterDraft] = useState('');
  const [savingChapter, setSavingChapter] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [questionDraft, setQuestionDraft] = useState('');
  const [answersDraft, setAnswersDraft] = useState({ A: '', B: '', C: '', D: '' });
  const [savingQuestion, setSavingQuestion] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  // Reset drafts when question changes
  useEffect(() => {
    setChapterDraft('');
    setSavingChapter('idle');
    setEditingQuestion(false);
    setQuestionDraft('');
    setAnswersDraft({ A: '', B: '', C: '', D: '' });
  }, [index]);

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
    updateHistory(serialNumber, isCorrect, qData[KEYS.TOPIC]);
    updateSpacedRepetition(serialNumber, isCorrect, level, qData[KEYS.TOPIC]);
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
    setShowExitDialog(true);
  };

  const handleSaveAndExit = async () => {
    await saveSessionToDb(timerSeconds, simTimerSeconds);
    toast({ title: 'הסשן נשמר ✅', description: 'תוכל להמשיך מאוחר יותר מדף הבית.' });
    setShowExitDialog(false);
    navigate('home');
  };

  const handleExitWithoutSaving = () => {
    clearSavedSession();
    setShowExitDialog(false);
    navigate('home');
  };

  const handleSubmitSimulation = () => {
    quiz.forEach((q, i) => {
      const userAns = answers[i];
      if (userAns) {
        const isCorrect = userAns === q[KEYS.CORRECT];
        updateHistory(q[KEYS.ID], isCorrect, q[KEYS.TOPIC]);
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
    <div className="w-full pb-24" ref={mainRef} style={{ minHeight: '60vh' }}>
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
        <motion.div
          className="bg-primary h-full rounded-full shadow-[0_0_8px_hsl(25_95%_53%/0.4)]"
          layout
          style={{ width: `${((index + 1) / quiz.length) * 100}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      </div>

      {/* Question Card */}
      <div className="deep-tile overflow-hidden relative card-accent-top">
        {/* Meta bar */}
        <div className="bg-muted/50 px-8 py-4 border-b border-border flex flex-wrap gap-4 text-xs text-muted-foreground font-medium justify-between items-center">
          <div className="flex flex-wrap gap-4 items-center">
            <span className="text-foreground font-bold bidi-text">
              שאלה {questionId} (מספר סידורי: {serialNumber})
            </span>
            <span className="flex items-center gap-1.5">📁 <span className="text-foreground">{qData[KEYS.TOPIC]}</span></span>
            <span className="flex items-center gap-1.5">📅 <span className="text-foreground">{qData[KEYS.YEAR]}</span></span>
            {qData[KEYS.SOURCE] && qData[KEYS.SOURCE] !== 'N/A' && (
              <span className="flex items-center gap-1.5">🏛 <span className="text-foreground">{qData[KEYS.SOURCE]}</span></span>
            )}
            {qData[KEYS.CHAPTER] ? (
              <span className="flex items-center gap-1.5">📖 <span className="text-foreground">{getChapterDisplay(qData[KEYS.CHAPTER])}</span></span>
            ) : null}
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
          <div className="flex items-start gap-2 mb-8">
            {editingQuestion ? (
              <div className="w-full space-y-4">
                <RichTextEditor
                  content={questionDraft}
                  onChange={setQuestionDraft}
                  placeholder="טקסט השאלה..."
                  minHeight="80px"
                />
                <div className="space-y-3">
                  {(['A', 'B', 'C', 'D'] as const).map(opt => (
                    <div key={opt} className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-muted text-muted-foreground font-bold flex items-center justify-center text-sm shrink-0">{opt}</span>
                      <input
                        type="text"
                        value={answersDraft[opt]}
                        onChange={e => setAnswersDraft(prev => ({ ...prev, [opt]: e.target.value }))}
                        dir="rtl"
                        className="flex-grow bg-muted border border-border rounded-xl px-4 py-3 text-foreground text-base outline-none focus:border-primary"
                        placeholder={`תשובה ${opt}...`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingQuestion(false)}
                    className="px-4 py-2 text-xs font-bold text-muted-foreground bg-muted border border-border rounded-lg hover:bg-muted/80 transition"
                  >
                    ביטול
                  </button>
                  <button
                    disabled={savingQuestion}
                    onClick={async () => {
                      setSavingQuestion(true);
                      const { error } = await supabase
                        .from('questions')
                        .update({
                          question: questionDraft,
                          a: answersDraft.A,
                          b: answersDraft.B,
                          c: answersDraft.C,
                          d: answersDraft.D,
                          manually_edited: true,
                        })
                        .eq('id', serialNumber);
                      setSavingQuestion(false);
                      if (error) {
                        toast({ title: 'שגיאה בשמירה', description: error.message, variant: 'destructive' });
                      } else {
                        (qData as any)[KEYS.QUESTION] = questionDraft;
                        (qData as any)[KEYS.A] = answersDraft.A;
                        (qData as any)[KEYS.B] = answersDraft.B;
                        (qData as any)[KEYS.C] = answersDraft.C;
                        (qData as any)[KEYS.D] = answersDraft.D;
                        invalidateQuestions();
                        setEditingQuestion(false);
                        toast({ title: 'השאלה עודכנה ✅' });
                      }
                    }}
                    className="px-4 py-2 text-xs font-bold text-primary-foreground bg-primary rounded-lg hover:opacity-90 transition disabled:opacity-50"
                  >
                    {savingQuestion ? '...' : 'שמור'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-foreground text-lg leading-relaxed font-medium flex-grow">
                  <SmartContent text={qData[KEYS.QUESTION]} />
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setQuestionDraft(qData[KEYS.QUESTION]);
                      setAnswersDraft({
                        A: qData[KEYS.A] || '',
                        B: qData[KEYS.B] || '',
                        C: qData[KEYS.C] || '',
                        D: qData[KEYS.D] || '',
                      });
                      setEditingQuestion(true);
                    }}
                    className="text-muted-foreground hover:text-primary transition p-1 rounded-md hover:bg-primary/10 shrink-0 mt-1"
                    title="ערוך שאלה ותשובות"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>

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
          {!editingQuestion && (
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
          )}

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
                  <div className="mt-2">
                    <RichTextEditor
                      content={noteText}
                      onChange={(html) => saveNote(serialNumber, html)}
                      placeholder="הקלד הערה..."
                      minHeight="80px"
                    />
                  </div>
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
                            .update({ correct: correctAnswerDraft, manually_edited: true })
                            .eq('id', serialNumber);
                          setSavingCorrectAnswer(false);
                          if (error) {
                            toast({ title: 'שגיאה בשמירה', description: error.message, variant: 'destructive' });
                          } else {
                            qData[KEYS.CORRECT] = correctAnswerDraft;
                            invalidateQuestions();
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
                  <RichTextEditor
                    content={explanationDraft}
                    onChange={setExplanationDraft}
                    minHeight="120px"
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
                          .update({ explanation: explanationDraft, manually_edited: true })
                          .eq('id', serialNumber);
                        setSavingExplanation(false);
                        if (error) {
                          toast({ title: 'שגיאה בשמירה', description: error.message, variant: 'destructive' });
                        } else {
                          qData[KEYS.EXPLANATION] = explanationDraft;
                          invalidateQuestions();
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
                <SmartContent text={qData[KEYS.EXPLANATION] || 'אין הסבר'} />
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

              {/* Admin inline chapter editor */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">פרק:</span>
                  <input
                    type="text"
                    value={chapterDraft || String(qData[KEYS.CHAPTER] || '')}
                    onChange={e => { setChapterDraft(e.target.value); setSavingChapter('idle'); }}
                    onFocus={() => { if (!chapterDraft) setChapterDraft(String(qData[KEYS.CHAPTER] || '')); }}
                    onBlur={async () => {
                      if (!chapterDraft || chapterDraft === String(qData[KEYS.CHAPTER] || '')) return;
                      const { valid } = resolveChapterName(chapterDraft);
                      if (!valid) return;
                      setSavingChapter('saving');
                      const chapterVal = chapterDraft.trim().toUpperCase() === 'ACLS' ? 0 : parseInt(chapterDraft, 10);
                      const chapterName = MILLER_CHAPTERS[chapterVal] || '';
                      const { error } = await supabase.from('questions').update({
                        chapter: chapterVal,
                        miller: String(chapterVal),
                        topic: chapterName,
                        manually_edited: true,
                      }).eq('id', serialNumber);
                      if (!error) {
                        sessionStorage.removeItem('questions_cache');
                        (qData as any)[KEYS.CHAPTER] = chapterVal;
                        (qData as any)[KEYS.MILLER] = String(chapterVal);
                        (qData as any)[KEYS.TOPIC] = chapterName;
                        setSavingChapter('saved');
                        setChapterDraft('');
                        setTimeout(() => setSavingChapter('idle'), 2000);
                      } else {
                        setSavingChapter('idle');
                        toast({ title: 'שגיאה בשמירת פרק', description: error.message, variant: 'destructive' });
                      }
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="w-16 px-2 py-1 text-xs bg-muted border border-border rounded-lg text-foreground outline-none focus:border-primary text-center"
                    placeholder="#"
                  />
                  {chapterDraft && (() => {
                    const { valid, display } = resolveChapterName(chapterDraft);
                    return (
                      <span className={`text-xs ${valid ? 'text-muted-foreground' : 'text-destructive'}`}>
                        {display}
                      </span>
                    );
                  })()}
                  {savingChapter === 'saved' && <Check className="w-3.5 h-3.5 text-success" />}
                </div>
              )}

              {/* Non-admin chapter display */}
              {!isAdmin && qData[KEYS.CHAPTER] ? (
                <span className="text-xs text-muted-foreground bg-muted px-4 py-2 rounded-full font-medium border border-border">
                  📖 {getChapterDisplay(qData[KEYS.CHAPTER])}
                </span>
              ) : null}

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

      {/* Exit Dialog */}
      {showExitDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="liquid-glass max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-foreground text-center">לצאת מהסשן?</h3>
            <p className="text-sm text-muted-foreground text-center">תוכל לשמור את ההתקדמות ולהמשיך מאוחר יותר, או לצאת בלי לשמור.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleSaveAndExit}
                className="w-full bg-primary text-primary-foreground px-5 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition"
              >
                💾 שמור וצא
              </button>
              <button
                onClick={handleExitWithoutSaving}
                className="w-full bg-destructive/15 text-destructive px-5 py-3 rounded-xl font-bold text-sm hover:bg-destructive/25 transition"
              >
                🚪 צא בלי לשמור
              </button>
              <button
                onClick={() => setShowExitDialog(false)}
                className="w-full text-muted-foreground px-5 py-3 rounded-xl text-sm hover:bg-muted transition"
              >
                ביטול — המשך לתרגל
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
