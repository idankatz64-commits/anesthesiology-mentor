import { useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { RefreshCw, AlertTriangle, BookOpen, Coffee } from 'lucide-react';

export default function WeeklyPlanView() {
  const { progress, generateWeeklyPlan, data } = useApp();

  useEffect(() => {
    if (data.length > 0 && !progress.plan) {
      generateWeeklyPlan();
    }
  }, [data, progress.plan, generateWeeklyPlan]);

  return (
    <div className="fade-in max-w-5xl mx-auto">
      <header className="mb-8 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
          📅 תוכנית לימוד שבועית
        </h2>
        <button
          onClick={() => generateWeeklyPlan(true)}
          className="bg-success/10 text-success border border-success/20 px-4 py-2 rounded-xl text-sm font-bold hover:bg-success/20 transition shadow-sm flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> צור תוכנית חדשה
        </button>
      </header>

      <div className="bg-card p-6 rounded-2xl border border-border mb-8 shadow-sm">
        <p className="text-foreground text-sm leading-relaxed bidi-text">
          התוכנית נוצרת אוטומטית על בסיס הביצועים שלך. האלגוריתם משלב בין <b>3 הנושאים החלשים ביותר שלך</b> (לצורך חיזוק) לבין <b>3 נושאים עם שאלות חדשות</b> שטרם ראית.
        </p>
      </div>

      {progress.plan ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {progress.plan.map((day, i) => {
            const isWeak = day.type === 'weak';
            const isNew = day.type === 'new';
            return (
              <div
                key={i}
                className={`p-6 rounded-2xl border bg-card relative overflow-hidden ${
                  isWeak ? 'border-destructive/20' :
                  isNew ? 'border-info/20' :
                  'border-success/20'
                }`}
              >
                <div className={`absolute top-0 left-0 w-2 h-full ${
                  isWeak ? 'bg-destructive' : isNew ? 'bg-info' : 'bg-success'
                }`} />
                <h3 className="text-xl font-bold mb-2 text-foreground">{day.day}</h3>
                <div className={`text-xs font-bold uppercase tracking-wider mb-3 ${
                  isWeak ? 'text-destructive/60' : isNew ? 'text-info/60' : 'text-success/60'
                }`}>
                  {isWeak ? 'חיזוק חולשות' : isNew ? 'למידה חדשה' : 'סופ"ש'}
                </div>
                <div className="font-medium text-lg flex items-start gap-3 text-foreground">
                  {isWeak ? <AlertTriangle className="w-5 h-5 mt-1 opacity-70" /> :
                   isNew ? <BookOpen className="w-5 h-5 mt-1 opacity-70" /> :
                   <Coffee className="w-5 h-5 mt-1 opacity-70" />}
                  <span className="bidi-text">{day.focus}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 text-muted-foreground">
          <p>טוען תוכנית...</p>
        </div>
      )}
    </div>
  );
}
