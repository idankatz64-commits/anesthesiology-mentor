import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Search, Pencil, Trash2, ChevronRight, ChevronLeft, Loader2, Save, X, Download, ChevronDown, Check } from 'lucide-react';
import Papa from 'papaparse';
import { getChapterDisplay, resolveChapterName } from '@/data/millerChapters';

interface QuestionRow {
  id: string;
  ref_id: string | null;
  question: string;
  a: string | null;
  b: string | null;
  c: string | null;
  d: string | null;
  correct: string;
  explanation: string | null;
  topic: string | null;
  year: string | null;
  source: string | null;
  kind: string | null;
  miller: string | null;
  chapter: number | null;
  media_type: string | null;
  media_link: string | null;
}

const PAGE_SIZE = 25;
const BATCH_PAGE_SIZE = 50;

function BatchChapterUpdate() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ id: string; question: string; chapter: number | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [totalMissing, setTotalMissing] = useState(0);

  const fetchMissing = async () => {
    setLoading(true);
    const { data, count } = await supabase
      .from('questions')
      .select('id, question, chapter', { count: 'exact' })
      .or('chapter.is.null,chapter.eq.0')
      .order('id')
      .limit(BATCH_PAGE_SIZE);
    setRows((data || []) as any);
    setTotalMissing(count || 0);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchMissing();
  }, [open]);

  const saveOne = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    const { valid } = resolveChapterName(draft);
    if (!valid) { toast.error('מספר פרק לא תקין'); return; }
    setSavingId(id);
    const chapterVal = parseInt(draft, 10);
    const { error } = await supabase.from('questions').update({ chapter: chapterVal }).eq('id', id);
    if (error) toast.error('שגיאה: ' + error.message);
    else {
      toast.success(`פרק עודכן לשאלה ${id}`);
      setRows(r => r.filter(row => row.id !== id));
      setTotalMissing(t => t - 1);
    }
    setSavingId(null);
  };

  const saveAll = async () => {
    const entries = Object.entries(drafts).filter(([, d]) => d && resolveChapterName(d).valid);
    if (entries.length === 0) { toast.error('אין שינויים לשמור'); return; }
    setSavingAll(true);
    let success = 0;
    for (const [id, draft] of entries) {
      const chapterVal = parseInt(draft, 10);
      const { error } = await supabase.from('questions').update({ chapter: chapterVal }).eq('id', id);
      if (!error) success++;
    }
    toast.success(`${success} שאלות עודכנו בהצלחה`);
    setSavingAll(false);
    setDrafts({});
    fetchMissing();
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-bold text-primary hover:underline w-full">
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        עדכון פרקים ({totalMissing > 0 ? totalMissing : '...'} שאלות ללא פרק)
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">כל השאלות כבר מעודכנות ✅</p>
        ) : (
          <div className="space-y-3">
            <div className="glass-card rounded-xl overflow-hidden border border-border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-20">מזהה</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">שאלה</th>
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground w-20">פרק</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">שם הפרק</th>
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground w-16">שמור</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const draft = drafts[r.id] || '';
                      const resolved = draft ? resolveChapterName(draft) : null;
                      return (
                        <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground truncate">{r.id}</td>
                          <td className="px-3 py-2 text-foreground max-w-[250px]"><span className="line-clamp-1">{r.question}</span></td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="text"
                              value={draft}
                              onChange={e => setDrafts(d => ({ ...d, [r.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') saveOne(r.id); }}
                              className="w-16 px-2 py-1 text-xs bg-muted border border-border rounded-lg text-foreground outline-none focus:border-primary text-center"
                              placeholder="#"
                            />
                          </td>
                          <td className="px-3 py-2">
                            {resolved && (
                              <span className={`text-xs ${resolved.valid ? 'text-muted-foreground' : 'text-destructive'}`}>
                                {resolved.display}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              disabled={!draft || !resolved?.valid || savingId === r.id}
                              onClick={() => saveOne(r.id)}
                            >
                              {savingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveAll} disabled={savingAll} size="sm">
                {savingAll ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />}
                שמור הכל
              </Button>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function QuestionEditorTab() {
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>('__all__');
  const [topics, setTopics] = useState<string[]>([]);

  // Edit state
  const [editQuestion, setEditQuestion] = useState<QuestionRow | null>(null);
  const [editForm, setEditForm] = useState<Partial<QuestionRow>>({});
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const allRows: QuestionRow[] = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        let query = supabase
          .from('questions')
          .select('id, ref_id, question, a, b, c, d, correct, explanation, topic, year, source, kind, miller, chapter, media_type, media_link');

        if (searchTerm.trim()) {
          query = query.or(`question.ilike.%${searchTerm}%,id.ilike.%${searchTerm}%,ref_id.ilike.%${searchTerm}%`);
        }
        if (topicFilter && topicFilter !== '__all__') {
          query = query.eq('topic', topicFilter);
        }

        const { data, error } = await query.range(from, from + batchSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...(data as QuestionRow[]));
        if (data.length < batchSize) break;
        from += batchSize;
      }
      const csv = Papa.unparse(allRows);
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `questions_export_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`יוצאו ${allRows.length} שאלות בהצלחה`);
    } catch (err: any) {
      toast.error('שגיאה בייצוא: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Fetch topics for filter
  useEffect(() => {
    supabase
      .from('questions')
      .select('topic')
      .not('topic', 'is', null)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map(r => r.topic).filter(Boolean) as string[])].sort();
          setTopics(unique);
        }
      });
  }, []);

  // Fetch questions
  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('questions')
        .select('*', { count: 'exact' });

      if (searchTerm.trim()) {
        query = query.or(`question.ilike.%${searchTerm}%,id.ilike.%${searchTerm}%,ref_id.ilike.%${searchTerm}%`);
      }
      if (topicFilter && topicFilter !== '__all__') {
        query = query.eq('topic', topicFilter);
      }

      const { data, count, error } = await query
        .order('id', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      setQuestions(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      toast.error('שגיאה בטעינת שאלות: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, topicFilter]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Reset page on filter change
  useEffect(() => {
    setPage(0);
  }, [searchTerm, topicFilter]);

  // Edit handlers
  const openEdit = (q: QuestionRow) => {
    setEditQuestion(q);
    setEditForm({ ...q });
  };

  const handleSave = async () => {
    if (!editQuestion || !editForm) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('questions')
        .update({
          question: editForm.question,
          a: editForm.a,
          b: editForm.b,
          c: editForm.c,
          d: editForm.d,
          correct: editForm.correct,
          explanation: editForm.explanation,
          topic: editForm.topic,
          year: editForm.year,
          source: editForm.source,
          kind: editForm.kind,
          miller: editForm.miller,
          chapter: editForm.chapter,
          media_type: editForm.media_type,
          media_link: editForm.media_link,
          manually_edited: true,
        })
        .eq('id', editQuestion.id);

      if (error) throw error;
      toast.success('השאלה עודכנה בהצלחה');

      // Fire-and-forget edit log
      if (editForm && editQuestion) {
        const changedFields = Object.keys(editForm).filter(k => (editForm as any)[k] !== (editQuestion as any)[k]);
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user && changedFields.length > 0) {
            supabase.from('question_edit_log').insert({
              editor_id: session.user.id,
              question_id: editQuestion.id,
              fields_changed: changedFields,
              action: 'update',
            }).then();
          }
        });
      }

      setEditQuestion(null);
      fetchQuestions();
    } catch (err: any) {
      toast.error('שגיאה בשמירה: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete handlers
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('questions').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success('השאלה נמחקה');
      setDeleteId(null);
      fetchQuestions();
    } catch (err: any) {
      toast.error('שגיאה במחיקה: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Question Editor</h2>
        <p className="text-sm text-muted-foreground">עריכה ומחיקה של שאלות ({totalCount} שאלות סה״כ)</p>
      </div>

      {/* Batch Chapter Update */}
      <BatchChapterUpdate />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי טקסט שאלה או מזהה..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>
        <Select value={topicFilter} onValueChange={setTopicFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="סנן לפי נושא" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">כל הנושאים</SelectItem>
            {topics.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Download className="w-4 h-4 ml-1" />}
          ייצוא CSV
        </Button>
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">מזהה</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground min-w-[300px]">שאלה</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">תשובה</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">נושא</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">שנה</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground">מקור</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                  </td>
                </tr>
              ) : questions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-muted-foreground">
                    לא נמצאו שאלות
                  </td>
                </tr>
              ) : (
                questions.map((q) => (
                  <tr key={q.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[80px] truncate">{q.id}</td>
                    <td className="px-4 py-3 text-foreground max-w-[350px]">
                      <span className="line-clamp-2">{q.question}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary/15 text-primary font-bold text-xs">
                        {q.correct}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[120px] truncate">{q.topic || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{q.year || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[100px] truncate">{q.source || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(q)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(q.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
            <span className="text-xs text-muted-foreground">
              עמוד {page + 1} מתוך {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronRight className="w-4 h-4" />
                הקודם
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                הבא
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editQuestion} onOpenChange={(open) => !open && setEditQuestion(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת שאלה</DialogTitle>
            <DialogDescription>מזהה: {editQuestion?.id}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">שאלה</label>
              <Textarea
                value={editForm.question || ''}
                onChange={(e) => setEditForm(f => ({ ...f, question: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(['a', 'b', 'c', 'd'] as const).map(opt => (
                <div key={opt}>
                  <label className="text-sm font-medium text-foreground mb-1 block">תשובה {opt.toUpperCase()}</label>
                  <Input
                    value={(editForm as any)[opt] || ''}
                    onChange={(e) => setEditForm(f => ({ ...f, [opt]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">תשובה נכונה</label>
                <Select value={editForm.correct || ''} onValueChange={(v) => setEditForm(f => ({ ...f, correct: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['a', 'b', 'c', 'd'].map(v => (
                      <SelectItem key={v} value={v}>{v.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">נושא</label>
                <Input
                  value={editForm.topic || ''}
                  onChange={(e) => setEditForm(f => ({ ...f, topic: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">שנה</label>
                <Input
                  value={editForm.year || ''}
                  onChange={(e) => setEditForm(f => ({ ...f, year: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">מוסד (Institution)</label>
                <Input
                  value={editForm.source || ''}
                  onChange={(e) => setEditForm(f => ({ ...f, source: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">סוג</label>
                <Input
                  value={editForm.kind || ''}
                  onChange={(e) => setEditForm(f => ({ ...f, kind: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Miller</label>
                <Input
                  value={editForm.miller || ''}
                  onChange={(e) => setEditForm(f => ({ ...f, miller: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">פרק (Chapter)</label>
                <Input
                  type="number"
                  value={editForm.chapter ?? ''}
                  onChange={(e) => setEditForm(f => ({ ...f, chapter: e.target.value ? parseInt(e.target.value, 10) : null }))}
                />
              </div>
              <div className="flex items-end pb-2">
                <span className={`text-xs ${editForm.chapter && resolveChapterName(String(editForm.chapter)).valid ? 'text-muted-foreground' : editForm.chapter ? 'text-destructive' : 'text-muted-foreground/50'}`}>
                  {editForm.chapter ? resolveChapterName(String(editForm.chapter)).display : 'הזן מספר פרק'}
                </span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">הסבר</label>
              <Textarea
                value={editForm.explanation || ''}
                onChange={(e) => setEditForm(f => ({ ...f, explanation: e.target.value }))}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditQuestion(null)}>
              <X className="w-4 h-4 ml-1" /> ביטול
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />}
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת שאלה</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את השאלה? פעולה זו אינה ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Trash2 className="w-4 h-4 ml-1" />}
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
