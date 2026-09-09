import { describe, expect, it } from 'vitest';
import { addMonths, APPROVED_TOPIC_GROUPS, dateOnly, groupsMatch, personalQuarter, quarterlySchedule } from '@/lib/personalStudyPlan';
import type { CurriculumConfig } from '@/lib/curriculumPlan';
const config: CurriculumConfig = { version: 'test', status: 'approved', chapters: Array.from({ length: 16 }, (_, i) => ({ id: i + 1, title: String(i + 1) })) };
describe('personal study calendar and medical scope', () => {
  it('anchors end-of-month boundaries to the original date, including leap years', () => {
    expect(addMonths('2024-01-31', 3)).toBe('2024-04-30');
    expect(addMonths('2024-01-31', 6)).toBe('2024-07-31');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(personalQuarter('2024-01-31', '2024-04-29')).toMatchObject({ number: 1, daysLeft: 1 });
    expect(personalQuarter('2024-01-31', '2024-04-30')).toMatchObject({ number: 2, endDate: '2024-07-31' });
  });
  it('crosses years and keeps quarters after the two-year recommendation horizon', () => {
    expect(personalQuarter('2025-11-30', '2026-02-28')).toMatchObject({ number: 2, endDate: '2026-05-30' });
    expect(personalQuarter('2024-09-09', '2026-09-09').number).toBe(9);
    expect(quarterlySchedule(config, '2024-09-09', '2026-09-09', null, [])).toEqual([]);
  });
  it('rejects impossible dates instead of rolling them silently', () => {
    expect(() => dateOnly('2025-02-29')).toThrow();
    expect(() => dateOnly('garbage')).toThrow();
  });
  it('covers the remaining core once and respects an explicit exam date', () => {
    const plan = quarterlySchedule(config, '2026-01-31', '2026-04-30', '2026-09-15', []);
    expect(plan.map(p => p.number)).toEqual([2, 3]);
    expect(plan.at(-1)?.endDate).toBe('2026-09-15');
    expect(plan.flatMap(p => p.chapters)).toEqual(config.chapters.map(c => c.id));
    expect(quarterlySchedule({ ...config, status: 'draft' }, '2026-01-31', '2026-04-30', null, [])).toEqual([]);
  });
  it('gates the medical groups on exact approved core membership, including 54 and 9', () => {
    const ids = APPROVED_TOPIC_GROUPS.flatMap(g => [...g.chapterIds]);
    expect(ids).toHaveLength(43); expect(new Set(ids).size).toBe(43);
    expect(ids).toContain(54); expect(ids).toContain(9);
    const full = { ...config, chapters: ids.map(id => ({ id, title: String(id) })) };
    expect(groupsMatch(full)).toBe(true);
    expect(groupsMatch({ ...full, status: 'draft' })).toBe(false);
    expect(groupsMatch({ ...full, chapters: full.chapters.slice(1) })).toBe(false);
  });
});
