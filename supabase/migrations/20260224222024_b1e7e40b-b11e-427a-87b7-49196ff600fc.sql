
-- Create calculator formulas table
CREATE TABLE public.calculator_formulas (
  id TEXT NOT NULL PRIMARY KEY,
  category_id TEXT NOT NULL,
  category_label TEXT NOT NULL,
  formula_name TEXT NOT NULL,
  expression TEXT NOT NULL,
  unit TEXT NOT NULL,
  note TEXT,
  inputs JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calculator_formulas ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Anyone can read calculator_formulas"
  ON public.calculator_formulas FOR SELECT USING (true);

-- Admin write
CREATE POLICY "Admins can insert calculator_formulas"
  ON public.calculator_formulas FOR INSERT WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update calculator_formulas"
  ON public.calculator_formulas FOR UPDATE USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete calculator_formulas"
  ON public.calculator_formulas FOR DELETE USING (is_admin(auth.uid()));

CREATE INDEX idx_calculator_formulas_category ON public.calculator_formulas (category_id);
