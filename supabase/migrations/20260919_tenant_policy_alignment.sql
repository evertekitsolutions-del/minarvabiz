-- Align tenant defaults and RLS policies with the hardened production database.
-- This migration is idempotent and safe for fresh or already-hardened deployments.

DO $$
DECLARE
  t TEXT;
  policy_expr TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','customers','categories','products','inventory_transactions',
    'sales','sale_items','payments','measurement_profiles','orders',
    'order_expenses','laundry_orders','expenses','purchases','suppliers',
    'staff_members','sale_returns','audit_logs','quotations','purchase_returns',
    'cash_register_sessions','outbox_events','production_workflows',
    'production_stage_events','material_rolls','material_consumptions'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      -- Ensure inserts that omit org_id are assigned to the signed-in user's
      -- single organization before the strict WITH CHECK policy runs.
      EXECUTE format('DROP TRIGGER IF EXISTS set_current_user_org_id ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER set_current_user_org_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION private.set_current_user_org_id()',
        t
      );

      -- Remove historical overlapping permissive policies and replace them
      -- with one tenant policy that does not depend on caller EXECUTE access
      -- to public.user_org_ids().
      EXECUTE format('DROP POLICY IF EXISTS %I_org_select ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_org_write ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_org_access ON public.%I', t, t);

      policy_expr := format(
        'org_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.org_id = %I.org_id AND om.user_id = (SELECT auth.uid()))',
        t
      );

      EXECUTE format(
        'CREATE POLICY %I_org_access ON public.%I FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
        t, t, policy_expr, policy_expr
      );
    END IF;
  END LOOP;
END $$;
