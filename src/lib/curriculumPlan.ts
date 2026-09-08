// Bounded curriculum engine (Phase 4A). Pure: no I/O, no Date.now(), no AI.
// Turns a versioned chapter configuration + resident context + learning
// evidence into an ordered, flexible plan. Nothing here is wired to UI or
// persistence, and the 42-chapter candidate list is never embedded in code.
//
// Contract (LEARNING-CURRICULUM-HANDOFF + PHASE-4A-HANDOFF):
//   - a draft config never activates a resident plan; admins get a flagged preview
//   - ordering comes only from configuration (per-year, with provenance) or source order, flagged
//   - residency year is starting context; evidence (green / in-progress) overrides it
//   - missing evidence or exam date is explicit "unknown", never a guessed deadline
//   - horizon and basket are suggestions; no locking, quotas, resets or compulsory tasks

export const ACCESS_POLICY = 'all-entitled-chapters-accessible' as const;
export const DEFAULT_HORIZON_MONTHS = 24;
export const DEFAULT_BASKET_SIZE = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const AVERAGE_MONTH_MS = (365.25 / 12) * DAY_MS;

export type CurriculumChapter = { id: number; title: string };
export type YearOrder = { year: number; chapterIds: readonly number[]; provenance: string };
export type CurriculumConfig = {
  version: string;
  /** Raw status string; only the exact 'approved' activates (see normalizeConfigStatus). */
  status: string;
  chapters: readonly CurriculumChapter[];
  /** Optional source-defined ordering per residency year. Absent → source order, flagged. */
  yearOrders?: readonly YearOrder[];
  horizonMonths?: number;
  source?: { path?: string; sha256?: string; description?: string };
};
export type ResidentContext = { residencyYear: number | null; examThisYear: boolean; examDate: string | null };
/** Minimal learning evidence per chapter (structurally compatible with learningInsights ChapterReport + policy.green). */
export type ChapterEvidence = { chapter: number; green: boolean; coveragePercent: number | null };
export type PlanInput = {
  config: CurriculumConfig;
  resident: ResidentContext;
  evidence: readonly ChapterEvidence[];
  audience: 'resident' | 'admin';
  nowMs: number;
  basketSize?: number;
};

export type ConfigStatus = 'draft' | 'approved';
export type NoticeCode = 'core-list-draft' | 'exam-this-year-no-date' | 'evidence-missing-for-some-chapters';
export const curriculumNoticeLabel: Record<NoticeCode, string> = {
  'core-list-draft': 'רשימת הליבה טרם אושרה — תצוגה מקדימה למנהל בלבד, לא תוכנית פעילה.',
  'exam-this-year-no-date': 'דווח על בחינה השנה ללא תאריך — אין ספירה לאחור עד שיוזן תאריך.',
  'evidence-missing-for-some-chapters': 'לחלק מהפרקים אין עדיין נתוני למידה — מצבם מוצג כלא ידוע, לא כאפס.',
};

export type OrderingFlag = 'residency-year-unknown' | 'no-year-order-configured' | 'year-order-incomplete' | 'year-order-has-unknown-ids';
export type Ordering = { chapterIds: number[]; basis: 'year-config' | 'source-order'; provenance: string; flags: OrderingFlag[] };
export type Horizon = { basis: 'exam-date' | 'default-horizon' | 'exam-date-passed' | 'exam-date-invalid'; endMs: number | null; countdownDays: number | null; months: number };
export type ChapterStatus = 'green' | 'in-progress' | 'untouched' | 'unknown';
export type Remaining = {
  total: number; green: number; remaining: number;
  /** Not-green chapters in plan order. */
  chapterIds: number[];
  inProgress: number[]; untouched: number[]; evidenceMissing: number[];
  status: Record<number, ChapterStatus>;
};
export type Pacing =
  | { kind: 'suggested'; basis: 'exam-date' | 'default-horizon'; monthsRemaining: number; chaptersPerMonth: number; caveats: ('reference-horizon-not-deadline' | 'less-than-a-month')[] }
  | { kind: 'unknown'; reason: 'no-remaining' | 'exam-date-passed' | 'exam-date-invalid' };
