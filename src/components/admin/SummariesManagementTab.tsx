import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Save, BookOpen, ExternalLink } from 'lucide-react';

interface TopicSummary {
  id: string;
  topic_key: string;
  title: string;
  embed_url: string | null;
  drive_url: string | null;
  created_by: string | null;
  updated_at: string;
}

const EMPTY = { topic_key: '', title: '', embed_url: '', drive_url: '' };

export default function SummariesManagementTab() {
  const [summaries, setSummaries] = useState<TopicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newSummary, setNewSummary] = useState({ ...EMPTY });
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('topic_summaries')
      .select('*')
      .order('title', { ascending: true });
    if (error) { toast.error('שגיאה בטעינה'); }
    else { setSummaries(data ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newSummary.topic_key.trim() || !newSummary.title.trim()) {
      toast.error('יש למלא מפתח נושא וכותרת');
      return;
    }
    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('topic_summaries').insert({
      topic_key: newSummary.topic_key.trim(),
      title: newSummary.title.trim(),
      embed_url: newSummary.embed_url.trim() || null,
      drive_url: newSummary.drive_url.trim() || null,
      created_by: user?.id,
    });
    if (error) {
      toast.error(error.code === '23505' ? 'מפתח נושא כבר קיים' : 'שגיאה בהוספה');
    } else {
      toast.success('סיכום נוסף');
      setNewSummary({ ...EMPTY });
      setShowForm(false);
      load();
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק סיכום זה?')) return;
    setDeleting(id);
    const { error } = await supabase.from('topic_summaries').delete().eq('id', id);
    if (error) { toast.error('שגיאה במחיקה'); }
    else { setSummaries(prev => prev.filter(s => s.id !== id)); toast.success('נמחק'); }
    setDeleting(null);
  };

  const handleUpdateField = async (id: string, field: keyof TopicSummary, value: string) => {
    setSaving(id);
    const { error } = await supabase.from('topic_summaries').update({ [field]: value || null }).eq('id', id);
    if (error) { toast.error('שגיאה בשמירה'); }
    else {
      setSummaries(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
      toast.success('נשמר');
    }
    setSaving(null);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">סיכומי נושאים</h2>
          <p className="text-sm text-muted-foreground mt-1">סיכומים המוצגים לפי נושא — כולל embed של Google Drive</p>
        </div>
        <Button onClick={() => setShowForm(s => !s)} className="gap-2">
          <Plus className="w-4 h-4" /> הוסף סיכום
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="glass-card rounded-xl p-6 border border-primary/20 space-y-4">
          <h3 className="font-bold text-foreground">סיכום חדש</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              placeholder="מפתח נושא (topic_key) *"
              value={newSummary.topic_key}
              onChange={e => setNewSummary(s => ({ ...s, topic_key: e.target.value }))}
              dir="ltr"
            />
            <Input
              placeholder="כותרת לתצוגה *"
              value={newSummary.title}
              onChange={e => setNewSummary(s => ({ ...s, title: e.target.value }))}
            />
            <Input
              placeholder="Embed URL (Google Drive Publish to web)"
              value={newSummary.embed_url}
              onChange={e => setNewSummary(s => ({ ...s, embed_url: e.target.value }))}
              dir="ltr"
              className="md:col-span-2"
            />
            <Input
              placeholder="קישור ישיר ל-Drive (אופציונלי)"
              value={newSummary.drive_url}
              onChange={e => setNewSummary(s => ({ ...s, drive_url: e.target.value }))}
              dir="ltr"
              className="md:col-span-2"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            להשיג Embed URL: Google Drive → File → Share → Publish to web → Copy embed link
          </p>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={adding} className="gap-2">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              שמור
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : summaries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין סיכומים עדיין</p>
        </div>
      ) : (
        <div className="space-y-3">
          {summaries.map(summary => (
            <div key={summary.id} className="glass-card rounded-xl p-4 border border-border space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{summary.title}</span>
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                      {summary.topic_key}
                    </span>
                  </div>
                  {summary.embed_url && (
                    <p className="text-xs text-muted-foreground truncate" dir="ltr">{summary.embed_url.slice(0, 70)}...</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {summary.drive_url && (
                    <a href={summary.drive_url} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(summary.id)}
                    disabled={deleting === summary.id}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                  >
                    {deleting === summary.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Inline edit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input
                  defaultValue={summary.embed_url ?? ''}
                  placeholder="Embed URL"
                  dir="ltr"
                  className="text-xs"
                  onBlur={e => { if (e.target.value !== (summary.embed_url ?? '')) handleUpdateField(summary.id, 'embed_url', e.target.value); }}
                />
                <Input
                  defaultValue={summary.drive_url ?? ''}
                  placeholder="Drive URL"
                  dir="ltr"
                  className="text-xs"
                  onBlur={e => { if (e.target.value !== (summary.drive_url ?? '')) handleUpdateField(summary.id, 'drive_url', e.target.value); }}
                />
              </div>
              {saving === summary.id && <p className="text-xs text-primary">שומר...</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
