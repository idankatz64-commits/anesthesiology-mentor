import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { fetchQuestions, syncQuestionsFromSheet } from '@/lib/csvService';
import {
  KEYS, LS_KEY, WELCOME_KEY,
  type Question, type UserProgress, type SessionState,
  type MultiSelectState, type ViewId, type HistoryEntry, type WeeklyDay,
  type ConfidenceLevel,
} from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';

interface AppContextType {
  data: Question[];
  loading: boolean;
  progress: UserProgress;
  session: SessionState;
  multiSelect: MultiSelectState;
  currentView: ViewId;
  isDark: boolean;
  showWelcome: boolean;
  
  navigate: (view: ViewId, param?: string | null) => void;
  toggleTheme: () => void;
  closeWelcome: () => void;
  saveProgress: () => void;
  
  // Session actions
  startSession: (pool: Question[], count: number, mode: SessionState['mode']) => void;
  setAnswer: (index: number, answer: string) => void;
  setConfidence: (index: number, level: ConfidenceLevel) => void;
  setSessionIndex: (index: number) => void;
  toggleFlag: (index: number) => void;
  skipQuestion: (index: number) => void;
  updateHistory: (id: string, isCorrect: boolean) => void;
  updateSpacedRepetition: (questionId: string, isCorrect: boolean, confidence: ConfidenceLevel) => void;
  syncAnswerToDb: (questionId: string, isCorrect: boolean, topic: string) => void;
  
  // Progress actions
  toggleFavorite: (id: string) => void;
  saveNote: (id: string, text: string) => void;
  deleteNote: (id: string) => void;
  setRating: (id: string, level: 'easy' | 'medium' | 'hard') => void;
  addTag: (id: string, tag: string) => void;
  removeTag: (id: string, tag: string) => void;
  resetAllData: () => void;
  importData: (data: UserProgress) => void;
  
  // Multi-select
  toggleMultiSelect: (type: keyof MultiSelectState, value: string) => void;
  resetFilters: () => void;
  setSourceFilter: (source: SessionState['sourceFilter']) => void;
  toggleUnseenOnly: () => void;
  
  // Plan
  generateWeeklyPlan: (force?: boolean) => void;
  
  // Sync
  syncStatus: 'idle' | 'syncing' | 'done' | 'error';
  lastSyncTime: string | null;
  triggerSync: () => Promise<{ count: number } | null>;
  
  // Computed
  getFilteredQuestions: (serial?: string, textSearch?: string) => Question[];
  getDueQuestions: () => Promise<Question[]>;
}

const defaultProgress: UserProgress = {
  history: {}, notes: {}, favorites: [], plan: null, ratings: {}, tags: {},
};

const defaultSession: SessionState = {
  quiz: [], index: 0, score: 0, mode: 'practice',
  answers: [], confidence: [], flagged: new Set(), skipped: new Set(),
  sourceFilter: 'all', countFilter: 10, unseenOnly: false,
};

const defaultMultiSelect: MultiSelectState = {
  topic: new Set(['all']), year: new Set(['all']), kind: new Set(['all']),
  institution: new Set(['all']), difficulty: new Set(['all']), usertags: new Set(['all']),
};

