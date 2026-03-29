import { useState, useCallback, useMemo, useEffect } from 'react';
import { evaluate } from 'mathjs';
import { X, Calculator, ChevronDown, History, AlertTriangle, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import formulasJson from '@/data/formulas.json';

interface FormulaInput {
  id: string;
  label: string;
  default: number;
}

interface Formula {
  id: string;
  name: string;
  expression: string;
  unit: string;
  note?: string;
  description?: string;
  inputs: FormulaInput[];
}

interface Category {
  id: string;
  label: string;
  formulas: Formula[];
}

interface HistoryEntry {
  formulaName: string;
  result: number;
  unit: string;
  timestamp: number;
}

const categoryIcons: Record<string, string> = {
  cardiac: '❤️',
  respiratory: '🫁',
  acid_base: '⚗️',
  pharmacology: '💊',
};

export default function FormulaCalculatorPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, number>>({});
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!open) return;
    const loadFormulas = async () => {
      setLoading(true);
      // Try Supabase first, fall back to local JSON
      const { data, error } = await supabase
        .from('calculator_formulas')
        .select('*')
        .order('sort_order');

      if (!error && data && data.length > 0) {
        const catMap: Record<string, Category> = {};
        data.forEach((row: any) => {
          if (!catMap[row.category_id]) {
            catMap[row.category_id] = { id: row.category_id, label: row.category_label, formulas: [] };
          }
          catMap[row.category_id].formulas.push({
            id: row.id,
            name: row.formula_name,
            expression: row.expression,
            unit: row.unit,
            note: row.note || undefined,
            description: row.description || undefined,
            inputs: (row.inputs as FormulaInput[]) || [],
          });
        });
        const cats = Object.values(catMap);
        setCategories(cats);
        if (cats.length > 0 && !selectedCategoryId) setSelectedCategoryId(cats[0].id);
      } else {
        // Fallback: load from local formulas.json
        const cats: Category[] = formulasJson.categories.map((cat: any) => ({
          id: cat.id,
          label: cat.label,
          formulas: cat.formulas.map((f: any) => ({
            id: f.id,
            name: f.name,
            expression: f.expression,
            unit: f.unit,
            note: f.note,
            description: f.description,
            inputs: f.inputs,
          })),
        }));
        setCategories(cats);
        if (cats.length > 0 && !selectedCategoryId) setSelectedCategoryId(cats[0].id);
      }
      setLoading(false);
    };
    loadFormulas();
  }, [open]);

  const selectedCategory = useMemo(
    () => categories.find(c => c.id === selectedCategoryId),
    [selectedCategoryId, categories]
  );

  const selectedFormula = useMemo(
    () => selectedCategory?.formulas.find(f => f.id === selectedFormulaId) ?? null,
    [selectedCategory, selectedFormulaId]
  );

  const selectFormula = useCallback((formula: Formula) => {
    setSelectedFormulaId(formula.id);
    const defaults: Record<string, number> = {};
    formula.inputs.forEach(inp => { defaults[inp.id] = inp.default; });
    setInputValues(defaults);
    setResult(null);
    setError(null);
  }, []);

  const handleInputChange = useCallback((id: string, value: string) => {
    const num = parseFloat(value);
    setInputValues(prev => ({ ...prev, [id]: isNaN(num) ? 0 : num }));
    setResult(null);
    setError(null);
  }, []);

  const handleCalculate = useCallback(() => {
    if (!selectedFormula) return;
    try {
      const scope = { ...inputValues };
      const res = evaluate(selectedFormula.expression, scope);
      if (!isFinite(res)) {
        setError('Invalid input — check your values (possible division by zero)');
        setResult(null);
        return;
      }
      const rounded = Math.round(res * 1000) / 1000;
      setResult(rounded);
      setError(null);
      setHistory(prev => [
        { formulaName: selectedFormula.name, result: rounded, unit: selectedFormula.unit, timestamp: Date.now() },
        ...prev.slice(0, 4),
      ]);
    } catch {
      setError('Invalid input — check your values');
      setResult(null);
    }
  }, [selectedFormula, inputValues]);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[440px] p-0 bg-card border-border overflow-y-auto">
        <SheetHeader className="p-5 pb-0">
          <SheetTitle className="flex items-center gap-2 text-foreground">
            <Calculator className="w-5 h-5 text-primary" />
            <span className="matrix-title">Formula Calculator</span>
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="calculate" className="p-5 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="calculate" className="flex-1">Calculate</TabsTrigger>
              <TabsTrigger value="browse" className="flex-1">Browse All</TabsTrigger>
            </TabsList>

            {/* ===== CALCULATE TAB ===== */}
            <TabsContent value="calculate" className="space-y-4 mt-4">
              {/* Category pills */}
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => { setSelectedCategoryId(cat.id); setSelectedFormulaId(null); setResult(null); setError(null); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition border ${
                      selectedCategoryId === cat.id
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'bg-muted text-muted-foreground border-border hover:border-primary/20'
                    }`}
                  >
                    {categoryIcons[cat.id] || '📐'} {cat.label}
                  </button>
                ))}
              </div>

              {/* Formula selector */}
              {selectedCategory && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground">Select Formula</label>
                  <div className="grid gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {selectedCategory.formulas.map(f => (
                      <button
                        key={f.id}
                        onClick={() => selectFormula(f)}
                        className={`text-left px-3 py-2.5 rounded-xl text-sm transition border ${
                          selectedFormulaId === f.id
                            ? 'bg-primary/10 border-primary/30 text-foreground font-medium'
                            : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:border-primary/20'
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected formula details */}
              {selectedFormula && (
                <div className="space-y-4 pt-2">
                  <div className="liquid-glass p-4 space-y-2">
                    <h3 className="font-bold text-foreground text-sm">{selectedFormula.name}</h3>
                    <code className="text-xs matrix-text block bg-muted/50 p-2 rounded-lg font-mono break-all">
                      {selectedFormula.expression}
                    </code>
                    {selectedFormula.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-2">{selectedFormula.description}</p>
                    )}
                    {selectedFormula.note && (
                      <p className="text-xs text-amber-400/80 italic">{selectedFormula.note}</p>
                    )}
                  </div>

                  {/* Inputs */}
                  <div className="space-y-3">
                    {selectedFormula.inputs.map(inp => (
                      <div key={inp.id}>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">{inp.label}</label>
                        <Input
                          type="number"
                          step="any"
                          value={inputValues[inp.id] ?? inp.default}
                          onChange={e => handleInputChange(inp.id, e.target.value)}
                          className="bg-muted border-border h-9 text-sm"
                        />
                      </div>
                    ))}
                  </div>

                  <Button onClick={handleCalculate} className="w-full font-bold">
                    <Calculator className="w-4 h-4 mr-2" /> Calculate
                  </Button>

                  {/* Result */}
                  {result !== null && (
                    <div className="liquid-glass p-5 text-center">
                      <p className="text-xs text-muted-foreground mb-1 font-medium">Result</p>
                      <p className="text-3xl font-bold matrix-text">{result}</p>
                      <Badge variant="secondary" className="mt-2 text-xs">{selectedFormula.unit}</Badge>
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {error}
                    </div>
                  )}
                </div>
              )}

              {/* History */}
              {history.length > 0 && (
                <Collapsible open={showHistory} onOpenChange={setShowHistory}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground transition w-full">
                    <History className="w-3 h-3" />
                    Recent Calculations ({history.length})
                    <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-1.5">
                    {history.map((h, i) => (
                      <div key={i} className="flex items-center justify-between bg-muted/50 px-3 py-2 rounded-lg border border-border text-xs">
                        <span className="text-muted-foreground truncate mr-2">{h.formulaName}</span>
                        <span className="matrix-text font-bold whitespace-nowrap">{h.result} {h.unit}</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </TabsContent>

            {/* ===== BROWSE TAB ===== */}
            <TabsContent value="browse" className="space-y-4 mt-4">
              {categories.map(cat => (
                <Collapsible key={cat.id} defaultOpen={cat.id === selectedCategoryId}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-sm font-bold text-foreground p-3 rounded-xl bg-muted/50 border border-border hover:border-primary/20 transition">
                    <span>{categoryIcons[cat.id] || '📐'}</span>
                    {cat.label}
                    <ChevronDown className="w-4 h-4 ml-auto" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-1.5 space-y-1 pl-2">
                    {cat.formulas.map(f => (
                      <button
                        key={f.id}
                        onClick={() => { setSelectedCategoryId(cat.id); selectFormula(f); }}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition"
                      >
                        <span className="font-medium">{f.name}</span>
                        <span className="text-muted-foreground ml-1">— {f.unit}</span>
                      </button>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
