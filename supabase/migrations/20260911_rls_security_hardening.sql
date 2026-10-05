-- Restored from the production migration history: 20260911_rls_security_hardening.
ALTER FUNCTION public.is_authenticated() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_trial_registrations_updated_at() SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.user_org_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.user_org_ids() FROM anon;
REVOKE ALL ON FUNCTION public.user_org_ids() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','customers','categories','products','inventory_transactions','sales',
    'sale_items','payments','measurement_profiles','orders','order_expenses',
    'laundry_orders','expenses','purchases','suppliers','staff_members','outbox_events','audit_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_auth_all ON %I', t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS profiles_select_own ON profiles;
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS organization_members_self_select ON organization_members;
CREATE POLICY organization_members_self_select ON organization_members
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_branches_org_id ON branches(org_id);
CREATE INDEX IF NOT EXISTS idx_categories_org_id ON categories(org_id);
CREATE INDEX IF NOT EXISTS idx_customers_org_id ON customers(org_id);
CREATE INDEX IF NOT EXISTS idx_products_org_id ON products(org_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_org_id ON inventory_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_sales_org_id ON sales(org_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_org_id ON sale_items(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_org_id ON payments(org_id);
CREATE INDEX IF NOT EXISTS idx_measurement_profiles_org_id ON measurement_profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_orders_org_id ON orders(org_id);
CREATE INDEX IF NOT EXISTS idx_order_expenses_org_id ON order_expenses(org_id);
CREATE INDEX IF NOT EXISTS idx_laundry_orders_org_id ON laundry_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org_id ON expenses(org_id);
CREATE INDEX IF NOT EXISTS idx_purchases_org_id ON purchases(org_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_org_id ON suppliers(org_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_org_id ON staff_members(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_quotations_customer_id ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_org_id ON purchase_returns(org_id);
CREATE INDEX IF NOT EXISTS idx_cash_register_sessions_org_id ON cash_register_sessions(org_id);
