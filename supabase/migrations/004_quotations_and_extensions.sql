-- Quotations + purchase returns + cash register (online)
CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  lines_json JSONB NOT NULL DEFAULT '[]',
  material_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
  labour_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  advance NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  valid_until DATE,
  notes TEXT,
  converted_sale_id UUID,
  converted_order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  org_id UUID REFERENCES organizations(id),
  device_id UUID
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID,
  purchase_id UUID,
  product_id UUID,
  quantity NUMERIC(14,3) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID REFERENCES organizations(id),
  device_id UUID,
  version INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cash_register_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date DATE NOT NULL,
  opening_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_received NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_refunds NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_closing NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual_closing NUMERIC(14,2),
  difference NUMERIC(14,2),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  org_id UUID REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_quotations_number ON quotations(quotation_number);
CREATE INDEX IF NOT EXISTS idx_quotations_org ON quotations(org_id);

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_register_sessions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['quotations','purchase_returns','cash_register_sessions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_org_select ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_org_select ON %I FOR SELECT USING (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()))',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_org_write ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_org_write ON %I FOR ALL USING (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids())) WITH CHECK (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()))',
      t, t
    );
  END LOOP;
END $$;
