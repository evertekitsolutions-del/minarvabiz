-- Authoritative organization RBAC hardening.
-- Direct client role/membership mutation is prohibited; authenticated clients
-- resolve their own role via a SECURITY INVOKER function, while controlled role
-- changes go through a privilege-checked SECURITY DEFINER RPC.

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_members_self_insert ON public.organization_members;
DROP POLICY IF EXISTS organization_members_self_update ON public.organization_members;
DROP POLICY IF EXISTS organization_members_self_delete ON public.organization_members;
DROP POLICY IF EXISTS organization_members_member_write ON public.organization_members;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.organization_members FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.organization_members'::regclass
      AND conname = 'organization_members_role_allowed'
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_role_allowed
      CHECK (role IN ('super_admin','admin','manager','cashier','tailor','staff'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.current_user_authorization()
RETURNS TABLE (
  auth_user_id UUID,
  auth_org_id UUID,
  auth_role TEXT,
  auth_full_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  membership_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)
    INTO membership_count
    FROM public.organization_members om
   WHERE om.user_id = auth.uid();

  IF membership_count <> 1 THEN
    RAISE EXCEPTION 'Exactly one Minarva Biz organization membership is required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    om.user_id,
    om.org_id,
    om.role,
    COALESCE(NULLIF(p.full_name, ''), 'Minarva Biz User')
  FROM public.organization_members om
  LEFT JOIN public.profiles p ON p.id = om.user_id
  WHERE om.user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.current_user_authorization() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_authorization() TO authenticated;

-- Role changes are enforced with column-level grants + RLS. This avoids
-- exposing privileged SECURITY DEFINER mutation functions through the Data API.
REVOKE UPDATE ON TABLE public.organization_members FROM PUBLIC, anon, authenticated;
GRANT UPDATE (role) ON TABLE public.organization_members TO authenticated;

DROP POLICY IF EXISTS organization_members_role_update ON public.organization_members;
CREATE POLICY organization_members_role_update
ON public.organization_members
FOR UPDATE
TO authenticated
USING (
  user_id <> (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.organization_members actor
    WHERE actor.org_id = organization_members.org_id
      AND actor.user_id = (SELECT auth.uid())
      AND actor.role IN ('super_admin','admin')
      AND (
        actor.role = 'super_admin'
        OR organization_members.role <> 'super_admin'
      )
  )
)
WITH CHECK (
  user_id <> (SELECT auth.uid())
  AND role IN ('super_admin','admin','manager','cashier','tailor','staff')
  AND EXISTS (
    SELECT 1
    FROM public.organization_members actor
    WHERE actor.org_id = organization_members.org_id
      AND actor.user_id = (SELECT auth.uid())
      AND actor.role IN ('super_admin','admin')
      AND (
        actor.role = 'super_admin'
        OR organization_members.role <> 'super_admin'
      )
  )
);


-- Align remaining tenant tables with the same role model enforced by the
-- shared business-logic permission layer. Read access remains tenant-scoped.

DO $$
DECLARE
  t TEXT;
  tenant_expr TEXT;
  write_expr TEXT;
BEGIN
  -- orders.manage => super_admin/admin/manager/cashier/tailor/staff
  FOREACH t IN ARRAY ARRAY['orders','laundry_orders','production_workflows']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_authenticated ON public.%I', t, t);
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
        'org_id IS NOT NULL AND public.user_has_org_role(%I.org_id, ARRAY[''super_admin'',''admin'',''manager'',''cashier'',''tailor'',''staff'']::text[])',
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
    END IF;
  END LOOP;

  -- Order expenses support explicit removal in the domain model.
  t := 'order_expenses';
  IF to_regclass('public.order_expenses') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS order_expenses_org_access ON public.order_expenses';
    EXECUTE 'DROP POLICY IF EXISTS order_expenses_org_select ON public.order_expenses';
    EXECUTE 'DROP POLICY IF EXISTS order_expenses_org_write ON public.order_expenses';
    EXECUTE 'DROP POLICY IF EXISTS order_expenses_tenant_select ON public.order_expenses';
    EXECUTE 'DROP POLICY IF EXISTS order_expenses_role_insert ON public.order_expenses';
    EXECUTE 'DROP POLICY IF EXISTS order_expenses_role_update ON public.order_expenses';
    EXECUTE 'DROP POLICY IF EXISTS order_expenses_role_delete ON public.order_expenses';

    tenant_expr :=
      'org_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.org_id = order_expenses.org_id AND om.user_id = (SELECT auth.uid()))';
    write_expr :=
      'org_id IS NOT NULL AND public.user_has_org_role(order_expenses.org_id, ARRAY[''super_admin'',''admin'',''manager'',''cashier'',''tailor'',''staff'']::text[])';

    EXECUTE format(
      'CREATE POLICY order_expenses_tenant_select ON public.order_expenses FOR SELECT TO authenticated USING (%s)',
      tenant_expr
    );
    EXECUTE format(
      'CREATE POLICY order_expenses_role_insert ON public.order_expenses FOR INSERT TO authenticated WITH CHECK (%s)',
      write_expr
    );
    EXECUTE format(
      'CREATE POLICY order_expenses_role_update ON public.order_expenses FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      write_expr, write_expr
    );
    EXECUTE format(
      'CREATE POLICY order_expenses_role_delete ON public.order_expenses FOR DELETE TO authenticated USING (%s)',
      write_expr
    );
  END IF;

  -- inventory.adjust => super_admin/admin/manager.
  t := 'material_rolls';
  IF to_regclass('public.material_rolls') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS material_rolls_authenticated ON public.material_rolls';
    EXECUTE 'DROP POLICY IF EXISTS material_rolls_org_access ON public.material_rolls';
    EXECUTE 'DROP POLICY IF EXISTS material_rolls_org_select ON public.material_rolls';
    EXECUTE 'DROP POLICY IF EXISTS material_rolls_org_write ON public.material_rolls';
    EXECUTE 'DROP POLICY IF EXISTS material_rolls_tenant_select ON public.material_rolls';
    EXECUTE 'DROP POLICY IF EXISTS material_rolls_role_insert ON public.material_rolls';
    EXECUTE 'DROP POLICY IF EXISTS material_rolls_role_update ON public.material_rolls';
    EXECUTE 'DROP POLICY IF EXISTS material_rolls_role_delete ON public.material_rolls';

    tenant_expr :=
      'org_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.organization_members om WHERE om.org_id = material_rolls.org_id AND om.user_id = (SELECT auth.uid()))';
    write_expr :=
      'org_id IS NOT NULL AND public.user_has_org_role(material_rolls.org_id, ARRAY[''super_admin'',''admin'',''manager'']::text[])';

    EXECUTE format(
      'CREATE POLICY material_rolls_tenant_select ON public.material_rolls FOR SELECT TO authenticated USING (%s)',
      tenant_expr
    );
    EXECUTE format(
      'CREATE POLICY material_rolls_role_insert ON public.material_rolls FOR INSERT TO authenticated WITH CHECK (%s)',
      write_expr
    );
    EXECUTE format(
      'CREATE POLICY material_rolls_role_update ON public.material_rolls FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
      write_expr, write_expr
    );
  END IF;
END $$;

-- Append-only operational/audit history. Authenticated tenant members can read;
-- only the role set corresponding to the originating domain action may insert.
DO $$
DECLARE
  tenant_expr TEXT;
  insert_expr TEXT;
BEGIN
  IF to_regclass('public.production_stage_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS production_stage_events_authenticated ON public.production_stage_events;
    DROP POLICY IF EXISTS production_stage_events_org_access ON public.production_stage_events;
    DROP POLICY IF EXISTS production_stage_events_org_select ON public.production_stage_events;
    DROP POLICY IF EXISTS production_stage_events_org_write ON public.production_stage_events;
    DROP POLICY IF EXISTS production_stage_events_tenant_select ON public.production_stage_events;
    DROP POLICY IF EXISTS production_stage_events_role_insert ON public.production_stage_events;
    DROP POLICY IF EXISTS production_stage_events_role_update ON public.production_stage_events;
    DROP POLICY IF EXISTS production_stage_events_role_delete ON public.production_stage_events;

    CREATE POLICY production_stage_events_tenant_select ON public.production_stage_events
      FOR SELECT TO authenticated
      USING (
        org_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.org_id = production_stage_events.org_id
            AND om.user_id = (SELECT auth.uid())
        )
      );
    CREATE POLICY production_stage_events_role_insert ON public.production_stage_events
      FOR INSERT TO authenticated
      WITH CHECK (
        org_id IS NOT NULL
        AND public.user_has_org_role(
          production_stage_events.org_id,
          ARRAY['super_admin','admin','manager','cashier','tailor','staff']::text[]
        )
      );
  END IF;

  IF to_regclass('public.material_consumptions') IS NOT NULL THEN
    DROP POLICY IF EXISTS material_consumptions_authenticated ON public.material_consumptions;
    DROP POLICY IF EXISTS material_consumptions_org_access ON public.material_consumptions;
    DROP POLICY IF EXISTS material_consumptions_org_select ON public.material_consumptions;
    DROP POLICY IF EXISTS material_consumptions_org_write ON public.material_consumptions;
    DROP POLICY IF EXISTS material_consumptions_tenant_select ON public.material_consumptions;
    DROP POLICY IF EXISTS material_consumptions_role_insert ON public.material_consumptions;
    DROP POLICY IF EXISTS material_consumptions_role_update ON public.material_consumptions;
    DROP POLICY IF EXISTS material_consumptions_role_delete ON public.material_consumptions;

    CREATE POLICY material_consumptions_tenant_select ON public.material_consumptions
      FOR SELECT TO authenticated
      USING (
        org_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.org_id = material_consumptions.org_id
            AND om.user_id = (SELECT auth.uid())
        )
      );
    CREATE POLICY material_consumptions_role_insert ON public.material_consumptions
      FOR INSERT TO authenticated
      WITH CHECK (
        org_id IS NOT NULL
        AND public.user_has_org_role(
          material_consumptions.org_id,
          ARRAY['super_admin','admin','manager']::text[]
        )
      );
  END IF;

  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    DROP POLICY IF EXISTS audit_logs_org_access ON public.audit_logs;
    DROP POLICY IF EXISTS audit_logs_org_select ON public.audit_logs;
    DROP POLICY IF EXISTS audit_logs_org_write ON public.audit_logs;
    DROP POLICY IF EXISTS audit_logs_tenant_select ON public.audit_logs;
    DROP POLICY IF EXISTS audit_logs_role_insert ON public.audit_logs;
    DROP POLICY IF EXISTS audit_logs_role_update ON public.audit_logs;
    DROP POLICY IF EXISTS audit_logs_role_delete ON public.audit_logs;

    CREATE POLICY audit_logs_tenant_select ON public.audit_logs
      FOR SELECT TO authenticated
      USING (
        org_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.org_id = audit_logs.org_id
            AND om.user_id = (SELECT auth.uid())
        )
      );
    CREATE POLICY audit_logs_role_insert ON public.audit_logs
      FOR INSERT TO authenticated
      WITH CHECK (
        org_id IS NOT NULL
        AND public.user_has_org_role(
          audit_logs.org_id,
          ARRAY['super_admin','admin','manager','cashier','tailor','staff']::text[]
        )
      );
  END IF;
END $$;
