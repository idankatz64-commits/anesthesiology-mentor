import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Lightweight admin check — no redirect, just returns isAdmin boolean */
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data } = await supabase.rpc('is_admin', { _user_id: session.user.id });
      if (data) setIsAdmin(true);
    })();
  }, []);

  return isAdmin;
}
