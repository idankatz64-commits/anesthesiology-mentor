import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { ClipboardCheck, Sparkles, Key, Loader2, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_KEY_LS = 'gemini_api_key';

export default function AICoachView() {
  const { data, progress } = useApp();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(GEMINI_KEY_LS) || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (apiKey) localStorage.setItem(GEMINI_KEY_LS, apiKey);
  }, [apiKey]);

  const buildPrompt = () => {
    const topicStats: Record<string, { correct: number; total: number }> = {};
    let totalAnswered = 0, totalCorrect = 0;

    Object.entries(progress.history).forEach(([id, h]) => {
      totalAnswered += h.answered;
      totalCorrect += h.correct;
      const q = data.find(x => x[KEYS.ID] === id);
      if (q) {
        const t = q[KEYS.TOPIC] || 'Other';
        if (!topicStats[t]) topicStats[t] = { correct: 0, total: 0 };
        topicStats[t].total += h.answered;
        topicStats[t].correct += h.correct;
      }
    });

    // Calculate Smart Score per topic
    const topicSmartScores = Object.entries(topicStats).map(([topic, s]) => {
      const accuracy = s.total > 0 ? (s.correct / s.total) * 100 : 0;
      const smartScore = ((s.total / (s.total + 10)) * accuracy) + ((10 / (s.total + 10)) * 50);
      return { topic, correct: s.correct, total: s.total, accuracy: Math.round(accuracy), smartScore: Math.round(smartScore) };
    });

    topicSmartScores.sort((a, b) => a.smartScore - b.smartScore);

    const weakest = topicSmartScores.slice(0, 3);
    const strongest = [...topicSmartScores].sort((a, b) => b.smartScore - a.smartScore).slice(0, 3);

    const overallAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    const topicLines = topicSmartScores
      .map(s => `- ${s.topic}: ${s.correct}/${s.total} (דיוק ${s.accuracy}%, Smart Score ${s.smartScore}%)`)
      .join('\n');

    const weakestLines = weakest.map(s => `- ${s.topic}: דיוק ${s.accuracy}%, Smart Score ${s.smartScore}%`).join('\n');
    const strongestLines = strongest.map(s => `- ${s.topic}: דיוק ${s.accuracy}%, Smart Score ${s.smartScore}%`).join('\n');

    return `You are Prof. Idit Matot, the brilliant, highly demanding, and no-nonsense Head of the Anesthesiology Department at Ichilov Hospital. You are reviewing the performance data of your resident, Idan.

He has a critical simulation exam coming up in February 2026, and his final board exams (based on Miller's Anesthesia 10th Ed) are in June 2026.

Review his statistics. DO NOT be polite, positive, or sugarcoat anything. Be blunt, clinical, and brutally honest.

If his accuracy in his weak topics is low, reprimand him professionally: ask him how he expects to pass the simulation in February with such dangerous knowledge gaps.

Here is Idan's performance data:
- Total questions attempted: ${totalAnswered}
- Total unique questions seen: ${Object.keys(progress.history).length} out of ${data.length}
- Overall accuracy: ${overallAccuracy}%

3 Weakest topics (by Smart Score):
${weakestLines}

3 Strongest topics (by Smart Score):
${strongestLines}

Full topic breakdown (sorted weakest first):
${topicLines}

Structure your response in Hebrew:

1. שורת מחץ (Opening punchline about his overall readiness).
2. ניתוח פערים קליני (Clinical gap analysis of his weakest topics).
3. פקודות עבודה להמשך השבוע (3 strict, non-negotiable action items to fix the gaps using Miller 10th Ed).

Keep it under 250 words. Speak directly to Idan in Hebrew. Use markdown formatting.`;
  };

  const generateReport = async () => {
    if (!apiKey.trim()) {
      setShowKeyInput(true);
      setError('יש להזין מפתח Gemini API כדי לייצר דוח.');
      return;
    }

    setLoading(true);
    setError('');
    setReport('');

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(buildPrompt());
      const responseText = result.response.text();
      if (!responseText) throw new Error('No response from Gemini.');
      setReport(responseText);
    } catch (err: any) {
      console.error('Gemini SDK error:', err);
      setError(err.message || 'שגיאה בחיבור ל-API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in max-w-3xl mx-auto">
      <div className="bg-gradient-to-br from-destructive/80 to-primary rounded-3xl p-10 text-primary-foreground shadow-2xl mb-10 border border-transparent">
        <div className="flex items-start gap-6">
          <div className="bg-primary-foreground/20 p-4 rounded-2xl backdrop-blur-sm">
            <ClipboardCheck className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-3xl font-bold mb-3">דו״ח מטות</h2>
            <p className="text-primary-foreground/80 text-base font-light">
              סקירת ביצועים קלינית חסרת פשרות מפרופ׳ עידית מטות.
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={generateReport}
            disabled={loading}
            className="bg-primary-foreground text-foreground font-bold px-6 py-3 rounded-xl shadow-lg hover:opacity-90 transition flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'מייצר דוח...' : '📋 הפק דו״ח מטות'}
          </button>
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            className="bg-primary-foreground/20 text-primary-foreground font-medium px-4 py-3 rounded-xl hover:bg-primary-foreground/30 transition flex items-center gap-2 text-sm"
          >
            <Key className="w-4 h-4" />
            {apiKey ? 'עדכן מפתח API' : 'הגדר מפתח API'}
          </button>
        </div>
      </div>

      {/* API Key Input */}
      {showKeyInput && (
        <div className="soft-card bg-card border border-border p-6 mb-6">
          <label className="text-sm font-bold text-foreground mb-2 block">Gemini API Key</label>
          <p className="text-xs text-muted-foreground mb-3">
            קבל מפתח חינמי מ-{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Google AI Studio
            </a>
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="AIza..."
            className="w-full p-3 border border-border rounded-xl bg-background text-foreground outline-none focus:border-primary transition font-mono text-sm"
            dir="ltr"
          />
          <button
            onClick={() => { localStorage.setItem(GEMINI_KEY_LS, apiKey); setShowKeyInput(false); setError(''); }}
            className="mt-3 bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-bold hover:opacity-90 transition"
          >
            שמור מפתח
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Report */}
      {report ? (
        <div className="soft-card bg-card border border-border p-8">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" /> דו״ח פרופ׳ מטות
          </h3>
          <div className="markdown-content bidi-text text-foreground leading-relaxed">
            <ReactMarkdown>{report}</ReactMarkdown>
          </div>
        </div>
      ) : !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-light">לחץ על הכפתור למעלה כדי לקבל סקירת ביצועים מפרופ׳ מטות.</p>
          {!apiKey && <p className="text-sm mt-2 text-warning">⚠️ יש להגדיר מפתח Gemini API תחילה.</p>}
        </div>
      )}
    </div>
  );
}
