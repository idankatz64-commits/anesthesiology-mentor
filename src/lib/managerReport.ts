// דוח ביצועים למנהל התוכנית — שכבת הנתונים והלוגיקה (v1, 1.9.2026).
// הנתונים מגיעים משלוש פונקציות SECURITY DEFINER עם שער-אדמין פנימי (מיגרציית manager_dashboard_v1).
// עקרון: הכשרה-לא-הערכה — הסטטוסים הם איתותי ליווי ("כדאי לשים לב"), לא דירוג.

import { supabase } from "@/integrations/supabase/client";
import { isDemo } from "@/lib/demoMode";
import { cohort, demoBankSize, type DemoResident } from "@/lib/demoCohort";

export interface OverviewRow {
  user_id: string;
  display_name: string;
  residency_year: number | null;
  is_academy_member: boolean;
  is_staff: boolean;
  answered_total: number;
  coverage: number;
  current_correct: number;
  qs_last30: number;
  correct_last30: number;
  qs_prev30: number;
  correct_prev30: number;
  last_active: string | null;
}

export interface CohortChapterRow {
  chapter: number;
  topic: string;
  seen: number;
  current_correct: number;
}

export interface MemberChapterRow {
  chapter: number;
  topic: string;
  seen: number;
  current_correct: number;
  answered_total: number;
  first_seen: number;
  first_correct: number;
}

export interface DailyRow {
  day: string; // YYYY-MM-DD, כבר בשעון ישראל (ה-RPC ממיר)
  user_id: string;
  answered: number;
  correct: number;
}

export interface RepetitionRow {
  times_answered: number; // 1..5, כאשר 5 = "5 ומעלה"
  questions: number;
  correct: number;
}

export interface SeriesPoint {
  day: string;
  answered: number;
  /** null ביום בלי מענים — "לא ידוע", לא "0% הצלחה" */
  accuracy: number | null;
}

/** חלון התצוגה של הגרף: מספר ימים, או כל ההיסטוריה */
export type RangeKey = 7 | 30 | 90 | "all";

export type ResidentStatusKind = "active" | "steady" | "attention" | "inactive";

/** דיוק על המצב העדכני (התשובה האחרונה לכל שאלה) — ההגדרה שנפסקה 30.8 */
export function accuracyPct(correct: number, seen: number): number | null {
  if (!seen) return null;
  return Math.round((100 * correct) / seen);
}

/** קצב שבועי משוער מתוך חלון 30 הימים (30/7 ≈ 4.3 שבועות) */
export function weeklyRate(qsLast30: number): number {
  return Math.round(qsLast30 / 4.3);
}

/** אחוז כיסוי מאגר */
export function coveragePct(coverage: number, bankSize: number): number {
  return bankSize ? Math.round((100 * coverage) / bankSize) : 0;
}

/** דלתא של דיוק: 30 הימים האחרונים מול 30 שקדמו להם; null כשאין נתונים באחד הצדדים */
export function trendDelta(r: OverviewRow): number | null {
  if (!r.qs_last30 || !r.qs_prev30) return null;
  const last = (100 * r.correct_last30) / r.qs_last30;
  const prev = (100 * r.correct_prev30) / r.qs_prev30;
  const d = last - prev;
  // עיגול חצי-הרחק-מאפס: 4.5- חייב להישאר 5- כדי לא לפספס את סף האיתות
  return Math.sign(d) * Math.round(Math.abs(d));
}

const ATTENTION_TREND = -5;
const ATTENTION_IDLE_DAYS = 14;
const INACTIVE_DAYS = 30;

/**
 * איתות ליווי. "לא פעיל" נבדק ראשון בכוונה (פסיקת עידן 2.9): כשכל מי ששקט
 * נצבע "כדאי לשים לב", הסטטוס נדלק אצל 100% מהמחזור ומפסיק להעביר מידע.
 * הפרדת השקט לסטטוס משלו מחזירה ל"כדאי לשים לב" את משמעותו —
 * מתמחה שכן מתרגל ובכל זאת יורד.
 */
