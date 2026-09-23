-- Corrective RLS/auth hardening for legacy permissive policies and server-side role enforcement.
-- This is intentionally a new migration; historical migrations remain unchanged.

-- 1) Remove every historical <table>_auth_all policy. These policies used
-- is_authenticated() and would otherwise OR with tenant-scoped policies.
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND right(policyname, 9) = '_auth_all'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      p.policyname,
      p.schemaname,
      p.tablename
    );
  END LOOP;
END $$;

-- 2) A signed-in user may edit only their own display name.
-- Role, branch assignment, activation state and audit timestamps are privileged.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

REVOKE UPDATE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

-- organization_members.role is the authoritative online tenant role.
-- Keep this SECURITY INVOKER so RLS on organization_members still applies.
CREATE OR REPLACE FUNCTION public.user_has_org_role(
  target_org_id UUID,
  allowed_roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.org_id = target_org_id
      AND om.user_id = (SELECT auth.uid())
      AND om.role = ANY (allowed_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_org_role(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_org_role(UUID, TEXT[]) TO authenticated;
GRANT SELECT ON public.organization_members TO authenticated;

-- Replace permissive tenant FOR ALL policies on sensitive tables with:
--   * tenant-scoped SELECT for any organization member
--   * role-scoped INSERT/UPDATE/DELETE
-- Existing insert triggers still populate org_id before WITH CHECK runs.
DO $$
DECLARE
  t TEXT;
  tenant_expr TEXT;
  write_expr TEXT;
BEGIN
  -- Administrative, inventory, returns, procurement and accounting writes.
  FOREACH t IN ARRAY ARRAY[
    'branches','categories','products','inventory_transactions',
    'expenses','purchases','suppliers','staff_members','sale_returns',
    'purchase_returns',
    'warehouses','warehouse_locations','warehouse_stock','warehouse_transfers',
    'purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines',
    'purchase_invoices','purchase_invoice_lines',
    'accounts','journal_entries','journal_entry_lines'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_org_access ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_org_select ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_org_write ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_tenant_select ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_role_insert ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_role_update ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_role_delete ON public.%I', t, t);

      tenant_expr := format(
        'org_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.org_id = %I.org_id AND om.user_id = (SELECT auth.uid()))',
        t
      );
      write_expr := format(
        'org_id IS NOT NULL AND public.user_has_org_role(%I.org_id, ARRAY[''super_admin'',''admin'',''manager'']::text[])',
        t
      );

      EXECUTE format(
        'CREATE POLICY %I_tenant_select ON public.%I FOR SELECT TO authenticated USING (%s)',
        t, t, tenant_expr
      );
      EXECUTE format(
        'CREATE POLICY %I_role_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
        t, t, write_expr
      );
      EXECUTE format(
        'CREATE POLICY %I_role_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
        t, t, write_expr, write_expr
      );
      EXECUTE format(
        'CREATE POLICY %I_role_delete ON public.%I FOR DELETE TO authenticated USING (%s)',
        t, t, write_expr
      );
    END IF;
  END LOOP;

  -- Sales/payment/cash-register/quotation writes: cashiers are authorized too.
  FOREACH t IN ARRAY ARRAY[
    'sales','sale_items','payments','cash_register_sessions','quotations'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_org_access ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_org_select ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_org_write ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_tenant_select ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_role_insert ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_role_update ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_role_delete ON public.%I', t, t);

      tenant_expr := format(
        'org_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.org_id = %I.org_id AND om.user_id = (SELECT auth.uid()))',
        t
      );
      write_expr := format(
        'org_id IS NOT NULL AND public.user_has_org_role(%I.org_id, ARRAY[''super_admin'',''admin'',''manager'',''cashier'']::text[])',
        t
      );

      EXECUTE format(
        'CREATE POLICY %I_tenant_select ON public.%I FOR SELECT TO authenticated USING (%s)',
        t, t, tenant_expr
      );
      EXECUTE format(
        'CREATE POLICY %I_role_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
        t, t, write_expr
      );
      EXECUTE format(
        'CREATE POLICY %I_role_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
        t, t, write_expr, write_expr
      );
      EXECUTE format(
        'CREATE POLICY %I_role_delete ON public.%I FOR DELETE TO authenticated USING (%s)',
        t, t, write_expr
      );
    END IF;
  END LOOP;

  -- Customer/measurement writes are also available to tailoring roles.
  FOREACH t IN ARRAY ARRAY['customers','measurement_profiles']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_org_access ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_org_select ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_org_write ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_tenant_select ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_role_insert ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_role_update ON public.%I', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_role_delete ON public.%I', t, t);

      tenant_expr := format(
        'org_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.org_id = %I.org_id AND om.user_id = (SELECT auth.uid()))',
        t
      );
      write_expr := format(
        'org_id IS NOT NULL AND public.user_has_org_role(%I.org_id, ARRAY[''super_admin'',''admin'',''manager'',''cashier'',''tailor'']::text[])',
        t
      );

      EXECUTE format(
        'CREATE POLICY %I_tenant_select ON public.%I FOR SELECT TO authenticated USING (%s)',
        t, t, tenant_expr
      );
      EXECUTE format(
        'CREATE POLICY %I_role_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
        t, t, write_expr
      );
      EXECUTE format(
        'CREATE POLICY %I_role_update ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
        t, t, write_expr, write_expr
      );
      EXECUTE format(
        'CREATE POLICY %I_role_delete ON public.%I FOR DELETE TO authenticated USING (%s)',
        t, t, write_expr
      );
    END IF;
  END LOOP;
END $$;
