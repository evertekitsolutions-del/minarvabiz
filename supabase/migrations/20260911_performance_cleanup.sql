-- Restored from the production migration history: 20260911_performance_cleanup.
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
      'CREATE POLICY %I_org_access ON %I FOR ALL TO authenticated USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = %I.org_id AND om.user_id = (select auth.uid()))) WITH CHECK (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = %I.org_id AND om.user_id = (select auth.uid())))',
      t, t, t, t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS quotations_org_select ON quotations;
DROP POLICY IF EXISTS quotations_org_write ON quotations;
CREATE POLICY quotations_org_access ON quotations
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
CREATE POLICY purchase_returns_org_access ON purchase_returns
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
CREATE POLICY cash_register_sessions_org_access ON cash_register_sessions
  FOR ALL TO authenticated
  USING (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = cash_register_sessions.org_id AND om.user_id = (select auth.uid())
  ))
  WITH CHECK (org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = cash_register_sessions.org_id AND om.user_id = (select auth.uid())
  ));

CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id);
CREATE INDEX IF NOT EXISTS idx_laundry_orders_customer_id ON laundry_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_measurement_profiles_customer_id ON measurement_profiles(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_expenses_order_id ON order_expenses(order_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_purchases_order_id ON purchases(order_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);

DROP INDEX IF EXISTS idx_trial_registrations_device;
DROP INDEX IF EXISTS idx_trial_registrations_email;
DROP INDEX IF EXISTS idx_trial_registrations_phone;