export function residentStatus(r: OverviewRow, now: Date): ResidentStatusKind {
  const idleDays = r.last_active ? (now.getTime() - new Date(r.last_active).getTime()) / 86400000 : Infinity;
  if (idleDays >= INACTIVE_DAYS) return "inactive";
  const delta = trendDelta(r);
  if (delta !== null && delta <= ATTENTION_TREND) return "attention";
  if (idleDays >= ATTENTION_IDLE_DAYS) return "attention";
  if (r.qs_last30 > 0) return "active";
  return "steady";
}

/* ─────────── סדרת זמן ─────────── */

const DAY_MS = 86400000;
/** צהריים-UTC: מנטרל הזזות של שעון קיץ בחישוב "יום ועוד יום" */
const dayToMs = (day: string) => Date.parse(`${day}T12:00:00Z`);
const msToDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const todayInIsrael = (now: Date) => now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

/**
 * מקבץ שורות יומיות לסדרה רציפה לגרף.
 * ימים שקטים נשארים בסדרה עם answered=0 ו-accuracy=null — קו שנקטע במקום
 * שנופל ל-0%, כי "לא ענו" ו-"ענו והכל שגוי" הם לא אותו דבר.
 */
export function seriesForRange(rows: DailyRow[], range: RangeKey, userId: string | null, now: Date): SeriesPoint[] {
  const mine = userId ? rows.filter((r) => r.user_id === userId) : rows;
  const lastDay = todayInIsrael(now);

  let firstDay: string;
  if (range === "all") {
    if (mine.length === 0) return [];
    firstDay = mine.reduce((min, r) => (r.day < min ? r.day : min), mine[0].day);
  } else {
    firstDay = msToDay(dayToMs(lastDay) - (range - 1) * DAY_MS);
  }

  const byDay = new Map<string, { answered: number; correct: number }>();
  for (const r of mine) {
    if (r.day < firstDay || r.day > lastDay) continue;
    const acc = byDay.get(r.day) ?? { answered: 0, correct: 0 };
    acc.answered += r.answered;
    acc.correct += r.correct;
    byDay.set(r.day, acc);
  }

  const out: SeriesPoint[] = [];
  for (let ms = dayToMs(firstDay); ms <= dayToMs(lastDay); ms += DAY_MS) {
    const day = msToDay(ms);
    const hit = byDay.get(day);
    out.push({
      day,
      answered: hit?.answered ?? 0,
      accuracy: hit && hit.answered > 0 ? Math.round((100 * hit.correct) / hit.answered) : null,
    });
  }
  return out;
}

/** הפער בין חשיפה ראשונה לשאלות שחזרו עליהן — כמה החזרה מוסיפה, בנקודות */
export function repetitionLift(rows: RepetitionRow[]): {
  first: number | null;
  last: number | null;
  lift: number | null;
} {
  const pct = (r: RepetitionRow) => (r.questions ? Math.round((100 * r.correct) / r.questions) : null);
  const firstRow = rows.find((r) => r.times_answered === 1);
  const lastRow = rows.reduce<RepetitionRow | null>(
    (max, r) => (max === null || r.times_answered > max.times_answered ? r : max),
    null,
  );
  const first = firstRow ? pct(firstRow) : null;
  const last = lastRow ? pct(lastRow) : null;
  return { first, last, lift: first !== null && last !== null ? last - first : null };
}

const WEAKNESS_MIN_FIRST = 20;
const WEAKNESS_THRESHOLD = 0.7;

/** כלל החולשות שנפסק 1.9: הצלחה בחשיפות ראשונות < 70% על לפחות 20 חשיפות בפרק */
export function chapterWeaknesses(rows: MemberChapterRow[]): MemberChapterRow[] {
  return rows
    .filter((r) => r.first_seen >= WEAKNESS_MIN_FIRST && r.first_correct / r.first_seen < WEAKNESS_THRESHOLD)
    .sort((a, b) => a.first_correct / a.first_seen - b.first_correct / b.first_seen);
}

