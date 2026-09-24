-- Fresh-install compatibility for legacy 003_tenant_rls.sql.
-- 003 adds org_id and tenant policies to sale_returns, so the relation must
-- exist before that migration runs. Runtime code does not otherwise use this
-- legacy table, so keep the compatibility schema intentionally minimal.

CREATE TABLE IF NOT EXISTS public.sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.sale_returns ENABLE ROW LEVEL SECURITY;
