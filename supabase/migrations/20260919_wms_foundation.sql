-- Minarva Biz WMS foundation: warehouses, physical locations, stock positions and transfer workflow.

CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  branch_id UUID REFERENCES public.branches(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_org_code
  ON public.warehouses(org_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'storage'
    CHECK (type IN ('receiving','storage','dispatch','returns')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_locations_code
  ON public.warehouse_locations(warehouse_id, lower(code))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  on_hand NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(location_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_product ON public.warehouse_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_warehouse ON public.warehouse_stock(warehouse_id, location_id);

CREATE TABLE IF NOT EXISTS public.warehouse_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id),
  transfer_number TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  source_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  source_location_id UUID NOT NULL REFERENCES public.warehouse_locations(id),
  destination_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  destination_location_id UUID NOT NULL REFERENCES public.warehouse_locations(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','in_transit','received','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_transfers_org_number
  ON public.warehouse_transfers(org_id, transfer_number);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_status
  ON public.warehouse_transfers(status, updated_at DESC);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_transfers ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
  policy_expr TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['warehouses','warehouse_locations','warehouse_stock','warehouse_transfers']
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
