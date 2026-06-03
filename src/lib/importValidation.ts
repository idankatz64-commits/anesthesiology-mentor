import { z } from "zod";
import type { UserProgress, HistoryEntry } from "./types";

// Caps to keep a corrupt or hand-edited backup file from poisoning the user's rows.
const NOTE_MAX = 5000;
const TAG_MAX = 100;
const KEY_MAX = 200;
const COUNT_MAX = 1_000_000;

const historyEntrySchema = z.object({
  answered: z.number().int().min(0).max(COUNT_MAX),
  correct: z.number().int().min(0).max(COUNT_MAX),
  lastResult: z.enum(["correct", "wrong"]).nullable().catch(null),
  everWrong: z.boolean().catch(false),
  timestamp: z.number().int().min(0).catch(0),
});

const ratingSchema = z.enum(["easy", "medium", "hard"]);

function sanitizeRecord<T>(raw: unknown, validate: (value: unknown) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key !== "string" || key.length === 0 || key.length > KEY_MAX) continue;
    const clean = validate(value);
    if (clean !== undefined) out[key] = clean;
  }
  return out;
}

/**
 * Validate/coerce an untrusted imported backup into a clean UserProgress.
 * Invalid entries are DROPPED (or clamped/capped) rather than written verbatim, so a
 * corrupt export cannot land NaN counts, out-of-enum ratings, or oversized
 * text/tags into the user's Supabase rows. Valid data passes through unchanged.
 */
export function sanitizeImport(raw: unknown): UserProgress {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const history = sanitizeRecord<HistoryEntry>(obj.history, (v) => {
    const parsed = historyEntrySchema.safeParse(v);
    if (!parsed.success) return undefined;
    const h = parsed.data;
    const entry: HistoryEntry = {
      answered: h.answered,
      correct: Math.min(h.correct, h.answered), // correct can never exceed answered
      lastResult: h.lastResult,
      everWrong: h.everWrong,
      timestamp: h.timestamp,
    };
    return entry;
  });

  const notes = sanitizeRecord<string>(obj.notes, (v) => (typeof v === "string" ? v.slice(0, NOTE_MAX) : undefined));

  const ratings = sanitizeRecord<"easy" | "medium" | "hard">(obj.ratings, (v) => {
    const parsed = ratingSchema.safeParse(v);
    return parsed.success ? parsed.data : undefined;
  });

  const tags = sanitizeRecord<string[]>(obj.tags, (v) => {
    if (!Array.isArray(v)) return undefined;
    const clean = v.filter((t): t is string => typeof t === "string" && t.length > 0).map((t) => t.slice(0, TAG_MAX));
    return clean.length ? clean : undefined;
  });

  const favorites = Array.isArray(obj.favorites)
    ? obj.favorites.filter((f): f is string => typeof f === "string" && f.length > 0 && f.length <= KEY_MAX)
    : [];

  return { history, notes, favorites, ratings, tags };
}
