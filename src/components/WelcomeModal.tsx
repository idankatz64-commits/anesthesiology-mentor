import { useApp } from '@/contexts/AppContext';
import { X, GraduationCap } from 'lucide-react';

export default function WelcomeModal() {
  const { showWelcome, closeWelcome } = useApp();

  if (!showWelcome) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm fade-in">
      <div className="bg-card w-full max-w-lg rounded-3xl shadow-2xl p-8 border border-border text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-info" />
        <div className="mb-6 bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-primary text-3xl shadow-sm">
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
          className="w-full bg-gradient-to-r from-primary to-info text-primary-foreground font-bold py-4 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
        >
          התחל לתרגל
        </button>
      </div>
    </div>
  );
}
