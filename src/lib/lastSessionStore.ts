/**
 * The "last session" card on Home, kept in localStorage.
 *
 * localStorage is per browser profile, not per account: a demo run, a previous
 * resident and a brand-new learner all share one key. Unstamped, the record was
 * shown to whoever logged in next — a fresh learner with an empty cloud history
 * was greeted by someone else's (demo) session.
 *
 * So the record carries its owner, and the reader only accepts a record whose
 * owner is the currently authenticated user. A record with a different owner —
 * or with no owner at all, which is every record written before this change and
 * every demo/signed-out run — is simply not displayed. It is never deleted and
 * never re-attributed to the reader: unknown provenance stays unknown.
 *
 * This is a display cache only. It grants nothing; the real history lives in
 * user_answers behind RLS.
 */

const KEY = "last_session_results";

export interface LastSessionResults {
  score: number;
  total: number;
  pct: number | null;
  mode: string;
  topics: string[];
  timestamp: number;
  /** Owner of the record. Absent on pre-2026-09-08 records and on signed-out/demo runs. */
  userId?: string | null;
}

/**
 * A record is only usable if it still has the shape Home renders. Anything else —
 * an older format, a half-written value, a hand-edited key — is treated like a
 * foreign record: not shown, not deleted. HomeView maps over `topics` and formats
 * `timestamp`, so a malformed field there is a blank Home screen, not a blank card.
 */
function isWellFormed(record: unknown): record is LastSessionResults {
  const r = record as Partial<LastSessionResults> | null;
  return (
    !!r &&
    typeof r.score === "number" &&
    typeof r.total === "number" &&
    (r.pct === null || typeof r.pct === "number") &&
    typeof r.mode === "string" &&
    typeof r.timestamp === "number" &&
    Array.isArray(r.topics) &&
    r.topics.every((t) => typeof t === "string")
  );
}

/** The stored record, only when the signed-in user is the one who wrote it. */
export function readLastSession(userId: string | null | undefined): LastSessionResults | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastSessionResults | null;
    return parsed && parsed.userId === userId && isWellFormed(parsed) ? parsed : null;
  } catch {
    return null; // corrupt record: show no card rather than break Home
  }
}

export function writeLastSession(userId: string | null | undefined, results: Omit<LastSessionResults, "userId">): void {
  localStorage.setItem(KEY, JSON.stringify({ ...results, userId: userId ?? null }));
}
