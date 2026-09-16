-- Cloud tenant bootstrap + safe org_id defaults.
-- A new Supabase auth user gets one organization, profile, and membership.
-- Business-table inserts that omit org_id are assigned to that user's sole org
-- before RLS WITH CHECK is evaluated. This keeps existing clients compatible
-- while preserving strict tenant isolation.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.bootstrap_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_org_id UUID;
  display_name TEXT;
BEGIN
  display_name := NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), '');
  IF display_name IS NULL THEN
    display_name := split_part(COALESCE(NEW.email, 'Minarva Biz User'), '@', 1);
  END IF;

  INSERT INTO public.organizations (name)
  VALUES (display_name || '''s Minarva Biz')
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, display_name, 'admin')
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        updated_at = now();

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'admin')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_minarva_org ON auth.users;
CREATE TRIGGER on_auth_user_created_minarva_org
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION private.bootstrap_new_user();

CREATE OR REPLACE FUNCTION private.current_user_org_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result UUID;
  org_count INTEGER;
BEGIN
  SELECT COUNT(*), MIN(org_id)
    INTO org_count, result
    FROM public.organization_members
   WHERE user_id = auth.uid();

  IF org_count = 0 OR result IS NULL THEN
    RAISE EXCEPTION 'No Minarva Biz organization is assigned to the signed-in user';
  END IF;

  IF org_count > 1 THEN
    RAISE EXCEPTION 'Multiple organizations are not supported by this client yet';
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION private.set_current_user_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := private.current_user_org_id();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','customers','categories','products','inventory_transactions',
    'sales','sale_items','payments','measurement_profiles','orders',
    'order_expenses','laundry_orders','expenses','purchases','suppliers',
    'staff_members','sale_returns','audit_logs'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS set_current_user_org_id ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER set_current_user_org_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION private.set_current_user_org_id()',
        t
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION private.current_user_org_id() IS
  'Returns the sole organization assigned to the authenticated Minarva Biz user.';
COMMENT ON FUNCTION private.set_current_user_org_id() IS
  'Assigns org_id to new tenant rows before strict RLS WITH CHECK is evaluated.';
