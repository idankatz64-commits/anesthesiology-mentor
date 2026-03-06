import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { fetchQuestions, syncQuestionsFromSheet } from '@/lib/csvService';
import {
  KEYS, WELCOME_KEY,
  type Question, type UserProgress, type SessionState,
  type MultiSelectState, type ViewId, type HistoryEntry, type WeeklyDay,
  type ConfidenceLevel,
} from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';

interface SavedSessionData {
  questionIds: string[];
  index: number;
  mode: SessionState['mode'];
  answers: (string | null)[];
  confidence: (ConfidenceLevel | null)[];
  flagged: number[];
  skipped: number[];
  timerSeconds?: number;
  simTimerSeconds?: number;
  createdAt: string;
}

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

  // Session persistence
  saveSessionToDb: (timerSeconds?: number, simTimerSeconds?: number) => Promise<void>;
  resumeSessionFromDb: () => Promise<boolean>;
  clearSavedSession: () => Promise<void>;
  savedSessionInfo: SavedSessionData | null;
  loadingSavedSession: boolean;
}

const defaultProgress: UserProgress = {
  history: {}, notes: {}, favorites: [], plan: null, ratings: {}, tags: {},
};

const defaultSession: SessionState = {
  quiz: [], index: 0, score: 0, mode: 'practice',
  answers: [], confidence: [], flagged: new Set(), skipped: new Set(),
  sourceFilter: 'all', countFilter: 10, unseenOnly: false,
};

// React context for app state
const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// ---- Supabase hydration helpers ----

async function fetchProgressFromSupabase(userId: string): Promise<UserProgress> {
  const [answersRes, favRes, notesRes, ratingsRes, tagsRes, planRes] = await Promise.all([
    supabase.from('user_answers').select('question_id, answered_count, correct_count, is_correct, ever_wrong, updated_at').eq('user_id', userId),
    supabase.from('user_favorites').select('question_id').eq('user_id', userId),
    supabase.from('user_notes').select('question_id, note_text').eq('user_id', userId),
    supabase.from('user_ratings').select('question_id, rating').eq('user_id', userId),
    supabase.from('user_tags').select('question_id, tag').eq('user_id', userId),
    supabase.from('user_weekly_plans').select('plan_data').eq('user_id', userId).maybeSingle(),
  ]);

  // Build history
  const history: Record<string, HistoryEntry> = {};
  if (answersRes.data) {
    for (const row of answersRes.data) {
      history[row.question_id] = {
        answered: row.answered_count,
        correct: row.correct_count,
        lastResult: row.is_correct ? 'correct' : 'wrong',
        everWrong: row.ever_wrong ?? false,
        timestamp: new Date(row.updated_at).getTime(),
      };
    }
  }

  // Build favorites
  const favorites: string[] = (favRes.data || []).map((r: any) => r.question_id);

  // Build notes
  const notes: Record<string, string> = {};
  for (const r of (notesRes.data || [])) {
    notes[r.question_id] = r.note_text;
  }

  // Build ratings
  const ratings: Record<string, 'easy' | 'medium' | 'hard'> = {};
  for (const r of (ratingsRes.data || [])) {
    ratings[r.question_id] = r.rating as 'easy' | 'medium' | 'hard';
  }

  // Build tags
  const tags: Record<string, string[]> = {};
  for (const r of (tagsRes.data || [])) {
    if (!tags[r.question_id]) tags[r.question_id] = [];
    tags[r.question_id].push(r.tag);
  }

  // Plan
  const plan: WeeklyDay[] | null = (planRes.data as any)?.plan_data as WeeklyDay[] | null ?? null;

  return { history, favorites, notes, ratings, tags, plan };
}



