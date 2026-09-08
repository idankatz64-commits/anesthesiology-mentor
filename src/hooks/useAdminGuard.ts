import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

/**
 * Admin access is re-derived for the *current* identity: an identity switch or sign-out
 * clears access immediately and re-checks the role; a role answer that arrives for a
 * previous identity is discarded.
 */
export function useAdminGuard() {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, isAdmin: false });

  useEffect(() => {
    let generation = 0;
    let current: string | null | undefined; // undefined = identity not resolved yet

    const check = async (userId: string | null) => {
      const mine = ++generation;
      setState({ loading: true, isAdmin: false });
      if (!userId) {
        navigate('/', { replace: true });
        return;
      }
      const { data, error } = await supabase.rpc('is_admin', { _user_id: userId });
      if (mine !== generation) return; // identity changed while the role request was in flight
      if (error || !data) {
        navigate('/', { replace: true });
        return;
      }
      setState({ loading: false, isAdmin: true });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (current !== undefined) return;
      current = session?.user?.id ?? null;
      check(current);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null;
      if (userId === current) return;
      current = userId;
      check(userId);
    });
    return () => { generation += 1; subscription.unsubscribe(); };
  }, [navigate]);

  return state;
}
