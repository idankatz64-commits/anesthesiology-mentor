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

// Row shape returned from `spaced_repetition` SELECT.
// confidence/last_correct may be null on legacy rows or partial writes.
export interface SrsRow {
  question_id: string;
  next_review_date: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  confidence: ConfidenceLevel | null;
  last_correct: boolean | null;
}

// Read-side counterpart to SrsUpsertPayload — all 5 SM-2 fields needed by smart selection.
export interface SrsRecord {
  next_review_date: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  confidence: ConfidenceLevel | null;
  last_correct: boolean | null;
}

export function buildSrsRecordMap(rows: readonly SrsRow[]): Record<string, SrsRecord> {
  const map: Record<string, SrsRecord> = {};
  for (const row of rows) {
    map[row.question_id] = {
      next_review_date: row.next_review_date,
      interval_days: row.interval_days,
      ease_factor: row.ease_factor,
      repetitions: row.repetitions,
      confidence: row.confidence,
      last_correct: row.last_correct,
    };
  }
  return map;
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
