export const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRLqVYyyxd2HTiccI520BEhLE29HV0G6BVUkDyKnXNvCJ_c41WZBGJyfLcbGTeRGZr8k2-Uq0VukZg2/pub?gid=1958019419&single=true&output=csv";

export const LS_KEY = 'anesthesia_app_v5';
export const WELCOME_KEY = 'seen_welcome_v2';

export const KEYS = {
  ID: 'id',
  REF_ID: 'ref_id',
  QUESTION: 'question',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  CORRECT: 'correct',
  EXPLANATION: 'explanation',
  TOPIC: 'topic',
  YEAR: 'year',
  SOURCE: 'source',
  MILLER: 'miller',
  CHAPTER: 'chapter',
  MEDIA_TYPE: 'media_type',
  MEDIA_LINK: 'media_link',
  KIND: 'kind',
} as const;

export type Question = {
  [KEYS.ID]: string;
  [KEYS.REF_ID]: string;
  [KEYS.QUESTION]: string;
  [KEYS.A]: string;
  [KEYS.B]: string;
  [KEYS.C]: string;
  [KEYS.D]: string;
  [KEYS.CORRECT]: string;
  [KEYS.EXPLANATION]: string;
  [KEYS.TOPIC]: string;
  [KEYS.YEAR]: string;
  [KEYS.SOURCE]: string;
  [KEYS.MILLER]: string;
  [KEYS.CHAPTER]: number;
  [KEYS.MEDIA_TYPE]: string;
  [KEYS.MEDIA_LINK]: string;
  [KEYS.KIND]: string;
};

export type HistoryEntry = {
  answered: number;
  correct: number;
  lastResult: 'correct' | 'wrong' | null;
  everWrong: boolean;
  timestamp: number;
};

export type UserProgress = {
  history: Record<string, HistoryEntry>;
  notes: Record<string, string>;
  favorites: string[];
  ratings: Record<string, 'easy' | 'medium' | 'hard'>;
  tags: Record<string, string[]>;
};

export type SessionMode = 'practice' | 'exam' | 'review' | 'simulation';
export type FeedbackTiming = 'immediate' | 'end';
export type SessionOptions = { quizId?: string; feedbackTiming?: FeedbackTiming };
export type LearningBaseline = { lastResults: Record<string, HistoryEntry['lastResult']> };

export type ConfidenceLevel = 'confident' | 'hesitant' | 'guessed';

export type SessionState = {
  quiz: Question[];
  index: number;
  score: number;
  mode: SessionMode;
  /** Absent in legacy drafts: practice defaults to immediate, exam to end. */
  feedbackTiming?: FeedbackTiming;
  /** Learning state before this session; absent in older saved drafts. */
  learningBaseline?: LearningBaseline;
  answers: (string | null)[];
  confidence: (ConfidenceLevel | null)[];
  flagged: Set<number>;
  skipped: Set<number>;
  sourceFilter: 'all' | 'mistakes' | 'fixed' | 'favorites';
  countFilter: number;
  unseenOnly: boolean;
  /** Set when this session is an academy quiz — submit routes to quiz_attempts */
  quizId?: string;
  /** Timer values restored when resuming a saved session */
  resumedTimerSeconds?: number;
  resumedSimTimerSeconds?: number;
  /** Durable attempt (milestone 2, VITE_DURABLE_ATTEMPTS): server-side identity and provenance. */
  attemptId?: string;
  rootId?: string;
  /** Active answering time per question, in ms, same order as quiz. */
  questionMs?: number[];
  /** Server-authoritative result once the attempt was submitted. */
  attemptResult?: AttemptResultSummary;
  /** Active time recorded at submit for paths without a durable result (Academy quiz, legacy). Never a limit. */
  totalActiveMs?: number;
};

export type AttemptResultSummary = {
  attemptId: string; rootId: string; status: 'in_progress' | 'submitted' | 'abandoned';
  correctCount: number | null; scoredCount: number | null; answeredCount: number | null; totalCount: number;
  quarter: string | null; submittedAt: string | null; totalActiveMs: number | null;
  kind?: 'simulation' | null; recommendationId?: string | null;
};

export type MultiSelectState = {
  topic: Set<string>;
  year: Set<string>;
  kind: Set<string>;
  institution: Set<string>;
  confidence: Set<string>;
  usertags: Set<string>;
};

export type ViewId = 'home' | 'setup-practice' | 'setup-exam' | 'session' | 'review' | 'results' | 'stats' | 'notebook' | 'simulation-results' | 'flashcards' | 'formula-sheet' | 'summaries' | 'miller-guide' | 'srs-dashboard' | 'academy' | 'archive';
