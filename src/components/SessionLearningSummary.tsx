import type { SessionInsights } from '@/lib/sessionInsights';

const coverage = (count: number | null, total: number) => count === null || !total ? '—' : `${count}/${total} (${Math.round(count * 100 / total)}%)`;

export default function SessionLearningSummary({ insights, onContinue }: {
  insights: SessionInsights;
  onContinue: (topic: string, source: 'all' | 'mistakes', unseenOnly: boolean) => void;
}) {
  const { overall, topics, recommendations } = insights;
  return (
    <section aria-label="ניתוח התקדמות והמלצות" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">מה המפגש הוסיף להתקדמות שלך?</h2>
        <p className="mt-2 text-sm text-foreground/70">מדדי למידה אישיים מכלל התרגולים והבחנים, ביחס למאגר הזמין לך. חזרה על שאלה אינה נספרת שוב ככיסוי חדש.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm text-foreground/70">כיסוי הלמידה הכולל</h3>
          <p className="mt-2 text-lg font-bold" dir="ltr">{coverage(overall.coveredBefore, overall.total)} → {coverage(insights.progressAvailable ? overall.coveredAfter : null, overall.total)}</p>
          <p className="mt-2 text-sm text-foreground/70">לפני המפגש ← עכשיו</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm text-foreground/70">שאלות חדשות שכיסית</h3>
          <p className="mt-2 text-3xl font-bold text-primary">{overall.newCount ?? '—'}</p>
          <p className="mt-2 text-sm text-foreground/70">תרגול ובוחן מקדמים את הכיסוי</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm text-foreground/70">טעויות קודמות שתיקנת</h3>
          <p className="mt-2 text-3xl font-bold text-primary">{overall.correctedCount ?? '—'}</p>
          <p className="mt-2 text-sm text-foreground/70">שאלות שנענו קודם בשגיאה והפעם נכון</p>
        </div>
      </div>
      {!insights.progressAvailable ? <p role="note" className="text-sm text-foreground/70">היסטוריית הלמידה אינה זמינה כעת. תוצאות המפגש מוצגות, והכיסוי הכולל יוצג לאחר טעינת ההיסטוריה.</p>
        : !insights.baselineAvailable && <p role="note" className="text-sm text-foreground/70">במפגש הזה חסרה תמונת מצב מלפני ההתחלה. מוצגת ההתקדמות הזמינה כעת; אי אפשר לחשב בדיעבד את השינוי במפגש הזה.</p>}

      {topics.length > 0 && <div className="space-y-3">
        <h3 className="font-bold text-lg">התקדמות בנושאי המפגש</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {topics.map(topic => <article key={topic.topic} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h4 className="font-bold"><bdi>{topic.topic}</bdi></h4>
            <dl className="text-sm space-y-2">
              <div className="flex flex-wrap justify-between gap-2"><dt>במפגש הזה</dt><dd>{topic.correct} נכונות מתוך {topic.scored} תשובות שנבדקו{topic.skipped > 0 ? ` · ${topic.skipped} ללא מענה` : ''}</dd></div>
              <div className="flex flex-wrap justify-between gap-2"><dt>כיסוי בנושא: לפני ← עכשיו</dt><dd dir="ltr">{coverage(topic.coveredBefore, topic.total)} → {coverage(insights.progressAvailable ? topic.coveredAfter : null, topic.total)}</dd></div>
              <div className="flex flex-wrap justify-between gap-2"><dt>שאלות שהתשובה האחרונה עליהן נכונה</dt><dd dir="ltr">{topic.latestCorrectBefore ?? '—'} → {insights.progressAvailable ? topic.latestCorrectAfter : '—'}</dd></div>
            </dl>
            {topic.answered < 5 && <p className="text-xs text-foreground/70">זהו מפגש קצר בנושא — אין להסיק ממנו לבדו על שליטה בחומר.</p>}
          </article>)}
        </div>
      </div>}

      {recommendations.length > 0 && <div className="space-y-3">
        <h3 className="font-bold text-lg">מה כדאי לעשות עכשיו?</h3>
        <p className="text-sm text-foreground/70">הצעות לבחירתך. אפשר להמשיך בקצב שלך, לשנות את הכמות ואת מועד ההסברים.</p>
        {recommendations.map(recommendation => <article key={recommendation.topic} className="rounded-xl border border-primary/25 bg-primary/5 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <h4 className="font-bold">{recommendation.title}</h4>
            <p className="mt-1 text-sm text-foreground/80">{recommendation.reason}</p>
          </div>
          <button type="button" onClick={() => onContinue(recommendation.topic, recommendation.source, recommendation.kind === 'explore')}
            className="shrink-0 rounded-xl border border-primary/40 bg-card px-4 py-3 font-bold text-sm hover:bg-primary/10"
            aria-label={recommendation.topic === 'כללי' ? 'בחירת נושא למפגש הבא' : `המשך למפגש בנושא ${recommendation.topic}`}>
            {recommendation.topic === 'כללי' ? 'בחירת נושא למפגש הבא' : 'בחירת המפגש הבא'} ←
          </button>
        </article>)}
      </div>}
    </section>
  );
}
