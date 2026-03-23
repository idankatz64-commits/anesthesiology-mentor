import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Save, GripVertical, ExternalLink, Link as LinkIcon, FolderOpen, BookOpen, FileText } from 'lucide-react';

interface ResourceLink {
  id: string;
  title: string;
  description: string | null;
  url: string;
  category: string;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
}

const CATEGORY_OPTIONS = [
  { value: 'drive', label: '📁 Google Drive', icon: FolderOpen },
  { value: 'exam', label: '📝 מבחנים', icon: FileText },
  { value: 'reference', label: '📖 חומר רקע', icon: BookOpen },
  { value: 'other', label: '🔗 אחר', icon: LinkIcon },
];

const EMPTY: Omit<ResourceLink, 'id'> = {
  title: '', description: '', url: '', category: 'drive', icon: null, is_active: true, sort_order: 0,
};

export default function ResourceLinksTab() {
  const [links, setLinks] = useState<ResourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [newLink, setNewLink] = useState({ ...EMPTY });
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('resource_links')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) { toast.error('שגיאה בטעינה'); }
    else { setLinks(data ?? []); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newLink.title.trim() || !newLink.url.trim()) {
      toast.error('יש למלא כותרת וקישור');
      return;
    }
    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('resource_links').insert({
      ...newLink,
      sort_order: links.length,
      created_by: user?.id,
    });
    if (error) { toast.error('שגיאה בהוספה'); }
    else {
      toast.success('קישור נוסף');
      setNewLink({ ...EMPTY });
      setShowForm(false);
      load();
    }
    setAdding(false);
  };

  const handleToggleActive = async (link: ResourceLink) => {
    setSaving(link.id);
    const { error } = await supabase
      .from('resource_links')
      .update({ is_active: !link.is_active })
      .eq('id', link.id);
    if (error) { toast.error('שגיאה'); }
    else { setLinks(prev => prev.map(l => l.id === link.id ? { ...l, is_active: !l.is_active } : l)); }
    setSaving(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק קישור זה?')) return;
    setDeleting(id);
    const { error } = await supabase.from('resource_links').delete().eq('id', id);
    if (error) { toast.error('שגיאה במחיקה'); }
    else { setLinks(prev => prev.filter(l => l.id !== id)); toast.success('נמחק'); }
    setDeleting(null);
  };

  const handleUpdateField = async (id: string, field: keyof ResourceLink, value: string | number) => {
    setSaving(id);
    const { error } = await supabase.from('resource_links').update({ [field]: value }).eq('id', id);
    if (error) { toast.error('שגיאה בשמירה'); }
    else {
      setLinks(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
      toast.success('נשמר');
    }
    setSaving(null);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">קישורים ומשאבים</h2>
          <p className="text-sm text-muted-foreground mt-1">קישורים המוצגים ב-HomeView למשתמשים</p>
        </div>
        <Button onClick={() => setShowForm(s => !s)} className="gap-2">
          <Plus className="w-4 h-4" /> הוסף קישור
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="glass-card rounded-xl p-6 border border-primary/20 space-y-4">
          <h3 className="font-bold text-foreground">קישור חדש</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              placeholder="כותרת *"
              value={newLink.title}
              onChange={e => setNewLink(l => ({ ...l, title: e.target.value }))}
            />
            <Input
              placeholder="קישור (URL) *"
              value={newLink.url}
              onChange={e => setNewLink(l => ({ ...l, url: e.target.value }))}
              dir="ltr"
            />
            <Input
              placeholder="תיאור (אופציונלי)"
              value={newLink.description ?? ''}
              onChange={e => setNewLink(l => ({ ...l, description: e.target.value }))}
            />
            <select
              value={newLink.category}
              onChange={e => setNewLink(l => ({ ...l, category: e.target.value }))}
              className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground"
            >
              {CATEGORY_OPTIONS.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={adding} className="gap-2">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              שמור
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>ביטול</Button>
          </div>
        </div>
      )}

      {/* Links list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : links.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <LinkIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>אין קישורים עדיין</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map(link => (
            <div key={link.id} className={`glass-card rounded-xl p-4 border transition-all ${link.is_active ? 'border-border' : 'border-border/30 opacity-50'}`}>
              <div className="flex items-start gap-3">
                <GripVertical className="w-5 h-5 text-muted-foreground mt-1 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{link.title}</span>
                    <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase">
                      {CATEGORY_OPTIONS.find(c => c.value === link.category)?.label ?? link.category}
                    </span>
                    {!link.is_active && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">מוסתר</span>
                    )}
                  </div>
                  {link.description && (
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  )}
                  <a href={link.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary underline flex items-center gap-1 w-fit" dir="ltr">
                    {link.url.slice(0, 60)}{link.url.length > 60 ? '...' : ''}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(link)}
                    disabled={saving === link.id}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                      link.is_active
                        ? 'bg-success/10 text-success hover:bg-destructive/10 hover:text-destructive'
                        : 'bg-muted text-muted-foreground hover:bg-success/10 hover:text-success'
                    }`}
                  >
                    {saving === link.id ? <Loader2 className="w-3 h-3 animate-spin" /> : link.is_active ? 'הסתר' : 'הצג'}
                  </button>
                  <button
                    onClick={() => handleDelete(link.id)}
                    disabled={deleting === link.id}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                  >
                    {deleting === link.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
