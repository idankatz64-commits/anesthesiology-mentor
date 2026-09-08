import { describe, it, expect } from 'vitest';
import { selectBounded, classifyQuestion, type SelectionResult } from '@/lib/selectionPolicy';
import type { Question, HistoryEntry } from '@/lib/types';
import { KEYS } from '@/lib/types';
import type { SrsRecord } from '@/lib/srsRepository';

// Frozen clock; every date below is relative to it.
const NOW = new Date('2026-09-07T12:00:00Z').getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Deterministic generator so tier order is testable without Math.random.
function lcg(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

// Question has 17 required fields — same pattern as smartSelection.test.ts, no cast.
function q(id: string, topic = 'Cardiac Physiology'): Question {
  return {
    [KEYS.ID]: id,
    [KEYS.REF_ID]: id,
    [KEYS.QUESTION]: '?',
    [KEYS.A]: 'a', [KEYS.B]: 'b', [KEYS.C]: 'c', [KEYS.D]: 'd',
    [KEYS.CORRECT]: 'A',
    [KEYS.EXPLANATION]: '',
    [KEYS.TOPIC]: topic,
    [KEYS.YEAR]: '2024',
    [KEYS.SOURCE]: '',
    [KEYS.MILLER]: '',
    [KEYS.CHAPTER]: 1,
    [KEYS.MEDIA_TYPE]: '',
    [KEYS.MEDIA_LINK]: '',
    [KEYS.KIND]: '',
  };
}
const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => q(`${prefix}-${i}`));

// Mirrors how AppContext builds HistoryEntry from user_answers
// (answered_count, correct_count, is_correct, ever_wrong, updated_at).
function seen(
  lastResult: HistoryEntry['lastResult'],
  opts: { answered?: number; everWrong?: boolean; hoursAgo?: number } = {},
): HistoryEntry {
  return {
    answered: opts.answered ?? 1,
    correct: lastResult === 'correct' ? 1 : 0,
    lastResult,
    everWrong: opts.everWrong ?? lastResult === 'wrong',
    timestamp: NOW - (opts.hoursAgo ?? 48) * HOUR,
  };
}

// spaced_repetition.next_review_date is a Postgres date → 'YYYY-MM-DD'.
function srs(daysOut: number): SrsRecord {
  return {
    next_review_date: new Date(NOW + daysOut * DAY).toISOString().slice(0, 10),
    interval_days: 1,
    ease_factor: 2.5,
    repetitions: 1,
    confidence: null,
    last_correct: daysOut > 0,
  };
}

const ids = (r: SelectionResult) => r.questions.map(x => x[KEYS.ID]);
const histOf = (...entries: [string, HistoryEntry][]) => Object.fromEntries(entries);
const srsOf = (...entries: [string, SrsRecord][]) => Object.fromEntries(entries);

type Opts = Parameters<typeof selectBounded>[3];
const run = (
  pool: Question[],
  history: Record<string, HistoryEntry>,
  srsData: Record<string, SrsRecord>,
  opts: Partial<Opts> & Pick<Opts, 'mode' | 'count'>,
) => selectBounded(pool, history, srsData, { nowMs: NOW, random: lcg(), ...opts });

const ZERO = { new: 0, mistake: 0, due: 0, repeated: 0, unknown: 0 };

// ────────────────────────────────────────────────────────────────────
describe('classifyQuestion — buckets from the persisted history shape', () => {
  it('no history row → new', () => {
    expect(classifyQuestion('x', {}, {}, NOW)).toBe('new');
  });

  it('SRS without a matching history row is unknown, including due, future, and malformed dates', () => {
    expect(classifyQuestion('due', {}, srsOf(['due', srs(-3)]), NOW)).toBe('unknown');
    expect(classifyQuestion('future', {}, srsOf(['future', srs(10)]), NOW)).toBe('unknown');
    expect(classifyQuestion('malformed', {}, srsOf(['malformed', { ...srs(0), next_review_date: 'not-a-date' }]), NOW)).toBe('unknown');
  });

  it('last scored answer wrong → mistake, even when the SRS record is also due', () => {
    const history = histOf(['x', seen('wrong')]);
    expect(classifyQuestion('x', history, srsOf(['x', srs(-3)]), NOW)).toBe('mistake');
    expect(classifyQuestion('x', history, {}, NOW)).toBe('mistake');
  });

  it('a later correct answer removes the mistake even if still due → due', () => {
    const history = histOf(['x', seen('correct', { everWrong: true })]);
    expect(classifyQuestion('x', history, srsOf(['x', srs(0)]), NOW)).toBe('due');
    expect(classifyQuestion('x', history, srsOf(['x', srs(-10)]), NOW)).toBe('due');
  });

  it('seen, correct, not yet due (or no SRS row) → repeated', () => {
    const history = histOf(['x', seen('correct')]);
    expect(classifyQuestion('x', history, srsOf(['x', srs(3)]), NOW)).toBe('repeated');
    expect(classifyQuestion('x', history, {}, NOW)).toBe('repeated');
  });

  it('ambiguous rows are unknown, never a mistake: lastResult null, or answered 0', () => {
    expect(classifyQuestion('x', histOf(['x', seen(null)]), {}, NOW)).toBe('unknown');
    expect(classifyQuestion('x', histOf(['x', seen('wrong', { answered: 0 })]), {}, NOW)).toBe('unknown');
  });
});

