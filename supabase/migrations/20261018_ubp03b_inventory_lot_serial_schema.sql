-- UBP-03b source migration: typed stock lots and unique serialized units.
-- IMPORTANT: production application is gated on fresh-instance replay,
-- tenant RLS/security review, SQLite parity and an authoritative checkout RPC.
-- No existing sales, products, warehouse rows or journal entries are changed.

-- PostgreSQL requires explicit unique composite reference keys for strict
-- tenant-qualified foreign keys, even though the legacy ID column is a PK.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ubp_products_org_id
  ON public.products (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ubp_warehouses_org_id
  ON public.warehouses (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ubp_sale_items_org_product_id
  ON public.sale_items (org_id, product_id, id);

CREATE TABLE IF NOT EXISTS public.inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL,
  warehouse_id UUID NOT NULL,
  batch_code TEXT NOT NULL
    CHECK (char_length(btrim(batch_code)) BETWEEN 1 AND 128),
  manufactured_on DATE,
  expires_on DATE NOT NULL,
  received_quantity NUMERIC(14,3) NOT NULL DEFAULT 0
    CHECK (received_quantity >= 0),
  on_hand_quantity NUMERIC(14,3) NOT NULL DEFAULT 0
    CHECK (on_hand_quantity >= 0),
  reserved_quantity NUMERIC(14,3) NOT NULL DEFAULT 0
    CHECK (reserved_quantity >= 0 AND reserved_quantity <= on_hand_quantity),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT ubp_batch_expiry_not_before_manufacture
    CHECK (manufactured_on IS NULL OR manufactured_on <= expires_on),
  CONSTRAINT ubp_batch_tenant_product_fk
    FOREIGN KEY (org_id, product_id)
      REFERENCES public.products(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT ubp_batch_tenant_warehouse_fk
    FOREIGN KEY (org_id, warehouse_id)
      REFERENCES public.warehouses(org_id, id) ON DELETE RESTRICT
);

-- One logical batch per product/warehouse, case-insensitively.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ubp_batches_org_product_warehouse_code
  ON public.inventory_batches
    (org_id, product_id, warehouse_id, lower(btrim(batch_code)));

CREATE INDEX IF NOT EXISTS idx_ubp_batches_fefo
  ON public.inventory_batches
    (org_id, product_id, warehouse_id, expires_on, id)
  WHERE status = 'active' AND on_hand_quantity > reserved_quantity;

CREATE TABLE IF NOT EXISTS public.inventory_serial_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL,
  warehouse_id UUID NOT NULL,
  serial_kind TEXT NOT NULL CHECK (serial_kind IN ('imei','serial')),
  serial_code TEXT NOT NULL
    CHECK (char_length(serial_code) BETWEEN 1 AND 128
       AND serial_code = btrim(serial_code)
       AND serial_code ~ '^[A-Za-z0-9][A-Za-z0-9 _./-]*$'),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','reserved','sold','blocked','returned')),
  sale_item_id UUID,
  warranty_from DATE,
  warranty_until DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT ubp_serial_imei_digits
    CHECK (serial_kind <> 'imei' OR serial_code ~ '^[0-9]{15}$'),
  CONSTRAINT ubp_serial_sold_has_sale
    CHECK (status <> 'sold' OR sale_item_id IS NOT NULL),
  CONSTRAINT ubp_serial_warranty_dates
    CHECK (warranty_from IS NULL OR warranty_until IS NULL OR warranty_from <= warranty_until),
  CONSTRAINT ubp_serial_tenant_product_fk
    FOREIGN KEY (org_id, product_id)
      REFERENCES public.products(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT ubp_serial_tenant_warehouse_fk
    FOREIGN KEY (org_id, warehouse_id)
      REFERENCES public.warehouses(org_id, id) ON DELETE RESTRICT,
  CONSTRAINT ubp_serial_tenant_sale_item_fk
    FOREIGN KEY (org_id, product_id, sale_item_id)
      REFERENCES public.sale_items(org_id, product_id, id) ON DELETE RESTRICT
);

-- Normalized lookup prevents duplicate serial scans with casing/outer
-- whitespace differences. Actual scanner NFKC normalization and IMEI Luhn
-- validation must run again in a trusted, transactional checkout RPC.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ubp_serial_org_kind_code
  ON public.inventory_serial_units (org_id, serial_kind, upper(btrim(serial_code)));
CREATE INDEX IF NOT EXISTS idx_ubp_serial_available
  ON public.inventory_serial_units (org_id, product_id, warehouse_id, id)
  WHERE status = 'available';
CREATE INDEX IF NOT EXISTS idx_ubp_serial_sale_item
  ON public.inventory_serial_units (org_id, sale_item_id)
  WHERE sale_item_id IS NOT NULL;

-- Tenant visibility is allowed to signed-in members only.
-- Direct writes by authenticated clients are deliberately DENIED until
-- an audited checkout/reservation transaction with scoped role and branch
-- checks is implemented. A client-side FEFO preview is never authority.
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_serial_units ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.inventory_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.inventory_serial_units FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inventory_batches TO authenticated;
GRANT SELECT ON public.inventory_serial_units TO authenticated;

CREATE POLICY ubp_inventory_batches_member_select
  ON public.inventory_batches FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = inventory_batches.org_id
        AND om.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY ubp_inventory_serial_member_select
  ON public.inventory_serial_units FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = inventory_serial_units.org_id
        AND om.user_id = (SELECT auth.uid())
    )
  );

-- Service-role access exists only for approved trusted server integrations;
-- never expose service_role keys to the renderer or browser.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.inventory_batches, public.inventory_serial_units TO service_role;

COMMENT ON TABLE public.inventory_batches IS
  'UBP-03b typed expiry stock. Reservations require future transactional authority.';
COMMENT ON TABLE public.inventory_serial_units IS
  'UBP-03b typed serial/IMEI stock. No direct authenticated mutations; sale allocation requires future transactional authority.';
