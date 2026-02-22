import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { X, Send, MessageSquareWarning } from 'lucide-react';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  questionId?: string;
}

export default function FeedbackModal({ open, onClose, questionId }: FeedbackModalProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({ title: 'שגיאה', description: 'יש להתחבר כדי לשלוח פידבק.', variant: 'destructive' });
        return;
      }

      const { error } = await supabase.from('user_feedback').insert({
        user_id: session.user.id,
        feedback_text: text.trim(),
        question_id: questionId || null,
        page_context: window.location.pathname,
      });

      if (error) throw error;

      toast({ title: '✅ תודה!', description: 'הפידבק נשלח בהצלחה.' });
      setText('');
      onClose();
    } catch (err: any) {
      console.error('Feedback error:', err);
      toast({ title: 'שגיאה', description: 'לא הצלחנו לשלוח. נסה שוב.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="glass-card rounded-2xl shadow-2xl w-full max-w-md p-6 card-accent-top" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <MessageSquareWarning className="w-5 h-5 text-primary" />
            דווח על טעות / פידבק
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {questionId && (
          <p className="text-xs text-muted-foreground mb-3">שאלה: {questionId}</p>
        )}

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="תאר את הבעיה או הצעת השיפור..."
          className="w-full h-32 p-3 border border-border rounded-xl bg-muted/50 text-foreground resize-none outline-none focus:border-primary transition text-sm"
          dir="rtl"
          maxLength={2000}
        />

        <div className="flex justify-between items-center mt-4">
          <span className="text-xs text-muted-foreground">{text.length}/2000</span>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || sending}
            className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-bold text-sm hover:opacity-90 transition flex items-center gap-2 disabled:opacity-50 hover-glow"
          >
            <Send className="w-4 h-4" />
            {sending ? 'שולח...' : 'שלח'}
          </button>
        </div>
      </div>
    </div>
  );
}
