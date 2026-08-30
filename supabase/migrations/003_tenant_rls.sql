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

-- Tenant-scoped columns for every business table. Child/operational tables are
-- explicitly scoped as well so no record can exist outside an organization in
-- production cloud mode.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE measurement_profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE order_expenses ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- Existing NULL org_id rows must be migrated to a real organization before
-- enabling strict policies. This migration deliberately does not guess ownership.
-- Operators should backfill org_id for legacy rows, then enforce NOT NULL.

-- Strict tenant policies: NULL org_id is NOT accessible.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','customers','categories','products','inventory_transactions',
    'sales','sale_items','payments','measurement_profiles','orders',
    'order_expenses','laundry_orders','expenses','purchases','suppliers',
    'staff_members','sale_returns','audit_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_org_select ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_org_write ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_org_select ON %I FOR SELECT USING (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()))',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_org_write ON %I FOR ALL USING (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids())) WITH CHECK (org_id IS NOT NULL AND org_id IN (SELECT public.user_org_ids()))',
      t, t
    );
  END LOOP;
END $$;

-- Organization metadata is itself tenant-sensitive. Users can see only their
-- memberships; they cannot enumerate other organizations.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_member_select ON organizations;
CREATE POLICY organizations_member_select ON organizations
  FOR SELECT USING (id IN (SELECT public.user_org_ids()));
DROP POLICY IF EXISTS organization_members_self_select ON organization_members;
CREATE POLICY organization_members_self_select ON organization_members
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS organization_members_self_insert ON organization_members;
-- Membership is provisioned by trusted server/admin tooling only; users cannot
-- add themselves to an organization.

