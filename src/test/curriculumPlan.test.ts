import { describe, expect, it } from 'vitest';
import {
  buildCurriculumPlan, normalizeConfigStatus, ACCESS_POLICY, DEFAULT_HORIZON_MONTHS, DEFAULT_BASKET_SIZE, curriculumNoticeLabel,
  type CurriculumConfig, type ChapterEvidence, type CurriculumPlan,
} from '@/lib/curriculumPlan';

const NOW = new Date('2026-09-07T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

// Synthetic config: ids/titles are placeholders, deliberately not the 42-chapter candidate.
const draft: CurriculumConfig = {
  version: 'synthetic-draft-1', status: 'draft_user_deferred_approval',
  chapters: [{ id: 8, title: 'A' }, { id: 12, title: 'B' }, { id: 15, title: 'C' }, { id: 10, title: 'D' }, { id: 40, title: 'E' }],
  yearOrders: [{ year: 1, chapterIds: [15, 12, 8], provenance: 'synthetic year-1 order (test fixture)' }],
};
const approved: CurriculumConfig = { ...draft, version: 'synthetic-approved-1', status: 'approved' };
const resident = { residencyYear: 1, examThisYear: false, examDate: null };
const plan = (overrides: Partial<Parameters<typeof buildCurriculumPlan>[0]> = {}) =>
  buildCurriculumPlan({ config: approved, resident, evidence: [], audience: 'resident', nowMs: NOW, ...overrides });
const live = (overrides: Partial<Parameters<typeof buildCurriculumPlan>[0]> = {}) => {
  const p = plan(overrides);
  if (p.mode !== 'live' && p.mode !== 'draft-preview') throw new Error(`expected a plan, got ${p.mode}`);
  return p;
};
const ev = (chapter: number, coveragePercent: number | null, green = false): ChapterEvidence => ({ chapter, coveragePercent, green });

describe('curriculum plan — activation', () => {
  it('a draft config never activates a resident plan', () => {
    const p = plan({ config: draft });
    expect(p).toMatchObject({ mode: 'unavailable', reason: 'draft-not-approved', configVersion: 'synthetic-draft-1', configStatus: 'draft', accessPolicy: ACCESS_POLICY });
    expect(p).not.toHaveProperty('ordering');
    expect(p).not.toHaveProperty('basket');
  });

  it('a draft config gives an admin a flagged preview only', () => {
    const p = live({ config: draft, audience: 'admin' });
    expect(p.mode).toBe('draft-preview');
    expect(p.configStatus).toBe('draft');
    expect(p.notices).toContain('core-list-draft');
    expect(curriculumNoticeLabel['core-list-draft']).toMatch(/טרם אושרה/);
  });

  it('an approved config gives a live plan', () => {
    const p = live();
    expect(p.mode).toBe('live');
    expect(p.notices).not.toContain('core-list-draft');
    expect(p.configVersion).toBe('synthetic-approved-1');
  });

  it('only the exact string "approved" is approved', () => {
    expect(normalizeConfigStatus('approved')).toBe('approved');
    for (const raw of ['Approved', 'approved ', 'draft', 'draft_user_deferred_approval', '', 'final']) expect(normalizeConfigStatus(raw)).toBe('draft');
  });

  it('an invalid config fails closed', () => {
    expect(plan({ config: { ...approved, chapters: [] } })).toMatchObject({ mode: 'invalid', errors: ['no-chapters'] });
    expect(plan({ config: { ...approved, chapters: [{ id: 8, title: 'A' }, { id: 8, title: 'A2' }] } })).toMatchObject({ mode: 'invalid', errors: ['duplicate-chapter-id:8'] });
    expect(plan({ config: { ...approved, chapters: [{ id: 1.5, title: 'x' }] } })).toMatchObject({ mode: 'invalid', errors: ['invalid-chapter-id:1.5'] });
  });
});

describe('curriculum plan — ordering comes from configuration, never from the engine', () => {
  it('residency year selects the configured order, keeps its provenance, and appends the rest in source order', () => {
    const p = live();
    expect(p.ordering).toEqual({ chapterIds: [15, 12, 8, 10, 40], basis: 'year-config', provenance: 'synthetic year-1 order (test fixture)', flags: ['year-order-incomplete'] });
  });

  it('a year without a configured order falls back to source order, flagged', () => {
    const p = live({ resident: { ...resident, residencyYear: 2 } });
    expect(p.ordering).toMatchObject({ chapterIds: [8, 12, 15, 10, 40], basis: 'source-order', flags: ['no-year-order-configured'] });
  });

  it('an unknown residency year is explicit, not guessed', () => {
    const p = live({ resident: { ...resident, residencyYear: null } });
    expect(p.ordering).toMatchObject({ chapterIds: [8, 12, 15, 10, 40], basis: 'source-order', flags: ['residency-year-unknown'] });
  });

  it('configured ids that are not chapters are ignored and flagged', () => {
    const config = { ...approved, yearOrders: [{ year: 1, chapterIds: [15, 999, 12, 8, 10, 40], provenance: 'p' }] };
    const p = live({ config });
    expect(p.ordering.chapterIds).toEqual([15, 12, 8, 10, 40]);
    expect(p.ordering.flags).toEqual(['year-order-has-unknown-ids']);
  });
});

describe('curriculum plan — horizon and pacing', () => {
  it('a known future exam date gives a countdown and a suggested pace; count stays the user\'s choice', () => {
    const p = live({ resident: { residencyYear: 1, examThisYear: true, examDate: '2027-03-07' } });
    expect(p.horizon).toMatchObject({ basis: 'exam-date', countdownDays: 181, months: DEFAULT_HORIZON_MONTHS });
    expect(p.horizon.endMs).toBe(Date.parse('2027-03-07T00:00:00Z'));
    expect(p.pacing.kind).toBe('suggested');
    if (p.pacing.kind !== 'suggested') return;
    expect(p.pacing.basis).toBe('exam-date');
    expect(p.pacing.monthsRemaining).toBe(5.9);
    expect(p.pacing.chaptersPerMonth).toBe(0.8);
    expect(p.pacing.caveats).toEqual([]);
    expect(p.basket).toMatchObject({ chapterIds: [15, 12, 8], size: DEFAULT_BASKET_SIZE, isRecommendationOnly: true });
  });

  it('a missing exam date produces no deadline and no countdown, only a reference horizon', () => {
    const p = live();
    expect(p.horizon).toEqual({ basis: 'default-horizon', endMs: null, countdownDays: null, months: 24 });
    expect(p.pacing).toMatchObject({ kind: 'suggested', basis: 'default-horizon', monthsRemaining: 24, chaptersPerMonth: 0.2, caveats: ['reference-horizon-not-deadline'] });
    expect(p.notices).not.toContain('exam-this-year-no-date');
    const declared = live({ resident: { ...resident, examThisYear: true } });
    expect(declared.notices).toContain('exam-this-year-no-date');
    expect(declared.horizon.countdownDays).toBeNull();
  });

  it('the horizon is configurable and a past or invalid date is explicit', () => {
    const twelve = live({ config: { ...approved, horizonMonths: 12 } });
    expect(twelve.horizon.months).toBe(12);
    expect(twelve.pacing).toMatchObject({ monthsRemaining: 12, chaptersPerMonth: 0.4 });

    const past = live({ resident: { ...resident, examDate: '2026-01-01' } });
    expect(past.horizon).toMatchObject({ basis: 'exam-date-passed', endMs: null, countdownDays: null });
    expect(past.pacing).toEqual({ kind: 'unknown', reason: 'exam-date-passed' });

    const invalid = live({ resident: { ...resident, examDate: 'soon' } });
    expect(invalid.horizon.basis).toBe('exam-date-invalid');
    expect(invalid.pacing).toEqual({ kind: 'unknown', reason: 'exam-date-invalid' });
  });

  it('a 24-month horizon and a 1-year horizon differ only in pace, never in access or obligation', () => {
    const long = live();
    const short = live({ config: { ...approved, horizonMonths: 12 } });
    expect(long.ordering).toEqual(short.ordering);
    expect(long.remaining).toEqual(short.remaining);
    expect(long.accessPolicy).toBe('all-entitled-chapters-accessible');
    expect(JSON.stringify(long)).not.toMatch(/lock|mandatory|quota|overdue|reset/i);
  });
});

describe('curriculum plan — evidence overrides the year', () => {
  const evidence = [ev(8, 100, true), ev(12, 30), ev(15, 0), ev(99, 50)];

  it('green chapters leave the remaining set, in-progress chapters lead the basket, missing evidence is unknown', () => {
    const p = live({ evidence });
    expect(p.remaining).toEqual({
      total: 5, green: 1, remaining: 4, chapterIds: [15, 12, 10, 40],
      inProgress: [12], untouched: [15], evidenceMissing: [10, 40],
      status: { 8: 'green', 12: 'in-progress', 15: 'untouched', 10: 'unknown', 40: 'unknown' },
    });
    expect(p.basket.chapterIds).toEqual([12, 15, 10]);
    expect(p.outsideCore).toEqual([99]);
    expect(p.notices).toContain('evidence-missing-for-some-chapters');
  });

  it('a long break resets nothing', () => {
    const before = live({ evidence });
    const after = live({ evidence, nowMs: NOW + 400 * DAY });
    expect(after.remaining).toEqual(before.remaining);
    expect(after.basket).toEqual(before.basket);
    expect(after.ordering).toEqual(before.ordering);
  });

  it('a new resident with no history gets an ordered plan with all chapters unknown', () => {
    const p = live();
    expect(p.remaining.evidenceMissing).toEqual([15, 12, 8, 10, 40]);
    expect(p.remaining.remaining).toBe(5);
    expect(p.basket.chapterIds).toEqual([15, 12, 8]);
  });

  it('all green: nothing remains, the basket is empty and pacing is not needed', () => {
    const p = live({ evidence: approved.chapters.map(c => ev(c.id, 100, true)) });
    expect(p.remaining).toMatchObject({ remaining: 0, chapterIds: [] });
    expect(p.basket.chapterIds).toEqual([]);
    expect(p.pacing).toEqual({ kind: 'unknown', reason: 'no-remaining' });
  });

  it('the basket size is a suggestion bounded by what remains', () => {
    expect(live({ basketSize: 2 }).basket).toMatchObject({ chapterIds: [15, 12], size: 2 });
    expect(live({ basketSize: 10 }).basket).toMatchObject({ chapterIds: [15, 12, 8, 10, 40], size: 10 });
    expect(live({ basketSize: 0 }).basket.chapterIds).toEqual([]);
  });
});

// Type-level guard: a resident plan discriminates on mode.
const _exhaustive = (p: CurriculumPlan): string => {
  switch (p.mode) {
    case 'invalid': return p.errors.join();
    case 'unavailable': return p.reason;
    case 'live': case 'draft-preview': return p.ordering.basis;
  }
};
void _exhaustive;
