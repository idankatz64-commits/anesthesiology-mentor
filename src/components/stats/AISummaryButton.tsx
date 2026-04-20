import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sparkles, Loader2 } from 'lucide-react';

function renderSummary(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={i} className="h-3" />;

    // Topic header: starts with === or **Topic** pattern or a line ending with ===
    if (trimmed.startsWith('===') || (trimmed.startsWith('**') && trimmed.endsWith('**'))) {
      const clean = trimmed.replace(/===|נושא:|^\*\*|\*\*$/g, '').trim();
      return (
        <div key={i} className="mt-5 mb-2 pb-1 border-b border-primary/30">
          <span className="text-primary font-bold text-sm">{clean}</span>
        </div>
      );
    }

    // Bullet point
    if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
      const content = trimmed.replace(/^[-•]\s*/, '').replace(/\*\*/g, '');
      return (
        <div key={i} className="flex gap-2 text-sm text-foreground/90 leading-relaxed my-1">
          <span className="text-primary mt-1 shrink-0">•</span>
          <span>{content}</span>
        </div>
      );
    }

    // Regular line — strip remaining markdown
    const clean = trimmed.replace(/\*\*/g, '').replace(/^#+\s*/, '');
    return (
      <p key={i} className="text-sm text-foreground/90 leading-relaxed my-1">{clean}</p>
    );
  });
}

export default function AISummaryButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [error, setError] = useState('');

  const fetchSummary = async (period: 'day' | 'week') => {
    setLoading(true);
    setError('');
    setSummary('');
    setPeriodLabel(period === 'day' ? '24 שעות אחרונות' : '7 ימים אחרונים');
    setOpen(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('לא מחובר');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-summary`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ period }),
        }
      );

      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSummary(json.text);
    } catch (e: any) {
      setError(e.message || 'שגיאה בטעינת הסיכום');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex gap-2 items-center flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => fetchSummary('day')}
        >
          <Sparkles className="w-4 h-4" />
          24 שעות אחרונות
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => fetchSummary('week')}
        >
          <Sparkles className="w-4 h-4" />
          7 ימים אחרונים
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" dir="rtl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right text-base">
              <Sparkles className="w-4 h-4 text-primary" />
              סיכום לימודי — {periodLabel}
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
              <p className="text-sm">מנתח את החומר שלמדת...</p>
            </div>
          )}

          {error && (
            <p className="text-destructive text-sm text-center py-4">{error}</p>
          )}

          {summary && !loading && (
            <div className="pt-1">
              {renderSummary(summary)}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
