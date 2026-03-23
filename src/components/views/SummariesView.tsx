import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, BookOpen, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TopicSummary {
  id: string;
  topic_key: string;
  title: string;
  embed_url: string | null;
  drive_url: string | null;
}

export default function SummariesView() {
  const [summaries, setSummaries] = useState<TopicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('topic_summaries')
      .select('id, topic_key, title, embed_url, drive_url')
      .order('title', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setSummaries(data ?? []);
        setLoading(false);
      });
  }, []);

  const toggle = (id: string) => setOpenId(prev => (prev === id ? null : id));

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-20" />
        <p className="text-lg font-medium">אין סיכומים זמינים עדיין</p>
        <p className="text-sm mt-1">סיכומי נושאים יתווספו בקרוב</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">סיכומי נושאים</h1>
        <p className="text-sm text-muted-foreground mt-1">חומר לימוד מקיף לפי נושאי הבחינה</p>
      </div>

      <div className="space-y-3">
        {summaries.map(summary => (
          <div key={summary.id} className="glass-card rounded-xl border border-border overflow-hidden">
            <button
              onClick={() => toggle(summary.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-card/60 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary p-2 rounded-lg">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">{summary.title}</p>
                  <p className="text-xs text-muted-foreground">{summary.topic_key}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {summary.drive_url && (
                  <a
                    href={summary.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition"
                    title="פתח ב-Google Drive"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                {openId === summary.id
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                }
              </div>
            </button>

            <AnimatePresence>
              {openId === summary.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className="overflow-hidden"
                >
                  {summary.embed_url ? (
                    <div className="border-t border-border">
                      <iframe
                        src={summary.embed_url}
                        className="w-full"
                        style={{ height: '600px' }}
                        title={summary.title}
                        allow="autoplay"
                        frameBorder="0"
                      />
                    </div>
                  ) : summary.drive_url ? (
                    <div className="border-t border-border p-6 text-center">
                      <p className="text-sm text-muted-foreground mb-3">הסיכום זמין ב-Google Drive</p>
                      <a
                        href={summary.drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary underline"
                      >
                        <ExternalLink className="w-4 h-4" />
                        פתח סיכום
                      </a>
                    </div>
                  ) : (
                    <div className="border-t border-border p-6 text-center text-sm text-muted-foreground">
                      תוכן בקרוב
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
