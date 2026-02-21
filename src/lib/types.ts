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
  plan: WeeklyDay[] | null;
  ratings: Record<string, 'easy' | 'medium' | 'hard'>;
  tags: Record<string, string[]>;
};

export type WeeklyDay = {
  day: string;
  focus: string;
  type: 'weak' | 'new' | 'rest';
};

export type SessionMode = 'practice' | 'exam' | 'review' | 'simulation';

export type ConfidenceLevel = 'confident' | 'hesitant' | 'guessed';

export type SessionState = {
  quiz: Question[];
  index: number;
  score: number;
  mode: SessionMode;
  answers: (string | null)[];
  confidence: (ConfidenceLevel | null)[];
  flagged: Set<number>;
  skipped: Set<number>;
  sourceFilter: 'all' | 'mistakes' | 'fixed' | 'favorites';
  countFilter: number;
  unseenOnly: boolean;
};

export type MultiSelectState = {
  topic: Set<string>;
  year: Set<string>;
  kind: Set<string>;
  institution: Set<string>;
  difficulty: Set<string>;
  usertags: Set<string>;
};

export type ViewId = 'home' | 'setup-practice' | 'setup-exam' | 'session' | 'review' | 'results' | 'stats' | 'notebook' | 'weekly-plan' | 'ai-coach' | 'simulation-results' | 'flashcards';
