import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { fetchQuestions, invalidateQuestionsCache, setQuestionsCacheScope } from "@/lib/csvService";
import {
  KEYS,
  WELCOME_KEY,
  type Question,
  type UserProgress,
  type SessionState,
  type MultiSelectState,
  type ViewId,
  type HistoryEntry,
  type ConfidenceLevel,
  type SessionOptions,
  type FeedbackTiming,
} from "@/lib/types";
import { feedbackTimingFor } from "@/lib/sessionFeedback";
import { captureLearningBaseline } from "@/lib/sessionInsights";
import { supabase } from "@/integrations/supabase/client";
import { maskEmail } from "@/lib/demoMode";
import { toast } from "sonner";
import { getIsraelToday, addDaysIsrael } from "@/lib/dateHelpers";
import { buildMarkForReviewIncrementArgs } from "@/lib/markForReviewParams";
import { persistOptimistic } from "@/lib/persistOptimistic";
import {
  upsertSpacedRepetitionRecord,
  buildSrsRecordMap,
  type SrsUpsertPayload,
  type SrsRow,
  type SrsRecord,
} from "@/lib/srsRepository";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { claimAcademyMembership, fetchMyAttempts, type AcademyMembership } from "@/lib/academyRepository";
import { fetchMyResident, residentErrorMessage, type ResidentState } from "@/lib/residentRepository";
import { residentOnboardingEnabled } from "@/lib/featureFlags";
import { reconcileSavedQuestions } from "@/lib/savedSessionReconcile";
import { durableAttemptsEnabled } from "@/lib/featureFlags";
import { type AttemptRead, RESULTS_READ_FAILED, abandonAttempt, confirmAttemptAnswer, readAttempt, repeatAttempt, snapshotToQuestion, startAttempt, startSimulationAttempt, submitAttempt, type AttemptResult } from "@/lib/attemptsRepository";
import { linkRecommendation } from "@/lib/learningRepository";
import type { Recommendation } from "@/lib/learningInsights";
import { sessionFromAttempt } from "@/lib/attemptSession";

export type SavedSessionData = {
  questionIds: string[];
  index: number;
  mode: SessionState["mode"];
  feedbackTiming?: SessionState["feedbackTiming"];
  learningBaseline?: SessionState["learningBaseline"];
  answers: (string | null)[];
  confidence: (ConfidenceLevel | null)[];
  flagged: number[];
  skipped: number[];
  quizId?: string;
  timerSeconds?: number;
  simTimerSeconds?: number;
  createdAt: string;
  /** Durable attempt identity (milestone 2). Present only for sessions started on the new path. */
  attemptId?: string;
  rootId?: string;
  questionMs?: number[];
}

interface AppContextType {
  data: Question[];
  loading: boolean;
  progress: UserProgress;
  historyLoaded: boolean;
  session: SessionState;
  multiSelect: MultiSelectState;
  currentView: ViewId;
  isDark: boolean;
  showWelcome: boolean;
  isAdmin: boolean;
  isEditor: boolean;
  academyMember: AcademyMembership | null;
  academyOnly: boolean;
  // False only while a logged-in user's academy-membership check is in flight
  // (default true — covers "resolved" for anonymous users and the pre-hydration moment).
  membershipResolved: boolean;
  /** Has the admin_users role query come back for the current user? */
  roleResolved: boolean;
  /** resident_me result (flag VITE_RESIDENT_ONBOARDING). Null when off, signed out or lookup failed. */
  resident: ResidentState | null;
  residentResolved: boolean;
  /** Hebrew reason the last resident lookup failed (gate shows the unavailable screen); null after a success. */
  residentError: string | null;
  refreshResident: () => Promise<void>;
  // ── access gate (lockdown 2026-08-14) ──
  // Logged-in user id, or null when signed out.
  userId: string | null;
  // False until the first Supabase auth check comes back. Nothing may render before then.
  authResolved: boolean;
  // Result of the is_approved() RPC — null while that round trip is in flight.
  // The DB enforces this too; this only decides what the UI shows.
  approved: boolean | null;
  registerAttemptedQuestions: (ids: string[]) => void;

  navigate: (view: ViewId, param?: string | null) => void;
  toggleTheme: () => void;
  closeWelcome: () => void;

  // Session actions
  /** Legacy path returns synchronously; with VITE_DURABLE_ATTEMPTS the attempt is created on the server first and the promise rejects on failure. */
  startSession: (pool: Question[], count: number, mode: SessionState["mode"], options?: SessionOptions) => void | Promise<void>;
  /** Durable path: confirms the selected answer on the server, then records the confidence locally. Rejects without changing state on failure. */
  confirmAnswer: (index: number, level: ConfidenceLevel, answerMs: number) => Promise<void>;
  /** Durable path: submits the attempt (idempotent on the server) and stores the server result on the session. */
  finishAttempt: (totalActiveMs: number) => Promise<AttemptResult>;
  /** Legacy/Academy paths: keeps the active time on the session for results/PDF (never a limit). */
  recordSessionTime: (totalActiveMs: number) => void;
  /** A learning recommendation the resident chose to act on; Setup honours it exactly (no widening). */
  recommendation: Recommendation | null;
  openRecommendation: (rec: Recommendation) => void;
  clearRecommendation: () => void;
  /** Durable path: marks the open attempt abandoned. No-op when the session has no attempt. */
  abandonCurrentAttempt: () => Promise<void>;
  /** Durable path: repeats an archived root (server enforces the 7-day cooldown) and opens the new attempt. */
  startRepeat: (rootId: string, feedbackTiming: FeedbackTiming) => Promise<void>;
  /** Durable path: opens an in-progress attempt from the server (no draft needed). Resolves false when it is no longer open. */
  openAttempt: (attemptId: string) => Promise<boolean>;
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
  setRating: (id: string, level: "easy" | "medium" | "hard") => void;
  addTag: (id: string, tag: string) => void;
  removeTag: (id: string, tag: string) => void;
  resetAllData: () => void;
  importData: (data: UserProgress) => void;

  // Multi-select
  toggleMultiSelect: (type: keyof MultiSelectState, value: string) => void;
  resetFilters: () => void;
  setSourceFilter: (source: SessionState["sourceFilter"]) => void;
  toggleUnseenOnly: () => void;

  // Quiz mutations (immutable)
  updateQuizQuestion: (index: number, fields: Partial<Question>) => void;

  // Cache
  invalidateQuestions: () => Promise<void>;

  // Computed
  /** questionId -> last confidence rating. Read by getFilteredQuestions through a ref,
   *  so consumers that memoise a pool must depend on it explicitly. */
  confidenceMap: Record<string, string>;
  getFilteredQuestions: (serial?: string, textSearch?: string) => Question[];
  getDueQuestions: () => Promise<Question[]>;
  getQuestionsByIds: (ids: string[]) => Question[];
  fetchSrsData: () => Promise<Record<string, SrsRecord>>;

  // Session persistence
  saveSessionToDb: (timerSeconds?: number, simTimerSeconds?: number, questionMs?: number[]) => Promise<void>;
  resumeSessionFromDb: () => Promise<boolean>;
  clearSavedSession: () => Promise<void>;
  savedSessionInfo: SavedSessionData | null;
  loadingSavedSession: boolean;
}

const defaultProgress: UserProgress = {
  history: {},
  notes: {},
  favorites: [],
  ratings: {},
  tags: {},
};

/**
 * Cache/bank scope: who is reading and under which entitlement (flag on) AND
 * which content privilege. Editors/admins read more rows under RLS
 * (is_content_admin) whatever the flag says, so an editor -> resident change
 * with the same national flag is still a different bank.
 */
const bankScopeFor = (uid: string, r: ResidentState | null, editor: boolean) =>
  `${residentOnboardingEnabled() ? `${uid}:${r?.member?.nationalAccess ? "national" : "open"}` : uid}${editor ? ":editor" : ""}`;

/** Thrown by async producers whose result landed after the identity or privilege changed. */
const IDENTITY_CHANGED = "IDENTITY_CHANGED";

const defaultSession: SessionState = {
  quiz: [],
  index: 0,
  score: 0,
  mode: "practice",
  answers: [],
  confidence: [],
  flagged: new Set(),
  skipped: new Set(),
  sourceFilter: "all",
  countFilter: 10,
  unseenOnly: false,
};

// React context for app state
const AppContext = createContext<AppContextType | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// ---- Supabase hydration helpers ----

// The single capability fetchAllRows needs from a Supabase query builder. Structural,
// so any `.select(...)` chain satisfies it without importing Postgrest's generics.
type RangeQuery = {
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

// Paginate past the 1000-row default limit
async function fetchAllRows<T>(buildQuery: () => RangeQuery): Promise<T[]> {
  const PAGE = 1000;
  let allData: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) {
      console.error("fetchAllRows error", error);
      throw error;
    }
    if (!data || data.length === 0) break;
    allData = allData.concat(data as T[]);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return allData;
}

/** Deterministic hash → 0-3 for N/A answer assignment per user */
function hashQidUid(qid: string, uid: string): number {
  const s = qid + "|" + uid;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 4;
}
const NA_OPTS = ["A", "B", "C", "D"] as const;

// The five per-user tables this hydration reads, in the columns it selects.
type AnswerRow = {
  question_id: string;
  answered_count: number;
  correct_count: number;
  is_correct: boolean | null;
  ever_wrong: boolean | null;
  updated_at: string;
};