/** סיכום מילולי אוטומטי — מבוסס חוקים, לא AI. שפת הדוח: he/en */
export function buildResidentSummary(
  r: OverviewRow,
  chapters: MemberChapterRow[],
  bankSize: number,
  lang: "he" | "en",
): string {
  const acc = accuracyPct(r.current_correct, r.coverage);
  const coverage = coveragePct(r.coverage, bankSize);
  const rated = chapters.filter((c) => c.seen >= 10);
  const byAcc = [...rated].sort((a, b) => b.current_correct / b.seen - a.current_correct / a.seen);
  const strongest = byAcc[0];
  const last = byAcc.length > 1 ? byAcc[byAcc.length - 1] : undefined;
  // ממליצים על חיזוק רק כשבאמת יש חולשה — לא כשהפרק "החלש" בעצמו מעל 75%
  const weakest = last && accuracyPct(last.current_correct, last.seen)! < 75 ? last : undefined;
  const weekly = weeklyRate(r.qs_last30);
  const delta = trendDelta(r);

  if (lang === "en") {
    const parts: string[] = [];
    parts.push(
      acc === null
        ? "No practice activity recorded yet."
        : `Overall accuracy ${acc}% on the current state (${coverage}% bank coverage).`,
    );
    if (strongest)
      parts.push(`Strongest in ${strongest.topic} (${accuracyPct(strongest.current_correct, strongest.seen)}%).`);
    if (weakest && weakest !== strongest)
      parts.push(
        `Would benefit from focused review of ${weakest.topic} (${accuracyPct(weakest.current_correct, weakest.seen)}%).`,
      );
    parts.push(`Engagement: ~${weekly} questions/week.`);
    if (delta !== null && delta <= ATTENTION_TREND)
      parts.push("Activity trend dipped — a brief check-in is suggested.");
    return parts.join(" ");
  }

  const parts: string[] = [];
  parts.push(
    acc === null ? "עדיין לא נרשמה פעילות תרגול." : `דיוק כולל ${acc}% על המצב העדכני (כיסוי מאגר ${coverage}%).`,
  );
  if (strongest)
    parts.push(`הכי חזק ב-${strongest.topic} (${accuracyPct(strongest.current_correct, strongest.seen)}%).`);
  if (weakest && weakest !== strongest)
    parts.push(`כדאי חיזוק ממוקד ב-${weakest.topic} (${accuracyPct(weakest.current_correct, weakest.seen)}%).`);
  parts.push(`מעורבות: ~${weekly} שאלות בשבוע.`);
  if (delta !== null && delta <= ATTENTION_TREND) parts.push("המגמה ירדה לאחרונה — מומלצת שיחת צ'ק-אין קצרה.");
  return parts.join(" ");
}

/* ─────────── שכבת הדמו ───────────
   כשהדמו דולק אף שליפה לא יוצאת ל-DB. השער יושב כאן, בשכבת הנתונים, ולא
   ברכיבי התצוגה — כך מסך חדש מקבל את ההגנה בלי שמישהו יזכור להוסיף אותה. */

