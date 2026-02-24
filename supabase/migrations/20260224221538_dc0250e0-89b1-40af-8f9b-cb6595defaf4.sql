
-- Create formulas reference table
CREATE TABLE public.formulas (
  id TEXT NOT NULL PRIMARY KEY,
  chapter TEXT NOT NULL,
  category TEXT NOT NULL,
  formula_name TEXT NOT NULL,
  equation TEXT NOT NULL,
  variables TEXT NOT NULL,
  unit TEXT NOT NULL,
  clinical_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.formulas ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can read formulas"
  ON public.formulas
  FOR SELECT
  USING (true);

-- Admin insert
CREATE POLICY "Admins can insert formulas"
  ON public.formulas
  FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Admin update
CREATE POLICY "Admins can update formulas"
  ON public.formulas
  FOR UPDATE
  USING (is_admin(auth.uid()));

-- Admin delete
CREATE POLICY "Admins can delete formulas"
  ON public.formulas
  FOR DELETE
  USING (is_admin(auth.uid()));

-- Index on category for filtering
CREATE INDEX idx_formulas_category ON public.formulas (category);