async function fetchProgressFromSupabase(userId: string): Promise<UserProgress> {
  const [answersData, favData, notesData, ratingsData, tagsData] = await Promise.all([
    fetchAllRows<AnswerRow>(() =>
      supabase
        .from("user_answers")
        .select("question_id, answered_count, correct_count, is_correct, ever_wrong, updated_at")
        .eq("user_id", userId),
    ),
    fetchAllRows<{ question_id: string }>(() => supabase.from("user_favorites").select("question_id").eq("user_id", userId)),
    fetchAllRows<{ question_id: string; note_text: string }>(() => supabase.from("user_notes").select("question_id, note_text").eq("user_id", userId)),
    fetchAllRows<{ question_id: string; rating: string }>(() => supabase.from("user_ratings").select("question_id, rating").eq("user_id", userId)),
    fetchAllRows<{ question_id: string; tag: string }>(() => supabase.from("user_tags").select("question_id, tag").eq("user_id", userId)),
  ]);

  // Build history
  const history: Record<string, HistoryEntry> = {};
  for (const row of answersData) {
    history[row.question_id] = {
      answered: row.answered_count,
      correct: row.correct_count,
      lastResult: row.is_correct ? "correct" : "wrong",
      everWrong: row.ever_wrong ?? false,
      timestamp: new Date(row.updated_at).getTime(),
    };
  }

  // Build favorites
  const favorites: string[] = favData.map((r) => r.question_id);

  // Build notes
  const notes: Record<string, string> = {};
  for (const r of notesData) {
    notes[r.question_id] = r.note_text;
  }

  // Build ratings
  const ratings: Record<string, "easy" | "medium" | "hard"> = {};
  for (const r of ratingsData) {
    ratings[r.question_id] = r.rating as "easy" | "medium" | "hard";
  }

  // Build tags
  const tags: Record<string, string[]> = {};
  for (const r of tagsData) {
    if (!tags[r.question_id]) tags[r.question_id] = [];
    tags[r.question_id].push(r.tag);
  }

  return { history, favorites, notes, ratings, tags };
}

/**
 * The claim's answer, or null if it rejected or did not answer within `ms`.
 * A hung claim must degrade to "no membership" (the gate then keeps its
 * fail-closed answer), never hold the whole app on the loading screen.
 */
