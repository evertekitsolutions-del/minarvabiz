-- Minarva Biz procurement Step 3C: Supplier Purchase Invoice / Accounts Payable.
-- Stock is posted by GRN. Supplier invoices post the financial payable separately.

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  branch_id UUID REFERENCES public.branches(id),
  internal_number TEXT NOT NULL,
  supplier_invoice_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  supplier_name TEXT,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id),
  po_number TEXT NOT NULL,
  goods_receipt_id UUID NOT NULL REFERENCES public.goods_receipts(id),
  grn_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  balance_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance_amount >= 0),
  notes TEXT,
  posted_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoices_org_internal_number
  ON public.supplier_invoices(org_id, internal_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoices_org_supplier_vendor_number
  ON public.supplier_invoices(org_id, supplier_id, lower(supplier_invoice_number))
  WHERE status <> 'void';
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoices_org_grn_active
  ON public.supplier_invoices(org_id, goods_receipt_id)
  WHERE status <> 'void';
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier_due
  ON public.supplier_invoices(supplier_id, due_date, status);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_po
  ON public.supplier_invoices(purchase_order_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_invoices_grn
  ON public.supplier_invoices(goods_receipt_id);

CREATE TABLE IF NOT EXISTS public.supplier_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  supplier_invoice_id UUID NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  goods_receipt_line_id UUID NOT NULL REFERENCES public.goods_receipt_lines(id),
  purchase_order_line_id UUID NOT NULL REFERENCES public.purchase_order_lines(id),
  product_id UUID REFERENCES public.products(id),
  description TEXT NOT NULL,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  tax_rate NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_subtotal >= 0),
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoice_lines_invoice
  ON public.supplier_invoice_lines(supplier_invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_invoice_lines_grn_line
  ON public.supplier_invoice_lines(goods_receipt_line_id);

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoice_lines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
  policy_expr TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['supplier_invoices','supplier_invoice_lines']
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
