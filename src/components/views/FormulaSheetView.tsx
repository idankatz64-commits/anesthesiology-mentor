import { useState, useMemo, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Copy, Check, Loader2 } from 'lucide-react';
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

const categoryColors: Record<string, string> = {
  'Neuroanesthesia': 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  'Respiratory Physiology': 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  'Cardiovascular': 'bg-red-500/15 text-red-400 border-red-500/20',
  'Renal & Fluids': 'bg-teal-500/15 text-teal-400 border-teal-500/20',
  'Pharmacology': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  'Hematology': 'bg-rose-500/15 text-rose-400 border-rose-500/20',
  'Obstetric Anesthesia': 'bg-pink-500/15 text-pink-400 border-pink-500/20',
  'Pediatric Anesthesia': 'bg-green-500/15 text-green-400 border-green-500/20',
  'Regional Anesthesia': 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  'Physics & Equipment': 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  'Pain Medicine': 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  'Statistics & EBM': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
};

const categoryHeaderColors: Record<string, string> = {
  'Neuroanesthesia': 'bg-purple-500/10 border-purple-500/20',
  'Respiratory Physiology': 'bg-sky-500/10 border-sky-500/20',
  'Cardiovascular': 'bg-red-500/10 border-red-500/20',
  'Renal & Fluids': 'bg-teal-500/10 border-teal-500/20',
  'Pharmacology': 'bg-amber-500/10 border-amber-500/20',
  'Hematology': 'bg-rose-500/10 border-rose-500/20',
  'Obstetric Anesthesia': 'bg-pink-500/10 border-pink-500/20',
  'Pediatric Anesthesia': 'bg-green-500/10 border-green-500/20',
  'Regional Anesthesia': 'bg-indigo-500/10 border-indigo-500/20',
  'Physics & Equipment': 'bg-slate-500/10 border-slate-500/20',
  'Pain Medicine': 'bg-orange-500/10 border-orange-500/20',
  'Statistics & EBM': 'bg-cyan-500/10 border-cyan-500/20',
};

export default function FormulaSheetView() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFormulas = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('formulas')
        .select('id, chapter, category, formula_name, equation, variables, unit, clinical_note')
        .order('category')
        .order('formula_name');

      if (error) {
        console.error('Error fetching formulas:', error);
        setLoading(false);
        return;
      }

      setFormulas(
        (data || []).map((row) => ({
          id: row.id,
          chapter: row.chapter,
          category: row.category,
          name: row.formula_name,
          equation: row.equation,
          variables: row.variables,
          unit: row.unit,
          clinicalNote: row.clinical_note,
        }))
      );
      setLoading(false);
    };
    fetchFormulas();
  }, []);

  const categories = useMemo(() => {
    const cats = [...new Set(formulas.map(f => f.category))];
    return ['All', ...cats];
  }, [formulas]);

  const filtered = useMemo(() => {
    let result = formulas;
    if (activeCategory !== 'All') {
      result = result.filter(f => f.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.equation.toLowerCase().includes(q)
      );
    }
    return result;
  }, [search, activeCategory, formulas]);

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
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Clinical Formula Reference</h1>
        <p className="text-muted-foreground text-sm mt-1">{formulas.length} formulas across {categories.length - 1} categories</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search formulas..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pr-10 bg-card border-border"
        />
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              activeCategory === cat
                ? 'bg-primary/15 text-primary border-primary/30'
                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl border border-border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-right p-3 font-medium text-muted-foreground w-20">Chapter</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Formula Name</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Equation</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Variables</th>
              <th className="text-center p-3 font-medium text-muted-foreground w-24">Unit</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Clinical Note</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([category, items]) => (
              <CategoryGroup
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
          <div className="p-8 text-center text-muted-foreground">No formulas match your search.</div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-4">
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <div className={`px-4 py-2 rounded-lg border mb-2 ${categoryHeaderColors[category] || 'bg-muted/50 border-border'}`}>
              <span className="font-semibold text-sm text-foreground">{category}</span>
              <span className="text-xs text-muted-foreground ml-2">({items.length})</span>
            </div>
            <div className="space-y-2">
              {items.map(f => (
                <div key={f.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge variant="outline" className="text-[10px] mb-1">{f.chapter}</Badge>
                      <h3 className="font-bold text-sm text-foreground">{f.name}</h3>
                    </div>
                    <button
                      onClick={() => copyEquation(f)}
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground shrink-0"
                    >
                      {copiedId === f.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="font-mono text-xs bg-muted/50 px-3 py-2 rounded-lg text-foreground break-all">{f.equation}</div>
                  <p className="text-xs text-muted-foreground">{f.variables}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-primary">{f.unit}</span>
                    {f.clinicalNote && <span className="text-xs text-muted-foreground italic">{f.clinicalNote}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">No formulas match your search.</div>
        )}
      </div>
    </div>
  );
}

function CategoryGroup({ category, items, copiedId, onCopy }: {
  category: string;
  items: Formula[];
  copiedId: string | null;
  onCopy: (f: Formula) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={7} className={`px-4 py-2.5 border-b border-t border-border font-semibold text-sm text-foreground ${categoryHeaderColors[category] || 'bg-muted/50'}`}>
          {category}
          <span className="text-xs font-normal text-muted-foreground ml-2">({items.length})</span>
        </td>
      </tr>
      {items.map((f, i) => (
        <tr
          key={f.id}
          className={`group border-b border-border/50 hover:bg-primary/5 transition-colors ${i % 2 === 1 ? 'bg-muted/20' : ''}`}
        >
          <td className="p-3">
            <Badge variant="outline" className="text-[10px] whitespace-nowrap">{f.chapter}</Badge>
          </td>
          <td className="p-3 font-bold text-foreground">{f.name}</td>
          <td className="p-3 font-mono text-xs text-foreground">{f.equation}</td>
          <td className="p-3 text-xs text-muted-foreground max-w-[200px]">{f.variables}</td>
          <td className="p-3 text-center text-xs font-medium text-primary">{f.unit}</td>
          <td className="p-3 text-xs text-muted-foreground italic max-w-[180px]">{f.clinicalNote}</td>
          <td className="p-3">
            <button
              onClick={() => onCopy(f)}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-muted transition-all text-muted-foreground"
            >
              {copiedId === f.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}