function claimSettledWithin<T>(claim: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    claim.catch(() => null),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<UserProgress>({ ...defaultProgress });
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const historyLoadedRef = useRef(false);
  const [session, setSession] = useState<SessionState>({ ...defaultSession });
  const [multiSelect, setMultiSelect] = useState<MultiSelectState>({
    topic: new Set(["all"]),
    year: new Set(["all"]),
    kind: new Set(["all"]),
    institution: new Set(["all"]),
    confidence: new Set(["all"]),
    usertags: new Set(["all"]),
  });
  const [confidenceMap, setConfidenceMap] = useState<Record<string, string>>({});
  const [currentView, setCurrentView] = useState<ViewId>("home");
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light") return false;
    return true;
  });
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem(WELCOME_KEY));
  const [savedSessionInfo, setSavedSessionInfo] = useState<SavedSessionData | null>(null);
  const [loadingSavedSession, setLoadingSavedSession] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditor, setIsEditor] = useState(false);
  const [academyMember, setAcademyMember] = useState<AcademyMembership | null>(null);
  const [attemptedQuizIds, setAttemptedQuizIds] = useState<Set<string>>(new Set());
  const [membershipResolved, setMembershipResolved] = useState(true);
  const [roleResolved, setRoleResolved] = useState(true);
  const [resident, setResident] = useState<ResidentState | null>(null);
  const [residentResolved, setResidentResolved] = useState(true);
  const [residentError, setResidentError] = useState<string | null>(null);
  // True while the in-memory bank does not belong to the current (user, entitlement).
  const [bankStale, setBankStale] = useState(false);
  // True once role and (flag on) resident are both known for the current
  // hydration/refresh, i.e. the bank scope is settled and the bank may load.
  const [scopeReady, setScopeReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [approved, setApproved] = useState<boolean | null>(null);

  // Linked active residents use the full learning UI with the bank already
  // scoped by server permissions. The old quiz-only restriction still applies
  // before linkage, while the rollout flag is off, and to suspended members.
  const residentLearningAccess = residentOnboardingEnabled() && resident?.linked
    && resident.member?.status === "active" && academyMember?.status === "active";
  const academyOnly = !!academyMember && academyMember.access_level === "academy" && !isAdmin && !isEditor && !residentLearningAccess;

  // Amendment 2: academy-tier residents only see questions from quizzes they've
  // already submitted (union of quiz_attempts.question_ids). This projection
  // happens ONLY here, at the context value boundary — internal paths
  // (resumeSessionFromDb, quiz question resolution) read the RAW data via
  // dataRef / getQuestionsByIds so a quiz can always resolve its own questions
  // even when they fall outside the resident's practice pool.
  const visibleData = useMemo(() => {
    if (!academyOnly) return data;
    return data.filter((q) => attemptedQuizIds.has(q[KEYS.ID]));
  }, [data, academyOnly, attemptedQuizIds]);

  const editChannelRef = useRef<RealtimeChannel | null>(null);
  // Notification generation (PHASE-2B-NOTIFICATION). Bumped on every channel
  // drop; a callback belongs to the generation its channel was created in and
  // publishes nothing once that generation is over — including a lookup that
  // was already in flight when the drop happened. Separate from the identity
  // epoch so tearing the channel down never disturbs an authorized quiz.
  const notifGenRef = useRef(0);
  // State twin of the ref: a drop must re-run the subscribe effect even when
  // approval and role are re-confirmed within the same render batch.
  const [notifGen, setNotifGen] = useState(0);
  // Refs only — safe from an unmount cleanup, where state must not be written.
  const killEditChannel = useCallback(() => {
    notifGenRef.current++;
    if (editChannelRef.current) {
      supabase.removeChannel(editChannelRef.current);
      editChannelRef.current = null;
    }
  }, []);
  const dropEditChannel = useCallback(() => {
    killEditChannel();
    setNotifGen(notifGenRef.current);
  }, [killEditChannel]);

  const progressRef = useRef(progress);
  progressRef.current = progress;
  const dataRef = useRef(data);
  dataRef.current = data;
  const visibleDataRef = useRef(visibleData);
  visibleDataRef.current = visibleData;
  const academyOnlyRef = useRef(academyOnly);
  academyOnlyRef.current = academyOnly;
  const attemptedQuizIdsRef = useRef(attemptedQuizIds);
  attemptedQuizIdsRef.current = attemptedQuizIds;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const multiSelectRef = useRef(multiSelect);
  multiSelectRef.current = multiSelect;
  const confidenceMapRef = useRef(confidenceMap);
  confidenceMapRef.current = confidenceMap;

  const userIdRef = useRef<string | null>(null);

  // Apply theme class
  useEffect(() => {
    document.documentElement.classList.toggle("light", !isDark);
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  // Hydrate progress from Supabase when auth state changes
  const hydrationIdRef = useRef(0);
  // Resident lookups carry their own generation: a token refresh re-reads the
  // resident without discarding in-flight progress hydration, and a result
  // from a previous identity or refresh can never rehydrate old privilege.
  const residentGenRef = useRef(0);
  // Only the newest bank fetch may populate `data`; bumped on every quarantine.
  const bankFetchRef = useRef(0);
  const bankSkipCacheRef = useRef(false);
  // Identity/privilege epoch (async identity barrier, 2026-09-07). Bumped by
  // every quarantine — account change, sign-out, entitlement or role change.
  // Every async producer captures it BEFORE its request and checks it after
  // EVERY await and inside deferred state updaters: a result that belongs to a
  // previous identity is neither published locally nor followed by another
  // request under the newly active auth. Writes already sent stay as they were:
  // the server authorised them for the account that sent them.
  const epochRef = useRef(0);
  const staleEpoch = useCallback((epoch: number) => epochRef.current !== epoch, []);
  const requireEpoch = useCallback((epoch: number) => {
    if (epochRef.current !== epoch) throw new Error(IDENTITY_CHANGED);
  }, []);
  // Only the newest role lookup (hydration or token refresh) may publish a role.
  const roleGenRef = useRef(0);
  // Only the current approval check may publish an access decision. This is
  // separate from role/resident because approval is the outer privacy gate.
  const approvalGenRef = useRef(0);
  // The roster claim of the current hydration while it is still in flight. Any
  // approval check that starts inside that window waits on it; null otherwise.
  const pendingClaimRef = useRef<Promise<AcademyMembership | null> | null>(null);
  // What the bank scope is made of for the current hydration/refresh. The scope
  // is applied only once BOTH parts are known, so a bank is never loaded under
  // a half-resolved privilege.
  const scopeInputsRef = useRef<{ uid: string; editor?: boolean; resident: ResidentState | null; residentKnown: boolean }>({ uid: "", resident: null, residentKnown: false });

  // Identity or entitlement is changing: drop everything that belonged to the
  // previous scope in this same render batch — bank, running session — so no
  // frame can show it, and open a new epoch so nothing in flight for the old
  // one can land. The bank is refetched once the new scope is known. The saved
  // draft is cleared by the identity change itself (hydrateUser), not here: a
  // same-user privilege change keeps the draft and resume reconciles it.
  const quarantineBank = useCallback(() => {
    epochRef.current++;
    bankFetchRef.current++;
    dataRef.current = [];
    setData([]);
    setSession({ ...defaultSession });
    setCurrentView("home");
    setLoading(true);
    setBankStale(true);
  }, []);

  // Stamp the cache with (user, national entitlement). A stamp change — account
  // switch in the same tab, or the admin toggling national access since the bank
  // was cached — drops the sessionStorage bank AND quarantines the in-memory one.
  // Offline, data already delivered cannot be pulled back.
  const applyBankScope = useCallback((scope: string) => {
    if (!setQuestionsCacheScope(scope)) return;
    bankSkipCacheRef.current = true;
    quarantineBank();
  }, [quarantineBank]);

  // Role and resident both known for the current generation: stamp the scope.
  // Unchanged stamp (routine token refresh, same privilege) keeps the running
  // quiz; a changed one quarantines and reloads.
  const settleScope = useCallback(() => {
    const inputs = scopeInputsRef.current;
    if (inputs.editor === undefined || !inputs.residentKnown) return;
    applyBankScope(bankScopeFor(inputs.uid, inputs.resident, inputs.editor));
    setScopeReady(true);
  }, [applyBankScope]);

  // Fail closed: a failed lookup drops the previous resident privilege and the
  // gate shows the unavailable (retry / sign-out) screen until a fresh success.
  // The scope still settles (as non-national) so an editor's bank can load.
  const loadResident = useCallback((uid: string, gen: number) =>
    fetchMyResident()
      .then((r) => {
        if (residentGenRef.current !== gen) return;
        setResident(r);
        setResidentError(null);
        setResidentResolved(true);
        scopeInputsRef.current = { ...scopeInputsRef.current, uid, resident: r, residentKnown: true };
        settleScope();
      })
      .catch((e) => {
        console.warn("Failed to load resident state:", e);
        if (residentGenRef.current !== gen) return;
        setResident(null);
        setResidentError(residentErrorMessage(e));
        setResidentResolved(true);
        scopeInputsRef.current = { ...scopeInputsRef.current, uid, resident: null, residentKnown: true };
        settleScope();
      }), [settleScope]);

  // Role lookup shared by hydration and token refresh. Fails closed: an error
  // (or an out-of-date result) leaves no admin/editor privilege behind, so a
  // stale editor bypass can never outlive the request meant to verify it.
  const loadRole = useCallback((uid: string, gen: number) =>
    supabase
      .from("admin_users")
      .select("role")
      .eq("id", uid)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (error) console.warn("Failed to load role:", error);
          return error ? null : data?.role ?? null;
        },
        (e) => {
          console.warn("Failed to load role:", e);
          return null;
        },
      )
      .then((role) => {
        if (roleGenRef.current !== gen) return;
        const userIsAdmin = role === "admin";
        const editor = role === "editor" || userIsAdmin;
        setIsAdmin(userIsAdmin);
        setIsEditor(editor);
        setRoleResolved(true);
        scopeInputsRef.current = { ...scopeInputsRef.current, uid, editor };
        settleScope();
        if (!userIsAdmin) dropEditChannel();
      }), [settleScope, dropEditChannel]);

  const clearUnapprovedPrivateState = useCallback(() => {
    // Cancel hydration branches that started before the failed approval check.
    hydrationIdRef.current++;
    residentGenRef.current++;
    roleGenRef.current++;
    invalidateQuestionsCache();
    setSavedSessionInfo(null);
    setProgress({ ...defaultProgress });
    setConfidenceMap({});
    setAttemptedQuizIds(new Set());
    setAcademyMember(null);
    setMembershipResolved(true);
    setHistoryLoaded(false);
    historyLoadedRef.current = false;
    dropEditChannel();
    setIsAdmin(false);
    setIsEditor(false);
    setRoleResolved(false);
    setResident(null);
    setResidentResolved(false);
    setScopeReady(false);
    quarantineBank();
  }, [quarantineBank, dropEditChannel]);

  // How long the gate is willing to wait on a claim before answering without it.
  // Fail-closed either way; this only bounds how long the screen may say "loading".
  const CLAIM_WAIT_MS = 8000;

  // claim_academy_membership() is what writes academy_members.user_id, and that
  // row is one of the things is_approved() reads — so on a resident's first
  // sign-in after being added to the roster the two race, the gate answers on
  // pre-claim state, and a freshly linked member sits on the "waiting for
  // approval" screen until the next reload. The claim is held in a ref rather
  // than passed in, so EVERY approval check that happens while it is open waits
  // on it — a TOKEN_REFRESHED landing inside that window used to ask without it
  // and re-open the same bug on its own generation. Re-ask once, only after a
  // claim that actually returned a membership, and still through is_approved()
  // itself: the server stays the sole authority and nothing here widens access.
  const loadApproval = useCallback(async (uid: string, gen: number) => {
    // Read before the first await, so the hydration that just started a claim
    // sees it and a later refresh (ref already cleared) sees null and pays nothing.
    const claim = pendingClaimRef.current;
    const ask = () =>
      supabase.rpc("is_approved", { _user_id: uid })
        .then(
          ({ data, error }) => !error && data === true,
          (error) => {
            console.warn("Failed to verify approval:", error);
            return false;
          },
        );
    let ok = await ask();
    // A claim that never answers must not strand the gate on "loading" forever;
    // past the bound the first (fail-closed) answer stands.
    if (!ok && claim && (await claimSettledWithin(claim, CLAIM_WAIT_MS))) ok = await ask();
    // Identity/generation guard unchanged: nothing is written unless this is
    // still the current check for the still-current user.
    if (approvalGenRef.current !== gen || userIdRef.current !== uid) return;
    setApproved(ok);
    if (!ok) clearUnapprovedPrivateState();
  }, [clearUnapprovedPrivateState]);

  // Admin edit notifications. Created only once the CURRENT approval is true
  // and the CURRENT role lookup has confirmed admin (a refresh closes both
  // gates and drops the channel before it asks), so no channel is ever live
  // while access is being re-verified.
  useEffect(() => {
    if (approved !== true || !roleResolved || !isAdmin || editChannelRef.current) return;
    const gen = notifGenRef.current;
    editChannelRef.current = supabase
      .channel("admin-edit-alerts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "question_edit_log",
        },
        async (payload) => {
          const epoch = epochRef.current;
          const dead = () => notifGenRef.current !== gen || staleEpoch(epoch);
          if (dead()) return;
          const newRow = payload.new as { editor_id?: string | null; question_id?: string | null };
          const [editorRes, questionRes] = await Promise.all([
            supabase.from("admin_users").select("email").eq("id", newRow.editor_id).maybeSingle(),
            newRow.question_id
              ? supabase.from("questions").select("topic").eq("id", newRow.question_id).maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
          if (dead()) return;
          const editorEmail = maskEmail(editorRes.data?.email) || "עורך";
          const topic = questionRes.data?.topic || "לא ידוע";
          if (dead()) return;
          toast(`✏️ שאלה נערכה`, {
            description: `שאלה: ${newRow.question_id?.slice(0, 12) ?? "—"}\nנושא: ${topic}\nנערך על ידי: ${editorEmail}`,
            duration: 6000,
          });
        },
      )
      .subscribe();
  }, [approved, roleResolved, isAdmin, notifGen, staleEpoch]);

  useEffect(() => {
    const hydrateUser = (userId: string | null) => {
      // Notifications first, on EVERY hydration: no channel may stay live, and
      // no callback it started may publish, while approval and role are being
      // re-verified — including the same-user SIGNED_IN supabase-js re-emits
      // on tab focus, which changes no identity but reopens both gates below.
      dropEditChannel();
      historyLoadedRef.current = false;
      setHistoryLoaded(false);
      const identityChanged = userIdRef.current !== userId;
      userIdRef.current = userId;
      setUserId(userId);
      const thisHydration = ++hydrationIdRef.current;
      const residentGen = ++residentGenRef.current;
      const roleGen = ++roleGenRef.current;
      const approvalGen = ++approvalGenRef.current;
      // A different account in the same tab (or sign-out) quarantines the
      // previous identity's bank, session and draft before anything of the new
      // identity resolves. A same-user re-emit keeps the in-memory session.
      if (identityChanged) {
        quarantineBank();
        setSavedSessionInfo(null);
        recommendationRef.current = null;
        setRecommendation(null);
      }
      scopeInputsRef.current = { uid: userId ?? "", resident: null, residentKnown: !residentOnboardingEnabled() };
      setScopeReady(false);
      if (userId) {
        if (identityChanged) setLoadingSavedSession(true);
        setMembershipResolved(false);
        setRoleResolved(false);
        setResident(null);
        setResidentResolved(!residentOnboardingEnabled());
        // Access gate (lockdown 2026-08-14). Same function the RLS policies use,
        // so the screen can never disagree with what the database will hand over.
        setApproved(null);
        // Started before the gate is asked so loadApproval can wait on it, and
        // published on the ref so a token refresh inside the window waits too.
        const claimed = claimAcademyMembership();
        pendingClaimRef.current = claimed;
        const clearPendingClaim = () => {
          if (pendingClaimRef.current === claimed) pendingClaimRef.current = null;
        };
        claimed.then(clearPendingClaim, clearPendingClaim);
        loadApproval(userId, approvalGen);
        fetchProgressFromSupabase(userId)
          .then((prog) => {
            if (hydrationIdRef.current === thisHydration) {
              progressRef.current = prog;
              setProgress(prog);
              historyLoadedRef.current = true;
              setHistoryLoaded(true);
            }
          })
          .catch((e) => {
            console.warn("Failed to hydrate progress from DB:", e);
            if (hydrationIdRef.current === thisHydration) setProgress({ ...defaultProgress });
          });
        // Hydrate confidence map from spaced_repetition
        supabase
          .from("spaced_repetition")
          .select("question_id, confidence")
          .eq("user_id", userId)
          .then(({ data: rows }) => {
            if (hydrationIdRef.current === thisHydration && rows) {
              const map: Record<string, string> = {};
              for (const r of rows) {
                if (r.confidence) map[r.question_id] = r.confidence;
              }
              setConfidenceMap(map);
            }
          });
        // Hydrate admin/editor role (content privilege is half of the bank scope)
        loadRole(userId, roleGen);

        // Hydrate academy membership + the pool of already-attempted questions
        claimed
          .then((m) => {
            if (hydrationIdRef.current !== thisHydration) return;
            setAcademyMember(m);
            setMembershipResolved(true);
            if (!m) return;
            fetchMyAttempts(userId)
              .then((attempts) => {
                if (hydrationIdRef.current !== thisHydration) return;
                const ids = new Set<string>();
                for (const a of attempts) for (const id of a.question_ids) ids.add(id);
                setAttemptedQuizIds(ids);
              })
              .catch((e) => console.warn("Failed to load attempted quiz questions:", e));
          })
          .catch((e) => {
            console.warn("Failed to load academy membership:", e);
            if (hydrationIdRef.current === thisHydration) setMembershipResolved(true);
          });
        // Resident identity (roster link + onboarding + national flag, read-only here).
        // Flag off: the scope settles from the role lookup alone.
        if (residentOnboardingEnabled()) loadResident(userId, residentGen);
        // Saved draft to offer for resume — per identity, guarded like the rest
        supabase
          .from("saved_sessions")
          .select("session_data")
          .eq("user_id", userId)
          .maybeSingle()
          .then(
            ({ data: saved }) => {
              if (hydrationIdRef.current !== thisHydration) return;
              if (saved?.session_data) setSavedSessionInfo(saved.session_data as unknown as SavedSessionData);
              setLoadingSavedSession(false);
            },
            (e) => {
              console.warn("Failed to check saved session:", e);
              if (hydrationIdRef.current === thisHydration) setLoadingSavedSession(false);
            },
          );
      } else {
        setProgress({ ...defaultProgress });
        setConfidenceMap({});
        setIsAdmin(false);
        setIsEditor(false);
        setAcademyMember(null);
        setAttemptedQuizIds(new Set());
        setMembershipResolved(true);
        setRoleResolved(true);
        setResident(null);
        setResidentResolved(true);
        setResidentError(null);
        setApproved(false);
        setLoading(false);
        setLoadingSavedSession(false);
        // Signed out — drop the cached question bank with the session.
        invalidateQuestionsCache();
      }
    };

    // Listen for auth changes (fires INITIAL_SESSION immediately)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
        hydrateUser(session?.user?.id ?? null);
        // INITIAL_SESSION always fires, so this is the one place that can
        // truthfully say "we now know whether anyone is logged in".
        setAuthResolved(true);
      } else if (event === "TOKEN_REFRESHED" && session?.user?.id) {
        // Privilege may have changed with the token — lightweight re-check, no
        // full re-hydration. Close the role gate BEFORE the lookup so a revoked
        // editor cannot keep the bypass while it is in flight (a failed lookup
        // leaves no privilege behind), and settle the bank scope again only
        // once role and resident are both fresh. Same privilege => same stamp
        // => the running quiz survives.
        const userId = session.user.id;
        if (userIdRef.current !== userId) return;
        // Notifications first: no channel may stay live, and no callback it
        // started may publish, while approval and role are being re-verified.
        dropEditChannel();
        // Approval can be revoked without changing role or resident state.
        // Close the outer gate before this verification; a false/error result
        // quarantines all private state, while a true result keeps this session.
        setApproved(null);
        loadApproval(userId, ++approvalGenRef.current);
        scopeInputsRef.current = { uid: userId, resident: null, residentKnown: !residentOnboardingEnabled() };
        setScopeReady(false);
        setRoleResolved(false);
        loadRole(userId, ++roleGenRef.current);
        if (residentOnboardingEnabled()) {
          // Entitlement may have changed with the token: close the gate now and
          // reopen only on a fresh, current result (a failure stays closed).
          setResidentResolved(false);
          loadResident(userId, ++residentGenRef.current);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      // Unmount (Index <-> AdminDashboard each mount their own provider): the
      // channel goes with the provider, and any callback it already started
      // is dead. No state is written here.
      killEditChannel();
    };
  }, []);

  // The one place the question bank is loaded: after the current identity's
  // scope (entitlement + content privilege) is settled and the bank was
  // quarantined. Only the newest fetch may populate it; a fetch started for a
  // previous scope is dropped.
  useEffect(() => {
    if (!userId || approved !== true || !scopeReady || !bankStale) return;
    const gen = bankFetchRef.current;
    const skipCache = bankSkipCacheRef.current;
    bankSkipCacheRef.current = false;
    setBankStale(false);
    (skipCache ? fetchQuestions(3, true) : fetchQuestions())
      .then((questions) => { if (bankFetchRef.current === gen) setData(questions); })
      .catch((e) => console.warn("Question bank fetch failed:", e))
      .finally(() => { if (bankFetchRef.current === gen) setLoading(false); });
  }, [userId, approved, scopeReady, bankStale]);

  const refreshResident = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid || !residentOnboardingEnabled()) return;
    await loadResident(uid, residentGenRef.current);
  }, [loadResident]);

  const navigate = useCallback((view: ViewId) => {
    setCurrentView(view === "srs-dashboard" ? "setup-practice" : view === "flashcards" ? "home" : view);
  }, []);

  const toggleTheme = useCallback(() => setIsDark((p) => !p), []);
  const closeWelcome = useCallback(() => {
    localStorage.setItem(WELCOME_KEY, "true");
    setShowWelcome(false);
  }, []);

  // Durable path (milestone 2). The server freezes the questions and returns the
  // attempt identity before the session opens; unknown keys are passed through
  // untouched so the server (and results screen) treat them as unscored.
  const startDurableSession = async (quiz: Question[], mode: "practice" | "exam" | "simulation", feedbackTiming: FeedbackTiming, count: number) => {
    const epoch = epochRef.current;
    const ids = quiz.map((q) => q[KEYS.ID]);
    // A simulation is a labelled exam attempt on the server (kind='simulation'): credited once at submit, never an official quiz.
    const started = mode === "simulation" ? await startSimulationAttempt(ids) : await startAttempt(mode, feedbackTiming, ids);
    requireEpoch(epoch);
    // Link the recommendation the resident acted on (tracking only, no causality claim). Failure never blocks the session.
    const rec = recommendationRef.current;
    if (rec) {
      recommendationRef.current = null;
      setRecommendation(null);
      linkRecommendation(started.attemptId, rec).catch((e) => console.error("learning_recommendation_link failed", e));
    }
    const byId = new Map(quiz.map((q) => [q[KEYS.ID], q]));
    const ordered = started.questionOrder.map((id) => byId.get(id)).filter((q): q is Question => !!q);
    setSession({
      quiz: ordered,
      index: 0,
      score: 0,
      mode,
      feedbackTiming,
      learningBaseline: historyLoadedRef.current ? captureLearningBaseline(progressRef.current.history) : undefined,
      answers: new Array(ordered.length).fill(null),
      confidence: new Array(ordered.length).fill(null),
      flagged: new Set(),
      skipped: new Set(),
      sourceFilter: "all",
      countFilter: count,
      unseenOnly: false,
      attemptId: started.attemptId,
      rootId: started.rootId,
      questionMs: new Array(ordered.length).fill(0),
    });
    setCurrentView("session");
  };

  // Legacy branch stays synchronous (callers inside act() rely on it); callers wrap with Promise.resolve(...).catch(...) for the durable branch.
  const startSession = useCallback(
    (pool: Question[], count: number, mode: SessionState["mode"], options?: SessionOptions) => {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      if (durableAttemptsEnabled() && (mode === "practice" || mode === "exam" || mode === "simulation") && !options?.quizId) {
        return startDurableSession(shuffled.slice(0, Math.min(pool.length, count)), mode, feedbackTimingFor(mode, options?.feedbackTiming), count);
      }
      const uid = userIdRef.current ?? "anon";
      const quiz = shuffled.slice(0, Math.min(pool.length, count)).map((q) => {
        const c = q[KEYS.CORRECT];
        if (!c || c === "N/A" || c.trim() === "") {
          return { ...q, [KEYS.CORRECT]: NA_OPTS[hashQidUid(q[KEYS.ID], uid)] };
        }
        return q;
      });
      setSession({
        quiz,
        index: 0,
        score: 0,
        mode,
        feedbackTiming: feedbackTimingFor(mode, options?.feedbackTiming),
        learningBaseline: historyLoadedRef.current ? captureLearningBaseline(progressRef.current.history) : undefined,
        answers: new Array(quiz.length).fill(null),
        confidence: new Array(quiz.length).fill(null),
        flagged: new Set(),
        skipped: new Set(),
        sourceFilter: "all",
        countFilter: count,
        unseenOnly: false,
        quizId: options?.quizId,
      });
      setCurrentView("session");
    },
    [],
  );

  const recordSessionTime = useCallback((totalActiveMs: number) => {
    setSession((prev) => ({ ...prev, totalActiveMs }));
  }, []);

  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const recommendationRef = useRef<Recommendation | null>(null);
  const openRecommendation = useCallback((rec: Recommendation) => {
    recommendationRef.current = rec;
    setRecommendation(rec);
    resetFilters();
    setCurrentView(rec.setup.mode === "practice" ? "setup-practice" : "setup-exam");
  }, []);
  const clearRecommendation = useCallback(() => {
    recommendationRef.current = null;
    setRecommendation(null);
  }, []);

  const setAnswer = useCallback((index: number, answer: string) => {
    setSession((prev) => {
      const answers = [...prev.answers];
      answers[index] = answer;
      const skipped = new Set(prev.skipped);
      skipped.delete(index);
      const confidence = prev.answers[index] === answer ? prev.confidence : prev.confidence.map((value, i) => i === index ? null : value);
      return { ...prev, answers, skipped, confidence };
    });
  }, []);

  const setSessionIndex = useCallback((index: number) => {
    setSession((prev) => ({ ...prev, index }));
  }, []);

  const toggleFlag = useCallback((index: number) => {
    setSession((prev) => {
      const flagged = new Set(prev.flagged);
      if (flagged.has(index)) flagged.delete(index);
      else flagged.add(index);
      return { ...prev, flagged };
    });
  }, []);

  const skipQuestion = useCallback((index: number) => {
    setSession((prev) => {
      const skipped = new Set(prev.skipped);
      skipped.add(index);
      return { ...prev, skipped };
    });
  }, []);

  // updateHistory: optimistic local update + fire-and-forget Supabase write
  const applyLocalHistory = useCallback((id: string, isCorrect: boolean) => {
    setProgress((prev) => {
      const history = { ...prev.history };
      if (!history[id]) history[id] = { answered: 0, correct: 0, lastResult: null, everWrong: false, timestamp: 0 };
      const h = { ...history[id] };
      h.answered++;
      if (isCorrect) h.correct++;
      if (!isCorrect) h.everWrong = true;
      h.lastResult = isCorrect ? "correct" : "wrong";
      h.timestamp = Date.now();
      history[id] = h;
      return { ...prev, history };
    });
  }, []);

  const updateHistory = useCallback((id: string, isCorrect: boolean, topic?: string) => {
    applyLocalHistory(id, isCorrect);

    // Fire-and-forget DB write — atomic increment via RPC (prevents race conditions)
    const userId = userIdRef.current;
    if (userId) {
      const epoch = epochRef.current;
      (async () => {
        const { error } = await supabase.rpc("increment_user_answer", {
          p_user_id: userId,
          p_question_id: id,
          p_is_correct: isCorrect,
          // `|| null`, not `?? null`: the RPC guards with COALESCE, which stops
          // NULL but not "". An empty topic used to overwrite a good one - 1,733
          // history rows were blanked this way before it was caught.
          p_topic: topic || null,
        });

        // The write was A's; its failure is not B's to see.
        if (error && !staleEpoch(epoch)) {
          console.error("user_answers increment error:", error);
          toast.error("שגיאה בשמירת התקדמות");
        }
      })();

      // answer_history is populated automatically by the DB trigger
      // trg_sync_answer_history on user_answers — no manual insert needed
    }
  }, [applyLocalHistory, staleEpoch]);

  // ── Durable attempts (milestone 2) ──────────────────────────────────────
  // These never touch updateHistory/updateSpacedRepetition: the server writes
  // user_answers/answer_history/spaced_repetition itself. The local mirror of
  // progress.history only follows what the server reported.
  const confirmAnswer = useCallback(async (index: number, level: ConfidenceLevel, answerMs: number) => {
    const current = sessionRef.current;
    const q = current.quiz[index];
    const selected = current.answers[index];
    if (!current.attemptId || !q || !selected) throw new Error("INVALID_INPUT");
    const epoch = epochRef.current;
    const result = await confirmAttemptAnswer(current.attemptId, q[KEYS.ID], selected, level, answerMs);
    requireEpoch(epoch);
    setSession((prev) => {
      if (staleEpoch(epoch)) return prev;
      const confidence = [...prev.confidence];
      confidence[index] = level;
      const questionMs = [...(prev.questionMs ?? new Array(prev.quiz.length).fill(0))];
      questionMs[index] = answerMs;
      // A resumed read strips key/explanation; an immediate-mode confirm hands them back.
      // The key is merged only when the server has one (unscored questions have none);
      // the explanation is merged whenever it arrives, so an unkeyed question still shows it.
      const quiz = prev.quiz.map((item, i) => i !== index ? item : {
        ...item,
        ...(result.correctKey !== null ? { [KEYS.CORRECT]: result.correctKey } : {}),
        [KEYS.EXPLANATION]: result.explanation ?? item[KEYS.EXPLANATION],
      });
      return { ...prev, confidence, questionMs, quiz };
    });
    setConfidenceMap((prev) => (staleEpoch(epoch) ? prev : { ...prev, [q[KEYS.ID]]: level }));
    if (current.mode === "practice" && result.isCorrect !== null) applyLocalHistory(q[KEYS.ID], result.isCorrect);
  }, [applyLocalHistory, requireEpoch, staleEpoch]);

  const finishAttempt = useCallback(async (totalActiveMs: number) => {
    const current = sessionRef.current;
    if (!current.attemptId) throw new Error("INVALID_INPUT");
    const epoch = epochRef.current;
    // Submit once. A stored result means the server already accepted it (retry after a failed results read).
    // ATTEMPT_NOT_OPEN on submit means an earlier submit landed: the server copy is the result.
    let result: AttemptResult | undefined = current.attemptResult;
    if (!result) {
      try { result = await submitAttempt(current.attemptId, totalActiveMs); }
      catch (err) {
        requireEpoch(epoch);
        if ((err as Error).message !== "ATTEMPT_NOT_OPEN") throw err;
        const read = await readAttempt(current.attemptId);
        requireEpoch(epoch);
        if (read.status !== "submitted") throw err;
        result = { ...read, questions: read.questions.map((q) => ({ questionId: q.questionId, isCorrect: q.isCorrect })) };
      }
      requireEpoch(epoch);
      const accepted = result;
      setSession((prev) => (staleEpoch(epoch) ? prev : { ...prev, attemptResult: accepted }));
      if (current.mode === "exam") {
        accepted.questions?.forEach(({ questionId, isCorrect }) => { if (isCorrect !== null) applyLocalHistory(questionId, isCorrect); });
      }
    }
    // A resumed in-progress read strips keys/explanations; the post-submit read reveals them.
    let revealed: AttemptRead;
    try { revealed = await readAttempt(current.attemptId); }
    catch { requireEpoch(epoch); throw new Error(RESULTS_READ_FAILED); }
    requireEpoch(epoch);
    const byId = new Map(revealed.questions.map((q) => [q.questionId, snapshotToQuestion({ id: q.questionId, ...q.snapshot })]));
    setSession((prev) => (staleEpoch(epoch) ? prev : { ...prev, quiz: prev.quiz.map((q) => byId.get(q[KEYS.ID]) ?? q) }));
    return result;
  }, [applyLocalHistory, requireEpoch, staleEpoch]);

  const abandonCurrentAttempt = useCallback(async () => {
    const attemptId = sessionRef.current.attemptId;
    if (attemptId) await abandonAttempt(attemptId);
  }, []);

  // Rejects (never returns false) when the identity changed underneath: a false
  // return means "this attempt is closed" and makes the caller delete the draft —
  // which would now be the NEXT account's draft.
  const openAttempt = useCallback(async (attemptId: string, draft?: SavedSessionData) => {
    const epoch = epochRef.current;
    const read = await readAttempt(attemptId);
    requireEpoch(epoch);
    if (read.status !== "in_progress") return false;
    setSession(sessionFromAttempt(read, draft && draft.attemptId === attemptId ? draft : undefined));
    setCurrentView("session");
    return true;
  }, [requireEpoch]);

  const startRepeat = useCallback(async (rootId: string, feedbackTiming: FeedbackTiming) => {
    const epoch = epochRef.current;
    const started = await repeatAttempt(rootId, feedbackTiming);
    requireEpoch(epoch);
    await openAttempt(started.attemptId);
  }, [openAttempt, requireEpoch]);

  const setConfidence = useCallback((index: number, level: ConfidenceLevel) => {
    setSession((prev) => {
      const confidence = [...prev.confidence];
      confidence[index] = level;
      return { ...prev, confidence };
    });
  }, []);

  const updateSpacedRepetition = useCallback(
    async (questionId: string, isCorrect: boolean, confidence: ConfidenceLevel, topic?: string) => {
      const userId = userIdRef.current;
      if (!userId) {
        console.warn("updateSpacedRepetition called without userId — SRS update skipped");
        return;
      }

      const epoch = epochRef.current;
      // Fetch existing SM-2 state
      const { data: existing } = await supabase
        .from("spaced_repetition")
        .select("interval_days, ease_factor, repetitions")
        .eq("user_id", userId)
        .eq("question_id", questionId)
        .maybeSingle();
      // Identity changed while reading: the upsert below would go out under
      // the new account's auth. Stop here; callers do not catch.
      if (staleEpoch(epoch)) return;

      let interval = existing?.interval_days ?? 1;
      let ease = existing?.ease_factor ?? 2.5;
      let reps = existing?.repetitions ?? 0;

      if (!isCorrect || confidence === "guessed") {
        interval = 1;
        ease = Math.max(1.3, ease - 0.2);
        reps = 0;
      } else if (confidence === "hesitant") {
        // SM-2 ramp with penalty: guesses/hesitations come back sooner
        if (reps === 0) interval = 1;
        else if (reps === 1) interval = 3;
        else interval = Math.max(1, Math.min(365, Math.round(interval * 1.2)));
        ease = Math.max(1.3, ease - 0.05);
        reps++;
      } else {
        // Confident: standard SM-2 progression (1 → 6 → prev×ease)
        if (reps === 0) interval = 1;
        else if (reps === 1) interval = 6;
        else interval = Math.max(1, Math.min(365, Math.round(interval * ease)));
        ease = Math.min(4.0, ease + 0.1);
        reps++;
      }

      const nextReviewDate = addDaysIsrael(getIsraelToday(), interval);

      const payload: SrsUpsertPayload = {
        user_id: userId,
        question_id: questionId,
        next_review_date: nextReviewDate,
        confidence,
        last_correct: isCorrect,
        updated_at: new Date().toISOString(),
        interval_days: interval,
        ease_factor: ease,
        repetitions: reps,
      };

      try {
        await upsertSpacedRepetitionRecord(supabase, payload);
        // Keep local confidenceMap in sync
        setConfidenceMap((prev) => (staleEpoch(epoch) ? prev : { ...prev, [questionId]: confidence }));
      } catch (error) {
        if (staleEpoch(epoch)) return;
        console.error("spaced_repetition upsert error:", error);
        toast.error("שגיאה בשמירת נתוני חזרה מרווחת");
        throw error;
      }
      // answer_history insert is now handled by updateHistory — no duplicate here
    },
    [staleEpoch],
  );

  const markForReview = useCallback(async (questionId: string, topic?: string) => {
    const userId = userIdRef.current;
    if (!userId) return;

    // Update local progress state (count as wrong)
    setProgress((prev) => {
      const history = { ...prev.history };
      if (!history[questionId])
        history[questionId] = { answered: 0, correct: 0, lastResult: null, everWrong: false, timestamp: 0 };
      const h = { ...history[questionId] };
      h.answered++;
      h.everWrong = true;
      h.lastResult = "wrong";
      h.timestamp = Date.now();
      history[questionId] = h;
      return { ...prev, history };
    });

    // Route through the same atomic RPC that updateHistory uses so
    // user_answers stays in sync. The trg_sync_answer_history trigger
    // populates answer_history automatically. The previous flagged_for_review
    // flag is intentionally dropped (verified zero readers in frontend, edge
    // functions, and DB objects).
    // 3.9: this runs BEFORE the spaced_repetition write, like every other call
    // site — the DB stamp trigger (trg_stamp_answer_history_confidence) copies
    // the confidence onto the history row that already exists; SRS-first would
    // leave this row unstamped, or stamp an older row of the same question.
    const epoch = epochRef.current;
    const { error: incError } = await supabase.rpc(
      "increment_user_answer",
      buildMarkForReviewIncrementArgs(userId, questionId, topic),
    );
    // Identity changed: nothing further is sent or shown for the old account.
    if (staleEpoch(epoch)) return;

    // Reset SRS
    const { data: existing } = await supabase
      .from("spaced_repetition")
      .select("ease_factor")
      .eq("user_id", userId)
      .eq("question_id", questionId)
      .maybeSingle();
    if (staleEpoch(epoch)) return;

    const ease = Math.max(1.3, (existing?.ease_factor ?? 2.5) - 0.2);
    const nextReviewDate = addDaysIsrael(getIsraelToday(), 1);

    const { error: srsError } = await supabase.from("spaced_repetition").upsert(
      {
        user_id: userId,
        question_id: questionId,
        interval_days: 1,
        ease_factor: ease,
        repetitions: 0,
        next_review_date: nextReviewDate,
        confidence: "guessed",
        last_correct: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,question_id" },
    );
    if (staleEpoch(epoch)) return;

    if (srsError) {
      console.error("markForReview: spaced_repetition upsert failed", srsError);
      toast.error("שמירת הסימון נכשלה — נסה שוב");
      return;
    }

    setConfidenceMap((prev) => ({ ...prev, [questionId]: "guessed" }));

    if (incError) {
      console.error("markForReview: increment_user_answer RPC failed", incError);
      // SRS row was saved — the question WILL come back tomorrow.
      // Only the answered-count update failed, which is non-blocking. Surface
      // a single toast that tells the user the SRS scheduling succeeded but
      // the count update did not, instead of stacking a misleading success
      // toast on top of the error.
      toast.error("השאלה תחזור מחר 🔁 — אך עדכון ספירת התשובות נכשל");
      return;
    }

    toast.success("שאלה תחזור מחר לחזרה 🔁");
  }, [staleEpoch]);

  // ── Optimistic mutators with rollback (fixes B5 #1–#5) ──────────────
  // Each: snapshot prior state → apply locally → persist → rollback on failure.
  // Pre-fix bug: bare `.then()` swallowed RLS/network errors silently; UI
  // diverged from DB and the user lost data on next reload.

  const toggleFavorite = useCallback((id: string) => {
    let snapshot: string[] = [];
    let willInsert = true;
    setProgress((prev) => {
      snapshot = prev.favorites;
      willInsert = !prev.favorites.includes(id);
      const favorites = willInsert ? [...prev.favorites, id] : prev.favorites.filter((x) => x !== id);
      return { ...prev, favorites };
    });
    const userId = userIdRef.current;
    if (!userId) return;
    const epoch = epochRef.current;
    void persistOptimistic({
      applyLocal: () => {},
      dbCall: () =>
        willInsert
          ? supabase.from("user_favorites").insert({ user_id: userId, question_id: id })
          : supabase.from("user_favorites").delete().eq("user_id", userId).eq("question_id", id),
      rollback: () => setProgress((prev) => (staleEpoch(epoch) ? prev : { ...prev, favorites: snapshot })),
      errorLabel: "שמירת המועדף נכשלה",
    });
  }, [staleEpoch]);

  const saveNote = useCallback((id: string, text: string) => {
    let snapshot: Record<string, string> = {};
    const isDelete = !text.trim();
    setProgress((prev) => {
      snapshot = prev.notes;
      const notes = { ...prev.notes };
      if (isDelete) delete notes[id];
      else notes[id] = text;
      return { ...prev, notes };
    });
    const userId = userIdRef.current;
    if (!userId) return;
    const epoch = epochRef.current;
    void persistOptimistic({
      applyLocal: () => {},
      dbCall: () =>
        isDelete
          ? supabase.from("user_notes").delete().eq("user_id", userId).eq("question_id", id)
          : supabase
              .from("user_notes")
              .upsert(
                { user_id: userId, question_id: id, note_text: text, updated_at: new Date().toISOString() },
                { onConflict: "user_id,question_id" },
              ),
      rollback: () => setProgress((prev) => (staleEpoch(epoch) ? prev : { ...prev, notes: snapshot })),
      errorLabel: "שמירת ההערה נכשלה",
    });
  }, [staleEpoch]);

  const deleteNote = useCallback((id: string) => {
    let snapshot: Record<string, string> = {};
    setProgress((prev) => {
      snapshot = prev.notes;
      const notes = { ...prev.notes };
      delete notes[id];
      return { ...prev, notes };
    });
    const userId = userIdRef.current;
    if (!userId) return;
    const epoch = epochRef.current;
    void persistOptimistic({
      applyLocal: () => {},
      dbCall: () => supabase.from("user_notes").delete().eq("user_id", userId).eq("question_id", id),
      rollback: () => setProgress((prev) => (staleEpoch(epoch) ? prev : { ...prev, notes: snapshot })),
      errorLabel: "מחיקת ההערה נכשלה",
    });
  }, [staleEpoch]);

  const setRating = useCallback((id: string, level: "easy" | "medium" | "hard") => {
    let snapshot: Record<string, "easy" | "medium" | "hard"> = {};
    setProgress((prev) => {
      snapshot = prev.ratings;
      return { ...prev, ratings: { ...prev.ratings, [id]: level } };
    });
    const userId = userIdRef.current;
    if (!userId) return;
    const epoch = epochRef.current;
    void persistOptimistic({
      applyLocal: () => {},
      dbCall: () =>
        supabase
          .from("user_ratings")
          .upsert(
            { user_id: userId, question_id: id, rating: level, updated_at: new Date().toISOString() },
            { onConflict: "user_id,question_id" },
          ),
      rollback: () => setProgress((prev) => (staleEpoch(epoch) ? prev : { ...prev, ratings: snapshot })),
      errorLabel: "שמירת הדירוג נכשלה",
    });
  }, [staleEpoch]);

  const addTag = useCallback((id: string, tag: string) => {
    let snapshot: Record<string, string[]> = {};
    let didMutate = false;
    setProgress((prev) => {
      snapshot = prev.tags;
      const existing = prev.tags[id] ?? [];
      // Compare trimmed: " ards" and "ards" are the same tag to a reader, and
      // the dedupe is the only thing standing between them and two rows.
      if (existing.some((t) => t.trim() === tag.trim())) return prev; // no-op, no DB call
      didMutate = true;
      return { ...prev, tags: { ...prev.tags, [id]: [...existing, tag] } };
    });
    const userId = userIdRef.current;
    if (!userId || !didMutate) return;
    const epoch = epochRef.current;
    void persistOptimistic({
      applyLocal: () => {},
      dbCall: () => supabase.from("user_tags").insert({ user_id: userId, question_id: id, tag }),
      rollback: () => setProgress((prev) => (staleEpoch(epoch) ? prev : { ...prev, tags: snapshot })),
      errorLabel: "הוספת התגית נכשלה",
    });
  }, [staleEpoch]);

  const removeTag = useCallback((id: string, tag: string) => {
    let snapshot: Record<string, string[]> = {};
    let didMutate = false;
    setProgress((prev) => {
      snapshot = prev.tags;
      const existing = prev.tags[id];
      if (!existing || !existing.includes(tag)) return prev;
      didMutate = true;
      const tags = { ...prev.tags };
      const filtered = existing.filter((t) => t !== tag);
      if (filtered.length === 0) delete tags[id];
      else tags[id] = filtered;
      return { ...prev, tags };
    });
    const userId = userIdRef.current;
    if (!userId || !didMutate) return;
    const epoch = epochRef.current;
    void persistOptimistic({
      applyLocal: () => {},
      dbCall: () => supabase.from("user_tags").delete().eq("user_id", userId).eq("question_id", id).eq("tag", tag),
      rollback: () => setProgress((prev) => (staleEpoch(epoch) ? prev : { ...prev, tags: snapshot })),
      errorLabel: "מחיקת התגית נכשלה",
    });
  }, [staleEpoch]);

  const resetAllData = useCallback(async () => {
    setProgress({ ...defaultProgress });

    const userId = userIdRef.current;
    if (userId) {
      await Promise.all([
        supabase.from("user_answers").delete().eq("user_id", userId),
        supabase.from("user_favorites").delete().eq("user_id", userId),
        supabase.from("user_notes").delete().eq("user_id", userId),
        supabase.from("user_ratings").delete().eq("user_id", userId),
        supabase.from("user_tags").delete().eq("user_id", userId),
        supabase.from("spaced_repetition").delete().eq("user_id", userId),
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
    // Identity changed mid-restore: stop before the next batch goes out under
    // the new account's auth. Batches already sent were authorised for `userId`.
    const epoch = epochRef.current;
    const guardIdentity = () => {
      if (staleEpoch(epoch)) throw new Error("החשבון התחלף במהלך השחזור — השחזור הופסק");
    };

    // Every write below is checked and every failure is collected. Until
    // 2026-08-09 all five results were discarded, so a restore that Postgres
    // rejected still reported "loaded successfully" and the user lost the data
    // without ever seeing an error.
    const failures: string[] = [];
    const check = (label: string, error: { message: string } | null) => {
      if (error) failures.push(`${label}: ${error.message}`);
    };

    // Batch write to Supabase
    // History -> user_answers
    const answerRows = Object.entries(newProgress.history).map(([qid, h]) => ({
      user_id: userId,
      question_id: qid,
      is_correct: h.lastResult === "correct",
      answered_count: h.answered,
      correct_count: h.correct,
      ever_wrong: h.everWrong,
      // Backups exported before `timestamp` existed carry undefined here, and
      // new Date(undefined).toISOString() throws RangeError - which aborted the
      // whole restore before a single row was written.
      updated_at: Number.isFinite(h.timestamp) ? new Date(h.timestamp).toISOString() : new Date().toISOString(),
    }));
    if (answerRows.length) {
      // Batch in chunks of 500
      for (let i = 0; i < answerRows.length; i += 500) {
        const { error } = await supabase
          .from("user_answers")
          .upsert(answerRows.slice(i, i + 500), { onConflict: "user_id,question_id" });
        guardIdentity();
        check("היסטוריית תשובות", error);
      }
    }

    // Favorites
    if (newProgress.favorites.length) {
      const favRows = newProgress.favorites.map((qid) => ({ user_id: userId, question_id: qid }));
      const { error } = await supabase
        .from("user_favorites")
        .upsert(favRows, { onConflict: "user_id,question_id" });
      guardIdentity();
      check("מועדפים", error);
    }

    // Notes
    const noteEntries = Object.entries(newProgress.notes);
    if (noteEntries.length) {
      const noteRows = noteEntries.map(([qid, text]) => ({
        user_id: userId,
        question_id: qid,
        note_text: text,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("user_notes")
        .upsert(noteRows, { onConflict: "user_id,question_id" });
      guardIdentity();
      check("הערות", error);
    }

    // Ratings
    const ratingEntries = Object.entries(newProgress.ratings);
    if (ratingEntries.length) {
      const ratingRows = ratingEntries.map(([qid, rating]) => ({
        user_id: userId,
        question_id: qid,
        rating,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase
        .from("user_ratings")
        .upsert(ratingRows, { onConflict: "user_id,question_id" });
      guardIdentity();
      check("דירוגים", error);
    }

    // Tags
    const tagRows: { user_id: string; question_id: string; tag: string }[] = [];
    Object.entries(newProgress.tags).forEach(([qid, tags]) => {
      tags.forEach((tag) => tagRows.push({ user_id: userId, question_id: qid, tag }));
    });
    if (tagRows.length) {
      const { error } = await supabase
        .from("user_tags")
        .upsert(tagRows, { onConflict: "user_id,question_id,tag" });
      guardIdentity();
      check("תגיות", error);
    }

    // Throw so the caller cannot report success over a partial restore.
    if (failures.length) {
      throw new Error("חלק מהנתונים לא נשמרו — " + failures.join(" | "));
    }
  }, [staleEpoch]);

  const toggleMultiSelect = useCallback((type: keyof MultiSelectState, value: string) => {
    setMultiSelect((prev) => {
      const newSet = new Set(prev[type]);
      if (value === "all") {
        newSet.clear();
        newSet.add("all");
      } else {
        if (newSet.has("all")) newSet.delete("all");
        if (newSet.has(value)) newSet.delete(value);
        else newSet.add(value);
        if (newSet.size === 0) newSet.add("all");
      }
      return { ...prev, [type]: newSet };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setMultiSelect({
      topic: new Set(["all"]),
      year: new Set(["all"]),
      kind: new Set(["all"]),
      institution: new Set(["all"]),
      confidence: new Set(["all"]),
      usertags: new Set(["all"]),
    });
    setSession((prev) => ({ ...prev, sourceFilter: "all", unseenOnly: false }));
  }, []);

  const setSourceFilter = useCallback((source: SessionState["sourceFilter"]) => {
    setSession((prev) => ({ ...prev, sourceFilter: source }));
  }, []);

  const toggleUnseenOnly = useCallback(() => {
    setSession((prev) => ({ ...prev, unseenOnly: !prev.unseenOnly }));
  }, []);

  const getFilteredQuestions = useCallback((serial?: string, textSearch?: string): Question[] => {
    const d = visibleDataRef.current;
    const p = progressRef.current;
    const s = sessionRef.current;
    const ms = multiSelectRef.current;
    const cm = confidenceMapRef.current;

    let pool = [...d];

    if (s.sourceFilter === "mistakes") pool = pool.filter((q) => p.history[q[KEYS.ID]]?.lastResult === "wrong");
    else if (s.sourceFilter === "fixed")
      pool = pool.filter((q) => p.history[q[KEYS.ID]]?.everWrong && p.history[q[KEYS.ID]]?.lastResult === "correct");
    else if (s.sourceFilter === "favorites") pool = pool.filter((q) => p.favorites.includes(q[KEYS.ID]));

    if (s.unseenOnly) pool = pool.filter((q) => !p.history[q[KEYS.ID]]);

    if (!ms.topic.has("all")) pool = pool.filter((q) => ms.topic.has(q[KEYS.TOPIC]));
    if (!ms.year.has("all")) pool = pool.filter((q) => ms.year.has(q[KEYS.YEAR]));
    if (!ms.kind.has("all")) pool = pool.filter((q) => ms.kind.has(q[KEYS.KIND]));
    if (!ms.institution.has("all")) pool = pool.filter((q) => ms.institution.has(q[KEYS.SOURCE]));
    if (!ms.confidence.has("all"))
      pool = pool.filter((q) => {
        const c = cm[q[KEYS.ID]];
        return c ? ms.confidence.has(c) : false;
      });
    if (!ms.usertags.has("all"))
      pool = pool.filter((q) => {
        const t = p.tags[q[KEYS.ID]] || [];
        return t.some((tag) => ms.usertags.has(tag));
      });

    if (serial) pool = pool.filter((q) => q[KEYS.ID] === serial);
    if (textSearch) {
      const lower = textSearch.toLowerCase();
      pool = pool.filter(
        (q) =>
          q[KEYS.QUESTION].toLowerCase().includes(lower) ||
          (q[KEYS.EXPLANATION] && q[KEYS.EXPLANATION].toLowerCase().includes(lower)),
      );
    }

    return pool;
  }, []); // stable — always reads latest state via refs

  const getDueQuestions = useCallback(async (): Promise<Question[]> => {
    const userId = userIdRef.current;
    if (!userId) return [];

    const today = getIsraelToday();
    const DAILY_SRS_CAP = 40;
    const epoch = epochRef.current;

    // fetchAllRows paginates past the 1000-row default limit; most overdue first
    const dueRows = await fetchAllRows<{ question_id: string; next_review_date: string }>(() =>
      supabase
        .from("spaced_repetition")
        .select("question_id, next_review_date")
        .eq("user_id", userId)
        .lte("next_review_date", today)
        .order("next_review_date", { ascending: true }),
    );
    // Old account's due list must not seed the new account's session.
    if (staleEpoch(epoch)) return [];

    const cappedRows = dueRows.slice(0, DAILY_SRS_CAP);
    if (cappedRows.length === 0) return [];
    const dueIds = new Set(cappedRows.map((r) => r.question_id));

    // Prefer in-memory cache when available
    let matched = visibleDataRef.current.filter((q) => dueIds.has(q[KEYS.ID]));

    // Fallback eliminates the race when questions haven't finished loading
    if (matched.length === 0) {
      const all = await fetchQuestions();
      if (staleEpoch(epoch)) return [];
      const pool = academyOnlyRef.current ? all.filter((q) => attemptedQuizIdsRef.current.has(q[KEYS.ID])) : all;
      matched = pool.filter((q) => dueIds.has(q[KEYS.ID]));
    }

    return matched;
  }, [staleEpoch]);

  // Resolves questions from the RAW bank regardless of the academy pool
  // projection — a quiz must always be able to resolve its own questions.
  const getQuestionsByIds = useCallback((ids: string[]): Question[] => {
    const byId = new Map(dataRef.current.map((q) => [q[KEYS.ID], q]));
    return ids.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q));
  }, []);

  // Immutably merges newly-submitted quiz question ids into the academy
  // practice pool so they're selectable immediately after submit.
  const registerAttemptedQuestions = useCallback((ids: string[]) => {
    setAttemptedQuizIds((prev) => new Set([...prev, ...ids]));
  }, []);

  const fetchSrsData = useCallback(async (): Promise<Record<string, SrsRecord>> => {
    const userId = userIdRef.current;
    if (!userId) return {};

    const epoch = epochRef.current;
    const rows = await fetchAllRows<SrsRow>(() =>
      supabase
        .from("spaced_repetition")
        .select("question_id, next_review_date, interval_days, ease_factor, repetitions, confidence, last_correct")
        .eq("user_id", userId),
    );
    if (staleEpoch(epoch)) return {};

    return buildSrsRecordMap(rows);
  }, [staleEpoch]);

  /** Invalidate question cache and re-fetch fresh data from DB */
  const invalidateQuestions = useCallback(async () => {
    const epoch = epochRef.current;
    invalidateQuestionsCache();
    const questions = await fetchQuestions(3, true);
    // Fetched under the previous account: the quarantine already emptied the
    // bank and scheduled the new account's load — never publish this one.
    if (staleEpoch(epoch)) return;
    setData(questions);
  }, [staleEpoch]);

  const sessionWritesRef = useRef<Promise<void>>(Promise.resolve());

  const saveSessionToDb = useCallback((timerSeconds?: number, simTimerSeconds?: number, questionMs?: number[]) => {
    const userId = userIdRef.current;
    if (!userId) return Promise.reject(new Error("יש להתחבר מחדש כדי לשמור את המפגש"));

    const currentSession = sessionRef.current;
    if (!currentSession.quiz.length) return Promise.resolve();

    const sessionData: SavedSessionData = {
      questionIds: currentSession.quiz.map((q) => q[KEYS.ID]),
      index: currentSession.index,
      mode: currentSession.mode,
      feedbackTiming: feedbackTimingFor(currentSession.mode, currentSession.feedbackTiming),
      learningBaseline: currentSession.learningBaseline,
      answers: currentSession.answers,
      confidence: currentSession.confidence,
      flagged: Array.from(currentSession.flagged),
      skipped: Array.from(currentSession.skipped),
      quizId: currentSession.quizId,
      timerSeconds,
      simTimerSeconds,
      createdAt: new Date().toISOString(),
      attemptId: currentSession.attemptId,
      rootId: currentSession.rootId,
      questionMs: questionMs ?? currentSession.questionMs,
    };

    // Captured at call time: a save queued behind an in-flight one must not
    // run under the next account, and a result landing after the switch must
    // not become the next account's draft.
    const epoch = epochRef.current;
    const write = sessionWritesRef.current.catch(() => undefined).then(async () => {
      requireEpoch(epoch);
      const { error: saveError } = await supabase.from("saved_sessions").upsert(
        {
          user_id: userId,
          session_data: sessionData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

      requireEpoch(epoch);
      if (saveError) {
        console.error("saveSessionToDb: upsert failed", saveError);
        toast.error("שמירת הסשן נכשלה — התקדמות עלולה להאבד");
        throw saveError;
      }

      setSavedSessionInfo(sessionData);
    });
    sessionWritesRef.current = write;
    return write;
  }, [requireEpoch]);

  const clearSavedSession = useCallback(() => {
    const userId = userIdRef.current;
    const epoch = epochRef.current;
    const write = sessionWritesRef.current.catch(() => undefined).then(async () => {
      // Queued behind a save that outlived the account: deleting now would
      // remove the NEXT account's draft.
      requireEpoch(epoch);
      if (!userId) throw new Error("יש להתחבר מחדש כדי למחוק את המפגש");
      const { error } = await supabase.from("saved_sessions").delete().eq("user_id", userId);
      requireEpoch(epoch);
      if (error) throw error;
      setSavedSessionInfo(null);
    });
    sessionWritesRef.current = write;
    return write;
  }, [requireEpoch]);

  const resumeSessionFromDb = useCallback(async (): Promise<boolean> => {
    if (!savedSessionInfo) return false;
    if (savedSessionInfo.attemptId) {
      // The server copy is the source of truth; a draft for a submitted or
      // abandoned attempt is stale and must not reopen it.
      if (await openAttempt(savedSessionInfo.attemptId, savedSessionInfo)) return true;
      toast.error("המפגש השמור כבר הוגש או נסגר, ולכן אי אפשר להמשיך אותו.");
      await clearSavedSession();
      return false;
    }
    if (!dataRef.current.length) return false;

    const questionMap = new Map(dataRef.current.map((q) => [q[KEYS.ID], q]));

    // בנה map של תשובות וconfidence לפי ID (לא לפי index).
    // כך, אם שאלה נמחקה מה-DB מאז השמירה, שאר התשובות לא יחרגו ממיקומן.
    const savedIds = savedSessionInfo.questionIds;
    const answersById: Record<string, string | null> = {};
    const confidenceById: Record<string, ConfidenceLevel | null> = {};
    savedIds.forEach((id, i) => {
      answersById[id] = savedSessionInfo.answers[i] ?? null;
      confidenceById[id] = savedSessionInfo.confidence[i] ?? null;
    });

    const reconciled = reconcileSavedQuestions(savedIds, questionMap, savedSessionInfo.mode);
    // Missing questions (deleted, or national access revoked since the save):
    // an exam is refused rather than scored as a shorter paper; practice goes
    // on with what is left. The draft stays until the user discards it.
    if (!reconciled.ok) { toast.error(reconciled.message ?? ""); return false; }
    if (reconciled.message) toast.warning(reconciled.message);
    const quiz = reconciled.quiz;

    const answers = quiz.map((q) => answersById[q[KEYS.ID]] ?? null);
    const confidence = quiz.map((q) => confidenceById[q[KEYS.ID]] ?? null);
    const validIndex = Math.min(savedSessionInfo.index, quiz.length - 1);

    setSession({
      quiz,
      index: validIndex,
      score: 0,
      mode: savedSessionInfo.mode,
      feedbackTiming: feedbackTimingFor(savedSessionInfo.mode, savedSessionInfo.feedbackTiming),
      learningBaseline: savedSessionInfo.learningBaseline,
      answers,
      confidence,
      flagged: new Set(savedSessionInfo.flagged),
      skipped: new Set(savedSessionInfo.skipped),
      sourceFilter: "all",
      countFilter: quiz.length,
      unseenOnly: false,
      quizId: savedSessionInfo.quizId,
      resumedTimerSeconds: savedSessionInfo.timerSeconds,
      resumedSimTimerSeconds: savedSessionInfo.simTimerSeconds,
    });
    setCurrentView("session");

    // Resuming is not completion: retain the server draft until a successful
    // finish or an explicit discard, including across a reload/offline exit.
    return true;
  }, [savedSessionInfo, openAttempt, clearSavedSession]);

  const updateQuizQuestion = useCallback((index: number, fields: Partial<Question>) => {
    setSession((prev) => ({
      ...prev,
      quiz: prev.quiz.map((q, i) => (i === index ? { ...q, ...fields } : q)),
    }));
  }, []);

  const value: AppContextType = {
    data: visibleData,
    loading,
    progress,
    historyLoaded,
    session,
    multiSelect,
    confidenceMap,
    currentView,
    isDark,
    showWelcome,
    isAdmin,
    isEditor,
    academyMember,
    academyOnly,
    membershipResolved,
    roleResolved,
    resident,
    residentResolved,
    residentError,
    refreshResident,
    userId,
    authResolved,
    approved,
    registerAttemptedQuestions,
    invalidateQuestions,
    navigate,
    toggleTheme,
    closeWelcome,
    startSession,
    confirmAnswer,
    finishAttempt,
    recordSessionTime,
    recommendation,
    openRecommendation,
    clearRecommendation,
    abandonCurrentAttempt,
    startRepeat,
    openAttempt,
    setAnswer,
    setConfidence,
    setSessionIndex,
    toggleFlag,
    skipQuestion,
    updateHistory,
    updateSpacedRepetition,
    markForReview,
    toggleFavorite,
    saveNote,
    deleteNote,
    setRating,
    addTag,
    removeTag,
    resetAllData,
    importData,
    toggleMultiSelect,
    resetFilters,
    setSourceFilter,
    toggleUnseenOnly,
    updateQuizQuestion,
    getFilteredQuestions,
    getDueQuestions,
    getQuestionsByIds,
    fetchSrsData,
    saveSessionToDb,
    resumeSessionFromDb,
    clearSavedSession,
    savedSessionInfo,
    loadingSavedSession,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