export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<UserProgress>({ ...defaultProgress });
  const [session, setSession] = useState<SessionState>({ ...defaultSession });
  const [multiSelect, setMultiSelect] = useState<MultiSelectState>({
    topic: new Set(['all']), year: new Set(['all']), kind: new Set(['all']),
    institution: new Set(['all']), confidence: new Set(['all']), usertags: new Set(['all']),
  });
  const [confidenceMap, setConfidenceMap] = useState<Record<string, string>>({});
  const [currentView, setCurrentView] = useState<ViewId>('home');
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') return false;
    return true;
  });
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem(WELCOME_KEY));
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [savedSessionInfo, setSavedSessionInfo] = useState<SavedSessionData | null>(null);
  const [loadingSavedSession, setLoadingSavedSession] = useState(true);

  const progressRef = useRef(progress);
  progressRef.current = progress;
  const dataRef = useRef(data);
  dataRef.current = data;
  const userIdRef = useRef<string | null>(null);

  // Apply theme class
  useEffect(() => {
    document.documentElement.classList.toggle('light', !isDark);
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Hydrate progress from Supabase when auth state changes
  const hydrationIdRef = useRef(0);

  useEffect(() => {
    const hydrateUser = (userId: string | null) => {
      userIdRef.current = userId;
      const thisHydration = ++hydrationIdRef.current;
      if (userId) {
        fetchProgressFromSupabase(userId).then(prog => {
          if (hydrationIdRef.current === thisHydration) setProgress(prog);
        }).catch(e => {
          console.warn('Failed to hydrate progress from DB:', e);
          if (hydrationIdRef.current === thisHydration) setProgress({ ...defaultProgress });
        });
      } else {
        setProgress({ ...defaultProgress });
      }
    };

    // Listen for auth changes (fires INITIAL_SESSION immediately)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrateUser(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auto-sync from Google Sheets on mount, then fetch from DB
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const questions = await fetchQuestions();
        if (!cancelled) setData(questions);
      } catch (e) {
        console.warn('Initial DB fetch failed, will retry after sync:', e);
      }
      if (!cancelled) setLoading(false);

      // Check for saved session
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        if (authSession?.user) {
          const { data: saved } = await supabase
            .from('saved_sessions')
            .select('session_data')
            .eq('user_id', authSession.user.id)
            .maybeSingle();
          if (saved?.session_data && !cancelled) {
            setSavedSessionInfo(saved.session_data as unknown as SavedSessionData);
          }
        }
      } catch (e) {
        console.warn('Failed to check saved session:', e);
      }
      if (!cancelled) setLoadingSavedSession(false);

      // Then sync in background
      if (!cancelled) setSyncStatus('syncing');
      try {
        const result = await syncQuestionsFromSheet();
        if (!cancelled) {
          setSyncStatus('done');
          setLastSyncTime(result.synced_at);
          const questions = await fetchQuestions();
          if (!cancelled) setData(questions);
        }
      } catch (e) {
        console.warn('Auto-sync failed:', e);
        if (!cancelled) setSyncStatus('error');
      }
    };
    init();
    return () => { cancelled = true; };
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

  // updateHistory: optimistic local update + fire-and-forget Supabase write
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
      return { ...prev, history };
    });

    // Fire-and-forget DB write
    const userId = userIdRef.current;
    if (userId) {
      (async () => {
        const { data: existing } = await supabase
          .from('user_answers')
          .select('answered_count, correct_count, ever_wrong')
          .eq('user_id', userId)
          .eq('question_id', id)
          .maybeSingle();

        const answeredCount = (existing?.answered_count || 0) + 1;
        const correctCount = (existing?.correct_count || 0) + (isCorrect ? 1 : 0);
        const everWrong = (existing?.ever_wrong || false) || !isCorrect;

        await supabase.from('user_answers').upsert({
          user_id: userId,
          question_id: id,
          is_correct: isCorrect,
          answered_count: answeredCount,
          correct_count: correctCount,
          ever_wrong: everWrong,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id,question_id' });
      })();
    }
  }, []);

  const setConfidence = useCallback((index: number, level: ConfidenceLevel) => {
    setSession(prev => {
      const confidence = [...prev.confidence];
      confidence[index] = level;
      return { ...prev, confidence };
    });
  }, []);

  const updateSpacedRepetition = useCallback(async (questionId: string, isCorrect: boolean, confidence: ConfidenceLevel) => {
    const userId = userIdRef.current;
    if (!userId) return;

    let daysToAdd = 1;
    if (isCorrect && confidence === 'confident') daysToAdd = 7;
    else if (isCorrect && confidence === 'hesitant') daysToAdd = 3;

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    const nextReviewDate = nextDate.toISOString().split('T')[0];

    await supabase.from('spaced_repetition').upsert({
      user_id: userId,
      question_id: questionId,
      next_review_date: nextReviewDate,
      confidence,
      last_correct: isCorrect,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,question_id' });
  }, []);

  // syncAnswerToDb is now handled by updateHistory, but kept for backward compat
  const syncAnswerToDb = useCallback(async (questionId: string, isCorrect: boolean, topic: string) => {
    const userId = userIdRef.current;
    if (!userId) return;

    const { data: existing } = await supabase
      .from('user_answers')
      .select('answered_count, correct_count, ever_wrong')
      .eq('user_id', userId)
      .eq('question_id', questionId)
      .maybeSingle();

    const answeredCount = (existing?.answered_count || 0) + 1;
    const correctCount = (existing?.correct_count || 0) + (isCorrect ? 1 : 0);
    const everWrong = (existing?.ever_wrong || false) || !isCorrect;

    await supabase.from('user_answers').upsert({
      user_id: userId,
      question_id: questionId,
      topic: topic || null,
      is_correct: isCorrect,
      answered_count: answeredCount,
      correct_count: correctCount,
      ever_wrong: everWrong,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'user_id,question_id' });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setProgress(prev => {
      const favorites = [...prev.favorites];
      const idx = favorites.indexOf(id);
      const removing = idx > -1;
      if (removing) favorites.splice(idx, 1); else favorites.push(id);

      // Fire-and-forget DB write
      const userId = userIdRef.current;
      if (userId) {
        if (removing) {
          supabase.from('user_favorites').delete().eq('user_id', userId).eq('question_id', id).then();
        } else {
          supabase.from('user_favorites').insert({ user_id: userId, question_id: id }).then();
        }
      }

      return { ...prev, favorites };
    });
  }, []);

  const saveNote = useCallback((id: string, text: string) => {
    setProgress(prev => {
      const notes = { ...prev.notes };
      if (!text.trim()) {
        delete notes[id];
        // Delete from DB
        const userId = userIdRef.current;
        if (userId) supabase.from('user_notes').delete().eq('user_id', userId).eq('question_id', id).then();
      } else {
        notes[id] = text;
        // Upsert to DB
        const userId = userIdRef.current;
        if (userId) supabase.from('user_notes').upsert({ user_id: userId, question_id: id, note_text: text, updated_at: new Date().toISOString() }, { onConflict: 'user_id,question_id' }).then();
      }
      return { ...prev, notes };
    });
  }, []);

  const deleteNote = useCallback((id: string) => {
    setProgress(prev => {
      const notes = { ...prev.notes };
      delete notes[id];
      const userId = userIdRef.current;
      if (userId) supabase.from('user_notes').delete().eq('user_id', userId).eq('question_id', id).then();
      return { ...prev, notes };
    });
  }, []);

  const setRating = useCallback((id: string, level: 'easy' | 'medium' | 'hard') => {
    setProgress(prev => {
      const ratings = { ...prev.ratings, [id]: level };
      const userId = userIdRef.current;
      if (userId) supabase.from('user_ratings').upsert({ user_id: userId, question_id: id, rating: level, updated_at: new Date().toISOString() }, { onConflict: 'user_id,question_id' }).then();
      return { ...prev, ratings };
    });
  }, []);

  const addTag = useCallback((id: string, tag: string) => {
    setProgress(prev => {
      const tags = { ...prev.tags };
      if (!tags[id]) tags[id] = [];
      if (!tags[id].includes(tag)) tags[id] = [...tags[id], tag];
      const userId = userIdRef.current;
      if (userId) supabase.from('user_tags').insert({ user_id: userId, question_id: id, tag }).then();
      return { ...prev, tags };
    });
  }, []);

  const removeTag = useCallback((id: string, tag: string) => {
    setProgress(prev => {
      const tags = { ...prev.tags };
      if (tags[id]) {
        tags[id] = tags[id].filter(t => t !== tag);
        if (tags[id].length === 0) delete tags[id];
      }
      const userId = userIdRef.current;
      if (userId) supabase.from('user_tags').delete().eq('user_id', userId).eq('question_id', id).eq('tag', tag).then();
      return { ...prev, tags };
    });
  }, []);

  const resetAllData = useCallback(async () => {
    if (!confirm('האם אתה בטוח? כל ההיסטוריה, ההערות והמועדפים יימחקו.')) return;
    setProgress({ ...defaultProgress });

    const userId = userIdRef.current;
    if (userId) {
      await Promise.all([
        supabase.from('user_answers').delete().eq('user_id', userId),
        supabase.from('user_favorites').delete().eq('user_id', userId),
        supabase.from('user_notes').delete().eq('user_id', userId),
        supabase.from('user_ratings').delete().eq('user_id', userId),
        supabase.from('user_tags').delete().eq('user_id', userId),
        supabase.from('user_weekly_plans').delete().eq('user_id', userId),
        supabase.from('spaced_repetition').delete().eq('user_id', userId),
      ]);
    }
  }, []);

  const importData = useCallback(async (imported: UserProgress) => {
    const newProgress = {
      ...defaultProgress,
      ...imported,
      ratings: imported.ratings || {},
      tags: imported.tags || {},
    };
    setProgress(newProgress);

    const userId = userIdRef.current;
    if (!userId) return;

    // Batch write to Supabase
    // History -> user_answers
    const answerRows = Object.entries(newProgress.history).map(([qid, h]) => ({
      user_id: userId,
      question_id: qid,
      is_correct: h.lastResult === 'correct',
      answered_count: h.answered,
      correct_count: h.correct,
      ever_wrong: h.everWrong,
      updated_at: new Date(h.timestamp).toISOString(),
    }));
    if (answerRows.length) {
      // Batch in chunks of 500
      for (let i = 0; i < answerRows.length; i += 500) {
        await supabase.from('user_answers').upsert(answerRows.slice(i, i + 500) as any, { onConflict: 'user_id,question_id' });
      }
    }

    // Favorites
    if (newProgress.favorites.length) {
      const favRows = newProgress.favorites.map(qid => ({ user_id: userId, question_id: qid }));
      await supabase.from('user_favorites').upsert(favRows as any, { onConflict: 'user_id,question_id' });
    }

    // Notes
    const noteEntries = Object.entries(newProgress.notes);
    if (noteEntries.length) {
      const noteRows = noteEntries.map(([qid, text]) => ({ user_id: userId, question_id: qid, note_text: text, updated_at: new Date().toISOString() }));
      await supabase.from('user_notes').upsert(noteRows as any, { onConflict: 'user_id,question_id' });
    }

    // Ratings
    const ratingEntries = Object.entries(newProgress.ratings);
    if (ratingEntries.length) {
      const ratingRows = ratingEntries.map(([qid, rating]) => ({ user_id: userId, question_id: qid, rating, updated_at: new Date().toISOString() }));
      await supabase.from('user_ratings').upsert(ratingRows as any, { onConflict: 'user_id,question_id' });
    }

    // Tags
    const tagRows: any[] = [];
    Object.entries(newProgress.tags).forEach(([qid, tags]) => {
      tags.forEach(tag => tagRows.push({ user_id: userId, question_id: qid, tag }));
    });
    if (tagRows.length) {
      await supabase.from('user_tags').upsert(tagRows as any, { onConflict: 'user_id,question_id,tag' });
    }

    // Plan
    if (newProgress.plan) {
      await supabase.from('user_weekly_plans').upsert({ user_id: userId, plan_data: newProgress.plan as any, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }
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
      institution: new Set(['all']), confidence: new Set(['all']), usertags: new Set(['all']),
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
    if (!ms.confidence.has('all')) pool = pool.filter(q => {
      const c = confidenceMap[q[KEYS.ID]];
      return c ? ms.confidence.has(c) : true; // no confidence data = pass through
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
    const userId = userIdRef.current;
    if (!userId) return [];

    const today = new Date().toISOString().split('T')[0];
    const { data: dueRows } = await supabase
      .from('spaced_repetition')
      .select('question_id')
      .eq('user_id', userId)
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

    setProgress(prev => ({ ...prev, plan }));

    // Save to DB
    const userId = userIdRef.current;
    if (userId) {
      supabase.from('user_weekly_plans').upsert({ user_id: userId, plan_data: plan as any, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).then();
    }
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const result = await syncQuestionsFromSheet();
      setLastSyncTime(result.synced_at);
      const questions = await fetchQuestions();
      setData(questions);
      setSyncStatus('done');
      return { count: questions.length };
    } catch (e) {
      console.error('Manual sync failed:', e);
      setSyncStatus('error');
      return null;
    }
  }, []);

  const saveSessionToDb = useCallback(async (timerSeconds?: number, simTimerSeconds?: number) => {
    const userId = userIdRef.current;
    if (!userId) return;

    const currentSession = session;
    if (!currentSession.quiz.length) return;

    const sessionData: SavedSessionData = {
      questionIds: currentSession.quiz.map(q => q[KEYS.ID]),
      index: currentSession.index,
      mode: currentSession.mode,
      answers: currentSession.answers,
      confidence: currentSession.confidence,
      flagged: Array.from(currentSession.flagged),
      skipped: Array.from(currentSession.skipped),
      timerSeconds,
      simTimerSeconds,
      createdAt: new Date().toISOString(),
    };

    await (supabase.from('saved_sessions') as any).upsert({
      user_id: userId,
      session_data: sessionData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    setSavedSessionInfo(sessionData);
  }, [session]);

  const resumeSessionFromDb = useCallback(async (): Promise<boolean> => {
    if (!savedSessionInfo || !dataRef.current.length) return false;

    const questionMap = new Map(dataRef.current.map(q => [q[KEYS.ID], q]));
    const quiz = savedSessionInfo.questionIds
      .map(id => questionMap.get(id))
      .filter((q): q is Question => !!q);

    if (quiz.length === 0) return false;

    setSession({
      quiz,
      index: savedSessionInfo.index,
      score: 0,
      mode: savedSessionInfo.mode,
      answers: savedSessionInfo.answers,
      confidence: savedSessionInfo.confidence,
      flagged: new Set(savedSessionInfo.flagged),
      skipped: new Set(savedSessionInfo.skipped),
      sourceFilter: 'all',
      countFilter: quiz.length,
      unseenOnly: false,
    });
    setCurrentView('session');

    const userId = userIdRef.current;
    if (userId) {
      await supabase.from('saved_sessions').delete().eq('user_id', userId);
    }
    setSavedSessionInfo(null);
    return true;
  }, [savedSessionInfo]);

  const clearSavedSession = useCallback(async () => {
    const userId = userIdRef.current;
    if (userId) {
      await supabase.from('saved_sessions').delete().eq('user_id', userId);
    }
    setSavedSessionInfo(null);
  }, []);

  const value: AppContextType = {
    data, loading, progress, session, multiSelect, currentView, isDark, showWelcome,
    syncStatus, lastSyncTime, triggerSync,
    navigate, toggleTheme, closeWelcome,
    startSession, setAnswer, setConfidence, setSessionIndex, toggleFlag, skipQuestion,
    updateHistory, updateSpacedRepetition, syncAnswerToDb,
    toggleFavorite, saveNote, deleteNote, setRating, addTag, removeTag, resetAllData, importData,
    toggleMultiSelect, resetFilters, setSourceFilter, toggleUnseenOnly,
    generateWeeklyPlan, getFilteredQuestions, getDueQuestions,
    saveSessionToDb, resumeSessionFromDb, clearSavedSession, savedSessionInfo, loadingSavedSession,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
