import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS, type Question } from '@/lib/types';
import ReactMarkdown from 'react-markdown';
import {
  X, Flag, Star, ChevronRight, ChevronLeft, SkipForward, BookOpen,
  StickyNote, Tag, Plus,
} from 'lucide-react';

export default function SessionView() {
  const {
    session, progress, navigate, setAnswer, setSessionIndex,
    toggleFlag, skipQuestion, updateHistory, toggleFavorite,
    saveNote, setRating, addTag, removeTag,
  } = useApp();

  const { quiz, index, mode, answers, flagged, skipped } = session;
  const [showNote, setShowNote] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);

  // Timer for exam mode
  useEffect(() => {
    if (mode !== 'exam') return;
    setTimerSeconds(0);
    const interval = setInterval(() => setTimerSeconds(p => p + 1), 1000);
    return () => clearInterval(interval);
  }, [mode]);

  if (!quiz.length) return null;

  const qData = quiz[index];
  const id = qData[KEYS.ID];
  const savedAns = answers[index];
  const correctAns = qData[KEYS.CORRECT];
  const isPracticeRevealed = mode === 'practice' && savedAns !== null;
  const isReviewMode = mode === 'review';
  const showFeedback = isPracticeRevealed || isReviewMode;

  const isFav = progress.favorites.includes(id);
  const noteText = progress.notes[id] || '';
  const rating = progress.ratings[id];
  const tags = progress.tags[id] || [];

  const handleAnswer = (opt: string) => {
    if (isPracticeRevealed || isReviewMode) return;
    setAnswer(index, opt);
    if (mode === 'practice') {
      updateHistory(id, opt === correctAns);
    }
  };

  const handleNext = () => {
    if (index < quiz.length - 1) {
      setSessionIndex(index + 1);
      mainRef.current?.scrollTo(0, 0);
    } else {
      if (isReviewMode) navigate('results');
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
      navigate('review');
    }
  };

  const handleExit = () => {
    if (isReviewMode) { navigate('results'); return; }
    if (confirm('לצאת? ההתקדמות לא תישמר.')) navigate('home');
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    addTag(id, tagInput.trim());
    setTagInput('');
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const getOptionClasses = (opt: string) => {
    let base = 'w-full text-right p-5 rounded-2xl border transition relative flex items-center group ';

    if (isReviewMode) {
      if (opt === correctAns) return base + 'bg-success-muted border-success/30 text-success';
      if (opt === savedAns && savedAns !== correctAns) return base + 'bg-destructive/10 border-destructive/30 text-destructive';
      return base + 'opacity-60 bg-muted border-border';
    }

    if (isPracticeRevealed) {
      if (opt === correctAns) return base + 'bg-success-muted border-success/30 text-success';
      if (opt === savedAns) return base + 'bg-destructive/10 border-destructive/30 text-destructive';
      return base + 'opacity-50 border-border';
    }

    if (savedAns === opt) return base + 'bg-primary/10 border-primary ring-1 ring-primary/30';
    return base + 'bg-card border-border hover:border-primary/30 hover:shadow-sm';
  };

  return (
    <div className="fade-in max-w-3xl mx-auto pb-24" ref={mainRef}>
      {/* Top Bar */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${
            mode === 'practice' ? 'bg-info/10 text-info border-info/20' :
            mode === 'exam' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800' :
            'bg-warning/10 text-warning border-warning/20'
          }`}>
            {mode === 'practice' ? 'תרגול' : mode === 'exam' ? 'בחינה' : 'תחקור'}
          </span>
          {mode === 'exam' && (
            <span className="bg-card text-success text-xs font-mono font-bold px-3 py-1.5 rounded-lg border border-border">
              {formatTime(timerSeconds)}
            </span>
          )}
          {mode === 'exam' && (
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
        <span className="text-muted-foreground text-sm font-medium bg-card px-3 py-1 rounded-lg border border-border">
          שאלה {index + 1} מתוך {quiz.length}
        </span>
        <button onClick={handleExit} className="text-muted-foreground hover:text-destructive text-sm font-medium px-3 py-1 rounded-lg hover:bg-destructive/10 transition">
          <X className="w-4 h-4 inline ml-1" /> צא
        </button>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-border h-2.5 rounded-full mb-8 overflow-hidden">
        <div className="bg-primary h-full transition-all duration-500 rounded-full" style={{ width: `${((index + 1) / quiz.length) * 100}%` }} />
      </div>

      {/* Question Card */}
      <div className="soft-card bg-card border border-border overflow-hidden relative">
        {/* Meta bar */}
        <div className="bg-muted/50 px-8 py-4 border-b border-border flex flex-wrap gap-4 text-xs text-muted-foreground font-medium justify-between items-center">
          <div className="flex flex-wrap gap-4">
            <span className="flex items-center gap-1.5"># <span className="text-foreground font-bold">{qData[KEYS.ID]}</span></span>
            <span className="flex items-center gap-1.5">📁 <span className="text-foreground">{qData[KEYS.TOPIC]}</span></span>
            <span className="flex items-center gap-1.5">📅 <span className="text-foreground">{qData[KEYS.YEAR]}</span></span>
          </div>
          <button onClick={() => toggleFavorite(id)} className="transition">
            <Star className={`w-5 h-5 ${isFav ? 'fill-warning text-warning' : 'text-muted-foreground hover:text-warning'}`} />
          </button>
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
          <div className="space-y-4">
            {(['A', 'B', 'C', 'D'] as const).map(opt => {
              const text = qData[KEYS[opt]];
              if (!text) return null;
              return (
                <button
                  key={opt}
                  onClick={() => handleAnswer(opt)}
                  disabled={isPracticeRevealed || isReviewMode}
                  className={getOptionClasses(opt)}
                >
                  <span className="w-8 h-8 rounded-full bg-muted text-muted-foreground font-bold flex items-center justify-center ml-3 text-sm group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    {opt}
                  </span>
                  <span className="flex-grow text-foreground text-lg font-light leading-snug bidi-text">{text}</span>
                  {(isPracticeRevealed || isReviewMode) && opt === correctAns && <span className="absolute left-5 text-success text-xl">✓</span>}
                  {(isPracticeRevealed || isReviewMode) && opt === savedAns && opt !== correctAns && <span className="absolute left-5 text-destructive text-xl">✗</span>}
                </button>
              );
            })}
          </div>

          {/* Metadata: Notes, Rating, Tags */}
          <div className="mt-8 pt-6 border-t border-border space-y-4">
            {/* Rating */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted-foreground ml-2">דרגת קושי:</span>
              {(['easy', 'medium', 'hard'] as const).map(level => (
                <button
                  key={level}
                  onClick={() => setRating(id, level)}
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
                  <X className="w-3 h-3 cursor-pointer hover:text-destructive" onClick={() => removeTag(id, tag)} />
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
                  onChange={e => saveNote(id, e.target.value)}
                  className="w-full mt-2 p-4 bg-muted border border-border rounded-xl text-sm outline-none focus:border-primary resize-y min-h-[80px] text-foreground"
                  placeholder="הקלד הערה..."
                />
              )}
            </div>
          </div>
        </div>

        {/* Feedback */}
        {showFeedback && (
          <div className="bg-muted/30 border-t border-border p-8 md:p-10">
            <div className="font-bold text-lg mb-3 flex items-center gap-2">
              {savedAns === correctAns ? (
                <span className="text-success flex items-center gap-2">✅ יפה מאוד!</span>
              ) : (
                <span className="text-destructive flex items-center gap-2">❌ התשובה הנכונה היא {correctAns}</span>
              )}
            </div>
            <div className="bg-card p-6 rounded-2xl border border-border text-foreground text-base leading-relaxed shadow-sm mb-6 font-light">
              <strong className="block text-foreground mb-2 font-medium flex items-center gap-2">
                💡 הסבר:
              </strong>
              <div className="markdown-content bidi-text">
                <ReactMarkdown>{qData[KEYS.EXPLANATION] || 'אין הסבר'}</ReactMarkdown>
              </div>
            </div>
            <a
              href={`https://www.google.com/search?q=Miller's+Anesthesia+10th+edition+page+${qData[KEYS.MILLER]}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary bg-primary/10 hover:bg-primary/20 px-4 py-2 rounded-full font-medium transition flex items-center gap-2 w-fit"
            >
              <BookOpen className="w-3 h-3" /> Miller Page: {qData[KEYS.MILLER]}
            </a>
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
          {!isReviewMode && (
            <button onClick={handleSkip} className="text-muted-foreground hover:text-foreground text-xs font-bold px-4 tracking-wider uppercase">
              דלג <SkipForward className="w-3 h-3 inline mr-1" />
            </button>
          )}
          <button
            onClick={handleNext}
            className="bg-primary text-primary-foreground px-8 py-3.5 rounded-xl hover:opacity-90 font-medium shadow-lg transition flex items-center gap-2 text-base"
          >
            {index === quiz.length - 1 ? (isReviewMode ? 'סיים תחקור' : 'סיום וסיכום') : 'הבא'}
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
