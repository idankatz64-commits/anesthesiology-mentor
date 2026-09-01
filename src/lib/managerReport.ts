// דוח ביצועים למנהל התוכנית — שכבת הנתונים והלוגיקה (v1, 1.9.2026).
// הנתונים מגיעים משלוש פונקציות SECURITY DEFINER עם שער-אדמין פנימי (מיגרציית manager_dashboard_v1).
// עקרון: הכשרה-לא-הערכה — הסטטוסים הם איתותי ליווי ("כדאי לשים לב"), לא דירוג.

import { supabase } from "@/integrations/supabase/client";

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

export type ResidentStatusKind = "active" | "steady" | "attention";

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

/** איתות ליווי: ירידה במגמה או חוסר פעילות ממושך → "כדאי לשים לב" */
export function residentStatus(r: OverviewRow, now: Date): ResidentStatusKind {
  const delta = trendDelta(r);
  if (delta !== null && delta <= ATTENTION_TREND) return "attention";
  const idleDays = r.last_active ? (now.getTime() - new Date(r.last_active).getTime()) / 86400000 : Infinity;
  if (idleDays >= ATTENTION_IDLE_DAYS) return "attention";
  if (r.qs_last30 > 0) return "active";
  return "steady";
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

/* ─────────── fetchers ─────────── */

/* eslint-disable @typescript-eslint/no-explicit-any -- the manager_* RPCs are newer than the generated types */
const rpc = (name: string, args?: Record<string, unknown>) => (supabase.rpc as any)(name, args);
const notesTable = () => (supabase.from as any)("manager_notes");

export async function fetchOverview(): Promise<OverviewRow[]> {
  const { data, error } = await rpc("manager_cohort_overview");
  if (error) throw error;
  return (data ?? []) as OverviewRow[];
}

export async function fetchCohortChapters(): Promise<CohortChapterRow[]> {
  const { data, error } = await rpc("manager_cohort_chapters");
  if (error) throw error;
  return (data ?? []) as CohortChapterRow[];
}

export async function fetchMemberChapters(userId: string): Promise<MemberChapterRow[]> {
  const { data, error } = await rpc("manager_member_chapters", { p_user: userId });
  if (error) throw error;
  return (data ?? []) as MemberChapterRow[];
}

export async function fetchBankSize(): Promise<number> {
  const { count, error } = await supabase.from("questions").select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
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
