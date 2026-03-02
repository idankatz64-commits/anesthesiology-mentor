import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Heart, Moon, Sun, Menu, X, MessageSquareWarning } from 'lucide-react';
import { type ViewId } from '@/lib/types';
import FeedbackModal from './FeedbackModal';
import { motion, AnimatePresence } from 'framer-motion';
import { springGentle } from '@/lib/animations';

const mobileNav: { id: ViewId; label: string; emoji: string }[] = [
  { id: 'home', label: 'ראשי', emoji: '🏠' },
  { id: 'setup-practice', label: 'תרגול', emoji: '📖' },
  { id: 'setup-exam', label: 'בחינה', emoji: '⏱️' },
  { id: 'stats', label: 'סטטיסטיקה', emoji: '📊' },
  { id: 'weekly-plan', label: 'תוכנית שבועית', emoji: '📅' },
  { id: 'notebook', label: 'המחברת שלי', emoji: '📝' },
  { id: 'ai-coach', label: 'דו״ח מטות', emoji: '📋' },
  { id: 'anki', label: 'כרטיסיות Anki', emoji: '🃏' },
];

export default function MobileHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const { isDark, toggleTheme, navigate } = useApp();

  return (
    <>
      <div className="md:hidden fixed top-0 left-0 right-0 bg-card/60 backdrop-blur-xl h-16 border-b border-border z-30 flex items-center justify-between px-4">
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-l from-transparent via-primary/30 to-transparent" />
        <div className="font-semibold flex items-center gap-2 text-foreground">
          <Heart className="w-5 h-5 text-primary" />
          סימולטור הרדמה
        </div>
        <div className="flex items-center gap-4">
          <button onClick={toggleTheme} className="text-muted-foreground">
            {isDark ? <Sun className="w-5 h-5 text-warning" /> : <Moon className="w-5 h-5" />}
          </button>
          <button onClick={() => setMenuOpen(true)} className="text-muted-foreground p-2">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="fixed inset-0 z-40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="absolute inset-0 bg-background/40 backdrop-blur-sm"
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              className="absolute right-0 top-0 bottom-0 w-72 glass-card shadow-2xl p-4 space-y-2"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={springGentle}
              style={{ willChange: 'transform' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-end mb-4">
                <button onClick={() => setMenuOpen(false)} className="text-muted-foreground p-2">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {mobileNav.map(item => (
                <button
                  key={item.id}
                  onClick={() => { navigate(item.id); setMenuOpen(false); }}
                  className="w-full text-right p-4 font-medium border-b border-border text-foreground hover:bg-muted hover:text-primary transition rounded-lg"
                >
                  {item.emoji} {item.label}
                </button>
              ))}
              <button
                onClick={() => { setFeedbackOpen(true); setMenuOpen(false); }}
                className="w-full text-right p-4 font-medium border-b border-border text-primary hover:bg-muted transition rounded-lg flex items-center gap-2 justify-end"
              >
                דווח על טעות / פידבק <MessageSquareWarning className="w-4 h-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
