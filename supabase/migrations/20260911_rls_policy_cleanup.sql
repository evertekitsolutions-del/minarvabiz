-- Restored from the production migration history: 20260911_rls_policy_cleanup.
ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_org_id ON outbox_events(org_id);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','customers','categories','products','inventory_transactions','sales',
    'sale_items','payments','measurement_profiles','orders','order_expenses',
    'laundry_orders','expenses','purchases','suppliers','staff_members','audit_logs','outbox_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_org_select ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_org_write ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_org_select ON %I FOR SELECT TO authenticated USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = %I.org_id AND om.user_id = (select auth.uid())))',
      t, t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_org_write ON %I FOR ALL TO authenticated USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = %I.org_id AND om.user_id = (select auth.uid()))) WITH CHECK (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = %I.org_id AND om.user_id = (select auth.uid())))',
      t, t, t, t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS organizations_member_select ON organizations;
CREATE POLICY organizations_member_select ON organizations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = organizations.id AND om.user_id = (select auth.uid())
  ));

REVOKE ALL ON FUNCTION public.user_org_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_org_ids() FROM anon;
REVOKE ALL ON FUNCTION public.user_org_ids() FROM authenticated;

DROP POLICY IF EXISTS quotations_org_select ON quotations;
DROP POLICY IF EXISTS quotations_org_write ON quotations;
CREATE POLICY quotations_org_select ON quotations
  FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = quotations.org_id AND om.user_id = (select auth.uid())
  ));
CREATE POLICY quotations_org_write ON quotations
  FOR ALL TO authenticated
  USING (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = quotations.org_id AND om.user_id = (select auth.uid())
  ))
  WITH CHECK (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = quotations.org_id AND om.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS purchase_returns_org_select ON purchase_returns;
DROP POLICY IF EXISTS purchase_returns_org_write ON purchase_returns;
CREATE POLICY purchase_returns_org_select ON purchase_returns
  FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = purchase_returns.org_id AND om.user_id = (select auth.uid())
  ));
CREATE POLICY purchase_returns_org_write ON purchase_returns
  FOR ALL TO authenticated
  USING (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = purchase_returns.org_id AND om.user_id = (select auth.uid())
  ))
  WITH CHECK (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = purchase_returns.org_id AND om.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS cash_register_sessions_org_select ON cash_register_sessions;
DROP POLICY IF EXISTS cash_register_sessions_org_write ON cash_register_sessions;
CREATE POLICY cash_register_sessions_org_select ON cash_register_sessions
  FOR SELECT TO authenticated
  USING (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = cash_register_sessions.org_id AND om.user_id = (select auth.uid())
  ));
CREATE POLICY cash_register_sessions_org_write ON cash_register_sessions
  FOR ALL TO authenticated
  USING (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = cash_register_sessions.org_id AND om.user_id = (select auth.uid())
  ))
  WITH CHECK (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = cash_register_sessions.org_id AND om.user_id = (select auth.uid())
  ));
