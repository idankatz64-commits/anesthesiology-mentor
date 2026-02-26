import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Send, MessageSquareWarning } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { springGentle } from '@/lib/animations';

interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
  questionId?: string;
}

export default function FeedbackModal({ open, onClose, questionId }: FeedbackModalProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

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
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-background/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="glass-card rounded-2xl shadow-2xl w-full max-w-md p-6 card-accent-top relative z-10"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0, transition: { duration: 0.2 } }}
            transition={springGentle}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100) onClose();
            }}
            style={{ willChange: 'transform' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <MessageSquareWarning className="w-5 h-5 text-primary" />
                דווח על טעות / פידבק
              </h3>
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
