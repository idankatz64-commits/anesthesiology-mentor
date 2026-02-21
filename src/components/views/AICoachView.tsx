import { useApp } from '@/contexts/AppContext';
import { Bot, Sparkles } from 'lucide-react';

export default function AICoachView() {
  return (
    <div className="fade-in max-w-3xl mx-auto">
      <div className="bg-gradient-to-br from-purple-600 to-primary rounded-3xl p-10 text-primary-foreground shadow-2xl mb-10 border border-transparent">
        <div className="flex items-start gap-6">
          <div className="bg-primary-foreground/20 p-4 rounded-2xl backdrop-blur-sm">
            <Bot className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-3xl font-bold mb-3">AI Performance Coach</h2>
            <p className="text-primary-foreground/80 text-base font-light">
              ניתוח חכם של דפוסי הלמידה שלך לקראת מבחן שלב א'.
            </p>
          </div>
        </div>
        <div className="mt-8 text-right">
          <button className="bg-primary-foreground text-purple-600 font-bold px-6 py-3 rounded-xl shadow-lg hover:opacity-90 transition flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> ✨ צור דוח אישי מבוסס AI
          </button>
        </div>
      </div>

      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-light">לחץ על הכפתור למעלה כדי לייצר דוח ביצועים מבוסס AI.</p>
        <p className="text-sm mt-2">פיצ'ר זה ישתפר בגרסאות הבאות עם חיבור ל-AI.</p>
      </div>
    </div>
  );
}
