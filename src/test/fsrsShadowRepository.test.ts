import { describe, expect, it, vi } from 'vitest';
import { mapFsrsShadowSummary } from '@/lib/fsrsShadowRepository';

const db = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: db.rpc, functions: { invoke: db.invoke } } }));

describe('FSRS owner aggregate mapping', () => {
  it('maps only aggregate fields and preserves the active-scheduler label', () => {
    const result = mapFsrsShadowSummary({
      active_scheduler: 'sm2', shadow_algorithm: 'ts-fsrs@5.4.2', parameter_version: 'default-r0.90-v1',
      events: { total: 9, eligible: 6, excluded: 3, unscored: 2, missing_confidence: 1, estimated_confidence: 0, late_out_of_order: 1, after_prior_feedback: 4, national: 2 },
      processing: { pending: 1, processing: 0, processed: 8, failed: 0 },
      comparison: { fsrs_cards: 6, cards_with_sm2: 5, fsrs_earlier: 1, same_date: 2, fsrs_later: 2, mean_delta_days: '1.40' },
      limitations: ['Shadow only'], user_id: 'must-not-map', question_id: 'must-not-map',
    });
    expect(result.activeScheduler).toBe('sm2');
    expect(result.events.afterPriorFeedback).toBe(4);
    expect(result.events.lateOutOfOrder).toBe(1);
    expect(result.comparison.meanDeltaDays).toBe(1.4);
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('questionId');
  });

  it('fails closed to bounded counts for malformed aggregate values', () => {
    const result = mapFsrsShadowSummary({ events: { total: 'bad', eligible: -1 }, comparison: { mean_delta_days: 'NaN' } });
    expect(result.events.total).toBe(0);
    expect(result.events.eligible).toBe(0);
    expect(result.comparison.meanDeltaDays).toBeNull();
  });
});
