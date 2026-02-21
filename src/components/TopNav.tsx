import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { LogIn, LogOut, User, ChevronDown } from 'lucide-react';
import type { User as SupaUser } from '@supabase/supabase-js';

export default function TopNav() {
  const [user, setUser] = useState<SupaUser | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setDropdownOpen(false);
  };

  const displayName = user?.user_metadata?.full_name || user?.email || '';

  return (
    <div className="fixed top-0 left-0 right-0 h-14 bg-card/95 backdrop-blur-md border-b border-border z-50 flex items-center justify-between px-4 md:px-8" dir="rtl">
      <div className="font-bold text-foreground text-sm">
        סימולטור הרדמה
      </div>

      <div className="flex items-center gap-3">
        {!user ? (
          <>
            <button
              onClick={() => navigate('/auth')}
              className="text-sm font-medium text-primary hover:text-primary/80 transition flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-primary/10"
            >
              <LogIn className="w-4 h-4" />
              התחבר
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="text-sm font-medium bg-primary text-primary-foreground px-4 py-1.5 rounded-lg hover:opacity-90 transition"
            >
              הרשם
            </button>
          </>
        ) : (
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 text-sm text-foreground hover:bg-muted px-3 py-1.5 rounded-lg transition"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <span className="max-w-[150px] truncate text-xs font-medium">{displayName}</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute left-0 top-full mt-1 w-48 bg-card border border-border rounded-xl shadow-lg z-50 py-1" dir="rtl">
                  <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border truncate">
                    {user.email}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-right px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    התנתק
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
