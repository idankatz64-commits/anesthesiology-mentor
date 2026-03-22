import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sparkles, Loader2 } from 'lucide-react';

export default function AISummaryButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');

  const fetchSummary = async (period: 'day' | 'week') => {
    setLoading(true);
    setError('');
    setSummary('');
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
      <div className="flex gap-2 items-center">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => fetchSummary('day')}
        >
          <Sparkles className="w-4 h-4" />
          סיכום AI — 24 שעות
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => fetchSummary('week')}
        >
          <Sparkles className="w-4 h-4" />
          סיכום AI — 7 ימים
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <Sparkles className="w-5 h-5 text-primary" />
              סיכום לימודי AI
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">מנתח את הלמידה שלך...</p>
            </div>
          )}

          {error && (
            <p className="text-destructive text-sm text-center py-4">{error}</p>
          )}

          {summary && !loading && (
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {summary}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
