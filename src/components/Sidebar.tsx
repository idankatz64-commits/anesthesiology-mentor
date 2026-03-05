import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Heart, BookOpen, Timer, BarChart3, StickyNote, CalendarDays, ClipboardCheck, Moon, Sun, MessageSquareWarning, ShieldAlert, FlaskConical, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { type ViewId } from '@/lib/types';
import { KEYS } from '@/lib/types';
import FeedbackModal from './FeedbackModal';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const navItems: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'ראשי', icon: <Heart className="w-5 h-5" /> },
  { id: 'setup-practice', label: 'תרגול (Practice)', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'setup-exam', label: 'בחינה (Exam)', icon: <Timer className="w-5 h-5" /> },
  { id: 'stats', label: 'סטטיסטיקה', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'notebook', label: 'המחברת שלי', icon: <StickyNote className="w-5 h-5" /> },
  { id: 'weekly-plan', label: 'תוכנית שבועית', icon: <CalendarDays className="w-5 h-5" /> },
  { id: 'ai-coach', label: 'דו״ח מטות', icon: <ClipboardCheck className="w-5 h-5" /> },
  { id: 'formula-sheet', label: 'Formula Sheet', icon: <FlaskConical className="w-5 h-5" /> },
  { id: 'study-room', label: 'תרגול משותף 👥', icon: <Users className="w-5 h-5" /> },
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

  return (
    <aside className={`${isCollapsed ? 'w-16' : 'w-72'} glass-card border-l flex-col shadow-lg z-20 hidden md:flex transition-all duration-300 relative`}>
      {/* Collapse toggle button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-6 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors z-30 shadow-sm"
      >
        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>

      {/* Header */}
      <div className={`border-b border-border flex items-center gap-4 ${isCollapsed ? 'p-4 justify-center' : 'p-8'}`}>
        <div className="bg-primary/15 text-primary p-3 rounded-2xl shadow-sm glow-border transition-colors shrink-0">
          <Heart className="w-5 h-5" />
        </div>
        {!isCollapsed && (
          <div>
            <h1 className="text-lg leading-tight font-bold text-foreground">סימולטור</h1>
            <p className="text-xs text-muted-foreground font-normal">הרדמה (מילר 10)</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-grow ${isCollapsed ? 'p-2' : 'p-4'} space-y-1 overflow-y-auto relative`}>
        {navItems.map(item => {
          const isActive = currentView === item.id ||
            (item.id === 'setup-practice' && currentView === 'setup-practice') ||
            (item.id === 'setup-exam' && currentView === 'setup-exam');
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-3.5'} rounded-xl text-sm transition-all relative
                ${isActive
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className={`absolute inset-0 bg-primary/10 ${isCollapsed ? '' : 'border-r-[3px] border-primary'} rounded-xl shadow-[inset_0_0_20px_hsl(25_95%_53%/0.05)]`}
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
      <div className={`${isCollapsed ? 'p-2' : 'p-6'} space-y-4`}>
        {!isCollapsed ? (
          <>
            <button
              onClick={() => setFeedbackOpen(true)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition text-xs font-bold"
            >
              <span>דווח על טעות / פידבק</span>
              <MessageSquareWarning className="w-4 h-4 text-primary" />
            </button>
            {isAdmin && (
              <Link
                to="/admin"
                className="w-full flex items-center justify-between p-3 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 transition text-xs font-bold"
              >
                <span>Admin</span>
                <ShieldAlert className="w-4 h-4" />
              </Link>
            )}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition text-xs font-bold"
            >
              <span>מצב תצוגה</span>
              {isDark ? <Sun className="w-4 h-4 text-warning" /> : <Moon className="w-4 h-4" />}
            </button>

            <div className="bg-muted/50 p-4 rounded-2xl border border-border transition-colors">
              <div className="flex justify-between items-end mb-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">התקדמות</div>
                <span className="text-xl font-bold text-primary matrix-text">{pct}%</span>
              </div>
              <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
                <motion.div
                  className="bg-primary h-full rounded-full shadow-[0_0_8px_hsl(25_95%_53%/0.4)]"
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
              className="w-full flex items-center justify-center p-3 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition"
            >
              <MessageSquareWarning className="w-4 h-4 text-primary" />
            </button>
            {isAdmin && (
              <Link
                to="/admin"
                title="Admin"
                className="w-full flex items-center justify-center p-3 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 transition"
              >
                <ShieldAlert className="w-4 h-4" />
              </Link>
            )}
            <button
              onClick={toggleTheme}
              title="מצב תצוגה"
              className="w-full flex items-center justify-center p-3 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition"
            >
              {isDark ? <Sun className="w-4 h-4 text-warning" /> : <Moon className="w-4 h-4" />}
            </button>
          </>
        )}
      </div>
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </aside>
  );
}
