import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Heart, BookOpen, Timer, BarChart3, StickyNote, CalendarDays, ClipboardCheck, Moon, Sun, MessageSquareWarning } from 'lucide-react';
import { type ViewId } from '@/lib/types';
import { KEYS } from '@/lib/types';
import FeedbackModal from './FeedbackModal';

const navItems: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'ראשי', icon: <Heart className="w-5 h-5" /> },
  { id: 'setup-practice', label: 'תרגול (Practice)', icon: <BookOpen className="w-5 h-5" /> },
  { id: 'setup-exam', label: 'בחינה (Exam)', icon: <Timer className="w-5 h-5" /> },
  { id: 'stats', label: 'סטטיסטיקה', icon: <BarChart3 className="w-5 h-5" /> },
  { id: 'notebook', label: 'המחברת שלי', icon: <StickyNote className="w-5 h-5" /> },
  { id: 'weekly-plan', label: 'תוכנית שבועית', icon: <CalendarDays className="w-5 h-5" /> },
  { id: 'ai-coach', label: 'דו״ח מטות', icon: <ClipboardCheck className="w-5 h-5" /> },
];

export default function Sidebar() {
  const { currentView, navigate, isDark, toggleTheme, progress, data } = useApp();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  let totalCorrect = 0;
  let totalAnswered = 0;
  Object.values(progress.history).forEach(h => {
    totalCorrect += h.correct;
    totalAnswered += h.answered;
  });
  const pct = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  return (
    <aside className="w-72 bg-card border-l border-border flex-col shadow-sm z-20 hidden md:flex transition-colors duration-300">
      {/* Header */}
      <div className="p-8 border-b border-border flex items-center gap-4">
        <div className="bg-primary/10 text-primary p-3 rounded-2xl shadow-sm transition-colors">
          <Heart className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg leading-tight font-bold text-foreground">סימולטור</h1>
          <p className="text-xs text-muted-foreground font-normal">הרדמה (מילר 10)</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-grow p-4 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const isActive = currentView === item.id || 
            (item.id === 'setup-practice' && currentView === 'setup-practice') ||
            (item.id === 'setup-exam' && currentView === 'setup-exam');
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm transition-all
                ${isActive
                  ? 'bg-primary/10 text-primary font-semibold border-r-[3px] border-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-6 space-y-4">
        <button
          onClick={() => setFeedbackOpen(true)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 transition text-xs font-bold"
        >
          <span>דווח על טעות / פידבק</span>
          <MessageSquareWarning className="w-4 h-4 text-primary" />
        </button>
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-muted text-muted-foreground hover:bg-muted/80 transition text-xs font-bold"
        >
          <span>מצב תצוגה</span>
          {isDark ? <Sun className="w-4 h-4 text-warning" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="bg-muted p-4 rounded-2xl border border-border transition-colors">
          <div className="flex justify-between items-end mb-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">התקדמות</div>
            <span className="text-xl font-bold text-foreground">{pct}%</span>
          </div>
          <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </aside>
  );
}
