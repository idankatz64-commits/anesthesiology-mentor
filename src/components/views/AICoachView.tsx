import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Bot, Sparkles, Key, Loader2, AlertTriangle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

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

    const topicLines = Object.entries(topicStats)
      .map(([topic, s]) => `- ${topic}: ${s.correct}/${s.total} (${Math.round((s.correct / s.total) * 100)}%)`)
      .join('\n');

    return `You are a medical education AI coach helping an anesthesiology resident prepare for board exams.

Here is the student's performance data:
- Total questions attempted: ${totalAnswered}
- Total unique questions: ${Object.keys(progress.history).length}
- Overall accuracy: ${totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0}%
- Database size: ${data.length} questions

Topic breakdown:
${topicLines}

Please provide:
1. A brief summary of the student's overall performance
2. The 3 weakest topics that need immediate focus
3. The 3 strongest topics
4. A recommended study plan for the next week
5. Specific tips for improving weak areas

Write your response in Hebrew. Use markdown formatting.`;
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
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: buildPrompt() }] }],
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error?.message || `API Error: ${res.status}`);
      }

      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('No response from Gemini.');
      setReport(text);
    } catch (err: any) {
      setError(err.message || 'שגיאה בחיבור ל-API.');
    } finally {
      setLoading(false);
    }
  };

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
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={generateReport}
            disabled={loading}
            className="bg-primary-foreground text-foreground font-bold px-6 py-3 rounded-xl shadow-lg hover:opacity-90 transition flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'מייצר דוח...' : '✨ צור דוח אישי מבוסס AI'}
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
            <Bot className="w-5 h-5 text-primary" /> דוח ביצועים
          </h3>
          <div className="markdown-content bidi-text text-foreground leading-relaxed">
            <ReactMarkdown>{report}</ReactMarkdown>
          </div>
        </div>
      ) : !loading && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-light">לחץ על הכפתור למעלה כדי לייצר דוח ביצועים מבוסס AI.</p>
          {!apiKey && <p className="text-sm mt-2 text-warning">⚠️ יש להגדיר מפתח Gemini API תחילה.</p>}
        </div>
      )}
    </div>
  );
}
