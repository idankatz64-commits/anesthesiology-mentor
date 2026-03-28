import DOMPurify from 'dompurify';
import { useMemo, useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { RotateCcw, ChevronDown, ChevronUp, BookOpen, ExternalLink, ArrowRight, TrendingUp, Trophy, Timer, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import AnimatedNumber from '@/components/AnimatedNumber';
import { exportSessionToPdf } from '@/lib/exportPdf';

const heroVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { type: 'spring' as const, stiffness: 260, damping: 24, delay: i * 0.1 },
  }),
};

/* ── Explanation renderers (unchanged logic) ── */
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
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(text) }}
      />
    );
  }
  return <ExplanationRenderer text={text} />;
}

/* ── SVG Progress Ring ── */
function ProgressRing({ value, color = 'text-primary', size = 96 }: { value: number; color?: string; size?: number }) {
  const r = (size - 16) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle className="text-border" cx={size / 2} cy={size / 2} fill="transparent" r={r} stroke="currentColor" strokeWidth="8" />
        <circle className={color} cx={size / 2} cy={size / 2} fill="transparent" r={r} stroke="currentColor"
          strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <span className="absolute text-xl font-bold text-foreground">{value}%</span>
    </div>
  );
}

/* ── Activity Heatmap (14 days) ── */
function ActivityHeatmap({ history }: { history: Record<string, any> }) {
  const days = useMemo(() => {
    const result: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      let count = 0;
      Object.values(history).forEach((entry: any) => {
        if (entry.timestamp) {
          const entryDate = new Date(entry.timestamp).toISOString().slice(0, 10);
          if (entryDate === dateStr) count++;
        }
      });
      result.push({ date: dateStr, count });
    }
    return result;
  }, [history]);

  const maxCount = Math.max(...days.map(d => d.count), 1);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">מפת פעילות</h4>
        <span className="text-[10px] text-muted-foreground italic">14 ימים אחרונים</span>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {days.map(d => {
          const intensity = d.count === 0 ? 0.05 : Math.max(0.15, d.count / maxCount);
          return (
            <div
              key={d.date}
              className="w-8 h-8 rounded-sm"
              style={{ backgroundColor: `hsl(var(--primary) / ${intensity})` }}
              title={`${d.date}: ${d.count} שאלות`}
            />
          );
        })}
      </div>
      <div className="mt-4 flex justify-between items-center text-[10px] text-muted-foreground font-bold uppercase">
        <span>מאמץ נמוך</span>
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-sm bg-primary/20" />
          <div className="w-2 h-2 rounded-sm bg-primary/50" />
          <div className="w-2 h-2 rounded-sm bg-primary" />
        </div>
        <span>מוכן למבחן</span>
      </div>
    </div>
  );
}

