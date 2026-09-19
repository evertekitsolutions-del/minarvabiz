-- Minarva Biz procurement Step 3B: Goods Receipt / GRN.
-- GRNs post physical receipt quantities only. Supplier AP remains separate
-- until Purchase Invoice posting in the next procurement step.

CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  branch_id UUID REFERENCES public.branches(id),
  grn_number TEXT NOT NULL,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id),
  po_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  supplier_name TEXT,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_goods_receipts_org_number
  ON public.goods_receipts(org_id, grn_number);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_po
  ON public.goods_receipts(purchase_order_id, receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_supplier
  ON public.goods_receipts(supplier_id, receipt_date DESC);

CREATE TABLE IF NOT EXISTS public.goods_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  goods_receipt_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id UUID NOT NULL REFERENCES public.purchase_order_lines(id),
  product_id UUID REFERENCES public.products(id),
  description TEXT NOT NULL,
  received_quantity NUMERIC(14,3) NOT NULL CHECK (received_quantity > 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_receipt
  ON public.goods_receipt_lines(goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_po_line
  ON public.goods_receipt_lines(purchase_order_line_id);

ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
  policy_expr TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['goods_receipts','goods_receipt_lines']
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
