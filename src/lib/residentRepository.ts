// Client wrappers for the resident identity / national-entitlement RPCs
// (migration 20260907000002). The server owns linking, roster validation and
// the national toggle; this file only maps shapes and error codes. It never
// writes academy_members directly and never sends anything that could
// look like an entitlement from the client.
import { supabase } from '@/integrations/supabase/client';

export type UnlinkedReason = 'NOT_ON_ROSTER' | 'EMAIL_ALREADY_LINKED' | 'EMAIL_NOT_VERIFIED' | 'NOT_LINKED';
export type ResidentMember = {
  id: string; email: string; fullName: string | null; accessLevel: 'academy' | 'full'; status: 'active' | 'suspended';
  residencyYear: number | null; examThisYear: boolean; examDate: string | null;
  /** Admin-only toggle, read-only here. */
  nationalAccess: boolean; onboardingCompletedAt: string | null; linkedAt: string | null;
};
export type ResidentState = { linked: boolean; reason: UnlinkedReason | null; member: ResidentMember | null };
export type OnboardingInput = { residencyYear: number; examDate: string | null; examThisYear: boolean };
/**
 * One parsed roster line. `null` means the line said NOTHING about that field,
 * which is not the same as an explicit answer: the server leaves an omitted
 * field on the stored member alone, so a partial e-mail-only re-import cannot
 * erase a year or an exam intention that was recorded earlier.
 */
export type RosterRow = { name: string; email: string; residencyYear: number | null; examThisYear: boolean | null };
export type RosterRejection = { row: number; reason: string };
export type RosterResult = { applied: boolean; inserted: number; updated: number; rejected: RosterRejection[] };
export type NationalAccessChange = { memberId: string; nationalAccess: boolean; setAt: string; setBy: string };

export const RESIDENT_ERROR_CODES = [
  'NOT_AUTHENTICATED', 'NOT_ADMIN', 'NOT_MEMBER', 'MEMBER_NOT_FOUND', 'INVALID_INPUT',
  'NOT_ON_ROSTER', 'EMAIL_ALREADY_LINKED', 'EMAIL_NOT_VERIFIED', 'NOT_LINKED',
] as const;
export const RESIDENCY_YEARS = [1, 2, 3, 4, 5, 6, 7] as const;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROSTER_MAX_ROWS = 500;

const HEBREW: Record<string, string> = {
  NOT_AUTHENTICATED: 'יש להתחבר מחדש כדי להמשיך.',
  NOT_ADMIN: 'הפעולה הזו זמינה למנהל בלבד.',
  NOT_MEMBER: 'החשבון עדיין לא מקושר לרשימת המתמחים.',
  MEMBER_NOT_FOUND: 'המתמחה לא נמצא ברשימה.',
  INVALID_INPUT: 'הנתונים שהוזנו אינם תקינים.',
  NOT_ON_ROSTER: 'כתובת המייל שלך לא נמצאת ברשימת המתמחים. פנו למנהל.',
  EMAIL_ALREADY_LINKED: 'כתובת המייל הזו כבר מקושרת לחשבון אחר.',
  EMAIL_NOT_VERIFIED: 'נדרש אימות של כתובת המייל (כניסה עם Google או אישור המייל) לפני הקישור.',
  NOT_LINKED: 'החשבון עדיין לא קושר. נסו להתחבר מחדש.',
};
export const residentErrorMessage = (error: unknown): string =>
  HEBREW[error instanceof Error ? error.message : ''] ?? 'הפעולה לא הושלמה בשרת. בדקו את החיבור ונסו שוב.';

