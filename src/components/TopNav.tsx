import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { LogIn, LogOut, User, ChevronDown, BookOpen, RefreshCw, Activity, Heart } from 'lucide-react';
import type { User as SupaUser } from '@supabase/supabase-js';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useApp } from '@/contexts/AppContext';
import { motion, AnimatePresence } from 'framer-motion';
import SquircleIcon from './SquircleIcon';

const TopNav = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(function TopNav(_props, ref) {
  const [user, setUser] = useState<SupaUser | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const { syncStatus } = useApp();

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
    <div ref={ref} className="fixed top-0 left-0 right-0 h-14 bg-background/60 backdrop-blur-xl border-b border-border/50 z-50 flex items-center justify-between px-4 md:px-8" dir="rtl">
      {/* Gradient accent line at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-l from-transparent via-primary/40 to-transparent" />

      {/* Right: Logo badge + app name */}
      <div className="flex items-center gap-2.5">
        <SquircleIcon icon={Heart} gradient="gold" size="md" />
        <span className="hidden sm:block text-sm font-bold tracking-tight text-foreground">YouShellNotPass</span>
      </div>

      {/* Center title */}
      <div className="flex flex-col items-center absolute left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-2" dir="ltr">
          <Activity className="w-4 h-4 text-primary hidden md:block" />
          <span className="text-muted-foreground font-light hidden md:block text-sm">
            Simulator for Stage 1 Anesthesia, Intensive Care and Pain Medicine
          </span>
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Sync indicator */}
        {syncStatus === 'syncing' && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
                  <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                  <span className="hidden md:inline text-primary/80">מסנכרן...</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>מסנכרן שאלות מ-Google Sheets</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* NotebookLM button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => window.open('https://notebooklm.google.com/notebook/4df9facd-84c4-4651-8551-6c0f335ce652', '_blank', 'noopener,noreferrer')}
                className="p-2 rounded-lg bg-card/40 border border-border/50 text-muted-foreground hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
              >
                <BookOpen className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Open NotebookLM</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Auth area */}
        {!user ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/auth')}
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 hover:border-primary/30 bg-card/30"
            >
              <LogIn className="w-4 h-4" />
              התחבר
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="text-sm font-semibold bg-primary text-primary-foreground px-4 py-1.5 rounded-lg hover:opacity-90 transition shadow-[0_0_15px_hsl(var(--primary)/0.3)]"
            >
              הרשם
            </button>
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 text-sm text-foreground hover:bg-card/60 px-3 py-1.5 rounded-lg transition-all duration-200 border border-transparent hover:border-border/50"
            >
              <div className="w-7 h-7 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <span className="max-w-[150px] truncate font-medium text-sm">{displayName}</span>
              <motion.div
                animate={{ rotate: dropdownOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </motion.div>
            </button>

            <AnimatePresence>
              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="absolute left-0 top-full mt-1.5 w-52 rounded-xl shadow-xl z-50 py-1 bg-card/80 backdrop-blur-xl border border-border/50"
                    dir="rtl"
                  >
                    <div className="px-4 py-2.5 text-xs text-muted-foreground border-b border-border/50 truncate">
                      {user.email}
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full text-right px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition flex items-center gap-2"
                    >
                      <LogOut className="w-4 h-4" />
                      התנתק
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
});

export default TopNav;
