// Versioned curriculum config (migration 20260908000002). Residents read the
// approved version; content admins draft new immutable versions; only the
// editorial owner (worker B's single row) can publish one exact version.
import { supabase } from '@/integrations/supabase/client';
import type { CurriculumChapter, CurriculumConfig } from '@/lib/curriculumPlan';

export type CurriculumVersionRow = { version: string; status: string; createdAt: string; approvedAt: string | null; chapterCount: number; contentHash: string | null };
/** Server-computed sha256 of the exact chapter list; publish is refused unless it still matches. */
export type HashedConfig = CurriculumConfig & { contentHash: string | null };
export type CurriculumConfigState = {
  approved: HashedConfig | null;
  /** Full config for content admins and the owner; residents only see version + status. */
  draft: HashedConfig | { version: string; status: string } | null;
  canEdit: boolean;
  canPublish: boolean;
  versions: CurriculumVersionRow[];
};
export type CurriculumSource = { path?: string; sha256?: string; description?: string };

export const CURRICULUM_ERROR_CODES = ['NOT_AUTHENTICATED', 'NOT_APPROVED', 'NOT_ADMIN', 'NOT_OWNER', 'INVALID_INPUT', 'DUPLICATE_VERSION', 'VERSION_NOT_FOUND', 'STALE_CONFIG', 'NOT_CONFIGURED'] as const;
const HEBREW: Record<string, string> = {
  NOT_AUTHENTICATED: 'יש להתחבר מחדש כדי להמשיך.',
  NOT_APPROVED: 'החשבון עדיין לא אושר.',
  NOT_ADMIN: 'שמירת טיוטה זמינה למנהלי תוכן בלבד.',
  NOT_OWNER: 'פרסום גרסת ליבה שמור לבעלים העריכתי בלבד.',
  INVALID_INPUT: 'הגרסה או רשימת הפרקים אינן תקינות.',
  DUPLICATE_VERSION: 'כבר קיימת גרסה בשם הזה. גרסאות אינן ניתנות לשינוי — בחרו שם חדש.',
  VERSION_NOT_FOUND: 'הגרסה לא נמצאה.',
  STALE_CONFIG: 'התצורה השתנתה מאז שנטענה (גרסה פעילה או תוכן טיוטה). רעננו, בדקו שוב ואז פרסמו.',
  NOT_CONFIGURED: 'אין עדיין גרסת ליבה מאושרת.',
};
export const curriculumErrorMessage = (error: unknown): string =>
  HEBREW[error instanceof Error ? error.message : ''] ?? 'הפעולה לא הושלמה בשרת. בדקו את החיבור ונסו שוב.';

const toError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  return new Error(CURRICULUM_ERROR_CODES.find(c => message.includes(c)) ?? 'CURRICULUM_UNAVAILABLE');
};
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(name, args);
    if (error) throw error;
    return data as T;
  } catch (error) {
    throw toError(error);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapConfig = (c: any): HashedConfig => ({
  version: String(c.version),
  contentHash: typeof c.content_hash === 'string' ? c.content_hash : null,
  status: String(c.status ?? 'draft'),
  chapters: Array.isArray(c.chapters) ? c.chapters.map((ch: { chapter: number; title: string }) => ({ id: Number(ch.chapter), title: String(ch.title) })) : [],
  ...(c.source ? { source: c.source } : {}),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapState = (r: any): CurriculumConfigState => ({
  approved: r.approved ? mapConfig(r.approved) : null,
  draft: r.draft ? (Array.isArray(r.draft.chapters) ? mapConfig(r.draft) : { version: String(r.draft.version), status: String(r.draft.status) }) : null,
  canEdit: !!r.can_edit,
  canPublish: !!r.can_publish,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  versions: Array.isArray(r.versions) ? r.versions.map((v: any) => ({ version: String(v.version), status: String(v.status), createdAt: v.created_at, approvedAt: v.approved_at ?? null, chapterCount: Number(v.chapter_count ?? 0), contentHash: typeof v.content_hash === 'string' ? v.content_hash : null })) : [],
});

export const fetchCurriculumConfig = () => rpc<unknown>('curriculum_config_read', {}).then(mapState);

export const saveCurriculumDraft = (version: string, chapters: readonly CurriculumChapter[], source: CurriculumSource | null) =>
  rpc<unknown>('curriculum_draft_save', {
    _version: version.trim(),
    _chapters: chapters.map(c => ({ chapter: c.id, title: c.title })),
    _source: source,
  }).then(mapConfig);

/**
 * Atomic compare-and-set publish: the server replaces the active version only if
 * `expectedActive` is still the active version AND `expectedHash` still matches the
 * exact stored chapters of `version`. Anything else → STALE_CONFIG, nothing changes.
 */
export const publishCurriculumVersion = (version: string, expectedActive: string | null, expectedHash: string | null) =>
  expectedHash
    ? rpc<unknown>('curriculum_publish', { _version: version, _expected_active: expectedActive, _expected_hash: expectedHash }).then(mapConfig)
    : Promise.reject(new Error('STALE_CONFIG'));

/** Accepts the CORE-CANDIDATE shape ({chapters:[{chapter,title}]}) or the engine shape ({chapters:[{id,title}]}). Nothing else. */
export function parseCurriculumImport(text: string): { chapters: CurriculumChapter[]; description?: string } | { error: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { error: 'הקובץ אינו JSON תקין.' }; }
  const raw = (parsed as { chapters?: unknown })?.chapters;
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'נדרש מערך chapters עם פרק אחד לפחות.' };
  const chapters: CurriculumChapter[] = [];
  for (const item of raw as { chapter?: unknown; id?: unknown; title?: unknown }[]) {
    const id = Number(item?.chapter ?? item?.id);
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    if (!Number.isInteger(id) || id < 1 || !title) return { error: `פרק לא תקין: ${JSON.stringify(item)}` };
    chapters.push({ id, title });
  }
  if (new Set(chapters.map(c => c.id)).size !== chapters.length) return { error: 'מספר פרק חוזר יותר מפעם אחת.' };
  const description = (parsed as { source_description?: unknown }).source_description;
  return { chapters, ...(typeof description === 'string' ? { description } : {}) };
}

export async function sha256Hex(text: string): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