/* ── Main Results View ── */
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

  // Update history for exam mode
  const historyUpdated = useRef(false);
  useEffect(() => {
    if (mode === 'exam' && !historyUpdated.current) {
      historyUpdated.current = true;
      quiz.forEach((q, i) => {
        const userAns = answers[i];
        if (userAns) {
          updateHistory(q[KEYS.ID], userAns === q[KEYS.CORRECT], q[KEYS.TOPIC]);
        }
      });
    }
  }, [mode, quiz, answers, updateHistory]);

  // Save last session results to localStorage
  const lastSessionSaved = useRef(false);
  useEffect(() => {
    if (quiz.length > 0 && !lastSessionSaved.current) {
      lastSessionSaved.current = true;
      const topicCount: Record<string, number> = {};
      quiz.forEach(q => {
        const t = q[KEYS.TOPIC];
        if (t) topicCount[t] = (topicCount[t] || 0) + 1;
      });
      const topTopics = Object.entries(topicCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t);

      localStorage.setItem('last_session_results', JSON.stringify({
        score: results.score,
        total: quiz.length,
        pct: results.pct,
        mode,
        topics: topTopics,
        timestamp: Date.now(),
      }));
    }
  }, [quiz, results, mode]);

  const handleRestart = () => {
    startSession(quiz, quiz.length, 'practice');
  };

  // Compute weak topics
  const weakTopics = useMemo(() => {
    const topicStats: Record<string, { total: number; wrong: number }> = {};
    results.details.forEach(d => {
      if (!d.userAns) return;
      const topic = d.q[KEYS.TOPIC] || 'Other';
      if (!topicStats[topic]) topicStats[topic] = { total: 0, wrong: 0 };
      topicStats[topic].total++;
      if (!d.isCorrect) topicStats[topic].wrong++;
    });
    return Object.entries(topicStats)
      .map(([topic, s]) => ({ topic, rate: s.wrong / s.total, count: s.total }))
      .filter(i => i.rate > 0 && i.count >= 1)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);
  }, [results.details]);

  // Compute bank progress
  const bankProgress = useMemo(() => {
    const answered = Object.keys(progress.history).length;
    const total = data.length || 1;
    return Math.round((answered / total) * 100);
  }, [progress.history, data]);

  // Status badge
  const statusLabel = results.pct >= 90 ? 'מועמד מצטיין' : results.pct >= 75 ? 'ביצוע טוב' : results.pct >= 60 ? 'בדרך הנכונה' : 'צריך חיזוק';

  // Count errors for review button
  const errorCount = results.details.filter(d => d.userAns && !d.isCorrect).length;

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-8 space-y-8">

      {/* ── Hero: Status + Countdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Premium Status Card */}
        <motion.div custom={0} variants={heroVariant} initial="hidden" animate="visible" className="lg:col-span-2 flex flex-col justify-start rounded-xl shadow-xl bg-gradient-to-br from-card to-secondary border border-border p-6 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-10 text-primary">
            <Trophy className="w-[120px] h-[120px]" />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="flex items-center justify-center bg-primary/20 p-4 rounded-full border border-primary/30">
              <Trophy className="w-12 h-12 text-primary" />
            </div>
            <div className="flex-1 text-center sm:text-right">
              <p className="text-primary text-xs font-bold tracking-widest uppercase mb-1">{statusLabel}</p>
              <h3 className="text-2xl font-bold text-foreground mb-2">
                {isSimulation ? 'סימולציה הושלמה' : 'סשן הושלם בהצלחה'}
              </h3>
              <p className="text-muted-foreground text-sm max-w-md">
                ענית על {quiz.length} שאלות עם ציון של {results.pct}%.
                {results.pct >= 80 ? ' המשך כך!' : ' תמשיך לתרגל ותשתפר!'}
              </p>
            </div>
            <div className="flex flex-col items-center justify-center bg-card/80 p-4 rounded-xl border border-border min-w-[120px]">
              <span className="text-3xl font-black text-primary"><AnimatedNumber value={results.score} />/{quiz.length}</span>
              <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">תשובות נכונות</span>
            </div>
          </div>
        </motion.div>

        {/* Countdown / Score Card */}
        <motion.div custom={1} variants={heroVariant} initial="hidden" animate="visible" className="rounded-xl shadow-xl bg-card border border-border p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">ציון סופי</span>
            <Timer className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="flex justify-center items-center py-4">
            <div className="text-center">
              <p className="text-6xl font-black text-primary"><AnimatedNumber value={results.pct} suffix="%" /></p>
              <p className="text-xs text-muted-foreground mt-2 uppercase font-bold">{isSimulation ? 'ציון סימולציה' : 'ציון סשן'}</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">{quiz.length} שאלות • {errorCount} שגיאות</p>
          </div>
        </motion.div>
      </div>

      {/* ── Metric Rings + Heatmap ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Accuracy Ring */}
        <div className="bg-card p-6 rounded-xl border border-border flex flex-col items-center">
          <ProgressRing value={results.pct} color="text-primary" />
          <p className="font-medium text-foreground mt-2">דיוק</p>
          {results.pct >= 80 && (
            <p className="text-success text-xs font-bold flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" /> ביצוע מצוין
            </p>
          )}
        </div>

        {/* Bank Progress Ring */}
        <div className="bg-card p-6 rounded-xl border border-border flex flex-col items-center">
          <ProgressRing value={bankProgress} color="text-warning" />
          <p className="font-medium text-foreground mt-2">התקדמות במאגר</p>
          <p className="text-muted-foreground text-xs mt-1">
            {Object.keys(progress.history).length} / {data.length}
          </p>
        </div>

        {/* Activity Heatmap */}
        <div className="lg:col-span-2 bg-card p-6 rounded-xl border border-border">
          <ActivityHeatmap history={progress.history} />
        </div>
      </div>

      {/* ── Weak Topics ── */}
      {weakTopics.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2 text-sm uppercase tracking-widest">
            <span className="text-primary">✨</span> נושאים לחיזוק
          </h3>
          <div className="flex flex-wrap gap-2">
            {weakTopics.map(t => (
              <span key={t.topic} className="px-3 py-1.5 rounded-full text-xs font-bold bg-destructive/10 text-destructive border border-destructive/20">
                {t.topic} ({Math.round(t.rate * 100)}% שגיאות)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Question History List ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden shadow-xl">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">
            {isSimulation ? 'פירוט מלא עם הסברים' : 'סיכום שאלות'}
          </h3>
          <span className="text-xs text-muted-foreground">{quiz.length} שאלות</span>
        </div>
        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {results.details.map((d, i) => (
            <div key={i}>
              {/* Question row */}
              <div
                className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => setExpandedQ(expandedQ === i ? null : i)}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                  d.isCorrect
                    ? 'bg-success/10 text-success'
                    : d.userAns
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {d.isCorrect ? '✓' : d.userAns ? '✗' : '—'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate bidi-text">{d.q[KEYS.QUESTION]}</p>
                  <p className="text-xs text-muted-foreground">#{d.q[KEYS.REF_ID]} • {d.q[KEYS.TOPIC] || 'כללי'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                    d.isCorrect
                      ? 'bg-success/20 text-success'
                      : d.userAns
                      ? 'bg-destructive/20 text-destructive'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {d.isCorrect ? 'נכון' : d.userAns ? 'שגוי' : 'דילוג'}
                  </span>
                  {expandedQ === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>

              {/* Expanded details */}
              {expandedQ === i && (
                <div className="p-5 border-t border-border bg-muted/20 space-y-4">
                  <p className="text-foreground text-sm bidi-text leading-relaxed">{d.q[KEYS.QUESTION]}</p>

                  {/* Options */}
                  <div className="space-y-2">
                    {(['A', 'B', 'C', 'D'] as const).map(opt => {
                      const text = d.q[KEYS[opt]];
                      if (!text) return null;
                      const isCorrectOpt = opt === d.correctAns;
                      const isUserChoice = opt === d.userAns;
                      return (
                        <div key={opt} className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
                          isCorrectOpt ? 'bg-success/10 text-success font-bold border border-success/20' :
                          isUserChoice ? 'bg-destructive/10 text-destructive border border-destructive/20' :
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
                    <div className="bg-card p-6 rounded-xl border border-border">
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

      {/* ── Action Footer ── */}
      <div className="flex flex-col sm:flex-row items-center gap-4 pt-4">
        {errorCount > 0 && (
          <button
            onClick={handleRestart}
            className="w-full sm:flex-1 h-14 bg-primary text-primary-foreground font-black text-lg rounded-xl shadow-[0_0_20px_hsl(var(--primary)/0.3)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            תרגול חוזר ({errorCount} שגיאות)
          </button>
        )}
        <button
          onClick={() => exportSessionToPdf({ score: results.score, pct: results.pct, mode, details: results.details })}
          className="w-full sm:w-auto h-14 px-6 bg-card border border-border text-foreground font-bold rounded-xl hover:bg-muted transition-all flex items-center justify-center gap-2"
        >
          <Download className="w-5 h-5" />
          ייצוא PDF
        </button>
        <button
          onClick={() => navigate('home')}
          className="w-full sm:flex-1 h-14 bg-secondary text-foreground font-bold text-lg rounded-xl hover:bg-muted transition-all flex items-center justify-center gap-2"
        >
          חזרה לראשי
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
