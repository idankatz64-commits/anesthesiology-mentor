import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { fetchQuestions, syncQuestionsFromSheet, invalidateQuestionsCache } from '@/lib/csvService';
import {
  KEYS, WELCOME_KEY,
  type Question, type UserProgress, type SessionState,
  type MultiSelectState, type ViewId, type HistoryEntry,
  type ConfidenceLevel,
} from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getIsraelToday, addDaysIsrael } from '@/lib/dateHelpers';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  isAdmin: boolean;
  isEditor: boolean;
  
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
  updateHistory: (id: string, isCorrect: boolean, topic?: string) => void;
  updateSpacedRepetition: (questionId: string, isCorrect: boolean, confidence: ConfidenceLevel, topic?: string) => void;
  markForReview: (questionId: string, topic?: string) => Promise<void>;
  
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
  
  // Quiz mutations (immutable)
  updateQuizQuestion: (index: number, fields: Partial<Question>) => void;

  // Sync & cache
  syncStatus: 'idle' | 'syncing' | 'done' | 'error';
  lastSyncTime: string | null;
  triggerSync: () => Promise<{ count: number } | null>;
  invalidateQuestions: () => Promise<void>;
  
   // Computed
  getFilteredQuestions: (serial?: string, textSearch?: string) => Question[];
  getDueQuestions: () => Promise<Question[]>;
  fetchSrsData: () => Promise<Record<string, { next_review_date: string }>>;

  // Session persistence
  saveSessionToDb: (timerSeconds?: number, simTimerSeconds?: number) => Promise<void>;
  resumeSessionFromDb: () => Promise<boolean>;
  clearSavedSession: () => Promise<void>;
  savedSessionInfo: SavedSessionData | null;
  loadingSavedSession: boolean;
}

const defaultProgress: UserProgress = {
  history: {}, notes: {}, favorites: [], ratings: {}, tags: {},
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

// Paginate past the 1000-row default limit
async function fetchAllRows<T>(
  buildQuery: () => any
): Promise<T[]> {
  const PAGE = 1000;
  let allData: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) { console.error('fetchAllRows error', error); throw error; }
    if (!data || data.length === 0) break;
    allData = allData.concat(data as T[]);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return allData;
}

/** Deterministic hash → 0-3 for N/A answer assignment per user */
function hashQidUid(qid: string, uid: string): number {
  const s = qid + '|' + uid;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 4;
}
const NA_OPTS = ['A', 'B', 'C', 'D'] as const;

