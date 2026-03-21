import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Save, Trash2, Upload, FileUp, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';

/* ── helpers ── */

function hashId(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).substring(0, 6).toUpperCase();
}

const EMPTY_FORM = {
  question: '', a: '', b: '', c: '', d: '',
  correct: 'A', explanation: '', topic: '',
  year: '', source: '', kind: '', miller: '',
  chapter: 0, media_type: '', media_link: '',
};

/* ═══════════════════════════════════════════════ */
/*  Section 1 – Create Single Question            */
/* ═══════════════════════════════════════════════ */

function CreateSingleQuestion({ categories }: { categories: string[] }) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: string | number) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.question.trim()) { toast.error('יש להזין טקסט שאלה'); return; }
    if (!form.correct) { toast.error('יש לבחור תשובה נכונה'); return; }
    setSaving(true);
    try {
      const id = hashId(form.question);
      const { error } = await supabase.from('questions').upsert({
        id,
        question: form.question,
        a: form.a, b: form.b, c: form.c, d: form.d,
        correct: form.correct,
        explanation: form.explanation,
        topic: form.topic || null,
        year: form.year || null,
        source: form.source || null,
        kind: form.kind || null,
        miller: form.miller || null,
        chapter: form.chapter || 0,
        media_type: form.media_type || null,
        media_link: form.media_link || null,
        manually_edited: true,
      }, { onConflict: 'id' });
      if (error) throw error;
      toast.success('השאלה נוצרה בהצלחה (ID: ' + id + ')');
      setForm({ ...EMPTY_FORM });
    } catch (err: any) {
      toast.error('שגיאה: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card rounded-xl p-6 border border-border space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Save className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">יצירת שאלה בודדת</h3>
      </div>

      {/* Question text */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">שאלה *</label>
        <Textarea rows={3} value={form.question} onChange={e => set('question', e.target.value)} placeholder="הקלד את טקסט השאלה..." />
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-3">
        {(['a', 'b', 'c', 'd'] as const).map(opt => (
          <div key={opt}>
            <label className="text-sm font-medium text-foreground mb-1 block">תשובה {opt.toUpperCase()}</label>
            <Input value={(form as any)[opt]} onChange={e => set(opt, e.target.value)} />
          </div>
        ))}
      </div>

      {/* Row: correct, topic, year */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">תשובה נכונה *</label>
          <Select value={form.correct} onValueChange={v => set('correct', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {['A', 'B', 'C', 'D'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">נושא</label>
          <Select value={form.topic || '__none__'} onValueChange={v => set('topic', v === '__none__' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="בחר נושא" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— ללא —</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">שנה</label>
          <Input value={form.year} onChange={e => set('year', e.target.value)} placeholder="2025" />
        </div>
      </div>

      {/* Row: source, kind, miller */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">מקור</label>
          <Input value={form.source} onChange={e => set('source', e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">סוג</label>
          <Input value={form.kind} onChange={e => set('kind', e.target.value)} />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-1 block">Miller</label>
          <Input value={form.miller} onChange={e => set('miller', e.target.value)} />
        </div>
      </div>

      {/* Explanation */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">הסבר</label>
        <Textarea rows={3} value={form.explanation} onChange={e => set('explanation', e.target.value)} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          שמור שאלה
        </Button>
        <Button variant="outline" onClick={() => setForm({ ...EMPTY_FORM })} className="gap-2">
          <Trash2 className="w-4 h-4" /> נקה טופס
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  Section 2 – Bulk Import via CSV               */
/* ═══════════════════════════════════════════════ */

interface ImportResult { inserted: number; failed: number; errors: string[] }

function BulkCsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, string>[];
        if (rows.length === 0) { toast.error('קובץ CSV ריק'); return; }

        // Validate required columns exist
        const cols = Object.keys(rows[0]).map(c => c.trim().toLowerCase());
        const hasQuestion = cols.some(c => ['question', 'questiontext'].includes(c));
        const hasCorrect = cols.some(c => ['correct', 'correctanswer'].includes(c));
        const missing: string[] = [];
        if (!hasQuestion) missing.push('question / QuestionText');
        if (!hasCorrect) missing.push('correct / CorrectAnswer');

        if (missing.length > 0) {
          toast.error(`עמודות חובה חסרות: ${missing.join(', ')}`);
          setValidationErrors(missing);
          setHeaders(Object.keys(rows[0]));
          setParsedRows([]);
          return;
        }

        setValidationErrors([]);
        setHeaders(Object.keys(rows[0]));
        setParsedRows(rows);
        toast.success(`נטענו ${rows.length} שורות מהקובץ`);
      },
      error: (err) => { toast.error('שגיאה בקריאת CSV: ' + err.message); },
    });
  };

  const COL_MAP: Record<string, string> = {
    question: 'question', a: 'a', b: 'b', c: 'c', d: 'd',
    correct: 'correct', explanation: 'explanation', topic: 'topic',
    year: 'year', source: 'source', kind: 'kind', miller: 'miller',
    chapter: 'chapter', media_type: 'media_type', media_link: 'media_link',
  };

  const mapRow = (row: Record<string, string>) => {
    const lowerRow: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) lowerRow[k.trim().toLowerCase()] = (v || '').trim();

    const q = lowerRow['question'] || lowerRow['questiontext'] || '';
    if (!q) return null;

    let id = lowerRow['id'] || lowerRow['serial_question_number#'] || lowerRow['serial'] || hashId(q);
    const correct = (lowerRow['correct'] || lowerRow['correctanswer'] || '').toUpperCase();

    return {
      id: String(id).trim(),
      question: q,
      a: lowerRow['a'] || lowerRow['optiona'] || '',
      b: lowerRow['b'] || lowerRow['optionb'] || '',
      c: lowerRow['c'] || lowerRow['optionc'] || '',
      d: lowerRow['d'] || lowerRow['optiond'] || '',
      correct: correct || 'A',
      explanation: lowerRow['explanation'] || lowerRow['explanation_correct'] || '',
      topic: lowerRow['topic'] || lowerRow['topic_main'] || '',
      year: lowerRow['year'] || '',
      ref_id: lowerRow['ref_id'] || lowerRow['questionid'] || lowerRow['question_id'] || '',
      source: lowerRow['source'] || lowerRow['institution'] || '',
      kind: lowerRow['kind'] || lowerRow['type'] || '',
      miller: lowerRow['miller'] || lowerRow['miller_page'] || '',
      chapter: parseInt(lowerRow['chapter'] || lowerRow['topic_num'] || '0') || 0,
      media_type: lowerRow['media_type'] || lowerRow['mediakind'] || '',
      media_link: lowerRow['media_link'] || lowerRow['medialink'] || '',
      manually_edited: true,
    };
  };

  const handleImport = async () => {
    setImporting(true);
    setResult(null);
    const errors: string[] = [];
    let inserted = 0;
    let failed = 0;

    try {
      const mapped = parsedRows
        .map((row, i) => {
          const m = mapRow(row);
          if (!m) { errors.push(`שורה ${i + 2}: חסר טקסט שאלה`); failed++; return null; }
          return m;
        })
        .filter(Boolean) as Record<string, any>[];

      // Deduplicate by id
      const seen = new Set<string>();
      const unique = mapped.filter(q => {
        if (seen.has(q.id)) { return false; }
        seen.add(q.id);
        return true;
      });

      // Upsert in batches
      const batchSize = 200;
      for (let i = 0; i < unique.length; i += batchSize) {
        const batch = unique.slice(i, i + batchSize) as { id: string; question: string; correct: string; [k: string]: any }[];
        const { error } = await supabase.from('questions').upsert(batch, { onConflict: 'id' });
        if (error) {
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
          failed += batch.length;
        } else {
          inserted += batch.length;
        }
      }

      setResult({ inserted, failed, errors });
      if (failed === 0) toast.success(`יובאו ${inserted} שאלות בהצלחה`);
      else toast.warning(`יובאו ${inserted}, נכשלו ${failed}`);
    } catch (err: any) {
      toast.error('שגיאה בייבוא: ' + err.message);
      setResult({ inserted, failed: failed + 1, errors: [...errors, err.message] });
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setParsedRows([]);
    setHeaders([]);
    setFileName(null);
    setResult(null);
    setValidationErrors([]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const previewRows = parsedRows.slice(0, 5);
  const previewHeaders = headers.slice(0, 8);

  return (
    <div className="glass-card rounded-xl p-6 border border-border space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <FileUp className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">ייבוא שאלות מ-CSV</h3>
      </div>

      {/* Upload */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
        <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
          <Upload className="w-4 h-4" />
          {fileName || 'בחר קובץ CSV'}
        </Button>
        {parsedRows.length > 0 && (
          <span className="text-sm text-muted-foreground">{parsedRows.length} שורות נטענו</span>
        )}
        {fileName && (
          <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
            נקה
          </Button>
        )}
      </div>

      {/* Column mapping info */}
      {parsedRows.length > 0 && (
        <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
          <p className="font-semibold mb-1">מיפוי עמודות אוטומטי:</p>
          <p>question, a, b, c, d, correct, explanation, topic, year, source, kind, miller, chapter, media_type, media_link</p>
          <p className="mt-1">נתמכים גם: QuestionText, OptionA-D, CorrectAnswer, Topic_MAIN, institution, Miller_Page</p>
        </div>
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span>עמודות חובה חסרות בקובץ:</span>
          </div>
          <ul className="list-disc list-inside text-xs text-destructive space-y-1 mr-6">
            {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          <p className="text-xs text-muted-foreground">עמודות שנמצאו: {headers.join(', ')}</p>
        </div>
      )}

      {/* Preview table */}
      {previewRows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs" dir="ltr">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                {previewHeaders.map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground max-w-[150px] truncate">{h}</th>
                ))}
                {headers.length > 8 && (
                  <th className="px-3 py-2 text-left text-muted-foreground">+{headers.length - 8}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  {previewHeaders.map(h => (
                    <td key={h} className="px-3 py-2 max-w-[150px] truncate text-foreground">{row[h] || ''}</td>
                  ))}
                  {headers.length > 8 && <td className="px-3 py-2 text-muted-foreground">…</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {parsedRows.length > 5 && (
            <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground border-t border-border">
              מציג 5 מתוך {parsedRows.length} שורות
            </div>
          )}
        </div>
      )}

      {/* Import button */}
      {parsedRows.length > 0 && !result && (
        <Button onClick={handleImport} disabled={importing} className="gap-2">
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {importing ? `מייבא ${parsedRows.length} שאלות...` : `ייבא ${parsedRows.length} שאלות`}
        </Button>
      )}

      {/* Result summary */}
      {result && (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-primary" />
              <span className="text-foreground font-medium">{result.inserted} יובאו בהצלחה</span>
            </div>
            {result.failed > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="w-4 h-4 text-destructive" />
                <span className="text-foreground font-medium">{result.failed} נכשלו</span>
              </div>
            )}
          </div>
          {result.errors.length > 0 && (
            <div className="bg-destructive/10 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
              {result.errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-destructive">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{e}</span>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={reset}>ייבא קובץ נוסף</Button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/*  Main Tab                                      */
/* ═══════════════════════════════════════════════ */

export default function ImportQuestionsTab() {
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('categories')
      .select('topic_main')
      .order('topic_num', { ascending: true })
      .then(({ data }) => {
        if (data) setCategories(data.map(r => r.topic_main).filter(Boolean));
      });
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Import Questions</h2>
        <p className="text-sm text-muted-foreground">יצירת שאלות חדשות או ייבוא מ-CSV</p>
      </div>

      <CreateSingleQuestion categories={categories} />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-background px-4 text-sm text-muted-foreground">או</span>
        </div>
      </div>

      <BulkCsvImport />
    </div>
  );
}