// React context for app state
const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<UserProgress>(() => {
    try {
      const s = localStorage.getItem(LS_KEY);
      if (s) {
        const p = JSON.parse(s);
        return { ...defaultProgress, ...p };
      }
    } catch {}
    return { ...defaultProgress };
  });
  const [session, setSession] = useState<SessionState>({ ...defaultSession });
  const [multiSelect, setMultiSelect] = useState<MultiSelectState>({
    topic: new Set(['all']), year: new Set(['all']), kind: new Set(['all']),
    institution: new Set(['all']), difficulty: new Set(['all']), usertags: new Set(['all']),
  });
  const [currentView, setCurrentView] = useState<ViewId>('home');
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') return false;
    return true; // Default to dark
  });
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem(WELCOME_KEY));
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const progressRef = useRef(progress);
  progressRef.current = progress;
  const dataRef = useRef(data);
  dataRef.current = data;

  // Apply theme class - dark is default, light is opt-in
  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDark);
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Auto-sync from Google Sheets on mount, then fetch from DB
  useEffect(() => {
    const init = async () => {
      setSyncStatus('syncing');
      try {
        await syncQuestionsFromSheet();
        setSyncStatus('done');
        setLastSyncTime(new Date().toISOString());
      } catch (e) {
        console.warn('Auto-sync failed, loading from DB anyway:', e);
        setSyncStatus('error');
      }
      try {
        const questions = await fetchQuestions();
        setData(questions);
      } catch (e) {
        console.error('Failed to fetch questions:', e);
      }
      setLoading(false);
    };
    init();
  }, []);

  // Realtime subscription for questions table
  useEffect(() => {
    const channel = supabase
      .channel('questions-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, () => {
        // Refetch all questions on any change
        fetchQuestions().then(setData).catch(console.error);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const saveProgressFn = useCallback(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(progressRef.current));
  }, []);

  const navigate = useCallback((view: ViewId) => {
    setCurrentView(view);
  }, []);

  const toggleTheme = useCallback(() => setIsDark(p => !p), []);
  const closeWelcome = useCallback(() => {
    localStorage.setItem(WELCOME_KEY, 'true');
    setShowWelcome(false);
  }, []);

  const startSession = useCallback((pool: Question[], count: number, mode: SessionState['mode']) => {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const quiz = shuffled.slice(0, Math.min(pool.length, count));
    setSession({
      quiz, index: 0, score: 0, mode,
      answers: new Array(quiz.length).fill(null),
      confidence: new Array(quiz.length).fill(null),
      flagged: new Set(), skipped: new Set(),
      sourceFilter: 'all', countFilter: count, unseenOnly: false,
    });
    setCurrentView('session');
  }, []);

  const setAnswer = useCallback((index: number, answer: string) => {
    setSession(prev => {
      const answers = [...prev.answers];
      answers[index] = answer;
      const skipped = new Set(prev.skipped);
      skipped.delete(index);
      return { ...prev, answers, skipped };
    });
  }, []);

  const setSessionIndex = useCallback((index: number) => {
    setSession(prev => ({ ...prev, index }));
  }, []);

  const toggleFlag = useCallback((index: number) => {
    setSession(prev => {
      const flagged = new Set(prev.flagged);
      if (flagged.has(index)) flagged.delete(index); else flagged.add(index);
      return { ...prev, flagged };
    });
  }, []);

  const skipQuestion = useCallback((index: number) => {
    setSession(prev => {
      const skipped = new Set(prev.skipped);
      skipped.add(index);
      return { ...prev, skipped };
    });
  }, []);

  const updateHistory = useCallback((id: string, isCorrect: boolean) => {
    setProgress(prev => {
      const history = { ...prev.history };
      if (!history[id]) history[id] = { answered: 0, correct: 0, lastResult: null, everWrong: false, timestamp: 0 };
      const h = { ...history[id] };
      h.answered++;
      if (isCorrect) h.correct++;
      if (!isCorrect) h.everWrong = true;
      h.lastResult = isCorrect ? 'correct' : 'wrong';
      h.timestamp = Date.now();
      history[id] = h;
      const newProgress = { ...prev, history };
      localStorage.setItem(LS_KEY, JSON.stringify(newProgress));
      return newProgress;
    });
  }, []);

  const setConfidence = useCallback((index: number, level: ConfidenceLevel) => {
    setSession(prev => {
      const confidence = [...prev.confidence];
      confidence[index] = level;
      return { ...prev, confidence };
    });
  }, []);

  const updateSpacedRepetition = useCallback(async (questionId: string, isCorrect: boolean, confidence: ConfidenceLevel) => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.user) return;

    let daysToAdd = 1;
    if (isCorrect && confidence === 'confident') daysToAdd = 7;
    else if (isCorrect && confidence === 'hesitant') daysToAdd = 3;
    // incorrect or guessed = 1 day

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    const nextReviewDate = nextDate.toISOString().split('T')[0];

    await supabase.from('spaced_repetition').upsert({
      user_id: authSession.user.id,
      question_id: questionId,
      next_review_date: nextReviewDate,
      confidence,
      last_correct: isCorrect,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,question_id' });
  }, []);

  const incrementScore = useCallback(() => {
    setSession(prev => ({ ...prev, score: prev.score + 1 }));
  }, []);

  const syncAnswerToDb = useCallback(async (questionId: string, isCorrect: boolean, topic: string) => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.user) return;

    const { data: existing } = await supabase
      .from('user_answers')
      .select('answered_count, correct_count')
      .eq('user_id', authSession.user.id)
      .eq('question_id', questionId)
      .maybeSingle();

    const answeredCount = (existing?.answered_count || 0) + 1;
    const correctCount = (existing?.correct_count || 0) + (isCorrect ? 1 : 0);

    await supabase.from('user_answers').upsert({
      user_id: authSession.user.id,
      question_id: questionId,
      topic: topic || null,
      is_correct: isCorrect,
      answered_count: answeredCount,
      correct_count: correctCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,question_id' });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setProgress(prev => {
      const favorites = [...prev.favorites];
      const idx = favorites.indexOf(id);
      if (idx > -1) favorites.splice(idx, 1); else favorites.push(id);
      const newProgress = { ...prev, favorites };
      localStorage.setItem(LS_KEY, JSON.stringify(newProgress));
      return newProgress;
    });
  }, []);

  const saveNote = useCallback((id: string, text: string) => {
    setProgress(prev => {
      const notes = { ...prev.notes };
      if (!text.trim()) delete notes[id]; else notes[id] = text;
      const newProgress = { ...prev, notes };
      localStorage.setItem(LS_KEY, JSON.stringify(newProgress));
      return newProgress;
    });
  }, []);

  const deleteNote = useCallback((id: string) => {
    setProgress(prev => {
      const notes = { ...prev.notes };
      delete notes[id];
      const newProgress = { ...prev, notes };
      localStorage.setItem(LS_KEY, JSON.stringify(newProgress));
      return newProgress;
    });
  }, []);

  const setRating = useCallback((id: string, level: 'easy' | 'medium' | 'hard') => {
    setProgress(prev => {
      const ratings = { ...prev.ratings, [id]: level };
      const newProgress = { ...prev, ratings };
      localStorage.setItem(LS_KEY, JSON.stringify(newProgress));
      return newProgress;
    });
  }, []);

  const addTag = useCallback((id: string, tag: string) => {
    setProgress(prev => {
      const tags = { ...prev.tags };
      if (!tags[id]) tags[id] = [];
      if (!tags[id].includes(tag)) tags[id] = [...tags[id], tag];
      const newProgress = { ...prev, tags };
      localStorage.setItem(LS_KEY, JSON.stringify(newProgress));
      return newProgress;
    });
  }, []);

  const removeTag = useCallback((id: string, tag: string) => {
    setProgress(prev => {
      const tags = { ...prev.tags };
      if (tags[id]) {
        tags[id] = tags[id].filter(t => t !== tag);
        if (tags[id].length === 0) delete tags[id];
      }
      const newProgress = { ...prev, tags };
      localStorage.setItem(LS_KEY, JSON.stringify(newProgress));
      return newProgress;
    });
  }, []);

  const resetAllData = useCallback(() => {
    if (!confirm('האם אתה בטוח? כל ההיסטוריה, ההערות והמועדפים יימחקו.')) return;
    const newProgress = { ...defaultProgress };
    setProgress(newProgress);
    localStorage.setItem(LS_KEY, JSON.stringify(newProgress));
  }, []);

  const importData = useCallback((imported: UserProgress) => {
    const newProgress = {
      ...defaultProgress,
      ...imported,
      ratings: imported.ratings || {},
      tags: imported.tags || {},
    };
    setProgress(newProgress);
    localStorage.setItem(LS_KEY, JSON.stringify(newProgress));
  }, []);

  const toggleMultiSelect = useCallback((type: keyof MultiSelectState, value: string) => {
    setMultiSelect(prev => {
      const newSet = new Set(prev[type]);
      if (value === 'all') { newSet.clear(); newSet.add('all'); }
      else {
        if (newSet.has('all')) newSet.delete('all');
        if (newSet.has(value)) newSet.delete(value); else newSet.add(value);
        if (newSet.size === 0) newSet.add('all');
      }
      return { ...prev, [type]: newSet };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setMultiSelect({
      topic: new Set(['all']), year: new Set(['all']), kind: new Set(['all']),
      institution: new Set(['all']), difficulty: new Set(['all']), usertags: new Set(['all']),
    });
    setSession(prev => ({ ...prev, sourceFilter: 'all', unseenOnly: false }));
  }, []);

  const setSourceFilter = useCallback((source: SessionState['sourceFilter']) => {
    setSession(prev => ({ ...prev, sourceFilter: source }));
  }, []);

  const toggleUnseenOnly = useCallback(() => {
    setSession(prev => ({ ...prev, unseenOnly: !prev.unseenOnly }));
  }, []);

  const getFilteredQuestions = useCallback((serial?: string, textSearch?: string): Question[] => {
    const d = dataRef.current;
    const p = progressRef.current;
    const s = session;
    const ms = multiSelect;

    let pool = [...d];

    if (s.sourceFilter === 'mistakes') pool = pool.filter(q => p.history[q[KEYS.ID]]?.lastResult === 'wrong');
    else if (s.sourceFilter === 'fixed') pool = pool.filter(q => p.history[q[KEYS.ID]]?.everWrong && p.history[q[KEYS.ID]]?.lastResult === 'correct');
    else if (s.sourceFilter === 'favorites') pool = pool.filter(q => p.favorites.includes(q[KEYS.ID]));

    if (s.unseenOnly) pool = pool.filter(q => !p.history[q[KEYS.ID]]);

    if (!ms.topic.has('all')) pool = pool.filter(q => ms.topic.has(q[KEYS.TOPIC]));
    if (!ms.year.has('all')) pool = pool.filter(q => ms.year.has(q[KEYS.YEAR]));
    if (!ms.kind.has('all')) pool = pool.filter(q => ms.kind.has(q[KEYS.KIND]));
    if (!ms.institution.has('all')) pool = pool.filter(q => ms.institution.has(q[KEYS.SOURCE]));
    if (!ms.difficulty.has('all')) pool = pool.filter(q => {
      const r = p.ratings[q[KEYS.ID]];
      return r ? ms.difficulty.has(r) : false;
    });
    if (!ms.usertags.has('all')) pool = pool.filter(q => {
      const t = p.tags[q[KEYS.ID]] || [];
      return t.some(tag => ms.usertags.has(tag));
    });

    if (serial) pool = pool.filter(q => q[KEYS.ID] === serial);
    if (textSearch) {
      const lower = textSearch.toLowerCase();
      pool = pool.filter(q =>
        q[KEYS.QUESTION].toLowerCase().includes(lower) ||
        (q[KEYS.EXPLANATION] && q[KEYS.EXPLANATION].toLowerCase().includes(lower))
      );
    }

    return pool;
  }, [session.sourceFilter, session.unseenOnly, multiSelect, data]);

  const getDueQuestions = useCallback(async (): Promise<Question[]> => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession?.user) return [];

    const today = new Date().toISOString().split('T')[0];
    const { data: dueRows } = await supabase
      .from('spaced_repetition')
      .select('question_id')
      .eq('user_id', authSession.user.id)
      .lte('next_review_date', today);

    if (!dueRows || dueRows.length === 0) return [];

    const dueIds = new Set(dueRows.map(r => r.question_id));
    return dataRef.current.filter(q => dueIds.has(q[KEYS.ID]));
  }, []);

  const generateWeeklyPlan = useCallback((force = false) => {
    const d = dataRef.current;
    const p = progressRef.current;
    if (!d.length) return;
    if (p.plan && !force) return;

    const topicStats: Record<string, { correct: number; total: number }> = {};
    Object.entries(p.history).forEach(([id, h]) => {
      const q = d.find(x => x[KEYS.ID] === id);
      if (q && q[KEYS.TOPIC]) {
        if (!topicStats[q[KEYS.TOPIC]]) topicStats[q[KEYS.TOPIC]] = { correct: 0, total: 0 };
        topicStats[q[KEYS.TOPIC]].total += h.answered;
        topicStats[q[KEYS.TOPIC]].correct += h.correct;
      }
    });

    const weakTopics = Object.entries(topicStats)
      .map(([topic, stats]) => ({ topic, acc: stats.correct / stats.total }))
      .sort((a, b) => a.acc - b.acc)
      .slice(0, 5)
      .map(t => t.topic);

    const unseenCounts: Record<string, number> = {};
    d.forEach(q => {
      if (!p.history[q[KEYS.ID]]) {
        if (!unseenCounts[q[KEYS.TOPIC]]) unseenCounts[q[KEYS.TOPIC]] = 0;
        unseenCounts[q[KEYS.TOPIC]]++;
      }
    });

    const newTopics = Object.entries(unseenCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(t => t[0]);

    const allTopics = [...new Set(d.map(q => q[KEYS.TOPIC]))].filter(Boolean);
    const getRand = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)] || 'General Anesthesia';

    const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const plan: WeeklyDay[] = days.map((day, i) => {
      if (i === 6) return { day, focus: 'חזרה מסכמת ומנוחה', type: 'rest' as const };
      if (i % 2 === 0) return { day, focus: getRand(weakTopics.length > 0 ? weakTopics : allTopics), type: 'weak' as const };
      return { day, focus: getRand(newTopics.length > 0 ? newTopics : allTopics), type: 'new' as const };
    });

    setProgress(prev => {
      const newProgress = { ...prev, plan };
      localStorage.setItem(LS_KEY, JSON.stringify(newProgress));
      return newProgress;
    });
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const result = await syncQuestionsFromSheet();
      setLastSyncTime(result.synced_at);
      const questions = await fetchQuestions();
      setData(questions);
      setSyncStatus('done');
      return { count: result.count };
    } catch (e) {
      console.error('Manual sync failed:', e);
      setSyncStatus('error');
      return null;
    }
  }, []);

  const value: AppContextType = {
    data, loading, progress, session, multiSelect, currentView, isDark, showWelcome,
    syncStatus, lastSyncTime, triggerSync,
    navigate, toggleTheme, closeWelcome, saveProgress: saveProgressFn,
    startSession, setAnswer, setConfidence, setSessionIndex, toggleFlag, skipQuestion,
    updateHistory, updateSpacedRepetition, syncAnswerToDb,
    toggleFavorite, saveNote, deleteNote, setRating, addTag, removeTag, resetAllData, importData,
    toggleMultiSelect, resetFilters, setSourceFilter, toggleUnseenOnly,
    generateWeeklyPlan, getFilteredQuestions, getDueQuestions,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
