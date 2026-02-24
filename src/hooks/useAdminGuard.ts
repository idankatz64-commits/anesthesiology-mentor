import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export function useAdminGuard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate('/', { replace: true });
        return;
      }

      const { data, error } = await supabase
        .from('admin_users')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error || !data) {
        navigate('/', { replace: true });
        return;
      }

      setIsAdmin(true);
      setLoading(false);
    })();
  }, [navigate]);

  return { loading, isAdmin };
}
