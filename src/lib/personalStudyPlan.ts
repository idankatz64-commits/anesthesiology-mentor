import type { CurriculumConfig } from './curriculumPlan';
import type { ChapterReport, Recommendation } from './learningInsights';

export type StudyMode = 'quarterly' | 'grouped' | 'random';
export type StudyPreferences = { startDate: string; mode: StudyMode; chapters: number[] };
// Exact medical mapping approved by Idan Katz on 2026-09-09. It only applies
// when the server's approved core version contains the same 43 chapters.
export const APPROVED_TOPIC_GROUPS = [
  { title: 'יסודות ותרופות', chapterIds: [16, 17, 18, 19, 20, 21, 22] },
  { title: 'מוח, עצב ושריר', chapterIds: [8, 10, 11, 24, 31, 39, 53] },
  { title: 'נשימה ונתיב אוויר', chapterIds: [9, 12, 37, 40, 49] },
  { title: 'לב וניטור המודינמי', chapterIds: [13, 32, 33, 50, 82] },
  { title: 'איברים, נוזלים ודם', chapterIds: [14, 15, 38, 43, 44, 45, 46] },
  { title: 'הרדמה אזורית', chapterIds: [25, 41, 42] },
  { title: 'הערכה ואוכלוסיות מיוחדות', chapterIds: [28, 29, 54, 58, 61, 72] },
  { title: 'טראומה, התאוששות וטיפול נמרץ', chapterIds: [62, 76, 79] },
] as const;
const DAY = 86400000;
export function dateOnly(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_DATE');
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error('INVALID_DATE');
  return time;
}
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
/** Clamp from the ORIGINAL anchor each time: Jan 31 -> Apr 30 -> Jul 31. */
export function addMonths(anchor: string, months: number): string {
  const d = new Date(dateOnly(anchor));
  const month = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(d.getUTCFullYear(), month, Math.min(d.getUTCDate(), last))).toISOString().slice(0, 10);
}
export function personalQuarter(startDate: string, today: string) {
  const now = dateOnly(today);
  const start = dateOnly(startDate);
  if (start > now) return { number: 1, startDate, endDate: addMonths(startDate, 3), daysLeft: Math.ceil((dateOnly(addMonths(startDate, 3)) - now) / DAY), upcoming: true };
  const a = new Date(start), b = new Date(now);
  let index = Math.floor(((b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth()) / 3);
  if (dateOnly(addMonths(startDate, index * 3)) > now) index--;
  const endDate = addMonths(startDate, (index + 1) * 3);
  return { number: index + 1, startDate: addMonths(startDate, index * 3), endDate, daysLeft: Math.ceil((dateOnly(endDate) - now) / DAY), upcoming: false };
}
export function groupsMatch(config: CurriculumConfig): boolean {
  const ids = APPROVED_TOPIC_GROUPS.flatMap(g => [...g.chapterIds]);
  return config.status === 'approved' && config.chapters.length === ids.length && new Set(config.chapters.map(c => c.id)).size === ids.length && config.chapters.every(c => ids.includes(c.id as typeof ids[number]));
}
export function quarterlySchedule(config: CurriculumConfig, start: string, today: string, examDate: string | null, reports: readonly ChapterReport[]) {
  if (config.status !== 'approved') return [];
  const current = personalQuarter(start, today);
  const horizon = addMonths(start, 24);
  const end = examDate && dateOnly(examDate) < dateOnly(horizon) ? examDate : horizon;
  if (dateOnly(end) <= dateOnly(today)) return [];
  const slots: { number: number; startDate: string; endDate: string; chapters: number[] }[] = [];
  for (let i = current.number - 1; i < 8 && dateOnly(addMonths(start, i * 3)) < dateOnly(end); i++) {
    const next = addMonths(start, (i + 1) * 3);
    slots.push({ number: i + 1, startDate: addMonths(start, i * 3), endDate: next < end ? next : end, chapters: [] });
  }
  const green = new Set(reports.filter(c => c.policy.green).map(c => c.chapter));
  const remaining = config.chapters.filter(c => !green.has(c.id));
  if (groupsMatch(config)) {
    const groups = APPROVED_TOPIC_GROUPS.map(g => g.chapterIds.filter(id => !green.has(id))).filter(g => g.length);
    groups.forEach((ids, i) => { if (slots.length) slots[Math.floor(i * slots.length / groups.length)].chapters.push(...ids); });
  } else {
    remaining.forEach((c, i) => { if (slots.length) slots[Math.floor(i * slots.length / remaining.length)].chapters.push(c.id); });
  }
  return slots;
}
export function studyRecommendation(chapters: number[], mode: 'practice' | 'exam', nowMs: number): Recommendation {
  return { id: `personal-plan-${nowMs}-${mode}`, kind: 'study-plan', priority: 1,
    title: 'הבחירה שלי בתכנית הלמידה', rationale: 'בחירה גמישה; אפשר להתאים את ההגדרות לפני ההתחלה.', evidence: { chapters }, caveats: [], countIsSuggestion: true,
    setup: { mode, chapters, source: 'all', count: 20, unseenOnly: false },
    provenance: { engine: 'personalStudyPlan', version: 1, asOf: nowMs, denominatorVersion: 'core-v1' } };
}
