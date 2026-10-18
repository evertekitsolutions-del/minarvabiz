-- UBP-02a: non-destructive profile and item attributes for 100+ business presets.
-- Source migration only: do not apply to production until isolated fresh replay,
-- tenant RLS review, and Windows SQLite/sync compatibility approval.
-- Reuses existing authoritative organizations/products/sales: no duplicate masters.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS business_group TEXT,
  ADD COLUMN IF NOT EXISTS business_type_code TEXT,
  ADD COLUMN IF NOT EXISTS feature_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS feature_config_version INTEGER NOT NULL DEFAULT 1;

-- Legacy organizations retain both NULL values and therefore their current UI.
-- A partially configured organization must never resolve to a new billing mode.
ALTER TABLE public.organizations
  ADD CONSTRAINT ubp_org_group_name
    CHECK (business_group IN ('RETAIL','EXPIRE_BASED','SERIALIZED','DIMENSIONAL','SERVICE')),
  ADD CONSTRAINT ubp_org_group_pair_consistent
    CHECK ((business_group IS NULL AND business_type_code IS NULL)
       OR (business_group IS NOT NULL AND business_type_code IS NOT NULL)),
  ADD CONSTRAINT ubp_org_business_code_format
    CHECK (business_type_code IS NULL OR
      business_type_code ~ ('^' || lower(business_group) || '_[0-9]{3}$')),
  ADD CONSTRAINT ubp_org_feature_config_json
    CHECK (jsonb_typeof(feature_config) = 'object'
      AND octet_length(feature_config::TEXT) <= 4096),
  ADD CONSTRAINT ubp_org_feature_config_revision
    CHECK (feature_config_version BETWEEN 1 AND 2147483646);

COMMENT ON COLUMN public.organizations.business_group IS
  'Presentation profile only. Server permissions and license authority are separate.';
COMMENT ON COLUMN public.organizations.feature_config IS
  'Bounded UI capability preferences only; client-edited JSON never grants permissions.';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS tracking_mode TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.products
  ADD CONSTRAINT ubp_products_attributes_json
    CHECK (jsonb_typeof(attributes) = 'object'
      AND octet_length(attributes::TEXT) <= 8192),
  ADD CONSTRAINT ubp_products_tracking_mode
    CHECK (tracking_mode IN ('none','lot','serial'));

COMMENT ON COLUMN public.products.attributes IS
  'Sparse, non-sensitive per-product attributes only; not the authoritative store of serials or batches.';
COMMENT ON COLUMN public.products.tracking_mode IS
  'Item-level inventory tracking hint. Batch/serial authority requires follow-up typed relations.';

-- Tenant-scoped hot-path lookups; preserve existing indexes for legacy callers.
-- These are partial indexes for active, nondeleted products.
CREATE INDEX IF NOT EXISTS idx_ubp_products_org_barcode
  ON public.products (org_id, barcode)
  WHERE deleted_at IS NULL AND is_active = true AND barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ubp_products_org_sku
  ON public.products (org_id, sku)
  WHERE deleted_at IS NULL AND is_active = true AND sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ubp_sales_org_date
  ON public.sales (org_id, sale_date DESC, id DESC)
  WHERE deleted_at IS NULL;

-- Existing tenant RLS policies are intentionally preserved unchanged.
-- No INSERT/UPDATE GRANT or new public RPC: setting these fields requires
-- a later server-authorized mutation path and offline compatibility gate.