const toError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  const code = RESIDENT_ERROR_CODES.find(c => message.includes(c));
  return new Error(code ?? 'RESIDENT_UNAVAILABLE');
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
const mapMember = (m: any): ResidentMember => ({
  id: m.id, email: m.email, fullName: m.full_name ?? null, accessLevel: m.access_level, status: m.status,
  residencyYear: m.residency_year ?? null, examThisYear: !!m.exam_this_year, examDate: m.exam_date ?? null,
  nationalAccess: !!m.national_access, onboardingCompletedAt: m.onboarding_completed_at ?? null, linkedAt: m.linked_at ?? null,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapState = (r: any): ResidentState => ({ linked: !!r.linked, reason: r.reason ?? null, member: r.member ? mapMember(r.member) : null });

export const fetchMyResident = () => rpc<unknown>('resident_me', {}).then(mapState);

export const completeMyOnboarding = async (input: OnboardingInput): Promise<ResidentState> => {
  if (!RESIDENCY_YEARS.includes(input.residencyYear as (typeof RESIDENCY_YEARS)[number])) throw new Error('INVALID_INPUT');
  return rpc<unknown>('complete_my_onboarding', { _residency_year: input.residencyYear, _exam_date: input.examDate, _exam_this_year: input.examThisYear }).then(mapState);
};

export const setMemberNationalAccess = (memberId: string, enabled: boolean) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc<any>('set_member_national_access', { _member_id: memberId, _enabled: enabled })
    .then((r): NationalAccessChange => ({ memberId: r.member_id, nationalAccess: !!r.national_access, setAt: r.national_access_set_at, setBy: r.national_access_set_by }));

// Leaving a key out is how the server is told "keep whatever you already have"
// (migration 20260908000004). A key that is present with a null value is not the
// same thing: for `residency_year` it is merely redundant, but a row that
// carries `residency_year` while omitting `exam_this_year` is rejected as
// INVALID_EXAM_FLAG. So a field with no answer is left out of the row entirely.
const rosterPayload = (row: RosterRow) => ({
  name: row.name,
  email: row.email,
  ...(row.residencyYear === null ? {} : { residency_year: row.residencyYear }),
  ...(row.examThisYear === null ? {} : { exam_this_year: row.examThisYear }),
});

export const upsertResidentRoster = async (rows: RosterRow[]): Promise<RosterResult> => {
  if (rows.length === 0 || rows.length > ROSTER_MAX_ROWS) throw new Error('INVALID_INPUT');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await rpc<any>('upsert_resident_roster', { _rows: rows.map(rosterPayload) });
  return { applied: !!r.applied, inserted: r.inserted ?? 0, updated: r.updated ?? 0, rejected: Array.isArray(r.rejected) ? r.rejected : [] };
};

const normalizeEmail = (raw: string) => raw.trim().toLowerCase();
const normalizeHeader = (raw: string) => raw.replace(/^\uFEFF/, '').trim().replace(/\s+/g, ' ').toLowerCase();
/** `null` = blank cell, i.e. no answer given; `undefined` = an answer that could not be read. */
const parseFlag = (raw: string): boolean | null | undefined => {
  const value = raw.trim().toLowerCase();
  if (['true', 'yes', '1', 'כן'].includes(value)) return true;
  if (['false', 'no', '0', 'לא'].includes(value)) return false;
  return value === '' ? null : undefined;
};
const HEBREW_RESIDENCY_YEAR: Record<string, number> = {
  ראשונה: 1, שניה: 2, שנייה: 2, שלישית: 3, רביעית: 4, חמישית: 5, שישית: 6, שביעית: 7,
};
const parseResidencyYear = (raw: string): number | null | undefined => {
  const value = raw.trim();
  if (!value) return null;
  if (/^[1-7]$/.test(value)) return Number(value);
  return HEBREW_RESIDENCY_YEAR[value];
};

type RosterColumns = { name: number; email: number; residencyYear: number | null; examThisYear: number; width: number };
const ENGLISH_HEADERS = ['name', 'email', 'exam_this_year'];
const HEBREW_HEADERS = ['שם מלא', 'אימייל', 'שלב בהתמחות ( מספיק שנה)', 'מתכננים לגשת לשלב א׳ השנה?'];

const rosterColumns = (cells: string[]): RosterColumns | 'invalid' | null => {
  const headers = cells.map(normalizeHeader);
  const looksLikeHeader = headers.some((header) => [...ENGLISH_HEADERS, ...HEBREW_HEADERS].includes(header));
  if (!looksLikeHeader) return null;
  const expected = headers.includes('אימייל') ? HEBREW_HEADERS : ENGLISH_HEADERS;
  if (headers.length !== expected.length || expected.some((header) => headers.filter((value) => value === header).length !== 1)) return 'invalid';
  return {
    name: headers.indexOf(expected[0]),
    email: headers.indexOf(expected[1]),
    residencyYear: expected === HEBREW_HEADERS ? headers.indexOf(expected[2]) : null,
    examThisYear: headers.indexOf(expected[expected.length - 1]),
    width: expected.length,
  };
};

/** Pure CSV → roster rows. Supports the named Hebrew four-column sheet, legacy English three-column input, or a bare e-mail per line. */
export function parseRosterCsv(text: string): { rows: RosterRow[]; rejected: { line: number; reason: string }[] } {
  const lines = text.split(/\r?\n/);
  const rows: RosterRow[] = []; const rejected: { line: number; reason: string }[] = []; const seen = new Set<string>();
  const first = lines.findIndex((line) => line.trim());
  const firstCells = first < 0 ? [] : lines[first].split(',').map(c => c.trim());
  const columns = rosterColumns(firstCells);
  if (columns === 'invalid') return { rows, rejected: [{ line: first + 1, reason: 'INVALID_HEADER' }] };
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(',').map(c => c.trim());
    if (columns && i === first) return;
    if ((columns && cells.length !== columns.width) || (!columns && cells.length !== 1 && cells.length !== 3)) {
      rejected.push({ line: i + 1, reason: 'INVALID_COLUMN_COUNT' }); return;
    }
    const name = cells.length === 1 ? '' : cells[columns ? columns.name : 0];
    const email = cells.length === 1 ? cells[0] : cells[columns ? columns.email : 1];
    const year = parseResidencyYear(columns?.residencyYear == null ? '' : cells[columns.residencyYear] ?? '');
    const flag = parseFlag(cells.length === 1 ? '' : cells[columns ? columns.examThisYear : 2] ?? '');
    // The named Hebrew sheet asks the exam question outright, so a blank there is
    // a filling-in mistake and stays rejected. Legacy input never asked it, so a
    // blank there is silence, and silence is carried through as "no answer".
    const flagRequired = columns?.residencyYear != null;
    const normalized = normalizeEmail(email ?? '');
    const reason = !EMAIL_RE.test(normalized) ? 'INVALID_EMAIL'
      : year === undefined ? 'INVALID_RESIDENCY_YEAR'
      : flag === undefined || (flagRequired && flag === null) ? 'INVALID_EXAM_FLAG'
      : seen.has(normalized) ? 'DUPLICATE_IN_FILE' : null;
    if (reason) { rejected.push({ line: i + 1, reason }); return; }
    seen.add(normalized);
    rows.push({ name: name ?? '', email: normalized, residencyYear: year, examThisYear: flag });
  });
  return { rows, rejected };
}
