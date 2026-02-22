import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Users, Send, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GlobalQuestionStatsProps {
  questionId: string;
}

export function GlobalQuestionStats({ questionId }: GlobalQuestionStatsProps) {
  const [stats, setStats] = useState<{ total_users: number; success_rate: number } | null>(null);

  useEffect(() => {
    supabase.rpc('get_question_success_rate', { qid: questionId }).then(({ data }) => {
      if (data && data.length > 0 && data[0].total_users > 0) {
        setStats({ total_users: Number(data[0].total_users), success_rate: Number(data[0].success_rate) });
      }
    });
  }, [questionId]);

  if (!stats) return null;

  const rate = stats.success_rate;
  const colorClasses = rate < 30
    ? 'bg-destructive/10 border-destructive/20 text-destructive'
    : rate < 70
      ? 'bg-warning/10 border-warning/20 text-warning'
      : 'bg-success/10 border-success/20 text-success';

  return (
    <div className={`flex items-center gap-2 mt-4 px-4 py-3 rounded-xl border text-sm font-medium ${colorClasses}`}>
      <Users className="w-4 h-4" />
      <span>
        רק <span className="font-bold text-lg matrix-text">{rate}%</span> מהמשתמשים ענו נכון על שאלה זו
        <span className="text-xs opacity-70 mr-1">({stats.total_users} משתמשים)</span>
      </span>
    </div>
  );
}

interface CommunityNotesProps {
  questionId: string;
}

export function CommunityNotes({ questionId }: CommunityNotesProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState<Array<{ id: string; note_text: string; author_display: string; created_at: string; user_id: string }>>([]);
  const [newNote, setNewNote] = useState('');
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id || null);
    });
  }, []);

  useEffect(() => {
    supabase
      .from('community_notes')
      .select('*')
      .eq('question_id', questionId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setNotes(data);
      });
  }, [questionId]);

  const handleSubmit = async () => {
    if (!newNote.trim()) return;
    setSending(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({ title: 'שגיאה', description: 'יש להתחבר כדי להוסיף הערה.', variant: 'destructive' });
        return;
      }

      const authorDisplay = session.user.email?.split('@')[0] || 'אנונימי';

      const { data: inserted, error } = await supabase.from('community_notes').insert({
        user_id: session.user.id,
        question_id: questionId,
        note_text: newNote.trim(),
        author_display: authorDisplay,
      }).select().single();

      if (error) throw error;
      if (inserted) setNotes(prev => [inserted, ...prev]);
      setNewNote('');
    } catch (err: any) {
      console.error('Community note error:', err);
      toast({ title: 'שגיאה', description: 'לא הצלחנו לשמור.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    await supabase.from('community_notes').delete().eq('id', noteId);
    setNotes(prev => prev.filter(n => n.id !== noteId));
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }) + ' ' +
           date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="mt-6 p-6 bg-muted/30 rounded-2xl border border-border">
      <h4 className="font-bold text-foreground mb-4 flex items-center gap-2 text-sm">
        💬 הערות קהילה ({notes.length})
      </h4>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="הוסף הערה לקהילה..."
          className="flex-grow p-2.5 bg-card border border-border rounded-xl text-sm outline-none focus:border-primary transition text-foreground"
          dir="rtl"
          maxLength={500}
        />
        <button
          onClick={handleSubmit}
          disabled={!newNote.trim() || sending}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-50 hover-glow"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">אין הערות עדיין. היה הראשון!</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {notes.map(note => (
            <div key={note.id} className="bg-card p-3 rounded-xl border border-border text-sm flex justify-between items-start gap-2">
              <div className="flex-grow">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-primary text-xs">@{note.author_display}</span>
                  <span className="text-xs text-muted-foreground matrix-text">{formatDate(note.created_at)}</span>
                </div>
                <p className="text-foreground text-sm leading-relaxed">{note.note_text}</p>
              </div>
              {userId === note.user_id && (
                <button onClick={() => handleDelete(note.id)} className="text-muted-foreground hover:text-destructive transition flex-shrink-0">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
