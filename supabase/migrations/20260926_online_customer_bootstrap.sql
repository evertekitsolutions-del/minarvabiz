-- Online customer bootstrap hardening.
-- First invited customer administrator gets a tenant organization and HQ branch.
-- Existing users/tenants are unchanged.

CREATE OR REPLACE FUNCTION private.bootstrap_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_org_id UUID;
  display_name TEXT;
  shop_name TEXT;
BEGIN
  display_name := NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''), '');
  IF display_name IS NULL THEN
    display_name := split_part(COALESCE(NEW.email, 'Minarva Biz User'), '@', 1);
  END IF;

  shop_name := NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'shop_name', ''), '');
  IF shop_name IS NULL THEN
    shop_name := display_name || '''s Minarva Biz';
  END IF;

  INSERT INTO public.organizations (name)
  VALUES (shop_name)
  RETURNING id INTO new_org_id;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, display_name, 'admin')
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        updated_at = now();

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'admin')
  ON CONFLICT (org_id, user_id) DO NOTHING;

  INSERT INTO public.branches (name, code, is_headquarters, is_active, org_id)
  VALUES ('Main Branch', 'HQ', true, true, new_org_id);

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.bootstrap_new_user() IS
  'Creates the first Minarva Biz tenant organization, admin profile, membership and HQ branch for a newly invited auth user.';
