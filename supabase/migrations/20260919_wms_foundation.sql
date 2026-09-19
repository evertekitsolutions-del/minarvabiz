-- Commercial warehouse/WMS foundation for Minarva Biz.
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  branch_id UUID REFERENCES branches(id),
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version INT NOT NULL DEFAULT 1,
  org_id UUID REFERENCES organizations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_org_code ON warehouses(org_id, lower(code)) WHERE is_active;

CREATE TABLE IF NOT EXISTS warehouse_bins (
  id UUID PRIMARY KEY,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  code TEXT NOT NULL,
  name TEXT,
  zone TEXT,
  aisle TEXT,
  rack TEXT,
  shelf TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version INT NOT NULL DEFAULT 1,
  org_id UUID REFERENCES organizations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_bins_wh_code ON warehouse_bins(warehouse_id, lower(code)) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_warehouse_bins_org ON warehouse_bins(org_id);

CREATE TABLE IF NOT EXISTS warehouse_bin_stock (
  id UUID PRIMARY KEY,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  bin_id UUID NOT NULL REFERENCES warehouse_bins(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity),
  updated_at TIMESTAMPTZ NOT NULL,
  version INT NOT NULL DEFAULT 1,
  org_id UUID REFERENCES organizations(id),
  UNIQUE(product_id, bin_id)
);
CREATE INDEX IF NOT EXISTS idx_wms_stock_product ON warehouse_bin_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_wms_stock_bin ON warehouse_bin_stock(bin_id);
CREATE INDEX IF NOT EXISTS idx_wms_stock_org ON warehouse_bin_stock(org_id);

CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id UUID PRIMARY KEY,
  transfer_number TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES products(id),
  source_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  source_bin_id UUID NOT NULL REFERENCES warehouse_bins(id),
  destination_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  destination_bin_id UUID NOT NULL REFERENCES warehouse_bins(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL CHECK (status IN ('pending','approved','in_transit','completed','cancelled')),
  notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  requested_by UUID,
  approved_by UUID,
  updated_at TIMESTAMPTZ NOT NULL,
  version INT NOT NULL DEFAULT 1,
  org_id UUID REFERENCES organizations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wms_transfer_org_number ON warehouse_transfers(org_id, transfer_number);
CREATE INDEX IF NOT EXISTS idx_wms_transfer_status ON warehouse_transfers(org_id, status, requested_at DESC);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_bins ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_bin_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_transfers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
  policy_expr TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['warehouses','warehouse_bins','warehouse_bin_stock','warehouse_transfers']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_current_user_org_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_current_user_org_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION private.set_current_user_org_id()', t);
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