const dayMinus = (n: number) =>
  new Date(Date.now() - n * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

function demoOverview(): OverviewRow[] {
  const last30 = dayMinus(30);
  const prev30 = dayMinus(60);
  return cohort().map((d) => {
    const sum = (f: (c: DemoResident["chapters"][number]) => number) => d.chapters.reduce((s, c) => s + f(c), 0);
    const win = (from: string, to: string) =>
      d.daily
        .filter((x) => x.day > from && x.day <= to)
        .reduce((a, x) => ({ q: a.q + x.answered, c: a.c + x.correct }), { q: 0, c: 0 });
    const recent = win(last30, dayMinus(-1));
    const before = win(prev30, last30);
    const lastDay = d.daily.length ? d.daily[d.daily.length - 1].day : null;
    return {
      user_id: d.user_id,
      display_name: d.display_name,
      residency_year: d.residency_year,
      is_academy_member: true,
      is_staff: false,
      answered_total: sum((c) => c.answered_total),
      coverage: sum((c) => c.seen),
      current_correct: sum((c) => c.current_correct),
      qs_last30: recent.q,
      correct_last30: recent.c,
      qs_prev30: before.q,
      correct_prev30: before.c,
      last_active: lastDay ? new Date(`${lastDay}T12:00:00Z`).toISOString() : null,
    };
  });
}

function demoCohortChapters(): CohortChapterRow[] {
  const byChapter = new Map<number, CohortChapterRow>();
  for (const d of cohort()) {
    for (const c of d.chapters) {
      const hit = byChapter.get(c.chapter) ?? { chapter: c.chapter, topic: c.topic, seen: 0, current_correct: 0 };
      hit.seen += c.seen;
      hit.current_correct += c.current_correct;
      byChapter.set(c.chapter, hit);
    }
  }
  return [...byChapter.values()];
}

function demoMemberChapters(userId: string): MemberChapterRow[] {
  return cohort().find((d) => d.user_id === userId)?.chapters ?? [];
}

function demoDaily(): DailyRow[] {
  return cohort().flatMap((d) => d.daily.map((x) => ({ ...x, user_id: d.user_id })));
}

/** הסולם נגזר מהחשיפה-הראשונה ומהמצב-העדכני של אותו מחזור, כדי שלא יסתור אותם */
function demoRepetition(userId: string | null): RepetitionRow[] {
  const src = userId ? cohort().filter((d) => d.user_id === userId) : cohort();
  const chapters = src.flatMap((d) => d.chapters);
  const firstSeen = chapters.reduce((s, c) => s + c.first_seen, 0) || 1;
  const first = chapters.reduce((s, c) => s + c.first_correct, 0) / firstSeen;
  const seen = chapters.reduce((s, c) => s + c.seen, 0) || 1;
  const current = chapters.reduce((s, c) => s + c.current_correct, 0) / seen;
  const top = Math.min(0.97, current + 0.05);
  return [1, 2, 3, 4, 5].map((times) => {
    const t = (times - 1) / 4;
    const acc = first + (top - first) * t;
    const questions = Math.round((seen * (0.44 - 0.07 * (times - 1))) / 1);
    return { times_answered: times, questions, correct: Math.round(questions * acc) };
  });
}

/* ─────────── fetchers ─────────── */

/* eslint-disable @typescript-eslint/no-explicit-any -- the manager_* RPCs are newer than the generated types */
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);
const notesTable = () => (supabase.from as any)("manager_notes");

export async function fetchOverview(): Promise<OverviewRow[]> {
  if (isDemo()) return demoOverview();
  const { data, error } = await rpc("manager_cohort_overview");
  if (error) throw error;
  return (data ?? []) as OverviewRow[];
}

export async function fetchCohortChapters(): Promise<CohortChapterRow[]> {
  if (isDemo()) return demoCohortChapters();
  const { data, error } = await rpc("manager_cohort_chapters");
  if (error) throw error;
  return (data ?? []) as CohortChapterRow[];
}

export async function fetchMemberChapters(userId: string): Promise<MemberChapterRow[]> {
  if (isDemo()) return demoMemberChapters(userId);
  const { data, error } = await rpc("manager_member_chapters", { p_user: userId });
  if (error) throw error;
  return (data ?? []) as MemberChapterRow[];
}

export async function fetchBankSize(): Promise<number> {
  if (isDemo()) return demoBankSize();
  const { count, error } = await supabase.from("questions").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function fetchDailySeries(days = 180): Promise<DailyRow[]> {
  if (isDemo()) return demoDaily();
  const { data, error } = await rpc("manager_daily_series", { p_days: days });
  if (error) throw error;
  return (data ?? []) as DailyRow[];
}

export async function fetchRepetitionCurve(userId: string | null = null): Promise<RepetitionRow[]> {
  if (isDemo()) return demoRepetition(userId);
  const { data, error } = await rpc("manager_repetition_curve", { p_user: userId });
  if (error) throw error;
  return (data ?? []) as RepetitionRow[];
}

export async function fetchManagerNote(memberUserId: string): Promise<string> {
  const { data, error } = await notesTable().select("note").eq("member_id", memberUserId).maybeSingle();
  if (error) throw error;
  return data?.note ?? "";
}

export async function saveManagerNote(memberUserId: string, note: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await notesTable().upsert({
    member_id: memberUserId,
    note,
    updated_at: new Date().toISOString(),
    updated_by: auth.user?.id ?? null,
  });
  if (error) throw error;
}
