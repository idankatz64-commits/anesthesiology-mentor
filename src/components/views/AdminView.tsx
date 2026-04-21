import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { ShieldAlert, ArrowRight, Loader2 } from 'lucide-react';

interface FeedbackRow {
  id: string;
  user_id: string;
  feedback_text: string;
  question_id: string | null;
  page_context: string | null;
  created_at: string;
  user_email?: string;
}

export default function AdminView() {
  const { navigate } = useApp();
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' ' + date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_feedback')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        setError('אין הרשאה או שגיאה בטעינה.');
        console.error(error);
      } else {
        setRows(data || []);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="fade-in max-w-5xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <button onClick={() => navigate('home')} className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm">
          <ArrowRight className="w-4 h-4" /> חזרה
        </button>
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-destructive" />
          <h2 className="text-xl font-bold text-foreground">ניהול מערכת</h2>
        </div>
      </div>

      {/* Feedback Section */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-bold text-foreground text-lg">פידבקים</h3>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 text-destructive border-t border-destructive/20 p-6 text-center font-medium">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-right px-4 py-3 font-bold text-muted-foreground">תאריך</th>
                    <th className="text-right px-4 py-3 font-bold text-muted-foreground">משתמש (ID)</th>
                    <th className="text-right px-4 py-3 font-bold text-muted-foreground">שאלה / הקשר</th>
                    <th className="text-right px-4 py-3 font-bold text-muted-foreground">טקסט</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-12 text-muted-foreground">אין פידבקים עדיין.</td>
                    </tr>
                  ) : rows.map(row => (
                    <tr key={row.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap matrix-text">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground max-w-[120px] truncate" title={row.user_id}>
                        {row.user_id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.question_id && <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">Q#{row.question_id}</span>}
                        {row.page_context && <span className="text-muted-foreground mr-2">{row.page_context}</span>}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-xs">{row.feedback_text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-muted/30 border-t border-border text-xs text-muted-foreground">
              סה״כ {rows.length} פידבקים
            </div>
          </>
        )}
      </div>
    </div>
  );
}
