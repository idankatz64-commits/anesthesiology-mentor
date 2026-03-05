import { useMemo, useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { RotateCcw, ChevronDown, ChevronUp, BookOpen, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

function isHtmlContent(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

function ExplanationRenderer({ text }: { text: string }) {
  let processed = text.replace(
    /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi,
    '[$2]($1)'
  );
  processed = processed.replace(
    /(?<!\]\()(?<!\()(https?:\/\/[^\s\)]+)/g,
    '[$1]($1)'
  );
  return (
    <ReactMarkdown
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80 transition inline-flex items-center gap-1 break-all">
            {children}
            <ExternalLink className="w-3 h-3 inline-block flex-shrink-0" />
          </a>
        ),
        p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

function SmartExplanation({ text }: { text: string }) {
  if (isHtmlContent(text)) {
    return (
      <div
        className="rich-content text-sm text-foreground bidi-text prose prose-sm max-w-none"
        style={{ lineHeight: '1.8' }}
        dangerouslySetInnerHTML={{ __html: text }}
      />
    );
  }
  return <ExplanationRenderer text={text} />;
}

export default function ResultsView() {
  const { session, progress, data, navigate, startSession, updateHistory } = useApp();
  const { quiz, answers, mode } = session;
  const [expandedQ, setExpandedQ] = useState<number | null>(null);

  const isSimulation = mode === 'simulation';

  const results = useMemo(() => {
    let score = 0;
    const details: { q: typeof quiz[0]; userAns: string | null; correctAns: string; isCorrect: boolean }[] = [];

    quiz.forEach((q, i) => {
      const userAns = answers[i];
      const correctAns = q[KEYS.CORRECT];
      const isCorrect = userAns === correctAns;
      if (userAns && isCorrect) score++;
      details.push({ q, userAns, correctAns, isCorrect });
    });

    const pct = quiz.length > 0 ? Math.round((score / quiz.length) * 100) : 0;
    return { score, pct, details };
  }, [quiz, answers]);

  // Update history for exam mode (side effect moved out of useMemo)
  const historyUpdated = useRef(false);
  useEffect(() => {
    if (mode === 'exam' && !historyUpdated.current) {
      historyUpdated.current = true;
      quiz.forEach((q, i) => {
        const userAns = answers[i];
        if (userAns) {
          updateHistory(q[KEYS.ID], userAns === q[KEYS.CORRECT]);
        }
      });
    }
  }, [mode, quiz, answers, updateHistory]);

  const handleRestart = () => {
    startSession(quiz, quiz.length, 'practice');
  };

  const icon = results.pct >= 80 ? '🏆' : results.pct >= 60 ? '💪' : '📚';

  return (
    <div className="fade-in max-w-2xl mx-auto text-center pt-10">
      <div className="text-8xl mb-6 animate-bounce drop-shadow-xl">{icon}</div>
      <h2 className="text-4xl font-bold text-foreground mb-3">
        {isSimulation ? 'תוצאות סימולציה' : 'סיכום ביצועים'}
      </h2>
      <p className="text-muted-foreground mb-10 text-lg font-light">
        {isSimulation ? 'המבחן הסתיים. להלן התוצאות המפורטות.' : 'סיימת את הסשן בהצלחה'}
      </p>

      <div className="grid grid-cols-2 gap-6 mb-10">
        <div className="soft-card bg-card border border-border p-8">
          <div className="text-5xl font-black text-primary mb-2">{results.pct}%</div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">ציון סופי</div>
        </div>
        <div className="soft-card bg-card border border-border p-8">
          <div className="text-5xl font-black text-foreground mb-2">{results.score}/{quiz.length}</div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">תשובות נכונות</div>
        </div>
      </div>

      {/* Weak topics */}
      {(() => {
        const topicStats: Record<string, { total: number; wrong: number }> = {};
        results.details.forEach(d => {
          if (!d.userAns) return;
          const topic = d.q[KEYS.TOPIC] || 'Other';
          if (!topicStats[topic]) topicStats[topic] = { total: 0, wrong: 0 };
          topicStats[topic].total++;
          if (!d.isCorrect) topicStats[topic].wrong++;
        });
        const weak = Object.entries(topicStats)
          .map(([topic, s]) => ({ topic, rate: s.wrong / s.total, count: s.total }))
          .filter(i => i.rate > 0 && i.count >= 1)
          .sort((a, b) => b.rate - a.rate)
          .slice(0, 5);

        if (weak.length === 0) return null;
        return (
          <div className="bg-primary/5 rounded-3xl p-8 border border-primary/10 text-right mb-10 shadow-sm">
            <h3 className="font-bold text-primary mb-4 flex items-center gap-3 text-lg">✨ נושאים לחיזוק</h3>
            <ul className="list-disc list-inside mt-2 font-bold text-primary space-y-1">
              {weak.map(t => <li key={t.topic}>{t.topic} ({Math.round(t.rate * 100)}% שגיאות)</li>)}
            </ul>
          </div>
        );
      })()}

      {/* Question details - expanded view for simulation */}
      <div className="text-right soft-card bg-card border border-border p-8 mb-10 max-h-[600px] overflow-y-auto">
        <h3 className="font-bold text-foreground mb-6 border-b border-border pb-3">
          {isSimulation ? 'פירוט מלא עם הסברים' : 'פירוט שאלות'}
        </h3>
        <div className="space-y-2">
          {results.details.map((d, i) => (
            <div
              key={i}
              className={`border rounded-xl overflow-hidden ${
                d.isCorrect ? 'border-success/20' : d.userAns ? 'border-destructive/20' : 'border-border'
              }`}
            >
              <div
                className={`p-4 text-sm cursor-pointer flex justify-between items-center ${
                  d.isCorrect ? 'bg-success-muted' : d.userAns ? 'bg-destructive/5' : 'bg-muted'
                }`}
                onClick={() => setExpandedQ(expandedQ === i ? null : i)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-foreground">#{d.q[KEYS.REF_ID]}</span>
                  <span className="text-muted-foreground text-xs">(סידורי: {d.q[KEYS.ID]})</span>
                  <span>{d.userAns ? (d.isCorrect ? '✅' : '❌') : '⚪'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    תשובתך: {d.userAns || '-'} | נכון: {d.correctAns}
                  </span>
                  {expandedQ === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {expandedQ === i && (
                <div className="p-5 border-t border-border bg-card space-y-4">
                  <p className="text-foreground text-sm bidi-text leading-relaxed">{d.q[KEYS.QUESTION]}</p>
                  
                  {/* Show all options with correct/incorrect marking */}
                  <div className="space-y-2">
                    {(['A', 'B', 'C', 'D'] as const).map(opt => {
                      const text = d.q[KEYS[opt]];
                      if (!text) return null;
                      const isCorrectOpt = opt === d.correctAns;
                      const isUserChoice = opt === d.userAns;
                      return (
                        <div key={opt} className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                          isCorrectOpt ? 'bg-success-muted text-success font-bold' :
                          isUserChoice ? 'bg-destructive/10 text-destructive' :
                          'text-muted-foreground'
                        }`}>
                          <span className="font-bold">{opt}.</span>
                          <span className="bidi-text">{text}</span>
                          {isCorrectOpt && <span>✓</span>}
                          {isUserChoice && !isCorrectOpt && <span>✗</span>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  {d.q[KEYS.EXPLANATION] && (
                    <div className="bg-muted/50 p-6 rounded-xl border border-border">
                      <strong className="text-foreground text-xs block mb-3">💡 הסבר:</strong>
                      <div className="text-sm text-foreground bidi-text markdown-content" style={{ lineHeight: '1.8' }}>
                        <SmartExplanation text={d.q[KEYS.EXPLANATION]} />
                      </div>
                    </div>
                  )}

                  {d.q[KEYS.MILLER] && d.q[KEYS.MILLER] !== 'N/A' && (
                    <a
                      href={`https://www.google.com/search?q=Miller's+Anesthesia+10th+edition+page+${d.q[KEYS.MILLER]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-full font-medium transition flex items-center gap-2 w-fit border border-border"
                    >
                      <BookOpen className="w-3 h-3" /> Miller Page: {d.q[KEYS.MILLER]}
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        <button onClick={() => navigate('home')} className="bg-card text-muted-foreground border border-border px-8 py-4 rounded-xl font-medium hover:bg-muted transition">
          חזרה לראשי
        </button>
        <button onClick={handleRestart} className="bg-primary text-primary-foreground px-8 py-4 rounded-xl font-bold shadow-lg hover:-translate-y-0.5 transition flex items-center gap-2">
          <RotateCcw className="w-4 h-4" /> תרגול מחדש
        </button>
      </div>
    </div>
  );
}
