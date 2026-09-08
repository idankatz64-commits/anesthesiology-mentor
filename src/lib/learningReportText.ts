// One wording for the cumulative learning report, shared by the on-screen panel and
// the printable PDF so an export can never say something different from the screen.
import { MIN_SIGNAL_SAMPLE, type LearningReport, type Trend } from '@/lib/learningInsights';

export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}%`);
export const chapterList = (ids: readonly number[]) => (ids.length ? ids.map((c) => `פרק ${c}`).join(', ') : '—');

export const trendText = (t: Trend): string => {
  if (!t.comparable || t.deltaPoints == null) return 'אין השוואה תקפה בין שני החלונות האחרונים (מדגם קטן או תמהיל שונה).';
  const dir = t.direction === 'up' ? 'עלייה' : t.direction === 'down' ? 'ירידה' : 'ללא שינוי מהותי';
  return `${dir} של ${Math.abs(t.deltaPoints)} נקודות דיוק לעומת ${t.windowDays} הימים הקודמים.`;
};

export const TREND_CAVEAT: Record<Trend['caveats'][number], string> = {
  'small-sample-recent': 'מדגם קטן בחלון האחרון',
  'small-sample-previous': 'מדגם קטן בחלון הקודם',
  'no-previous-window': 'אין חלון קודם להשוואה',
  'mode-mix-differs': 'תמהיל תרגול/בחינה שונה',
  'exposure-mix-differs': 'תמהיל שאלות חדשות/חוזרות שונה',
  'chapter-mix-differs': 'תמהיל פרקים שונה',
};

export const POLICY_NOTE = 'מדיניות 50/25/70: פרק נחשב ירוק כשכוסו לפחות 50% משאלותיו, לפחות 25% מהן נענו בבחינה, ו־70% מהתשובות האחרונות בבחינה נכונות. רק תשובות מנוסות ומנוקדות נספרות.';

/** Every conservative-handling caveat that applies to this report, in display order. */
export function uncertaintyNotes(report: LearningReport): string[] {
  const u = report.uncertainty;
  return [
    `טיפול שמרני בשאלות ללא מפתח מאומת: ${u.unscoredCount} תשובות נספרו כנצפו בלבד ואינן משפיעות על אחוזי ההצלחה. מדיניות זו ממתינה לבדיקת מוצר ולא שונתה כאן.`,
    u.legacyUnknownModeCount > 0 ? `${u.legacyUnknownModeCount} רשומות היסטוריות ללא מצב ידוע נחשבות "נצפו" בלבד.` : '',
    u.rehearsalCount > 0 ? `${u.rehearsalCount} תשובות חוזרות בתוך 24 שעות לא נספרו כעדות עצמאית.` : '',
    report.nationalSeenCount > 0 ? `${report.nationalSeenCount} שאלות ארציות מחוץ למכנה הליבה.` : '',
    u.outsideBankCount > 0 ? `${u.outsideBankCount} תשובות על שאלות שאינן במאגר הזמין כעת (הוסרו או שההרשאה בוטלה) ואינן יכולות להיכנס למכנה הנוכחי.` : '',
    u.chapterReclassifiedCount > 0 ? `${u.chapterReclassifiedCount} תשובות נענו כשהשאלה הייתה בפרק אחר; החוזקות נשמרות לפי הפרק ההיסטורי, הכיסוי לפי הפרק הנוכחי.` : '',
    u.scopeReclassifiedCount > 0 ? `${u.scopeReclassifiedCount} תשובות נענו תחת סיווג מקור אחר ולא נכנסו למכנה הליבה הנוכחי.` : '',
  ].filter(Boolean);
}

export const confidenceText = (report: LearningReport): string => {
  const s = report.signals;
  return s.interpretation === 'available'
    ? `מתוך ${s.sample} תשובות עם ביטחון מוצהר: נכון ובטוח ${s.correctConfident}, נכון ומתלבט ${s.correctHesitant}, ניחוש נכון ${s.correctGuessed}, שגוי ובטוח ${s.wrongConfident}, שגוי ומתלבט ${s.wrongHesitant}, ניחוש שגוי ${s.wrongGuessed}.`
    : `פחות מ־${MIN_SIGNAL_SAMPLE} תשובות עם ביטחון מוצהר — אין עדיין מסקנה.`;
};
export const confidenceNote = (report: LearningReport): string =>
  `${report.signals.note}${report.signals.estimatedExcluded > 0 ? ` · ${report.signals.estimatedExcluded} ערכי ביטחון משוערים לא נכללו.` : ''}`;
export const chapterLine = (c: LearningReport['chapters'][number]) =>
  `פרק ${c.chapter}: כיסוי ${pct(c.policy.coveragePercent)} · הצלחה ${pct(c.policy.quizSuccessPercent)} · ${c.policy.green ? 'ירוק' : `${c.mistakeCount} טעויות`}`;
export const signalLine = (items: LearningReport['strengths']) => (items.length ? items.map((c) => `פרק ${c.chapter} (${Math.round(c.accuracy)}%)`).join(', ') : '—');
export const recommendationMeta = (rec: LearningReport['recommendations'][number]) =>
  `${rec.setup.mode === 'practice' ? 'תרגול' : 'בחינה'} · ${chapterList(rec.setup.chapters)} · ${rec.setup.source === 'mistakes' ? 'טעויות בלבד' : 'כל השאלות'}${rec.setup.unseenOnly ? ' · חדשות בלבד' : ''} · ${rec.setup.count} שאלות (הצעה)`;
export const followUpText = (report: LearningReport) =>
  `מעקב אחרי המלצות קודמות (ללא טענת סיבתיות): ${report.followUp.map((f) => `${f.responses} תשובות, דיוק ${pct(f.accuracy)}`).join(' · ')}`;
