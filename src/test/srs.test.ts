import { describe, it, expect, vi } from 'vitest';
import {
  upsertSpacedRepetitionRecord,
  buildSrsRecordMap,
  type SrsUpsertPayload,
  type SrsRow,
} from '@/lib/srsRepository';
import { evaluateSimulationOutcome } from '@/lib/simulationSubmit';

const samplePayload: SrsUpsertPayload = {
  user_id: 'u-1',
  question_id: 'q-1',
  next_review_date: '2026-04-30',
  confidence: 'confident',
  last_correct: true,
  updated_at: '2026-04-25T12:00:00Z',
  interval_days: 6,
  ease_factor: 2.6,
  repetitions: 2,
};

function makeSupabaseStub(result: { error: unknown }) {
  const upsert = vi.fn().mockResolvedValue(result);
  const from = vi.fn().mockReturnValue({ upsert });
  return { client: { from }, upsert, from };
}

describe('upsertSpacedRepetitionRecord', () => {
  it('resolves silently when supabase returns no error', async () => {
    const { client, upsert, from } = makeSupabaseStub({ error: null });

    await expect(upsertSpacedRepetitionRecord(client, samplePayload)).resolves.toBeUndefined();
    expect(from).toHaveBeenCalledWith('spaced_repetition');
    expect(upsert).toHaveBeenCalledWith(samplePayload, { onConflict: 'user_id,question_id' });
  });

  it('throws the original supabase error when one is returned', async () => {
    const supabaseError = { message: 'permission denied for table spaced_repetition', code: '42501' };
    const { client } = makeSupabaseStub({ error: supabaseError });

    await expect(upsertSpacedRepetitionRecord(client, samplePayload)).rejects.toBe(supabaseError);
  });

  it('throws even when the error object is truthy but minimal (e.g., string)', async () => {
    const { client } = makeSupabaseStub({ error: 'network timeout' });

    await expect(upsertSpacedRepetitionRecord(client, samplePayload)).rejects.toBe('network timeout');
  });
});

describe('evaluateSimulationOutcome', () => {
  it('returns zero counts and allows clearing when results array is empty', () => {
    const outcome = evaluateSimulationOutcome([]);
    expect(outcome).toEqual({ failedCount: 0, totalCount: 0, canClearSession: true });
  });

  it('allows clearing when every promise fulfilled', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: undefined },
      { status: 'fulfilled', value: undefined },
      { status: 'fulfilled', value: undefined },
    ];
    expect(evaluateSimulationOutcome(results)).toEqual({
      failedCount: 0,
      totalCount: 3,
      canClearSession: true,
    });
  });

  it('blocks clearing when any promise rejected', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: undefined },
      { status: 'rejected', reason: new Error('upsert failed') },
      { status: 'fulfilled', value: undefined },
    ];
    expect(evaluateSimulationOutcome(results)).toEqual({
      failedCount: 1,
      totalCount: 3,
      canClearSession: false,
    });
  });

  it('blocks clearing when all promises rejected (worst case for long simulations)', () => {
    const results: PromiseSettledResult<unknown>[] = Array.from({ length: 120 }, () => ({
      status: 'rejected' as const,
      reason: new Error('network down'),
    }));
    expect(evaluateSimulationOutcome(results)).toEqual({
      failedCount: 120,
      totalCount: 120,
      canClearSession: false,
    });
  });
});

describe('buildSrsRecordMap', () => {
  it('returns an empty map when given no rows', () => {
    expect(buildSrsRecordMap([])).toEqual({});
  });

  it('preserves all 5 SM-2 fields per row keyed by question_id', () => {
    const rows: SrsRow[] = [
      {
        question_id: 'q-1',
        next_review_date: '2026-05-02',
        interval_days: 6,
        ease_factor: 2.6,
        repetitions: 2,
        confidence: 'confident',
        last_correct: true,
      },
      {
        question_id: 'q-2',
        next_review_date: '2026-04-27',
        interval_days: 1,
        ease_factor: 1.7,
        repetitions: 0,
        confidence: 'guessed',
        last_correct: false,
      },
    ];

    const map = buildSrsRecordMap(rows);

    expect(map).toEqual({
      'q-1': {
        next_review_date: '2026-05-02',
        interval_days: 6,
        ease_factor: 2.6,
        repetitions: 2,
        confidence: 'confident',
        last_correct: true,
      },
      'q-2': {
        next_review_date: '2026-04-27',
        interval_days: 1,
        ease_factor: 1.7,
        repetitions: 0,
        confidence: 'guessed',
        last_correct: false,
      },
    });
  });

  it('tolerates legacy rows with null confidence/last_correct without crashing', () => {
    const rows: SrsRow[] = [
      {
        question_id: 'q-legacy',
        next_review_date: '2026-04-30',
        interval_days: 3,
        ease_factor: 2.5,
        repetitions: 1,
        confidence: null,
        last_correct: null,
      },
    ];

    const map = buildSrsRecordMap(rows);

    expect(map['q-legacy']).toEqual({
      next_review_date: '2026-04-30',
      interval_days: 3,
      ease_factor: 2.5,
      repetitions: 1,
      confidence: null,
      last_correct: null,
    });
  });

  it('on duplicate question_id, the later row overwrites the earlier (stable last-write-wins)', () => {
    const rows: SrsRow[] = [
      {
        question_id: 'q-dup',
        next_review_date: '2026-04-26',
        interval_days: 1,
        ease_factor: 2.5,
        repetitions: 0,
        confidence: 'hesitant',
        last_correct: true,
      },
      {
        question_id: 'q-dup',
        next_review_date: '2026-05-10',
        interval_days: 14,
        ease_factor: 2.8,
        repetitions: 4,
        confidence: 'confident',
        last_correct: true,
      },
    ];

    const map = buildSrsRecordMap(rows);

    expect(map['q-dup'].interval_days).toBe(14);
    expect(map['q-dup'].next_review_date).toBe('2026-05-10');
  });
});