async function fetchProgressFromSupabase(userId: string): Promise<UserProgress> {
  const [answersData, favData, notesData, ratingsData, tagsData] = await Promise.all([
    fetchAllRows<any>(() => supabase.from('user_answers').select('question_id, answered_count, correct_count, is_correct, ever_wrong, updated_at').eq('user_id', userId)),
    fetchAllRows<any>(() => supabase.from('user_favorites').select('question_id').eq('user_id', userId)),
    fetchAllRows<any>(() => supabase.from('user_notes').select('question_id, note_text').eq('user_id', userId)),
    fetchAllRows<any>(() => supabase.from('user_ratings').select('question_id, rating').eq('user_id', userId)),
    fetchAllRows<any>(() => supabase.from('user_tags').select('question_id, tag').eq('user_id', userId)),
  ]);

  // Build history
  const history: Record<string, HistoryEntry> = {};
  for (const row of answersData) {
    history[row.question_id] = {
      answered: row.answered_count,
      correct: row.correct_count,
      lastResult: row.is_correct ? 'correct' : 'wrong',
      everWrong: row.ever_wrong ?? false,
      timestamp: new Date(row.updated_at).getTime(),
    };
  }

  // Build favorites
  const favorites: string[] = favData.map((r: any) => r.question_id);

  // Build notes
  const notes: Record<string, string> = {};
  for (const r of notesData) {
    notes[r.question_id] = r.note_text;
  }

  // Build ratings
  const ratings: Record<string, 'easy' | 'medium' | 'hard'> = {};
  for (const r of ratingsData) {
    ratings[r.question_id] = r.rating as 'easy' | 'medium' | 'hard';
  }

  // Build tags
  const tags: Record<string, string[]> = {};
  for (const r of tagsData) {
    if (!tags[r.question_id]) tags[r.question_id] = [];
    tags[r.question_id].push(r.tag);
  }

  return { history, favorites, notes, ratings, tags };
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditor, setIsEditor] = useState(false);
  const editChannelRef = useRef<RealtimeChannel | null>(null);

  const progressRef = useRef(progress);
  progressRef.current = progress;
  const dataRef = useRef(data);
  dataRef.current = data;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const multiSelectRef = useRef(multiSelect);
  multiSelectRef.current = multiSelect;
  const confidenceMapRef = useRef(confidenceMap);
  confidenceMapRef.current = confidenceMap;

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
        // Hydrate confidence map from spaced_repetition
        supabase.from('spaced_repetition').select('question_id, confidence').eq('user_id', userId)
          .then(({ data: rows }) => {
            if (hydrationIdRef.current === thisHydration && rows) {
              const map: Record<string, string> = {};
              for (const r of rows) { if (r.confidence) map[r.question_id] = r.confidence; }
              setConfidenceMap(map);
            }
          });
        // Hydrate admin/editor role
        supabase.from('admin_users').select('role').eq('id', userId).maybeSingle()
          .then(({ data: adminEntry }) => {
            if (hydrationIdRef.current === thisHydration) {
              const userIsAdmin = adminEntry?.role === 'admin';
              setIsAdmin(userIsAdmin);
              setIsEditor(adminEntry?.role === 'editor' || userIsAdmin);

              // Subscribe to edit notifications for admins only
              if (userIsAdmin && !editChannelRef.current) {
                editChannelRef.current = supabase
                  .channel('admin-edit-alerts')
                  .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'question_edit_log',
                  }, async (payload) => {
                    const newRow = payload.new as any;
                    const [editorRes, questionRes] = await Promise.all([
                      supabase.from('admin_users').select('email').eq('id', newRow.editor_id).maybeSingle(),
                      newRow.question_id
                        ? supabase.from('questions').select('topic').eq('id', newRow.question_id).maybeSingle()
                        : Promise.resolve({ data: null }),
                    ]);
                    const editorEmail = editorRes.data?.email ?? 'עורך';
                    const topic = questionRes.data?.topic || 'לא ידוע';
                    toast(`✏️ שאלה נערכה`, {
                      description: `שאלה: ${newRow.question_id?.slice(0, 12) ?? '—'}\nנושא: ${topic}\nנערך על ידי: ${editorEmail}`,
                      duration: 6000,
                    });
                  })
                  .subscribe();
              }
            }
          });
      } else {
        setProgress({ ...defaultProgress });
        setConfidenceMap({});
        setIsAdmin(false);
        setIsEditor(false);
        // Unsubscribe from edit notifications
        if (editChannelRef.current) {
          supabase.removeChannel(editChannelRef.current);
          editChannelRef.current = null;
        }
      }
    };

    // Listen for auth changes (fires INITIAL_SESSION immediately)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        hydrateUser(session?.user?.id ?? null);
      } else if (event === 'TOKEN_REFRESHED' && session?.user?.id) {
        // Re-check admin/editor role after token refresh — lightweight, no full re-hydration
        const userId = session.user.id;
        supabase.from('admin_users').select('role').eq('id', userId).maybeSingle()
          .then(({ data: adminEntry }) => {
            const userIsAdmin = adminEntry?.role === 'admin';
            setIsAdmin(userIsAdmin);
            setIsEditor(adminEntry?.role === 'editor' || userIsAdmin);
          });
      }
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

      // Check for saved session + whether background sync is allowed
      let canRunBackgroundSync = false;
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const userId = authSession?.user?.id ?? null;

        if (userId) {
          const [{ data: saved }, { data: roleEntry, error: roleError }] = await Promise.all([
            supabase
              .from('saved_sessions')
              .select('session_data')
              .eq('user_id', userId)
              .maybeSingle(),
            supabase
              .from('admin_users')
              .select('role')
              .eq('id', userId)
              .maybeSingle(),
          ]);

          if (saved?.session_data && !cancelled) {
            setSavedSessionInfo(saved.session_data as unknown as SavedSessionData);
          }

          if (!roleError && roleEntry?.role === 'admin') {
            canRunBackgroundSync = true;
          }
        }
      } catch (e) {
        console.warn('Failed to check saved session:', e);
      }
      if (!cancelled) setLoadingSavedSession(false);

      // sync-questions is protected: only authenticated admins should invoke it
      if (!canRunBackgroundSync) {
        if (!cancelled) setSyncStatus('idle');
        return;
      }

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
    const uid = userIdRef.current ?? 'anon';
    const quiz = shuffled.slice(0, Math.min(pool.length, count)).map(q => {
      const c = q[KEYS.CORRECT];
      if (!c || c === 'N/A' || c.trim() === '') {
        return { ...q, [KEYS.CORRECT]: NA_OPTS[hashQidUid(q[KEYS.ID], uid)] };
      }
      return q;
    });
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
  const updateHistory = useCallback((id: string, isCorrect: boolean, topic?: string) => {
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

    // Fire-and-forget DB write — atomic increment via RPC (prevents race conditions)
    const userId = userIdRef.current;
    if (userId) {
      (async () => {
        const { error } = await supabase.rpc('increment_user_answer', {
          p_user_id: userId,
          p_question_id: id,
          p_is_correct: isCorrect,
          p_topic: topic ?? null,
        });

        if (error) {
          console.error('user_answers increment error:', error);
          toast.error('שגיאה בשמירת התקדמות');
        }
      })();

      // answer_history is populated automatically by the DB trigger
      // trg_sync_answer_history on user_answers — no manual insert needed
    }
  }, []);

  const setConfidence = useCallback((index: number, level: ConfidenceLevel) => {
    setSession(prev => {
      const confidence = [...prev.confidence];
      confidence[index] = level;
      return { ...prev, confidence };
    });
  }, []);

  const updateSpacedRepetition = useCallback(async (questionId: string, isCorrect: boolean, confidence: ConfidenceLevel, topic?: string) => {
    const userId = userIdRef.current;
    if (!userId) return;

    // Fetch existing SM-2 state
    const { data: existing } = await supabase
      .from('spaced_repetition')
      .select('interval_days, ease_factor, repetitions')
      .eq('user_id', userId)
      .eq('question_id', questionId)
      .maybeSingle();

    let interval = (existing as any)?.interval_days ?? 1;
    let ease = (existing as any)?.ease_factor ?? 2.5;
    let reps = (existing as any)?.repetitions ?? 0;

    if (!isCorrect || confidence === 'guessed') {
      interval = 1;
      ease = Math.max(1.3, ease - 0.2);
      reps = 0;
    } else if (confidence === 'hesitant') {
      // SM-2 ramp with penalty: guesses/hesitations come back sooner
      if (reps === 0)      interval = 1;
      else if (reps === 1) interval = 3;
      else                 interval = Math.max(1, Math.min(365, Math.round(interval * 1.2)));
      ease = Math.max(1.3, ease - 0.05);
      reps++;
    } else {
      // Confident: standard SM-2 progression (1 → 6 → prev×ease)
      if (reps === 0)      interval = 1;
      else if (reps === 1) interval = 6;
      else                 interval = Math.max(1, Math.min(365, Math.round(interval * ease)));
      ease = Math.min(4.0, ease + 0.1);
      reps++;
    }

    const nextReviewDate = addDaysIsrael(getIsraelToday(), interval);

    const { error } = await supabase.from('spaced_repetition').upsert({
      user_id: userId,
      question_id: questionId,
      next_review_date: nextReviewDate,
      confidence,
      last_correct: isCorrect,
      updated_at: new Date().toISOString(),
      interval_days: interval,
      ease_factor: ease,
      repetitions: reps,
    } as any, { onConflict: 'user_id,question_id' });

    if (error) {
      console.error('spaced_repetition upsert error:', error);
      toast.error('שגיאה בשמירת נתוני חזרה מרווחת');
    } else {
      // Keep local confidenceMap in sync
      setConfidenceMap(prev => ({ ...prev, [questionId]: confidence }));
    }
    // answer_history insert is now handled by updateHistory — no duplicate here
  }, []);

  const markForReview = useCallback(async (questionId: string, topic?: string) => {
    const userId = userIdRef.current;
    if (!userId) return;

    // Update local progress state (count as wrong)
    setProgress(prev => {
      const history = { ...prev.history };
      if (!history[questionId]) history[questionId] = { answered: 0, correct: 0, lastResult: null, everWrong: false, timestamp: 0 };
      const h = { ...history[questionId] };
      h.answered++;
      h.everWrong = true;
      h.lastResult = 'wrong';
      h.timestamp = Date.now();
      history[questionId] = h;
      return { ...prev, history };
    });

    // Reset SRS
    const { data: existing } = await supabase
      .from('spaced_repetition')
      .select('ease_factor')
      .eq('user_id', userId)
      .eq('question_id', questionId)
      .maybeSingle();

    const ease = Math.max(1.3, ((existing as any)?.ease_factor ?? 2.5) - 0.2);
    const nextReviewDate = addDaysIsrael(getIsraelToday(), 1);

    await supabase.from('spaced_repetition').upsert({
      user_id: userId,
      question_id: questionId,
      interval_days: 1,
      ease_factor: ease,
      repetitions: 0,
      next_review_date: nextReviewDate,
      confidence: 'guessed',
      last_correct: false,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: 'user_id,question_id' });

    // Direct insert into answer_history with flagged_for_review=true
    await supabase.from('answer_history').insert({
      user_id: userId,
      question_id: questionId,
      topic: topic ?? null,
      is_correct: false,
      flagged_for_review: true,
      answered_at: new Date().toISOString(),
    } as any);

    setConfidenceMap(prev => ({ ...prev, [questionId]: 'guessed' }));
    toast.success('שאלה תחזור מחר לחזרה 🔁');
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
    const s = sessionRef.current;
    const ms = multiSelectRef.current;
    const cm = confidenceMapRef.current;

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
      const c = cm[q[KEYS.ID]];
      return c ? ms.confidence.has(c) : false;
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
  }, []); // stable — always reads latest state via refs

  const getDueQuestions = useCallback(async (): Promise<Question[]> => {
    const userId = userIdRef.current;
    if (!userId) return [];

    const today = getIsraelToday();
    const DAILY_SRS_CAP = 40;

    // fetchAllRows paginates past the 1000-row default limit; most overdue first
    const dueRows = await fetchAllRows<{ question_id: string; next_review_date: string }>(() =>
      supabase
        .from('spaced_repetition')
        .select('question_id, next_review_date')
        .eq('user_id', userId)
        .lte('next_review_date', today)
        .order('next_review_date', { ascending: true })
    );

    const cappedRows = dueRows.slice(0, DAILY_SRS_CAP);
    if (cappedRows.length === 0) return [];
    const dueIds = new Set(cappedRows.map(r => r.question_id));

    // Prefer in-memory cache when available
    let matched = dataRef.current.filter(q => dueIds.has(q[KEYS.ID]));

    // Fallback eliminates the race when questions haven't finished loading
    if (matched.length === 0) {
      const all = await fetchQuestions();
      matched = all.filter(q => dueIds.has(q[KEYS.ID]));
    }

    return matched;
  }, []);

  const fetchSrsData = useCallback(async (): Promise<Record<string, { next_review_date: string }>> => {
    const userId = userIdRef.current;
    if (!userId) return {};

    const rows = await fetchAllRows<any>(() =>
      supabase.from('spaced_repetition').select('question_id, next_review_date').eq('user_id', userId)
    );

    const map: Record<string, { next_review_date: string }> = {};
    for (const r of rows) {
      map[r.question_id] = { next_review_date: r.next_review_date };
    }
    return map;
  }, []);


  /** Invalidate question cache and re-fetch fresh data from DB */
  const invalidateQuestions = useCallback(async () => {
    invalidateQuestionsCache();
    const questions = await fetchQuestions(3, true);
    setData(questions);
  }, []);

  const triggerSync = useCallback(async () => {
    setSyncStatus('syncing');
    try {
      const result = await syncQuestionsFromSheet();
      setLastSyncTime(result.synced_at);
      await invalidateQuestions();
      setSyncStatus('done');
      return { count: data.length };
    } catch (e) {
      console.error('Manual sync failed:', e);
      setSyncStatus('error');
      return null;
    }
  }, [invalidateQuestions, data.length]);

  const saveSessionToDb = useCallback(async (timerSeconds?: number, simTimerSeconds?: number) => {
    const userId = userIdRef.current;
    if (!userId) return;

    const currentSession = sessionRef.current;
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
  }, []);

  const resumeSessionFromDb = useCallback(async (): Promise<boolean> => {
    if (!savedSessionInfo || !dataRef.current.length) return false;

    const questionMap = new Map(dataRef.current.map(q => [q[KEYS.ID], q]));

    // בנה map של תשובות וconfidence לפי ID (לא לפי index).
    // כך, אם שאלה נמחקה מה-DB מאז השמירה, שאר התשובות לא יחרגו ממיקומן.
    const savedIds = savedSessionInfo.questionIds;
    const answersById: Record<string, string | null> = {};
    const confidenceById: Record<string, string | null> = {};
    savedIds.forEach((id, i) => {
      answersById[id] = savedSessionInfo.answers[i] ?? null;
      confidenceById[id] = savedSessionInfo.confidence[i] ?? null;
    });

    const quiz = savedIds
      .map(id => questionMap.get(id))
      .filter((q): q is Question => !!q);

    if (quiz.length === 0) return false;

    const answers = quiz.map(q => answersById[q[KEYS.ID]] ?? null);
    const confidence = quiz.map(q => (confidenceById[q[KEYS.ID]] ?? null) as any);
    const validIndex = Math.min(savedSessionInfo.index, quiz.length - 1);

    setSession({
      quiz,
      index: validIndex,
      score: 0,
      mode: savedSessionInfo.mode,
      answers,
      confidence,
      flagged: new Set(savedSessionInfo.flagged),
      skipped: new Set(savedSessionInfo.skipped),
      sourceFilter: 'all',
      countFilter: quiz.length,
      unseenOnly: false,
      resumedTimerSeconds: savedSessionInfo.timerSeconds,
      resumedSimTimerSeconds: savedSessionInfo.simTimerSeconds,
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

  const updateQuizQuestion = useCallback((index: number, fields: Partial<Question>) => {
    setSession(prev => ({
      ...prev,
      quiz: prev.quiz.map((q, i) => i === index ? { ...q, ...fields } : q),
    }));
  }, []);

  const value: AppContextType = {
    data, loading, progress, session, multiSelect, currentView, isDark, showWelcome,
    isAdmin, isEditor,
    syncStatus, lastSyncTime, triggerSync, invalidateQuestions,
    navigate, toggleTheme, closeWelcome,
    startSession, setAnswer, setConfidence, setSessionIndex, toggleFlag, skipQuestion,
    updateHistory, updateSpacedRepetition, markForReview,
    toggleFavorite, saveNote, deleteNote, setRating, addTag, removeTag, resetAllData, importData,
    toggleMultiSelect, resetFilters, setSourceFilter, toggleUnseenOnly,
    updateQuizQuestion,
    getFilteredQuestions, getDueQuestions, fetchSrsData,
    saveSessionToDb, resumeSessionFromDb, clearSavedSession, savedSessionInfo, loadingSavedSession,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
