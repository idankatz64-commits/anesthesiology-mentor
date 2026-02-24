import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Pencil, Trash2, Loader2, Save, X, Plus, BookOpen, Calculator } from 'lucide-react';

// ─── Reference formula types ───
interface ReferenceFormula {
  id: string;
  chapter: string;
  category: string;
  formula_name: string;
  equation: string;
  variables: string;
  unit: string;
  clinical_note: string;
}

// ─── Calculator formula types ───
interface CalcInput {
  id: string;
  label: string;
  default: number;
}

interface CalculatorFormula {
  id: string;
  category_id: string;
  category_label: string;
  formula_name: string;
  expression: string;
  unit: string;
  note: string | null;
  inputs: CalcInput[];
  sort_order: number;
}

// ─── Shared delete state ───
interface DeleteTarget {
  id: string;
  table: 'formulas' | 'calculator_formulas';
}

export default function FormulaManagementTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Formula Management</h2>
        <p className="text-sm text-muted-foreground">ניהול נוסחאות — עריכה, הוספה ומחיקה</p>
      </div>

      <Tabs defaultValue="reference" className="w-full">
        <TabsList>
          <TabsTrigger value="reference" className="gap-2">
            <BookOpen className="w-4 h-4" /> Reference Sheet
          </TabsTrigger>
          <TabsTrigger value="calculator" className="gap-2">
            <Calculator className="w-4 h-4" /> Calculator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reference" className="mt-4">
          <ReferenceFormulaManager />
        </TabsContent>
        <TabsContent value="calculator" className="mt-4">
          <CalculatorFormulaManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════
//  REFERENCE FORMULA MANAGER
// ═══════════════════════════════════════════