// ────────────────────────────────────────────────────────────────────
describe('selectBounded — count', () => {
  it.each([0, -1, Number.NaN, 2.5, Number.POSITIVE_INFINITY])('count %p is invalid → nothing selected, reason invalid-count', (count) => {
    const r = run(many('n', 5), {}, {}, { mode: 'practice', count });
    expect(r.questions).toEqual([]);
    expect(r.shortage.reason).toBe('invalid-count');
    expect(r.shortage.selected).toBe(0);
    expect(r.composition).toEqual(ZERO);
  });

  it('count beyond the pool → whole eligible pool, missing disclosed, no cap', () => {
    const r = run(many('n', 4), {}, {}, { mode: 'practice', count: 10 });
    expect(r.questions).toHaveLength(4);
    expect(r.shortage).toMatchObject({ requested: 10, selected: 4, missing: 6, reason: 'pool-exhausted' });
  });

  it('count equal to eligible pool → reason none, missing 0', () => {
    const r = run(many('n', 4), {}, {}, { mode: 'exam', count: 4 });
    expect(r.questions).toHaveLength(4);
    expect(r.shortage).toMatchObject({ requested: 4, selected: 4, missing: 0, reason: 'none' });
  });

  it('large count is honoured up to the pool (no arbitrary ceiling)', () => {
    const r = run(many('n', 500), {}, {}, { mode: 'practice', count: 500 });
    expect(r.questions).toHaveLength(500);
    expect(r.shortage.reason).toBe('none');
  });

  it('empty pool → empty-pool', () => {
    const r = run([], {}, {}, { mode: 'exam', count: 5 });
    expect(r.questions).toEqual([]);
    expect(r.shortage).toMatchObject({ requested: 5, selected: 0, missing: 5, reason: 'empty-pool' });
  });
});

