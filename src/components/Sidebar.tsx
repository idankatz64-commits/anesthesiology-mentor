import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Heart, BookOpen, Timer, BarChart3, StickyNote, Moon, Sun, MessageSquareWarning, ShieldAlert, FlaskConical, ChevronLeft, ChevronRight, FileText, GraduationCap } from 'lucide-react';
import { type ViewId } from '@/lib/types';
import { KEYS } from '@/lib/types';
import FeedbackModal from './FeedbackModal';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import SquircleIcon from './SquircleIcon';

const navItems: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'ראשי', icon: <SquircleIcon icon={Heart} gradient="gold" /> },
  { id: 'setup-practice', label: 'תרגול (Practice)', icon: <SquircleIcon icon={BookOpen} gradient="teal" /> },
  { id: 'setup-exam', label: 'בחינה (Exam)', icon: <SquircleIcon icon={Timer} gradient="orange" /> },
  { id: 'stats', label: 'סטטיסטיקה', icon: <SquircleIcon icon={BarChart3} gradient="blue" /> },
  { id: 'notebook', label: 'המחברת שלי', icon: <SquircleIcon icon={StickyNote} gradient="cyan" /> },
  { id: 'formula-sheet', label: 'Formula Sheet', icon: <SquircleIcon icon={FlaskConical} gradient="violet" /> },
  { id: 'summaries', label: 'סיכומי נושאים', icon: <SquircleIcon icon={FileText} gradient="cyan" /> },
  { id: 'miller-guide', label: 'מדריך Miller', icon: <SquircleIcon icon={GraduationCap} gradient="violet" /> },
];

export default function Sidebar() {
  const { currentView, navigate, isDark, toggleTheme, progress, data } = useApp();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() =>
    localStorage.getItem('sidebar-collapsed') === 'true'
  );

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;
      const { data } = await supabase.rpc('is_admin', { _user_id: session.user.id });
      setIsAdmin(!!data);
    });
  }, []);

  let totalCorrect = 0;
  let totalAnswered = 0;
  Object.values(progress.history).forEach(h => {
    totalCorrect += h.correct;
    totalAnswered += h.answered;
  });
  const pct = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const glassButton = "w-full flex items-center justify-between p-3 rounded-xl bg-card/40 border border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all duration-200 text-xs font-bold";
  const glassButtonCollapsed = "w-full flex items-center justify-center p-3 rounded-xl bg-card/40 border border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all duration-200";

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-72'} bg-sidebar border-l border-sidebar-border flex-col shadow-lg z-20 hidden md:flex transition-all duration-300 relative`}>
      {/* Collapse toggle button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-6 rounded-full bg-card border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-all duration-200 z-30 shadow-sm"
      >
        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Header */}
      <div className={`border-b border-sidebar-border flex items-center gap-4 ${isCollapsed ? 'p-4 justify-center' : 'p-8'}`}>
        <SquircleIcon icon={Heart} gradient="gold" size="lg" />
        {!isCollapsed && (
          <div>
            <h1 className="text-lg leading-tight font-bold text-foreground">סימולטור</h1>
            <p className="text-xs text-muted-foreground font-normal">הרדמה (מילר 10)</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-grow ${isCollapsed ? 'p-2' : 'p-4'} space-y-1.5 overflow-y-auto relative`}>
        {navItems.map(item => {
          const isActive = currentView === item.id ||
            (item.id === 'setup-practice' && currentView === 'setup-practice') ||
            (item.id === 'setup-exam' && currentView === 'setup-exam');
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2 py-3.5' : 'gap-3 px-4 py-3.5'} rounded-xl text-sm transition-all duration-200 relative
                ${isActive
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card/40'
                }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 bg-primary/10 border-r-[3px] border-primary rounded-xl shadow-[inset_0_0_20px_hsl(var(--primary)/0.08)]"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  style={{ willChange: 'transform' }}
                />
              )}
              {isCollapsed ? (
                <span className="relative z-10">{item.icon}</span>
              ) : (
                <motion.span
                  className="relative z-10 flex items-center gap-3"
                  whileHover={{ x: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  {item.icon}
                  {item.label}
                </motion.span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={`${isCollapsed ? 'p-2' : 'p-6'} space-y-3`}>
        {!isCollapsed ? (
          <>
            <button
              onClick={() => setFeedbackOpen(true)}
              className={glassButton}
            >
              <span>דווח על טעות / פידבק</span>
              <SquircleIcon icon={MessageSquareWarning} gradient="rose" size="sm" />
            </button>
            {isAdmin && (
              <Link
                to="/admin"
                className={glassButton}
              >
                <span>Admin</span>
                <SquircleIcon icon={ShieldAlert} gradient="slate" size="sm" />
              </Link>
            )}
            <button
              onClick={toggleTheme}
              className={glassButton}
            >
              <span>מצב תצוגה</span>
              <SquircleIcon icon={isDark ? Sun : Moon} gradient="slate" size="sm" />
            </button>

            <div className="bg-card/40 p-4 rounded-xl border border-border/50 transition-colors">
              <div className="flex justify-between items-end mb-2">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">PROGRESS</div>
                <span className="text-xl font-bold text-primary">{pct}%</span>
              </div>
              <div className="w-full bg-border/50 h-1.5 rounded-full overflow-hidden">
                <motion.div
                  className="bg-gradient-to-l from-primary to-primary/70 h-full rounded-full shadow-[0_0_10px_hsl(var(--primary)/0.4)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => setFeedbackOpen(true)}
              title="דווח על טעות / פידבק"
              className={glassButtonCollapsed}
            >
              <SquircleIcon icon={MessageSquareWarning} gradient="rose" size="sm" />
            </button>
            {isAdmin && (
              <Link
                to="/admin"
                title="Admin"
                className={glassButtonCollapsed}
              >
                <SquircleIcon icon={ShieldAlert} gradient="slate" size="sm" />
              </Link>
            )}
            <button
              onClick={toggleTheme}
              title="מצב תצוגה"
              className={glassButtonCollapsed}
            >
              <SquircleIcon icon={isDark ? Sun : Moon} gradient="slate" size="sm" />
            </button>
          </>
        )}
      </div>
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </aside>
  );
}
