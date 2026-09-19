-- Original specification compliance: supplier contact completeness
ALTER TABLE IF EXISTS public.suppliers
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT;

CREATE INDEX IF NOT EXISTS idx_suppliers_email ON public.suppliers (lower(email)) WHERE email IS NOT NULL;
