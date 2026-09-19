-- Minarva Biz procurement Step 3C: supplier purchase invoices + AP aging source data.
-- GRNs move physical stock. Purchase invoices post supplier payable/accounting without
-- changing stock again, so receipt and financial recognition remain separate.

CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  branch_id UUID REFERENCES public.branches(id),
  invoice_number TEXT NOT NULL,
  supplier_invoice_number TEXT,
  purchase_order_id UUID REFERENCES public.purchase_orders(id),
  po_number TEXT,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  supplier_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','posted','partially_paid','paid','cancelled')),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  balance_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance_amount >= 0),
  notes TEXT,
  posted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_invoices_org_number
  ON public.purchase_invoices(org_id, invoice_number);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_due
  ON public.purchase_invoices(supplier_id, status, due_date, invoice_date);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_po
  ON public.purchase_invoices(purchase_order_id);

CREATE TABLE IF NOT EXISTS public.purchase_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  purchase_invoice_id UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  purchase_order_line_id UUID REFERENCES public.purchase_order_lines(id),
  product_id UUID REFERENCES public.products(id),
  description TEXT NOT NULL,
  invoiced_quantity NUMERIC(14,3) NOT NULL CHECK (invoiced_quantity > 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  tax_rate NUMERIC(7,3) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_invoice
  ON public.purchase_invoice_lines(purchase_invoice_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_lines_po_line
  ON public.purchase_invoice_lines(purchase_order_line_id);

ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_lines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
  policy_expr TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_invoices','purchase_invoice_lines']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_current_user_org_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_current_user_org_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION private.set_current_user_org_id()',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_org_access ON public.%I', t, t);
    policy_expr := format(
      'org_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.org_id = %I.org_id AND om.user_id = (SELECT auth.uid()))',
      t
    );
    EXECUTE format(
      'CREATE POLICY %I_org_access ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
      t, t, policy_expr, policy_expr
    );
  END LOOP;
END $$;
