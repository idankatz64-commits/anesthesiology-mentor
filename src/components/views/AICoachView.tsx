import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { ClipboardCheck, Sparkles, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import ReactMarkdown from 'react-markdown';

export default function AICoachView() {
  const { data, progress } = useApp();
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);

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

  const handleGenerate = async () => {
    if (Object.keys(progress.history).length === 0) {
      toast({ title: 'אין נתונים', description: 'התחל לתרגל כדי לקבל דו״ח.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setReport('');

    try {
      const { data: fnData, error } = await supabase.functions.invoke('matot-report', {
        body: { prompt: buildPrompt() },
      });

      if (error) throw error;
      if (fnData?.error) throw new Error(fnData.error);

      setReport(fnData.text);
    } catch (err: any) {
      console.error('Matot report error:', err);
      toast({
        title: 'שגיאה בהפקת הדו״ח',
        description: err?.message || 'נסה שוב מאוחר יותר.',
        variant: 'destructive',
      });
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
        <div className="mt-8">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-primary-foreground text-foreground font-bold px-6 py-3 rounded-xl shadow-lg hover:opacity-90 transition flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'מפיק דו״ח...' : '📋 הפק דו״ח מטות'}
          </button>
        </div>
      </div>

      {report ? (
        <div className="soft-card bg-card border border-border p-8 prose prose-sm dark:prose-invert max-w-none" dir="rtl">
          <ReactMarkdown>{report}</ReactMarkdown>
        </div>
      ) : !loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-light">לחץ על הכפתור למעלה כדי לקבל את הדו״ח ישירות באפליקציה.</p>
        </div>
      ) : (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">פרופ׳ מטות מנתחת את הנתונים שלך...</p>
        </div>
      )}
    </div>
  );
}
