import { supabase } from '@/integrations/supabase/client';
import { KEYS, type Question } from './types';

const CACHE_KEY = 'questions_cache';

/** Clear the sessionStorage question cache so next fetchQuestions re-fetches from DB */
export function invalidateQuestionsCache(): void {
  sessionStorage.removeItem(CACHE_KEY);
}

/** Fetch all questions from the Supabase questions table with retry + sessionStorage cache */
export async function fetchQuestions(retries = 3, skipCache = false): Promise<Question[]> {
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

        const mapped = data.map((row: any) => ({
          [KEYS.ID]: row.id,
          [KEYS.REF_ID]: row.ref_id || 'N/A',
          [KEYS.QUESTION]: row.question,
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

      // Cache in sessionStorage (clears when tab closes)
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(allQuestions)); } catch { /* quota */ }

      return allQuestions;
    } catch (err) {
      console.error(`Fetch attempt ${attempt}/${retries} failed:`, err);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return [];
}

