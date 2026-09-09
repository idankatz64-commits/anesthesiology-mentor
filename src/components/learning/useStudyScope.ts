import { useEffect, useState } from 'react';
import { readStudyPreferences } from '@/lib/studyPreferencesRepository';
import type { StudyPreferences } from '@/lib/personalStudyPlan';

export function useStudyScope(userId: string | null) {
  const [state, setState] = useState<{ userId: string; preferences: StudyPreferences | null; error: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    setState(null);
    if (userId) readStudyPreferences().then(preferences => {
      if (active) setState({ userId, preferences, error: false });
    }).catch(() => { if (active) setState({ userId, preferences: null, error: true }); });
    return () => { active = false; };
  }, [userId]);
  const current = state?.userId === userId ? state : null;
  return { loading: !!userId && !current, error: current?.error ?? false, preferences: current?.preferences ?? null };
}
export const RANDOM_PLAN_NOTICE = 'עבודה אקראית: באחריותכם לוודא בכל פעם שסינון השאלות הוא לפי התכנית שלכם ולא כללי.';