export type Basket = { chapterIds: number[]; size: number; isRecommendationOnly: true; rationale: string };

export type ActivePlan = {
  mode: 'live' | 'draft-preview';
  configVersion: string;
  configStatus: ConfigStatus;
  notices: NoticeCode[];
  ordering: Ordering;
  horizon: Horizon;
  remaining: Remaining;
  pacing: Pacing;
  basket: Basket;
  /** Evidence for chapters outside the configured set — reported, not planned. */
  outsideCore: number[];
  accessPolicy: typeof ACCESS_POLICY;
};
export type CurriculumPlan =
  | { mode: 'invalid'; errors: string[] }
  | { mode: 'unavailable'; reason: 'draft-not-approved'; configVersion: string; configStatus: 'draft'; notice: string; accessPolicy: typeof ACCESS_POLICY }
  | ActivePlan;

/** Fail closed: only the exact string 'approved' is approved. */
export const normalizeConfigStatus = (raw: string): ConfigStatus => (raw === 'approved' ? 'approved' : 'draft');

const round1 = (x: number) => Math.round(x * 10) / 10;

function validate(config: CurriculumConfig): string[] {
  const errors: string[] = [];
  if (!config.chapters?.length) errors.push('no-chapters');
  const seen = new Set<number>();
  for (const chapter of config.chapters ?? []) {
    if (!Number.isInteger(chapter.id)) { errors.push(`invalid-chapter-id:${chapter.id}`); continue; }
    if (seen.has(chapter.id)) errors.push(`duplicate-chapter-id:${chapter.id}`);
    seen.add(chapter.id);
  }
  if (config.horizonMonths !== undefined && !(Number.isFinite(config.horizonMonths) && config.horizonMonths > 0)) errors.push('invalid-horizon-months');
  return errors;
}

function buildOrdering(config: CurriculumConfig, year: number | null): Ordering {
  const sourceOrder = config.chapters.map(c => c.id);
  const known = new Set(sourceOrder);
  const sourceProvenance = `config ${config.version} source order`;
  if (year === null) return { chapterIds: sourceOrder, basis: 'source-order', provenance: sourceProvenance, flags: ['residency-year-unknown'] };
  const entry = config.yearOrders?.find(y => y.year === year);
  if (!entry) return { chapterIds: sourceOrder, basis: 'source-order', provenance: sourceProvenance, flags: ['no-year-order-configured'] };
  const flags: OrderingFlag[] = [];
  const configured = [...new Set(entry.chapterIds.filter(id => known.has(id)))];
  if (configured.length < new Set(entry.chapterIds).size) flags.push('year-order-has-unknown-ids');
  const rest = sourceOrder.filter(id => !configured.includes(id));
  if (rest.length) flags.push('year-order-incomplete');
  return { chapterIds: [...configured, ...rest], basis: 'year-config', provenance: entry.provenance, flags };
}

