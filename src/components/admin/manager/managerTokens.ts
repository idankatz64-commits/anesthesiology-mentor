// טוקנים ויזואליים משותפים לדשבורד המנהל ולדוח האישי.
// יושבים בקובץ נפרד כדי ש-fast-refresh ימשיך לעבוד ברכיבים (אותו דפוס כמו chartTokens).

import type { ResidentStatusKind } from "@/lib/managerReport";

/**
 * שלושת צבעי הסטטוס. אומתו ב-validate_palette (סקיל dataviz) מול שני המשטחים:
 * הפרדת עיוורון-צבעים ΔE 8.9 (protan) ו-23.8 בראייה רגילה — הצירוף הישן
 * (‎#00e676/#ff9800‎) נכשל ב-7.9 deutan, כלומר ירוק וכתום נראו זהים לכ-6% מהגברים.
 * בתאורה בהירה הניגודיות של הירוק/כתום יורדת מ-3:1, ולכן **חובה שהמספר עצמו
 * יופיע לצד הצבע בכל שימוש** — הצבע לעולם לא נושא את המידע לבדו.
 */
export const TONE = {
  good: "#10B981",
  watch: "#F59E0B",
  low: "#E11D48",
  idle: "#64748B",
} as const;

/** סף 70% הוא הכלל שנפסק 1.9 (חולשה = מתחת ל-70% בחשיפות ראשונות) */
export function accTone(pct: number | null): string {
  if (pct === null) return TONE.idle;
  if (pct >= 75) return TONE.good;
  if (pct >= 60) return TONE.watch;
  return TONE.low;
}

export function coverageTone(pct: number): string {
  if (pct >= 40) return TONE.good;
  if (pct >= 15) return TONE.watch;
  return TONE.low;
}

export const STATUS_META: Record<ResidentStatusKind, { label: string; cls: string; dot: string }> = {
  active: { label: "פעיל", cls: "bg-emerald-500/10 text-emerald-500", dot: TONE.good },
  steady: { label: "יציב", cls: "bg-muted text-muted-foreground", dot: TONE.idle },
  attention: { label: "כדאי לשים לב", cls: "bg-amber-500/10 text-amber-500", dot: TONE.watch },
  inactive: { label: "לא פעיל", cls: "bg-slate-500/10 text-slate-400", dot: TONE.idle },
};

export const MONO = { fontFamily: "'Share Tech Mono', monospace" } as const;

export function lastActiveLabel(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  if (days < 30) return `לפני ${days} ימים`;
  const months = Math.round(days / 30);
  return months === 1 ? "לפני חודש" : `לפני ${months} חודשים`;
}

/** 2026-08-14 → 14.8 — ציר תאריכים קצר, בלי שנה, לגרפים */
export function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(d)}.${Number(m)}`;
}
