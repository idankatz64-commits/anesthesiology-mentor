// Owner-only aggregate and processor controls for migration 20260908000003.
// No learner identity, question content or answer data is returned here.
import { supabase } from '@/integrations/supabase/client';

export type FsrsEventSummary = {
  total: number; eligible: number; excluded: number; unscored: number;
  missingConfidence: number; estimatedConfidence: number; lateOutOfOrder: number; afterPriorFeedback: number;
  national: number; firstConfirmedAt: string | null; lastConfirmedAt: string | null;
};
export type FsrsProcessingSummary = { pending: number; processing: number; processed: number; failed: number };
export type FsrsComparisonSummary = {
  fsrsCards: number; cardsWithSm2: number; fsrsEarlier: number; sameDate: number;
  fsrsLater: number; meanDeltaDays: number | null;
};
export type FsrsShadowSummary = {
  activeScheduler: 'sm2'; shadowAlgorithm: string; parameterVersion: string;
  events: FsrsEventSummary; processing: FsrsProcessingSummary;
  comparison: FsrsComparisonSummary; limitations: string[];
};
export type FsrsBatchResult = { claimed: number; applied: number; excluded: number; failed: number };

type Raw = Record<string, unknown>;
const count = (value: unknown): number => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const stringOrNull = (value: unknown): string | null => typeof value === 'string' ? value : null;
const rawObject = (value: unknown): Raw => value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {};
const fsrsError = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  if (message.includes('NOT_OWNER')) return new Error('NOT_OWNER');
  if (message.includes('NOT_AUTHENTICATED')) return new Error('NOT_AUTHENTICATED');
  return new Error('FSRS_UNAVAILABLE');
};

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  try {
    // Migration 000003 is newer than generated database types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(name, args);
    if (error) throw error;
    return data as T;
  } catch (error) { throw fsrsError(error); }
}

export function mapFsrsShadowSummary(value: unknown): FsrsShadowSummary {
  const root = rawObject(value); const events = rawObject(root.events);
  const processing = rawObject(root.processing); const comparison = rawObject(root.comparison);
  return {
    activeScheduler: 'sm2',
    shadowAlgorithm: typeof root.shadow_algorithm === 'string' ? root.shadow_algorithm : 'ts-fsrs@5.4.2',
    parameterVersion: typeof root.parameter_version === 'string' ? root.parameter_version : 'default-r0.90-v1',
    events: {
      total: count(events.total), eligible: count(events.eligible), excluded: count(events.excluded),
      unscored: count(events.unscored), missingConfidence: count(events.missing_confidence),
      estimatedConfidence: count(events.estimated_confidence), lateOutOfOrder: count(events.late_out_of_order),
      afterPriorFeedback: count(events.after_prior_feedback),
      national: count(events.national), firstConfirmedAt: stringOrNull(events.first_confirmed_at),
      lastConfirmedAt: stringOrNull(events.last_confirmed_at),
    },
    processing: {
      pending: count(processing.pending), processing: count(processing.processing),
      processed: count(processing.processed), failed: count(processing.failed),
    },
    comparison: {
      fsrsCards: count(comparison.fsrs_cards), cardsWithSm2: count(comparison.cards_with_sm2),
      fsrsEarlier: count(comparison.fsrs_earlier), sameDate: count(comparison.same_date),
      fsrsLater: count(comparison.fsrs_later),
      meanDeltaDays: comparison.mean_delta_days == null || !Number.isFinite(Number(comparison.mean_delta_days)) ? null : Number(comparison.mean_delta_days),
    },
    limitations: Array.isArray(root.limitations) ? root.limitations.filter((v): v is string => typeof v === 'string') : [],
  };
}

export const fetchFsrsShadowSummary = async (): Promise<FsrsShadowSummary> =>
  mapFsrsShadowSummary(await rpc<unknown>('fsrs_shadow_summary', {}));

export async function processFsrsShadow(): Promise<FsrsBatchResult> {
  try {
    const { data, error } = await supabase.functions.invoke('fsrs-shadow', { body: {} });
    if (error) throw error;
    const raw = rawObject(data);
    return { claimed: count(raw.claimed), applied: count(raw.applied), excluded: count(raw.excluded), failed: count(raw.failed) };
  } catch (error) { throw fsrsError(error); }
}

export const retryFailedFsrsEvents = (): Promise<number> => rpc<unknown>('fsrs_shadow_retry_failed', {}).then(count);

export const fsrsShadowErrorMessage = (error: unknown): string => {
  const code = error instanceof Error ? error.message : '';
  if (code === 'NOT_OWNER') return 'השוואת FSRS שמורה לעידן בלבד.';
  if (code === 'NOT_AUTHENTICATED') return 'יש להתחבר מחדש כדי להמשיך.';
  return 'נתוני ההשוואה אינם זמינים כרגע. בדקו את החיבור ונסו שוב.';
};
