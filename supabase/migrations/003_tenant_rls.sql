-- Tenant isolation: organizations + membership
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin',
  PRIMARY KEY (org_id, user_id)
);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT org_id FROM organization_members WHERE user_id = auth.uid();
$$;

-- Replace open policies with org-scoped policies
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','products','sales','orders','expenses','payments',
    'staff_members','suppliers','laundry_orders','purchases','inventory_transactions'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_auth_all ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_org_select ON %I FOR SELECT USING (org_id IS NULL OR org_id IN (SELECT public.user_org_ids()))',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_org_write ON %I FOR ALL USING (org_id IS NULL OR org_id IN (SELECT public.user_org_ids())) WITH CHECK (org_id IS NULL OR org_id IN (SELECT public.user_org_ids()))',
      t, t
    );
  END LOOP;
END $$;