// ────────────────────────────────────────────────────────────────────
describe('selectBounded — eligibility is disclosed, never bypassed', () => {
  it('history-absent SRS is unknown: it cannot displace unseen questions, and future scheduling still excludes it', () => {
    const pool = [q('fresh'), q('orphan-due'), q('orphan-future'), q('orphan-malformed')];
    const srsData = srsOf(
      ['orphan-due', srs(-3)],
      ['orphan-future', srs(10)],
      ['orphan-malformed', { ...srs(0), next_review_date: 'not-a-date' }],
    );
    const r = run(pool, {}, srsData, { mode: 'exam', count: 2 });
    expect(ids(r)).toContain('fresh');
    expect(ids(r)).not.toContain('orphan-future');
    expect(r.composition).toEqual({ ...ZERO, new: 1, unknown: 1 });
    expect(r.shortage.excluded.futureScheduled).toBe(1);
  });

  it('cooldown shortage: questions answered 1h ago are not pulled in to fill the count', () => {
    const pool = [q('cool'), q('hot-0'), q('hot-1'), q('hot-2'), q('hot-3')];
    const history = histOf(
      ['cool', seen('correct', { hoursAgo: 48 })],
      ...(['hot-0', 'hot-1', 'hot-2', 'hot-3'] as const).map((id): [string, HistoryEntry] => [id, seen('wrong', { hoursAgo: 1 })]),
    );
    const r = run(pool, history, {}, { mode: 'practice', count: 3 });
    expect(ids(r)).toEqual(['cool']);
    expect(r.shortage).toMatchObject({ requested: 3, selected: 1, missing: 2, reason: 'pool-exhausted' });
    expect(r.shortage.excluded.cooldown).toBe(4);
  });

  it('future-scheduled (>7 days) questions are excluded and counted', () => {
    const pool = [q('far-0'), q('far-1'), q('near'), q('fresh')];
    const history = histOf(['far-0', seen('correct')], ['far-1', seen('correct')], ['near', seen('correct')]);
    const srsData = srsOf(['far-0', srs(10)], ['far-1', srs(40)], ['near', srs(3)]);
    const r = run(pool, history, srsData, { mode: 'exam', count: 4 });
    expect(new Set(ids(r))).toEqual(new Set(['near', 'fresh']));
    expect(r.shortage.excluded.futureScheduled).toBe(2);
    expect(r.shortage.missing).toBe(2);
  });

  it('duplicate IDs in the input never appear twice in one session', () => {
    const pool = [q('a'), q('a'), q('b'), q('b'), q('c')];
    const r = run(pool, {}, {}, { mode: 'practice', count: 5 });
    expect(ids(r).sort()).toEqual(['a', 'b', 'c']);
    expect(new Set(ids(r)).size).toBe(r.questions.length);
    expect(r.shortage.excluded.duplicate).toBe(2);
  });

  it('result is always a subset of the caller pool; history about other questions cannot widen it', () => {
    const pool = [q('in-0'), q('in-1')];
    const history = histOf(['outside-0', seen('wrong')], ['outside-1', seen('wrong')], ['in-0', seen('wrong')]);
    const r = run(pool, history, srsOf(['outside-0', srs(-5)]), { mode: 'exam', count: 10, mistakesOnly: true });
    expect(ids(r)).toEqual(['in-0']);
    const inPool = new Set(pool.map(x => x[KEYS.ID]));
    r.questions.forEach(x => expect(inPool.has(x[KEYS.ID])).toBe(true));
  });

  it('composition always sums to the number of selected questions', () => {
    const pool = [...many('new', 3), q('m'), q('d'), q('r'), q('u')];
    const history = histOf(['m', seen('wrong')], ['d', seen('correct')], ['r', seen('correct')], ['u', seen(null)]);
    const srsData = srsOf(['d', srs(-1)], ['r', srs(2)]);
    for (const count of [1, 3, 5, 7, 9]) {
      const r = run(pool, history, srsData, { mode: 'exam', count });
      const total = Object.values(r.composition).reduce((a, b) => a + b, 0);
      expect(total).toBe(r.questions.length);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
describe('selectBounded — mistakesOnly never widens the filter', () => {
  it('zero eligible mistakes → empty, reason no-eligible-mistakes, not filled from other buckets', () => {
    const r = run(many('n', 5), {}, {}, { mode: 'practice', count: 5, mistakesOnly: true });
    expect(r.questions).toEqual([]);
    expect(r.shortage).toMatchObject({ requested: 5, selected: 0, missing: 5, reason: 'no-eligible-mistakes' });
    expect(r.shortage.excluded.notMistake).toBe(5);
  });

  it('conflicting filters: the only mistakes are in cooldown → empty, both exclusions disclosed', () => {
    const pool = [q('m-0'), q('m-1'), ...many('n', 3)];
    const history = histOf(['m-0', seen('wrong', { hoursAgo: 2 })], ['m-1', seen('wrong', { hoursAgo: 5 })]);
    const r = run(pool, history, {}, { mode: 'exam', count: 5, mistakesOnly: true });
    expect(r.questions).toEqual([]);
    expect(r.shortage.reason).toBe('no-eligible-mistakes');
    expect(r.shortage.excluded).toMatchObject({ cooldown: 2, notMistake: 3 });
  });

  it('fewer mistakes than requested → exactly the mistakes, shortage disclosed', () => {
    const pool = [q('m-0'), q('m-1'), ...many('n', 5)];
    const history = histOf(['m-0', seen('wrong')], ['m-1', seen('wrong')]);
    const r = run(pool, history, {}, { mode: 'practice', count: 5, mistakesOnly: true });
    expect(new Set(ids(r))).toEqual(new Set(['m-0', 'm-1']));
    expect(r.composition).toEqual({ ...ZERO, mistake: 2 });
    expect(r.shortage).toMatchObject({ requested: 5, selected: 2, missing: 3, reason: 'pool-exhausted' });
  });

  it('correct-after-error removes the mistake: not selected by mistakesOnly even though still due', () => {
    const pool = [q('fixed'), q('still-wrong')];
    const history = histOf(
      ['fixed', seen('correct', { everWrong: true })],
      ['still-wrong', seen('wrong')],
    );
    const r = run(pool, history, srsOf(['fixed', srs(-2)]), { mode: 'exam', count: 2, mistakesOnly: true });
    expect(ids(r)).toEqual(['still-wrong']);
  });

  it('unscored / ambiguous rows are never treated as mistakes', () => {
    const pool = [q('null-result'), q('zombie'), q('real')];
    const history = histOf(
      ['null-result', seen(null)],
      ['zombie', seen('wrong', { answered: 0 })],
      ['real', seen('wrong')],
    );
    const r = run(pool, history, {}, { mode: 'practice', count: 3, mistakesOnly: true });
    expect(ids(r)).toEqual(['real']);
    expect(r.shortage.excluded.notMistake).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────────────
describe('selectBounded — exam prioritises unseen, then mistakes, then due, then repeated', () => {
  const pool = [...many('new', 3), q('m-0'), q('m-1'), q('d-0'), q('d-1'), q('r-0'), q('r-1'), q('r-2')];
  const history = histOf(
    ['m-0', seen('wrong')], ['m-1', seen('wrong')],
    ['d-0', seen('correct')], ['d-1', seen('correct')],
    ['r-0', seen('correct')], ['r-1', seen('correct')], ['r-2', seen('correct')],
  );
  const srsData = srsOf(['d-0', srs(0)], ['d-1', srs(-4)], ['r-0', srs(2)], ['r-1', srs(5)]);

  it('insufficient unseen: all unseen first, then mistakes, then due — composition says so', () => {
    const r = run(pool, history, srsData, { mode: 'exam', count: 6 });
    const got = ids(r);
    expect(new Set(got.slice(0, 3))).toEqual(new Set(['new-0', 'new-1', 'new-2']));
    expect(new Set(got.slice(3, 5))).toEqual(new Set(['m-0', 'm-1']));
    expect(['d-0', 'd-1']).toContain(got[5]);
    expect(r.composition).toEqual({ new: 3, mistake: 2, due: 1, repeated: 0, unknown: 0 });
    expect(r.shortage.reason).toBe('none');
  });

  it('enough unseen: only unseen are taken', () => {
    const r = run([...many('new', 10), q('m-0')], history, srsData, { mode: 'exam', count: 5 });
    expect(r.composition).toEqual({ ...ZERO, new: 5 });
  });

  it('repeated fill only after due is exhausted; unknown is the last resort', () => {
    const withUnknown = [...pool, q('u')];
    const hist2 = { ...history, u: seen(null) };
    const r9 = run(withUnknown, hist2, srsData, { mode: 'exam', count: 9 });
    expect(r9.composition).toEqual({ new: 3, mistake: 2, due: 2, repeated: 2, unknown: 0 });
    const r11 = run(withUnknown, hist2, srsData, { mode: 'exam', count: 11 });
    expect(r11.composition).toEqual({ new: 3, mistake: 2, due: 2, repeated: 3, unknown: 1 });
    expect(r11.shortage.reason).toBe('none');
  });

  it('within a tier the order follows the injected random source', () => {
    const a = ids(run(many('new', 8), {}, {}, { mode: 'exam', count: 8, random: lcg(1) }));
    const b = ids(run(many('new', 8), {}, {}, { mode: 'exam', count: 8, random: lcg(1) }));
    expect(a).toEqual(b);
    expect(new Set(a)).toEqual(new Set(many('new', 8).map(x => x[KEYS.ID])));
  });
});

// ────────────────────────────────────────────────────────────────────
describe('selectBounded — practice is unrestricted', () => {
  it('takes every eligible question regardless of bucket', () => {
    const pool = [...many('new', 3), q('m'), q('d'), q('r')];
    const history = histOf(['m', seen('wrong')], ['d', seen('correct')], ['r', seen('correct')]);
    const srsData = srsOf(['d', srs(-1)], ['r', srs(3)]);
    const r = run(pool, history, srsData, { mode: 'practice', count: 6 });
    expect(r.questions).toHaveLength(6);
    expect(r.composition).toEqual({ new: 3, mistake: 1, due: 1, repeated: 1, unknown: 0 });
  });

  it('does not force unseen first: with a fixed random source the first pick can be a seen question', () => {
    // random() → 0 makes Fisher–Yates rotate, so the head of the result is not the head of the pool.
    const pool = [q('new-0'), q('seen-0'), q('seen-1')];
    const history = histOf(['seen-0', seen('correct')], ['seen-1', seen('correct')]);
    const r = run(pool, history, {}, { mode: 'practice', count: 1, random: () => 0 });
    expect(r.questions).toHaveLength(1);
    expect(['seen-0', 'seen-1']).toContain(ids(r)[0]);
  });

  it('still honours cooldown and schedule filters', () => {
    const pool = [q('hot'), q('far'), q('ok')];
    const history = histOf(['hot', seen('correct', { hoursAgo: 1 })], ['far', seen('correct')]);
    const r = run(pool, history, srsOf(['far', srs(30)]), { mode: 'practice', count: 3 });
    expect(ids(r)).toEqual(['ok']);
    expect(r.shortage.excluded).toMatchObject({ cooldown: 1, futureScheduled: 1 });
  });
});

// ────────────────────────────────────────────────────────────────────
// PHASE-3B-FIX §2: explicit manual practice lifts the adaptive SRS filters.
describe('selectBounded — manual practice permits repeats', () => {
  it('manual practice: cooldown and future schedule no longer exclude, nothing is counted as excluded', () => {
    const pool = [q('hot'), q('far'), q('ok')];
    const history = histOf(['hot', seen('correct', { hoursAgo: 1 })], ['far', seen('correct')]);
    const r = run(pool, history, srsOf(['far', srs(30)]), { mode: 'practice', count: 3, manual: true });
    expect(ids(r).sort()).toEqual(['far', 'hot', 'ok']);
    expect(r.shortage).toMatchObject({ reason: 'none', excluded: { cooldown: 0, futureScheduled: 0 } });
  });

  it('manual mistakes-only: a mistake from an hour ago is offered, new questions still are not', () => {
    const pool = [q('wrong-now'), q('fresh')];
    const history = histOf(['wrong-now', seen('wrong', { hoursAgo: 1 })]);
    const r = run(pool, history, {}, { mode: 'practice', count: 5, manual: true, mistakesOnly: true });
    expect(ids(r)).toEqual(['wrong-now']);
    expect(r.shortage.excluded).toMatchObject({ cooldown: 0, notMistake: 1 });
  });

  it('manual is ignored in exam mode: the adaptive filters stay on', () => {
    const pool = [q('hot'), q('far'), q('ok')];
    const history = histOf(['hot', seen('correct', { hoursAgo: 1 })], ['far', seen('correct')]);
    const r = run(pool, history, srsOf(['far', srs(30)]), { mode: 'exam', count: 3, manual: true });
    expect(ids(r)).toEqual(['ok']);
    expect(r.shortage.excluded).toMatchObject({ cooldown: 1, futureScheduled: 1 });
  });

  it('manual still dedupes and stays inside the caller pool', () => {
    const r = run([q('a'), q('a'), q('b')], {}, {}, { mode: 'practice', count: 5, manual: true });
    expect(ids(r).sort()).toEqual(['a', 'b']);
    expect(r.shortage.excluded.duplicate).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// PHASE-3B-FIX §3: an optional rank orders inside the approved tiers; tiers still win.
describe('selectBounded — rank orders within tiers, never across them', () => {
  const rankOf = (scores: Record<string, number>) => (x: Question) => scores[x[KEYS.ID]] ?? 0;

  it('exam: unseen stays first even when a seen question outranks every unseen one', () => {
    const pool = [q('seen-top'), q('new-lo'), q('new-hi')];
    const history = histOf(['seen-top', seen('correct')]);
    const r = run(pool, history, {}, { mode: 'exam', count: 2, rank: rankOf({ 'seen-top': 9, 'new-hi': 2, 'new-lo': 1 }) });
    expect(ids(r)).toEqual(['new-hi', 'new-lo']);
  });

  it('exam: within a tier the higher rank comes first', () => {
    const pool = many('new', 5);
    const scores = { 'new-3': 5, 'new-0': 4, 'new-4': 3, 'new-1': 2, 'new-2': 1 };
    const r = run(pool, {}, {}, { mode: 'exam', count: 3, rank: rankOf(scores) });
    expect(ids(r)).toEqual(['new-3', 'new-0', 'new-4']);
  });

  it('practice: ranked across the whole eligible set, seen or not', () => {
    const pool = [q('new-a'), q('seen-b'), q('new-c')];
    const history = histOf(['seen-b', seen('correct')]);
    const r = run(pool, history, {}, { mode: 'practice', count: 2, rank: rankOf({ 'seen-b': 3, 'new-c': 2, 'new-a': 1 }) });
    expect(ids(r)).toEqual(['seen-b', 'new-c']);
  });

  it('ties follow the injected random source, so equal ranks are still shuffled', () => {
    const a = ids(run(many('new', 8), {}, {}, { mode: 'exam', count: 8, random: lcg(3), rank: () => 1 }));
    const b = ids(run(many('new', 8), {}, {}, { mode: 'exam', count: 8, random: lcg(3), rank: () => 1 }));
    const plain = ids(run(many('new', 8), {}, {}, { mode: 'exam', count: 8, random: lcg(3) }));
    expect(a).toEqual(b);
    expect(a).toEqual(plain);
  });
});