function ReferenceFormulaManager() {
  const [formulas, setFormulas] = useState<ReferenceFormula[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editItem, setEditItem] = useState<ReferenceFormula | null>(null);
  const [editForm, setEditForm] = useState<Partial<ReferenceFormula>>({});
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('formulas')
      .select('*')
      .order('category')
      .order('formula_name');
    if (error) { toast.error('שגיאה בטעינה'); console.error(error); }
    else setFormulas(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = formulas.filter(f => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return f.formula_name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q) || f.equation.toLowerCase().includes(q);
  });

  const openNew = () => {
    setIsNew(true);
    setEditForm({ id: '', chapter: '', category: '', formula_name: '', equation: '', variables: '', unit: '', clinical_note: '' });
    setEditItem({} as ReferenceFormula);
  };

  const openEdit = (f: ReferenceFormula) => {
    setIsNew(false);
    setEditItem(f);
    setEditForm({ ...f });
  };

  const handleSave = async () => {
    if (!editForm.id || !editForm.formula_name || !editForm.equation) {
      toast.error('יש למלא מזהה, שם ומשוואה');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const { error } = await supabase.from('formulas').insert({
          id: editForm.id!,
          chapter: editForm.chapter || '',
          category: editForm.category || '',
          formula_name: editForm.formula_name!,
          equation: editForm.equation!,
          variables: editForm.variables || '',
          unit: editForm.unit || '',
          clinical_note: editForm.clinical_note || '',
        });
        if (error) throw error;
        toast.success('הנוסחה נוספה בהצלחה');
      } else {
        const { error } = await supabase.from('formulas').update({
          chapter: editForm.chapter,
          category: editForm.category,
          formula_name: editForm.formula_name,
          equation: editForm.equation,
          variables: editForm.variables,
          unit: editForm.unit,
          clinical_note: editForm.clinical_note,
        }).eq('id', editItem!.id);
        if (error) throw error;
        toast.success('הנוסחה עודכנה בהצלחה');
      }
      setEditItem(null);
      fetch();
    } catch (err: any) {
      toast.error('שגיאה: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('formulas').delete().eq('id', deleteTarget);
      if (error) throw error;
      toast.success('הנוסחה נמחקה');
      setDeleteTarget(null);
      fetch();
    } catch (err: any) {
      toast.error('שגיאה: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input
          placeholder="חיפוש נוסחאות..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 ml-1" /> הוסף נוסחה
        </Button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">מזהה</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">שם</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">קטגוריה</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">משוואה</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">יחידה</th>
                <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">לא נמצאו נוסחאות</td></tr>
              ) : filtered.map(f => (
                <tr key={f.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{f.id}</td>
                  <td className="px-3 py-2.5 text-foreground font-medium">{f.formula_name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{f.category}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-foreground max-w-[200px] truncate">{f.equation}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{f.unit}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(f)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(f.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
          {filtered.length} נוסחאות
        </div>
      </div>

      {/* Edit/Add Dialog */}
      <Dialog open={!!editItem} onOpenChange={open => !open && setEditItem(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{isNew ? 'הוסף נוסחה חדשה' : 'עריכת נוסחה'}</DialogTitle>
            <DialogDescription>{isNew ? 'מלא את הפרטים' : `מזהה: ${editItem?.id}`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {isNew && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">מזהה (ID)</label>
                <Input value={editForm.id || ''} onChange={e => setEditForm(f => ({ ...f, id: e.target.value }))} placeholder="e.g. my_formula" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">שם הנוסחה</label>
                <Input value={editForm.formula_name || ''} onChange={e => setEditForm(f => ({ ...f, formula_name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">קטגוריה</label>
                <Input value={editForm.category || ''} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">פרק</label>
                <Input value={editForm.chapter || ''} onChange={e => setEditForm(f => ({ ...f, chapter: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">יחידה</label>
                <Input value={editForm.unit || ''} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">משוואה</label>
              <Input value={editForm.equation || ''} onChange={e => setEditForm(f => ({ ...f, equation: e.target.value }))} className="font-mono" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">משתנים</label>
              <Textarea value={editForm.variables || ''} onChange={e => setEditForm(f => ({ ...f, variables: e.target.value }))} rows={2} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">הערה קלינית</label>
              <Textarea value={editForm.clinical_note || ''} onChange={e => setEditForm(f => ({ ...f, clinical_note: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditItem(null)}><X className="w-4 h-4 ml-1" /> ביטול</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />}
              {isNew ? 'הוסף' : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת נוסחה</AlertDialogTitle>
            <AlertDialogDescription>האם אתה בטוח? פעולה זו אינה ניתנת לביטול.</AlertDialogDescription>
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

// ═══════════════════════════════════════════
//  CALCULATOR FORMULA MANAGER
// ═══════════════════════════════════════════

function CalculatorFormulaManager() {
  const [formulas, setFormulas] = useState<CalculatorFormula[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editItem, setEditItem] = useState<CalculatorFormula | null>(null);
  const [editForm, setEditForm] = useState<Partial<CalculatorFormula>>({});
  const [inputsJson, setInputsJson] = useState('');
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('calculator_formulas')
      .select('*')
      .order('category_id')
      .order('sort_order');
    if (error) { toast.error('שגיאה בטעינה'); console.error(error); }
    else setFormulas((data || []).map((r: any) => ({ ...r, inputs: r.inputs as CalcInput[] })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = formulas.filter(f => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return f.formula_name.toLowerCase().includes(q) || f.category_label.toLowerCase().includes(q) || f.expression.toLowerCase().includes(q);
  });

  const openNew = () => {
    setIsNew(true);
    const form: Partial<CalculatorFormula> = { id: '', category_id: '', category_label: '', formula_name: '', expression: '', unit: '', note: '', sort_order: 0, inputs: [] };
    setEditForm(form);
    setInputsJson('[]');
    setEditItem({} as CalculatorFormula);
  };

  const openEdit = (f: CalculatorFormula) => {
    setIsNew(false);
    setEditItem(f);
    setEditForm({ ...f });
    setInputsJson(JSON.stringify(f.inputs, null, 2));
  };

  const handleSave = async () => {
    if (!editForm.id || !editForm.formula_name || !editForm.expression) {
      toast.error('יש למלא מזהה, שם וביטוי');
      return;
    }
    let parsedInputs: CalcInput[];
    try {
      parsedInputs = JSON.parse(inputsJson);
    } catch {
      toast.error('JSON של inputs לא תקין');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const { error } = await supabase.from('calculator_formulas').insert({
          id: editForm.id!,
          category_id: editForm.category_id || '',
          category_label: editForm.category_label || '',
          formula_name: editForm.formula_name!,
          expression: editForm.expression!,
          unit: editForm.unit || '',
          note: editForm.note || null,
          inputs: parsedInputs as any,
          sort_order: editForm.sort_order || 0,
        });
        if (error) throw error;
        toast.success('הנוסחה נוספה בהצלחה');
      } else {
        const { error } = await supabase.from('calculator_formulas').update({
          category_id: editForm.category_id,
          category_label: editForm.category_label,
          formula_name: editForm.formula_name,
          expression: editForm.expression,
          unit: editForm.unit,
          note: editForm.note || null,
          inputs: parsedInputs as any,
          sort_order: editForm.sort_order,
        }).eq('id', editItem!.id);
        if (error) throw error;
        toast.success('הנוסחה עודכנה בהצלחה');
      }
      setEditItem(null);
      fetchData();
    } catch (err: any) {
      toast.error('שגיאה: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('calculator_formulas').delete().eq('id', deleteTarget);
      if (error) throw error;
      toast.success('הנוסחה נמחקה');
      setDeleteTarget(null);
      fetchData();
    } catch (err: any) {
      toast.error('שגיאה: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input
          placeholder="חיפוש נוסחאות מחשבון..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 ml-1" /> הוסף נוסחה
        </Button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden border border-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">מזהה</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">שם</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">קטגוריה</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">ביטוי</th>
                <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Inputs</th>
                <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">לא נמצאו נוסחאות</td></tr>
              ) : filtered.map(f => (
                <tr key={f.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{f.id}</td>
                  <td className="px-3 py-2.5 text-foreground font-medium">{f.formula_name}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{f.category_label}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-foreground max-w-[180px] truncate">{f.expression}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{f.inputs.length} שדות</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(f)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(f.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
          {filtered.length} נוסחאות
        </div>
      </div>

      {/* Edit/Add Dialog */}
      <Dialog open={!!editItem} onOpenChange={open => !open && setEditItem(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{isNew ? 'הוסף נוסחת מחשבון' : 'עריכת נוסחת מחשבון'}</DialogTitle>
            <DialogDescription>{isNew ? 'מלא את הפרטים' : `מזהה: ${editItem?.id}`}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {isNew && (
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">מזהה (ID)</label>
                <Input value={editForm.id || ''} onChange={e => setEditForm(f => ({ ...f, id: e.target.value }))} placeholder="e.g. my_calc" />
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">שם הנוסחה</label>
              <Input value={editForm.formula_name || ''} onChange={e => setEditForm(f => ({ ...f, formula_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Category ID</label>
                <Input value={editForm.category_id || ''} onChange={e => setEditForm(f => ({ ...f, category_id: e.target.value }))} placeholder="e.g. cardiac" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Category Label</label>
                <Input value={editForm.category_label || ''} onChange={e => setEditForm(f => ({ ...f, category_label: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">יחידה</label>
                <Input value={editForm.unit || ''} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">סדר מיון</label>
                <Input type="number" value={editForm.sort_order || 0} onChange={e => setEditForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">ביטוי (Expression)</label>
              <Input value={editForm.expression || ''} onChange={e => setEditForm(f => ({ ...f, expression: e.target.value }))} className="font-mono" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">הערה</label>
              <Input value={editForm.note || ''} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Inputs (JSON)</label>
              <Textarea
                value={inputsJson}
                onChange={e => setInputsJson(e.target.value)}
                rows={6}
                className="font-mono text-xs"
                placeholder='[{"id":"x","label":"X value","default":10}]'
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditItem(null)}><X className="w-4 h-4 ml-1" /> ביטול</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <Save className="w-4 h-4 ml-1" />}
              {isNew ? 'הוסף' : 'שמור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת נוסחה</AlertDialogTitle>
            <AlertDialogDescription>האם אתה בטוח? פעולה זו אינה ניתנת לביטול.</AlertDialogDescription>
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
