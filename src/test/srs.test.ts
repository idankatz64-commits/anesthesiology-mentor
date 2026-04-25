import { describe, it, expect, vi } from 'vitest';
import { upsertSpacedRepetitionRecord, type SrsUpsertPayload } from '@/lib/srsRepository';
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
