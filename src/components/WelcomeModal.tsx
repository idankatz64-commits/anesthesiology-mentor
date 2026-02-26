import { useApp } from '@/contexts/AppContext';
import { GraduationCap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { springGentle } from '@/lib/animations';

export default function WelcomeModal() {
  const { showWelcome, closeWelcome } = useApp();

  return (
    <AnimatePresence>
      {showWelcome && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-background/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeWelcome}
          />
          <motion.div
            className="glass-card w-full max-w-lg rounded-3xl shadow-2xl p-8 text-center relative overflow-hidden card-accent-top z-10"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0, transition: { duration: 0.2 } }}
            transition={springGentle}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) closeWelcome();
            }}
            style={{ willChange: 'transform' }}
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-primary/50 to-transparent" />
            <div className="mb-6 bg-primary/15 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-primary text-3xl shadow-sm border border-primary/20">
              <GraduationCap className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-4">ברוכים הבאים לסימולטור הרדמה - איכילוב</h2>
            <div className="text-foreground text-sm leading-relaxed mb-6 space-y-2">
              <p>המערכת תוכננה לסייע למתמחים בהכנה למבחני שלב א' ו-ABA Basic Exam.</p>
              <p>השאלות מבוססות על <strong>Miller's Anesthesia, 10th Edition</strong> ומאפשרות תרגול חכם, מעקב אחר טעויות וניתוח ביצועים מותאם אישית.</p>
            </div>
            <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-xl mb-8">
              <p className="text-destructive text-xs font-bold">⚠️ המערכת נועדה לתרגול בלבד. המידע אינו מהווה תחליף לשיקול דעת רפואי.</p>
            </div>
            <button
              onClick={closeWelcome}
              className="w-full bg-primary text-primary-foreground font-bold py-4 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all hover-glow"
            >
              התחל לתרגל
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
