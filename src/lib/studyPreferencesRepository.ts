import { supabase } from '@/integrations/supabase/client';
import type { StudyPreferences } from './personalStudyPlan';

async function request(name: string, args: Record<string, unknown>): Promise<StudyPreferences | null> {
  // RPCs are additive; generated types are refreshed separately at release.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw error;
  if (!data) return null;
  return { startDate: data.start_date, mode: data.mode, chapters: data.chapters };
}
export const readStudyPreferences = () => request('study_preferences_read', {});
export const saveStudyPreferences = (p: StudyPreferences) => request('study_preferences_save', { _start_date: p.startDate, _mode: p.mode, _chapters: p.chapters });
