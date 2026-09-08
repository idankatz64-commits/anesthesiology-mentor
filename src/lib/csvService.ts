import { supabase } from '@/integrations/supabase/client';
import { KEYS, type Question } from './types';

const CACHE_KEY = 'questions_cache';
const SCOPE_KEY = 'questions_cache_scope';
let cacheScope = '';

/** Clear the sessionStorage question cache so next fetchQuestions re-fetches from DB */
export function invalidateQuestionsCache(): void {
  sessionStorage.removeItem(CACHE_KEY);
}

/**
 * Stamp the cache with who it belongs to (user id + national entitlement).
 * A bank cached under a different stamp is dropped. Returns true when that
 * happened, so the caller can refetch live. An empty previous stamp (bank
 * fetched before identity was known, same session token) is kept.
 * This cannot erase data a client already received while offline — RLS is
 * the boundary; this only stops the client replaying an older answer.
 */
export function setQuestionsCacheScope(scope: string): boolean {
  const previous = sessionStorage.getItem(SCOPE_KEY) ?? '';
  cacheScope = scope;
  try { sessionStorage.setItem(SCOPE_KEY, scope); } catch { /* quota */ }
  if (previous && previous !== scope) { invalidateQuestionsCache(); return true; }
  return false;
}

/** Fetch all questions from the Supabase questions table with retry + sessionStorage cache */
export async function fetchQuestions(retries = 3, skipCache = false): Promise<Question[]> {
  // Whose bank this is. Read at the START, not at the end: a fetch that began under one
  // identity/entitlement and finishes after a switch must not be stamped with the new scope.
  const scopeAtStart = cacheScope;

  // Check sessionStorage cache first (unless explicitly skipped)
  if (!skipCache) {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Question[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* ignore bad cache */ }
    }
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const allQuestions: Question[] = [];
      let from = 0;
      const batchSize = 500;

      while (true) {
        const { data, error } = await supabase
          .from('questions')
          .select('id,ref_id,question,a,b,c,d,correct,explanation,topic,year,source,miller,chapter,media_type,media_link,kind')
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        const mapped = data.map((row) => ({
          [KEYS.ID]: row.id,
          [KEYS.REF_ID]: row.ref_id || 'N/A',
          [KEYS.QUESTION]: row.question || '',
          [KEYS.A]: row.a || '',
          [KEYS.B]: row.b || '',
          [KEYS.C]: row.c || '',
          [KEYS.D]: row.d || '',
          [KEYS.CORRECT]: row.correct,
          [KEYS.EXPLANATION]: row.explanation || '',
          [KEYS.TOPIC]: row.topic || '',
          [KEYS.YEAR]: row.year || '',
          [KEYS.SOURCE]: row.source || 'N/A',
          [KEYS.MILLER]: row.miller || 'N/A',
          [KEYS.CHAPTER]: row.chapter || 0,
          [KEYS.MEDIA_TYPE]: row.media_type || '',
          [KEYS.MEDIA_LINK]: row.media_link || '',
          [KEYS.KIND]: row.kind || '',
        } as Question));

        allQuestions.push(...mapped);
        if (data.length < batchSize) break;
        from += batchSize;
      }

      // Cache in sessionStorage (clears when tab closes). Skipped when the scope moved
      // under us — the caller still gets the rows, they just do not outlive this call.
      if (cacheScope === scopeAtStart) {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(allQuestions)); sessionStorage.setItem(SCOPE_KEY, cacheScope); } catch { /* quota */ }
      }

      return allQuestions;
    } catch (err) {
      console.error(`Fetch attempt ${attempt}/${retries} failed:`, err);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return [];
}

