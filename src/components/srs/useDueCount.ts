import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getIsraelToday } from '@/lib/dateHelpers';

export function useDueCount() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) { setCount(0); setLoading(false); return; }

    const today = getIsraelToday();
    const { count: c, error } = await supabase
      .from('spaced_repetition')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lte('next_review_date', today);

    if (error) {
      console.error('useDueCount error:', error);
      setCount(0);
    } else {
      setCount(c ?? 0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return { count, loading, refresh };
}
