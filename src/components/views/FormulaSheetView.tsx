import { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Copy, Check, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Formula {
  id: string;
  chapter: string;
  category: string;
  name: string;
  equation: string;
  variables: string;
  unit: string;
  clinicalNote: string;
}

// Chapter number extracted from "Ch. 10" → "10"
function chapterNum(ch: string): number {
  return parseInt(ch.replace('Ch. ', '')) || 0;
}

const CATEGORY_COLOR: Record<string, { pill: string; header: string }> = {
  'Cardiac & Hemodynamics':     { pill: 'bg-rose-500/15 text-rose-400 border-rose-500/25',     header: 'bg-rose-500/8 border-rose-500/20' },
  'Respiratory Physiology':     { pill: 'bg-sky-500/15 text-sky-400 border-sky-500/25',         header: 'bg-sky-500/8 border-sky-500/20' },
  'Acid-Base & Fluids':         { pill: 'bg-violet-500/15 text-violet-400 border-violet-500/25', header: 'bg-violet-500/8 border-violet-500/20' },
  'Renal & Fluids':             { pill: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',       header: 'bg-cyan-500/8 border-cyan-500/20' },
  'Pharmacology':               { pill: 'bg-amber-500/15 text-amber-400 border-amber-500/25',    header: 'bg-amber-500/8 border-amber-500/20' },
  'Neuroanesthesia':            { pill: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25', header: 'bg-indigo-500/8 border-indigo-500/20' },
  'Pediatric Anesthesia':       { pill: 'bg-green-500/15 text-green-400 border-green-500/25',    header: 'bg-green-500/8 border-green-500/20' },
  'Regional & Local Anesthesia':{ pill: 'bg-teal-500/15 text-teal-400 border-teal-500/25',       header: 'bg-teal-500/8 border-teal-500/20' },
  'Hematology':                 { pill: 'bg-red-500/15 text-red-400 border-red-500/25',           header: 'bg-red-500/8 border-red-500/20' },
  'Obstetric Anesthesia':       { pill: 'bg-pink-500/15 text-pink-400 border-pink-500/25',        header: 'bg-pink-500/8 border-pink-500/20' },
  'Critical Care':              { pill: 'bg-orange-500/15 text-orange-400 border-orange-500/25',  header: 'bg-orange-500/8 border-orange-500/20' },
  'Preoperative Evaluation':    { pill: 'bg-slate-400/15 text-slate-400 border-slate-400/25',     header: 'bg-slate-400/8 border-slate-400/20' },
  'Physics & Equipment':        { pill: 'bg-zinc-400/15 text-zinc-400 border-zinc-400/25',        header: 'bg-zinc-400/8 border-zinc-400/20' },
  'Hepatic & GI':               { pill: 'bg-lime-500/15 text-lime-400 border-lime-500/25',        header: 'bg-lime-500/8 border-lime-500/20' },
  'Fluid & Blood Management':   { pill: 'bg-blue-500/15 text-blue-400 border-blue-500/25',        header: 'bg-blue-500/8 border-blue-500/20' },
};

function catStyle(cat: string) {
  return CATEGORY_COLOR[cat] ?? { pill: 'bg-muted text-muted-foreground border-border', header: 'bg-muted/50 border-border' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile card with expandable variables
function FormulaCard({ f, copiedId, onCopy }: { f: Formula; copiedId: string | null; onCopy: (f: Formula) => void }) {
  const [open, setOpen] = useState(false);
  const style = catStyle(f.category);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Badge variant="outline" className="text-[10px] font-mono shrink-0">{f.chapter}</Badge>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${style.pill}`}>{f.category}</span>
          </div>
          <h3 className="font-semibold text-sm text-foreground leading-snug">{f.name}</h3>
        </div>
        <button
          onClick={() => onCopy(f)}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground shrink-0 mt-0.5"
          title="Copy equation"
        >
          {copiedId === f.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      {/* Equation */}
      <div className="px-4 pb-3">
        <code className="block text-xs font-mono bg-muted/60 px-3 py-2 rounded-lg text-foreground break-all leading-relaxed">
          {f.equation}
        </code>
      </div>
      {/* Expandable details */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 border-t border-border/60 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <span className="font-medium text-primary">{f.unit}</span>
        <span className="flex items-center gap-1">
          {open ? 'הסתר' : 'פרטים'}
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 space-y-2 border-t border-border/40 bg-muted/20">
          <p className="text-xs text-muted-foreground leading-relaxed">{f.variables}</p>
          {f.clinicalNote && (
            <p className="text-xs text-amber-400/90 italic">{f.clinicalNote}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function FormulaSheetView() {
  const [search, setSearch]             = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [activeChapter, setActiveChapter]   = useState<string>('All');
  const [copiedId, setCopiedId]         = useState<string | null>(null);
  const [formulas, setFormulas]         = useState<Formula[]>([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    supabase
      .from('formulas')
      .select('id, chapter, category, formula_name, equation, variables, unit, clinical_note')
      .order('chapter')
      .order('formula_name')
      .then(({ data, error }) => {
        if (error) { console.error(error); setLoading(false); return; }
        setFormulas((data || []).map(row => ({
          id: row.id,
          chapter: row.chapter,
          category: row.category,
          name: row.formula_name,
          equation: row.equation,
          variables: row.variables,
          unit: row.unit,
          clinicalNote: row.clinical_note,
        })));
        setLoading(false);
      });
  }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(formulas.map(f => f.category))).sort()], [formulas]);

  // Chapters available in active category
  const chapters = useMemo(() => {
    const pool = activeCategory === 'All' ? formulas : formulas.filter(f => f.category === activeCategory);
    const nums = Array.from(new Set(pool.map(f => f.chapter))).sort((a, b) => chapterNum(a) - chapterNum(b));
    return ['All', ...nums];
  }, [formulas, activeCategory]);

  // Reset chapter filter when category changes
  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setActiveChapter('All');
  };

  const filtered = useMemo(() => {
    let result = formulas;
    if (activeCategory !== 'All') result = result.filter(f => f.category === activeCategory);
    if (activeChapter !== 'All')  result = result.filter(f => f.chapter === activeChapter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.equation.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.chapter.toLowerCase().includes(q)
      );
    }
    return result;
  }, [search, activeCategory, activeChapter, formulas]);

  const grouped = useMemo(() => {
    const map: Record<string, Formula[]> = {};
    filtered.forEach(f => {
      if (!map[f.category]) map[f.category] = [];
      map[f.category].push(f);
    });
    return map;
  }, [filtered]);

  const copyEquation = (formula: Formula) => {
    navigator.clipboard.writeText(formula.equation);
    setCopiedId(formula.id);
    toast({ title: 'Copied!', description: formula.equation, duration: 1500 });
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Clinical Formula Reference</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{formulas.length} formulas · {categories.length - 1} categories · {chapters.length - 1} chapters</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by name, equation, or category..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pr-10 bg-card border-border h-9 text-sm"
        />
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map(cat => {
          const style = cat === 'All' ? null : catStyle(cat);
          return (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all border ${
                activeCategory === cat
                  ? cat === 'All'
                    ? 'bg-primary/15 text-primary border-primary/30'
                    : `${style!.pill} opacity-100`
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {cat === 'All' ? `All (${formulas.length})` : cat}
            </button>
          );
        })}
      </div>

      {/* Chapter sub-filter — only shown when chapters > 1 */}
      {chapters.length > 2 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5 border-t border-border/50">
          <span className="text-xs text-muted-foreground self-center font-medium ml-1">Chapter:</span>
          {chapters.map(ch => (
            <button
              key={ch}
              onClick={() => setActiveChapter(ch)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium transition-all border ${
                activeChapter === ch
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-muted/30 text-muted-foreground border-border/60 hover:bg-muted'
              }`}
            >
              {ch}
            </button>
          ))}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl overflow-hidden border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-right p-3 font-medium text-muted-foreground text-xs w-20">Ch.</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs">Formula</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs">Equation</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs max-w-[180px]">Variables</th>
              <th className="text-center p-3 font-medium text-muted-foreground text-xs w-24">Unit</th>
              <th className="text-right p-3 font-medium text-muted-foreground text-xs">Clinical Note</th>
              <th className="w-8 p-3"></th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([category, items]) => (
              <TableCategoryGroup
                key={category}
                category={category}
                items={items}
                copiedId={copiedId}
                onCopy={copyEquation}
              />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-10 text-center text-muted-foreground text-sm">No formulas match your search.</div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <div className={`px-3 py-2 rounded-lg border mb-2 flex items-center justify-between ${catStyle(category).header}`}>
              <span className="font-semibold text-sm text-foreground">{category}</span>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map(f => (
                <FormulaCard key={f.id} f={f} copiedId={copiedId} onCopy={copyEquation} />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-10 text-center text-muted-foreground text-sm">No formulas match your search.</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function TableCategoryGroup({ category, items, copiedId, onCopy }: {
  category: string;
  items: Formula[];
  copiedId: string | null;
  onCopy: (f: Formula) => void;
}) {
  const style = catStyle(category);
  return (
    <>
      <tr>
        <td colSpan={7} className={`px-4 py-2 border-b border-t border-border/60 text-xs font-semibold text-foreground ${style.header}`}>
          <span className={`inline-block px-2 py-0.5 rounded-full border mr-2 ${style.pill}`}>{category}</span>
          <span className="text-muted-foreground font-normal">{items.length} formulas</span>
        </td>
      </tr>
      {items.map((f, i) => (
        <tr
          key={f.id}
          className={`group border-b border-border/40 hover:bg-primary/4 transition-colors ${i % 2 === 1 ? 'bg-muted/10' : ''}`}
        >
          <td className="p-3">
            <Badge variant="outline" className="text-[10px] font-mono whitespace-nowrap">{f.chapter}</Badge>
          </td>
          <td className="p-3 font-semibold text-foreground text-sm">{f.name}</td>
          <td className="p-3 font-mono text-xs text-foreground bg-transparent">{f.equation}</td>
          <td className="p-3 text-xs text-muted-foreground max-w-[180px] leading-relaxed">{f.variables}</td>
          <td className="p-3 text-center text-xs font-medium text-primary">{f.unit}</td>
          <td className="p-3 text-xs text-amber-400/80 italic max-w-[200px]">{f.clinicalNote}</td>
          <td className="p-3">
            <button
              onClick={() => onCopy(f)}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-muted transition-all text-muted-foreground"
              title="Copy equation"
            >
              {copiedId === f.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}
