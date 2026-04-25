import type { ConfidenceLevel } from '@/lib/types';

export interface SrsUpsertPayload {
  user_id: string;
  question_id: string;
  next_review_date: string;
  confidence: ConfidenceLevel;
  last_correct: boolean;
  updated_at: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
}

interface UpsertableTable {
  upsert: (payload: SrsUpsertPayload, opts: { onConflict: string }) => Promise<{ error: unknown }>;
}

interface SupabaseLike {
  from: (table: 'spaced_repetition') => UpsertableTable;
}

export async function upsertSpacedRepetitionRecord(
  supabase: SupabaseLike,
  payload: SrsUpsertPayload,
): Promise<void> {
  const { error } = await supabase
    .from('spaced_repetition')
    .upsert(payload, { onConflict: 'user_id,question_id' });

  if (error) {
    throw error;
  }
}