function parseExamDate(raw: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T00:00:00Z`) : Date.parse(raw);
}

function buildHorizon(resident: ResidentContext, months: number, nowMs: number): Horizon {
  if (resident.examDate === null || resident.examDate === '') return { basis: 'default-horizon', endMs: null, countdownDays: null, months };
  const endMs = parseExamDate(resident.examDate);
  if (Number.isNaN(endMs)) return { basis: 'exam-date-invalid', endMs: null, countdownDays: null, months };
  if (endMs <= nowMs) return { basis: 'exam-date-passed', endMs: null, countdownDays: null, months };
  return { basis: 'exam-date', endMs, countdownDays: Math.ceil((endMs - nowMs) / DAY_MS), months };
}

function buildPacing(horizon: Horizon, remaining: number, nowMs: number): Pacing {
  if (remaining === 0) return { kind: 'unknown', reason: 'no-remaining' };
  if (horizon.basis === 'exam-date-passed' || horizon.basis === 'exam-date-invalid') return { kind: 'unknown', reason: horizon.basis };
  if (horizon.basis === 'exam-date') {
    const monthsRemaining = round1((horizon.endMs! - nowMs) / AVERAGE_MONTH_MS);
    return {
      kind: 'suggested', basis: 'exam-date', monthsRemaining,
      chaptersPerMonth: round1(remaining / Math.max(monthsRemaining, 0.1)),
      caveats: monthsRemaining < 1 ? ['less-than-a-month'] : [],
    };
  }
  // ponytail: no exam date → a reference pace over the configured horizon, explicitly not a deadline.
  return { kind: 'suggested', basis: 'default-horizon', monthsRemaining: horizon.months, chaptersPerMonth: round1(remaining / horizon.months), caveats: ['reference-horizon-not-deadline'] };
}

export function buildCurriculumPlan(input: PlanInput): CurriculumPlan {
  const { config, resident, audience, nowMs } = input;
  const errors = validate(config);
  if (errors.length) return { mode: 'invalid', errors };
  const configStatus = normalizeConfigStatus(config.status);
  if (configStatus === 'draft' && audience !== 'admin') {
    return { mode: 'unavailable', reason: 'draft-not-approved', configVersion: config.version, configStatus, notice: curriculumNoticeLabel['core-list-draft'], accessPolicy: ACCESS_POLICY };
  }

  const ordering = buildOrdering(config, resident.residencyYear);
  const known = new Set(ordering.chapterIds);

  // Evidence overrides the year: last row per chapter wins; unknown chapters are reported, not planned.
  const evidenceByChapter = new Map<number, ChapterEvidence>();
  const outsideCore = new Set<number>();
  for (const row of input.evidence) {
    if (known.has(row.chapter)) evidenceByChapter.set(row.chapter, row);
    else outsideCore.add(row.chapter);
  }
  const statusOf = (chapter: number): ChapterStatus => {
    const row = evidenceByChapter.get(chapter);
    if (!row) return 'unknown';
    if (row.green) return 'green';
    return (row.coveragePercent ?? 0) > 0 ? 'in-progress' : 'untouched';
  };
  const status = Object.fromEntries(ordering.chapterIds.map(id => [id, statusOf(id)])) as Record<number, ChapterStatus>;
  const withStatus = (s: ChapterStatus) => ordering.chapterIds.filter(id => status[id] === s);
  const notGreen = ordering.chapterIds.filter(id => status[id] !== 'green');
  const remaining: Remaining = {
    total: ordering.chapterIds.length, green: withStatus('green').length, remaining: notGreen.length,
    chapterIds: notGreen, inProgress: withStatus('in-progress'), untouched: withStatus('untouched'), evidenceMissing: withStatus('unknown'), status,
  };

  const size = Math.max(0, Math.floor(input.basketSize ?? DEFAULT_BASKET_SIZE));
  const basket: Basket = {
    chapterIds: [...remaining.inProgress, ...notGreen.filter(id => status[id] !== 'in-progress')].slice(0, size),
    size, isRecommendationOnly: true,
    rationale: 'סל קטן של פרקים להתמקד בהם: קודם פרקים שכבר התחלת, אחר כך לפי הסדר המוגדר. זו המלצה בלבד — כל פרק נשאר פתוח.',
  };

  const horizon = buildHorizon(resident, config.horizonMonths ?? DEFAULT_HORIZON_MONTHS, nowMs);
  const pacing = buildPacing(horizon, remaining.remaining, nowMs);

  const notices: NoticeCode[] = [];
  if (configStatus === 'draft') notices.push('core-list-draft');
  if (resident.examThisYear && !resident.examDate) notices.push('exam-this-year-no-date');
  if (remaining.evidenceMissing.length) notices.push('evidence-missing-for-some-chapters');

  return {
    mode: configStatus === 'approved' ? 'live' : 'draft-preview',
    configVersion: config.version, configStatus, notices, ordering, horizon, remaining, pacing, basket,
    outsideCore: [...outsideCore].sort((a, b) => a - b), accessPolicy: ACCESS_POLICY,
  };
}
